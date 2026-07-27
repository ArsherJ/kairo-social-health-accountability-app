import { featuredStatFor, isFinalizable } from './day.ts';
import { applySabotage, replaySabotageDelta, type SabotageEvent } from './sabotage.ts';
import { computeDailyScore } from './scoring.ts';
import type { CoreStat, DailyScore, HourBucket } from './types.ts';

/**
 * The whole day-scoring pipeline in one call — the entry point the
 * `sync-health` and `finalize-days` Edge Functions use, and the same function
 * the client uses to render an optimistic score.
 *
 * Pure and idempotent: recomputing from the same buckets and the same event log
 * always yields the same result, which is what makes re-syncs, Apple's
 * retroactive step revisions, and cron retries all safe.
 */

export type DayStatus = 'provisional' | 'final';

export interface ComputeDayInput {
  userId: string;
  localDate: string;
  timeZone: string;
  now: Date;
  buckets: readonly HourBucket[];
  sabotageEvents: readonly SabotageEvent[];
  /** Wearable users only. */
  sleepMinutes?: number | null;
  /**
   * Omit to use the week's rotation. Pass `null` to score with no featured
   * stat at all; pass a stat to force one.
   */
  featuredStat?: CoreStat | null;
}

export interface ComputeDayResult {
  score: DailyScore;
  sabotageDelta: number;
  /** Health score plus sabotage, floored at zero. This is the leaderboard number. */
  total: number;
  status: DayStatus;
}

export function computeDay(input: ComputeDayInput): ComputeDayResult {
  const featuredStat =
    input.featuredStat === undefined
      ? featuredStatFor(input.localDate)
      : input.featuredStat;

  const score = computeDailyScore({
    buckets: input.buckets,
    sleepMinutes: input.sleepMinutes ?? null,
    featuredStat,
  });

  const sabotageDelta = replaySabotageDelta(
    input.sabotageEvents,
    input.userId,
    input.localDate,
  );

  return {
    score,
    sabotageDelta,
    total: applySabotage(score.healthTotal, sabotageDelta),
    status: isFinalizable(input.localDate, input.timeZone, input.now)
      ? 'final'
      : 'provisional',
  };
}
