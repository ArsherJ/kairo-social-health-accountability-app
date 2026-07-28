import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fail, json } from '../_shared/http.ts';
import { advanceStreak, type StreakState } from '../_shared/core.ts';
import { rescoreDay } from '../_shared/rescore.deno.ts';

/**
 * finalize-days — the only place a day's competition is declared over.
 *
 * Runs hourly. Each user's day finalizes roughly two hours after THEIR local
 * midnight (spec §12), which gives late phone syncs a grace window without
 * letting the result stay provisional forever. Because every player has their
 * own timezone, every hour of the day is somebody's finalization hour.
 *
 * Idempotent throughout: candidates are selected on status='provisional' and
 * the streak fold refuses to apply the same day twice, so a retry or an
 * overlapping run changes nothing.
 *
 * Deliberately NOT here: coin awards. The MVP beta ships no coin economy (§15),
 * so milestones grant badges only. The coin ledger arrives with the V1 shop.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Cap per invocation so one run cannot exceed the function time limit. */
const MAX_DAYS_PER_RUN = 500;

interface Candidate {
  user_id: string;
  local_date: string;
  timezone: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Scheduled invocation only. Without this, any caller could force days to
  // finalize early and freeze rankings mid-competition.
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret');
    if (provided !== cronSecret) return fail('forbidden', 403);
  }

  const now = new Date();

  // Selecting candidates in SQL keeps the timezone arithmetic next to the data.
  // `(local_date + 1)::timestamp at time zone tz` is the UTC instant of the
  // user's next local midnight — the same value dayEndUtc() computes in
  // kairo-core — and the interval adds the grace window.
  const { data, error } = await admin.rpc('finalizable_days', {
    p_limit: MAX_DAYS_PER_RUN,
  });
  if (error) return fail(`candidate lookup failed: ${error.message}`, 500);

  const candidates = (data ?? []) as Candidate[];
  const finalized: string[] = [];
  const failures: Array<{ userId: string; localDate: string; error: string }> = [];
  let shieldsUsed = 0;
  const milestones: Array<{ userId: string; milestone: number }> = [];

  for (const candidate of candidates) {
    const rescored = await rescoreDay(admin, {
      userId: candidate.user_id,
      localDate: candidate.local_date,
      timeZone: candidate.timezone,
      now,
      finalize: true,
    });

    if ('error' in rescored) {
      // One bad row must not abort the whole run — other users' days still
      // need to close on time.
      failures.push({
        userId: candidate.user_id,
        localDate: candidate.local_date,
        error: rescored.error,
      });
      continue;
    }

    const { data: streakRow, error: streakError } = await admin
      .from('streaks')
      .select('current_streak, longest_streak, last_scored_date, shield_available_on')
      .eq('user_id', candidate.user_id)
      .maybeSingle();

    if (streakError) {
      failures.push({
        userId: candidate.user_id,
        localDate: candidate.local_date,
        error: streakError.message,
      });
      continue;
    }

    const before: StreakState = {
      currentStreak: streakRow ? Number(streakRow.current_streak) : 0,
      longestStreak: streakRow ? Number(streakRow.longest_streak) : 0,
      lastScoredDate: (streakRow?.last_scored_date as string | null) ?? null,
      shieldAvailableOn: (streakRow?.shield_available_on as string | null) ?? null,
    };

    // §19 sets the bar deliberately low: any score above zero keeps a streak.
    const transition = advanceStreak(before, {
      localDate: candidate.local_date,
      scored: rescored.total > 0,
    });

    if (!transition.unchanged) {
      const { error: writeError } = await admin.from('streaks').upsert(
        {
          user_id: candidate.user_id,
          current_streak: transition.next.currentStreak,
          longest_streak: transition.next.longestStreak,
          last_scored_date: transition.next.lastScoredDate,
          shield_available_on: transition.next.shieldAvailableOn,
          updated_at: now.toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (writeError) {
        failures.push({
          userId: candidate.user_id,
          localDate: candidate.local_date,
          error: writeError.message,
        });
        continue;
      }
    }

    if (transition.shieldUsed) shieldsUsed += 1;
    if (transition.milestoneReached !== null) {
      milestones.push({
        userId: candidate.user_id,
        milestone: transition.milestoneReached,
      });
    }

    finalized.push(`${candidate.user_id}:${candidate.local_date}`);

    await admin.from('app_events').insert({
      user_id: candidate.user_id,
      type: 'day_finalized',
      payload: {
        localDate: candidate.local_date,
        total: rescored.total,
        streak: transition.next.currentStreak,
        shieldUsed: transition.shieldUsed,
        milestone: transition.milestoneReached,
      },
    });
  }

  return json({
    ranAt: now.toISOString(),
    candidates: candidates.length,
    finalized: finalized.length,
    shieldsUsed,
    milestones,
    failures,
    // A full batch means more days are waiting; the next hourly run picks them
    // up, but a persistently full batch is worth alerting on.
    truncated: candidates.length >= MAX_DAYS_PER_RUN,
  });
});
