import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import type { HourBucket } from '../_shared/core.ts';
import {
  affectedDates,
  observesWearable,
  planDay,
  validateSyncRequest,
  type DayScoreRow,
} from '../_shared/sync-plan.ts';

/**
 * sync-health — the only door health data enters through.
 *
 * The client uploads hourly buckets; this recomputes the affected days and
 * writes the scores. The client never posts a score, so cheating requires
 * forging raw health data rather than just claiming a number (spec §12).
 *
 * Everything that makes a decision lives in ../_shared/sync-plan.ts and is
 * unit-tested in plain Node. This file is deliberately only orchestration:
 * authenticate, read, plan, write.
 *
 * Idempotent by construction. Buckets upsert on (user, date, hour) and scores
 * upsert on (user, date), so a retried request, a duplicate background-delivery
 * wake-up, and Apple's retroactive step revisions all converge on the same
 * result rather than double-counting.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Service role: RLS blocks every client write to health_buckets and
// daily_scores, so this function is the only path in. It must therefore
// resolve the user from their JWT and scope every query to that id by hand.
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return fail('missing bearer token', 401);
  }

  const { data: auth, error: authError } = await admin.auth.getUser(
    authHeader.slice('Bearer '.length),
  );
  if (authError || !auth.user) return fail('invalid token', 401);
  const userId = auth.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('body must be valid JSON', 400);
  }

  const validated = validateSyncRequest(body);
  if (!validated.ok) return fail(validated.error, 400);
  const request = validated.value;

  const dates = affectedDates(request);
  if (dates.length === 0) return json({ days: [], message: 'nothing to sync' });

  const now = new Date();

  // The profile is the authority on timezone for every other job (the
  // finalizer, the notification budget), so a client that has travelled
  // updates it here rather than only sending it per-request.
  await admin
    .from('profiles')
    .update({ timezone: request.timezone })
    .eq('id', userId)
    .neq('timezone', request.timezone);

  if (request.buckets.length > 0) {
    const { error } = await admin.from('health_buckets').upsert(
      request.buckets.map((b) => ({
        user_id: userId,
        local_date: b.localDate,
        hour: b.hour,
        steps: b.steps,
        distance_m: b.distanceM,
        active_kcal: b.activeKcal,
        active_minutes: b.activeMinutes,
        had_workout: b.hadWorkout ?? false,
        elevated_heart_rate: b.elevatedHeartRate ?? false,
        // Null-safe on purpose: `?? null` writes an explicit NULL for an hour
        // with no reading, which is what overwrites a stale value when a watch
        // stops reporting. Whole-day emission (deviation #8) is only idempotent
        // if absence overwrites, and that applies to this column too.
        avg_heart_rate: b.avgHeartRate ?? null,
        updated_at: now.toISOString(),
      })),
      { onConflict: 'user_id,local_date,hour' },
    );
    if (error) return fail(`bucket upsert failed: ${error.message}`, 500);
  }

  // Wearable capability is observed here, never asked in onboarding. Sticky by
  // construction: the filter only ever flips false -> true, so a watch left on
  // the charger for a week does not read as a watch you stopped owning. The
  // `.eq` also makes this a no-op write for everyone already flagged.
  if (observesWearable(request)) {
    await admin
      .from('profiles')
      .update({ has_wearable: true })
      .eq('id', userId)
      .eq('has_wearable', false);
  }

  if (request.sleep && request.sleep.length > 0) {
    const { error } = await admin.from('daily_sleep').upsert(
      request.sleep.map((s) => ({
        user_id: userId,
        local_date: s.localDate,
        minutes: s.minutes,
        updated_at: now.toISOString(),
      })),
      { onConflict: 'user_id,local_date' },
    );
    if (error) return fail(`sleep upsert failed: ${error.message}`, 500);
  }

  // Resting heart rate, the other denominator strain needs. Its own table for
  // the same reason sleep has one: it is a per-day figure Apple derives, not an
  // hourly one, and a user can have one without the other.
  //
  // Display only — nothing below reads it, and no score depends on it.
  if (request.restingHeartRate && request.restingHeartRate.length > 0) {
    const { error } = await admin.from('daily_heart').upsert(
      request.restingHeartRate.map((r) => ({
        user_id: userId,
        local_date: r.localDate,
        resting_hr: r.bpm,
        updated_at: now.toISOString(),
      })),
      { onConflict: 'user_id,local_date' },
    );
    if (error) return fail(`resting heart rate upsert failed: ${error.message}`, 500);
  }

  // Read the FULL day back rather than scoring the payload alone. A sync
  // carrying only hour 14 must still be scored against every other hour
  // already stored, or the day's total would collapse to that one hour.
  const [bucketsResult, sleepResult, existingResult] =
    await Promise.all([
      admin
        .from('health_buckets')
        .select(
          'local_date, hour, steps, distance_m, active_kcal, active_minutes, had_workout, elevated_heart_rate',
        )
        .eq('user_id', userId)
        .in('local_date', dates),
      admin
        .from('daily_sleep')
        .select('local_date, minutes')
        .eq('user_id', userId)
        .in('local_date', dates),
      admin
        .from('daily_scores')
        .select('local_date, status')
        .eq('user_id', userId)
        .in('local_date', dates),
    ]);

  for (const result of [bucketsResult, sleepResult, existingResult]) {
    if (result.error) return fail(`read failed: ${result.error.message}`, 500);
  }

  const bucketsByDate = new Map<string, HourBucket[]>();
  const workoutHoursByDate = new Map<string, Set<number>>();
  const heartRateHoursByDate = new Map<string, Set<number>>();

  for (const row of bucketsResult.data ?? []) {
    const date = row.local_date as string;
    if (!bucketsByDate.has(date)) {
      bucketsByDate.set(date, []);
      workoutHoursByDate.set(date, new Set());
      heartRateHoursByDate.set(date, new Set());
    }
    bucketsByDate.get(date)!.push({
      hour: row.hour as number,
      steps: Number(row.steps),
      distanceM: Number(row.distance_m),
      activeKcal: Number(row.active_kcal),
      activeMinutes: Number(row.active_minutes),
    });
    if (row.had_workout) workoutHoursByDate.get(date)!.add(row.hour as number);
    if (row.elevated_heart_rate) {
      heartRateHoursByDate.get(date)!.add(row.hour as number);
    }
  }

  const sleepByDate = new Map<string, number>(
    (sleepResult.data ?? []).map((r) => [r.local_date as string, Number(r.minutes)]),
  );

  const statusByDate = new Map<string, 'provisional' | 'final'>(
    (existingResult.data ?? []).map((r) => [
      r.local_date as string,
      r.status as 'provisional' | 'final',
    ]),
  );

  const fullWrites: DayScoreRow[] = [];
  const frozenWrites: Array<{ localDate: string; xp: number; flagged: boolean }> = [];
  const response: Array<{ localDate: string; total: number; frozen: boolean }> = [];

  for (const date of dates) {
    const plan = planDay({
      userId,
      localDate: date,
      timeZone: request.timezone,
      now,
      buckets: bucketsByDate.get(date) ?? [],
      hadWorkoutHours: workoutHoursByDate.get(date) ?? new Set(),
      elevatedHeartRateHours: heartRateHoursByDate.get(date) ?? new Set(),
      sleepMinutes: sleepByDate.get(date) ?? null,
      existingStatus: statusByDate.get(date) ?? null,
    });

    if (plan.frozen) {
      // §19: the competition already settled, so ranking columns stay put.
      // XP and the flag still move — real activity is never punished by a
      // phone that failed to sync in time.
      frozenWrites.push({
        localDate: date,
        xp: plan.row.xp_awarded,
        flagged: plan.row.flagged,
      });
    } else {
      fullWrites.push(plan.row);
    }

    response.push({ localDate: date, total: plan.row.total, frozen: plan.frozen });
  }

  if (fullWrites.length > 0) {
    const { error } = await admin
      .from('daily_scores')
      .upsert(fullWrites, { onConflict: 'user_id,local_date' });
    if (error) return fail(`score upsert failed: ${error.message}`, 500);
  }

  for (const frozen of frozenWrites) {
    const { error } = await admin
      .from('daily_scores')
      .update({ xp_awarded: frozen.xp, flagged: frozen.flagged })
      .eq('user_id', userId)
      .eq('local_date', frozen.localDate);
    if (error) return fail(`frozen score update failed: ${error.message}`, 500);
  }

  // Behavioural telemetry (§11). Cheap to write now, impossible to backfill,
  // and it is what the beta's four risk questions get answered from.
  await admin.from('app_events').insert({
    user_id: userId,
    type: 'health_sync',
    payload: {
      dates,
      buckets: request.buckets.length,
      frozen: frozenWrites.length,
    },
  });

  return json({ days: response });
});
