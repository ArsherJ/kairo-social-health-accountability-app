import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { HourBucket } from './core.ts';
import { replayLifecycle } from './replay-plan.ts';
import { readScoringInputs } from './scoring-inputs.deno.ts';
import { planDay, type DayScoreRow } from './sync-plan.ts';

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
    /**
     * Recompute a day that has already finalized, keeping the `finalized_at`
     * it already carries.
     *
     * A deliberate, secret-guarded exception to the §19 freeze rule, for a
     * model migration and nothing else: when the engine itself changes, the
     * stored columns describe a scoring model that no longer exists, and
     * leaving them is not preserving a result — it is preserving arithmetic
     * from a different game. `replay-scores` is the only caller and it cannot
     * run without `REPLAY_SECRET`.
     *
     * It is **not** `finalize`, and widening `finalize` to cover it would be
     * the bug: `finalize` re-stamps `finalized_at` with `now`, which on a
     * replay moves every historical day's finalization to the afternoon of the
     * deploy. This option changes what a day *scored*, never when it ended.
     */
    replayFrozen?: boolean;
    /** Plan and return without writing. What `replay-scores --dry-run` reports. */
    dryRun?: boolean;
  },
): Promise<
  | { total: number; xp: number; flagged: boolean; row: DayScoreRow }
  | { error: string }
> {
  const { userId, localDate, timeZone, now } = args;

  // Sleep is not read here. `readScoringInputs` returns it already gated —
  // a hand-typed night reads null — and it has to be the same read that
  // decides §3's capability window, or the two disagree and the day pays
  // 6,200 against a 4,400 ceiling. Two write paths, one implementation.
  const [buckets, existing] = await Promise.all([
    admin
      .from('health_buckets')
      .select(
        'hour, steps, distance_m, active_kcal, active_minutes, had_workout, elevated_heart_rate',
      )
      .eq('user_id', userId)
      .eq('local_date', localDate),
    admin
      .from('daily_scores')
      // `finalized_at` is read for the replay path alone: it is the value that
      // must survive the rewrite, and there is nowhere else to get it.
      .select('status, finalized_at')
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
  const existingFinalizedAt = (existing.data?.finalized_at ?? null) as string | null;

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
    sleepMinutes: scoringInputs.sleepMinutes,
    earnableStats: scoringInputs.earnableStats,
    verifiedWorkoutMinutes: scoringInputs.verifiedWorkoutMinutes,
    existingStatus,
  });

  // A day that already finalized keeps its ranking columns no matter who asks
  // to rescore it — that is the §19 rule, and it holds even for health data
  // that Apple revised after the fact. `replayFrozen` is the one exception,
  // documented on the option above.
  if (plan.frozen && !args.finalize && !args.replayFrozen) {
    if (!args.dryRun) {
      const { error } = await admin
        .from('daily_scores')
        .update({ xp_awarded: plan.row.xp_awarded, flagged: plan.row.flagged })
        .eq('user_id', userId)
        .eq('local_date', localDate);
      if (error) return { error: error.message };
    }
    return {
      total: plan.row.total,
      xp: plan.row.xp_awarded,
      flagged: plan.row.flagged,
      // The planned row, not the stored one: in this branch only `xp_awarded`
      // and `flagged` were persisted.
      row: plan.row,
    };
  }

  const row = args.finalize
    ? { ...plan.row, status: 'final' as const, finalized_at: now.toISOString() }
    : args.replayFrozen
      ? replayLifecycle(plan.row, {
          status: existingStatus,
          finalizedAt: existingFinalizedAt,
        })
      : plan.row;

  if (!args.dryRun) {
    const { error } = await admin
      .from('daily_scores')
      .upsert(row, { onConflict: 'user_id,local_date' });
    if (error) return { error: error.message };
  }

  return { total: row.total, xp: row.xp_awarded, flagged: row.flagged, row };
}
