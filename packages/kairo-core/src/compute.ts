import { isFinalizable } from './day.ts';
import { computeDailyScore } from './scoring.ts';
import { CORE_STATS, type CoreStat, type DailyScore, type HourBucket } from './types.ts';

/**
 * The whole day-scoring pipeline in one call — the entry point the
 * `sync-health` and `finalize-days` Edge Functions use, and the same function
 * the client uses to render an optimistic score.
 *
 * Pure and idempotent: recomputing from the same buckets always yields the same
 * result, which is what makes re-syncs, Apple's retroactive step revisions, and
 * cron retries all safe.
 *
 * A day is built from that user's own activity and nothing else. Nothing
 * subtracts from it — no other player can reach it.
 */

export type DayStatus = 'provisional' | 'final';

export interface ComputeDayInput {
  localDate: string;
  timeZone: string;
  now: Date;
  buckets: readonly HourBucket[];
  /** Wearable users only. */
  sleepMinutes?: number | null;
  /**
   * Defaults to `null` — **no featured stat** (deviation #10). The weekly
   * rotation is retired from stored scoring: squad programs carry the meta now
   * and they weight at *read* time, so a stored multiplier would stack with a
   * program weight (an AGI week in a running squad = 2.25×).
   *
   * `featuredStatFor` still exists and is still tested, so V1 can resurrect the
   * rotation as a read-time projection. Passing a stat here forces one, which
   * is how the multiplier stays exercised by tests — but nothing on the write
   * path may do so.
   */
  featuredStat?: CoreStat | null;
  /**
   * How many stats this user can earn (spec §2's normalization). Defaults to
   * all of them.
   *
   * Not derived here, for the same reason `computeDailyScore` does not derive
   * it: the answer is a trailing window over `daily_sleep`, which is I/O and a
   * clock. `sync-health` is where it gets filled in. Until it does, every user
   * is normalized as though they could earn every stat — the pre-normalization
   * behaviour rather than a wrong one.
   */
  earnableStats?: number;
  /** Minutes from workouts passing `workoutVerified`. Shifts STR's bands. */
  verifiedWorkoutMinutes?: number;
}

export interface ComputeDayResult {
  score: DailyScore;
  /**
   * The leaderboard number, and what `daily_scores.total` stores.
   *
   * Identical to `score.healthTotal` — kept as its own field because it is the
   * *stored* column, and because read-time weighting (`squad_leaderboard()`,
   * deviation #11) projects from it without ever writing it back.
   */
  total: number;
  status: DayStatus;
}

export function computeDay(input: ComputeDayInput): ComputeDayResult {
  const score = computeDailyScore({
    buckets: input.buckets,
    sleepMinutes: input.sleepMinutes ?? null,
    // `?? default` rather than forwarding `undefined`: with
    // exactOptionalPropertyTypes an optional field and an explicitly-undefined
    // one are different types, and spelling the default here keeps the two
    // layers agreeing about what "not supplied" means.
    earnableStats: input.earnableStats ?? CORE_STATS.length,
    verifiedWorkoutMinutes: input.verifiedWorkoutMinutes ?? 0,
    featuredStat: input.featuredStat ?? null,
  });

  return {
    score,
    total: score.healthTotal,
    status: isFinalizable(input.localDate, input.timeZone, input.now)
      ? 'final'
      : 'provisional',
  };
}
