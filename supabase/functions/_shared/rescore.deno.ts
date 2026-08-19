import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { HourBucket } from './core.ts';
import { readScoringInputs } from './scoring-inputs.deno.ts';
import { planDay } from './sync-plan.ts';

/**
 * Recompute and persist one user-day from whatever is currently stored.
 *
 * Used by `finalize-days` for the closing recompute. Because a score is always
 * *replayed* from stored buckets rather than adjusted in place, calling this
 * repeatedly is safe and always converges (spec §12) — which is what makes cron
 * overlap and Apple's retroactive step revisions both harmless.
 */
export async function rescoreDay(
  admin: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    timeZone: string;
    now: Date;
    /** Write status='final' and stamp finalized_at. Only finalize-days does this. */
    finalize?: boolean;
  },
): Promise<{ total: number; xp: number; flagged: boolean } | { error: string }> {
  const { userId, localDate, timeZone, now } = args;

  const [buckets, sleep, existing] = await Promise.all([
    admin
      .from('health_buckets')
      .select(
        'hour, steps, distance_m, active_kcal, active_minutes, had_workout, elevated_heart_rate',
      )
      .eq('user_id', userId)
      .eq('local_date', localDate),
    admin
      .from('daily_sleep')
      .select('minutes')
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .maybeSingle(),
    admin
      .from('daily_scores')
      .select('status')
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .maybeSingle(),
  ]);

  for (const result of [buckets, existing]) {
    if (result.error) return { error: result.error.message };
  }

  const hourBuckets: HourBucket[] = [];
  const workoutHours = new Set<number>();
  const heartRateHours = new Set<number>();

  for (const row of buckets.data ?? []) {
    hourBuckets.push({
      hour: row.hour as number,
      steps: Number(row.steps),
      distanceM: Number(row.distance_m),
      activeKcal: Number(row.active_kcal),
      activeMinutes: Number(row.active_minutes),
    });
    if (row.had_workout) workoutHours.add(row.hour as number);
    if (row.elevated_heart_rate) heartRateHours.add(row.hour as number);
  }

  const existingStatus = (existing.data?.status ?? null) as
    | 'provisional'
    | 'final'
    | null;

  // §2's normalization and §3's STR shift, both keyed on `localDate` — the
  // date being replayed, which on a backfill is not today.
  const scoringInputs = await readScoringInputs(admin, { userId, localDate });
  if ('error' in scoringInputs) return { error: scoringInputs.error };

  const plan = planDay({
    userId,
    localDate,
    timeZone,
    now,
    buckets: hourBuckets,
    hadWorkoutHours: workoutHours,
    elevatedHeartRateHours: heartRateHours,
    sleepMinutes: sleep.data ? Number(sleep.data.minutes) : null,
    earnableStats: scoringInputs.earnableStats,
    verifiedWorkoutMinutes: scoringInputs.verifiedWorkoutMinutes,
    existingStatus,
  });

  // A day that already finalized keeps its ranking columns no matter who asks
  // to rescore it — that is the §19 rule, and it holds even for health data
  // that Apple revised after the fact.
  if (plan.frozen && !args.finalize) {
    const { error } = await admin
      .from('daily_scores')
      .update({ xp_awarded: plan.row.xp_awarded, flagged: plan.row.flagged })
      .eq('user_id', userId)
      .eq('local_date', localDate);
    if (error) return { error: error.message };
    return { total: plan.row.total, xp: plan.row.xp_awarded, flagged: plan.row.flagged };
  }

  const row = args.finalize
    ? { ...plan.row, status: 'final' as const, finalized_at: now.toISOString() }
    : plan.row;

  const { error } = await admin
    .from('daily_scores')
    .upsert(row, { onConflict: 'user_id,local_date' });
  if (error) return { error: error.message };

  return { total: row.total, xp: row.xp_awarded, flagged: row.flagged };
}
