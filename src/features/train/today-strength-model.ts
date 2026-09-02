import { STRENGTH_ACTIVITY_TYPES, workoutVerified } from '@kairo/core';

/**
 * Today's verified strength work, reduced for display and for one reaction.
 *
 * **Display authority only.** Scoring stays server-authoritative: `sync-health`
 * and `finalize-days` compute the Body credit from the same rows through
 * `verifiedStrengthMinutesFrom`, and nothing here feeds a score, an XP award or
 * a projection. This exists so Today can say "45 min" in details and so a
 * finished session can be celebrated once.
 *
 * Pure, and the trust predicate is `@kairo/core`'s `workoutVerified` rather
 * than a second reading of the same rule — a workout needs its source
 * allowlisted *and* heart-rate evidence, which is deliberately stricter than
 * sleep's `scoresAtAll`.
 */

/**
 * Display-only mirror of the server's list. The test beside this file pins it
 * to `WORKOUT_SOURCE_ALLOWLIST`, so a server allowlist change cannot silently
 * make Today claim a different result from the one the scorer reached.
 *
 * It is a copy rather than an import because `scoring-inputs.ts` is Edge
 * Function code that the app bundle has no business pulling in; the assertion
 * is what keeps the copy honest.
 */
export const DISPLAY_WORKOUT_SOURCE_ALLOWLIST = [
  'com.apple.workout',
  'com.apple.Fitness',
] as const;

export interface TodayStrengthRow {
  hkUuid: string;
  startedAt: string;
  activityType: number;
  durationS: number;
  sourceBundleId: string | null;
  wasUserEntered: boolean;
  hasHeartRateEvidence: boolean;
}
export interface TodayStrengthSummary { verifiedMinutes: number; latestOccurrence: string | null }

export function summarizeTodayStrength(rows: readonly TodayStrengthRow[]): TodayStrengthSummary {
  const verified = rows.filter((row) =>
    (STRENGTH_ACTIVITY_TYPES as readonly number[]).includes(row.activityType) &&
    workoutVerified({
      wasUserEntered: row.wasUserEntered,
      sourceBundleId: row.sourceBundleId,
      hasHeartRateEvidence: row.hasHeartRateEvidence,
    }, DISPLAY_WORKOUT_SOURCE_ALLOWLIST),
  );
  const verifiedMinutes = verified.reduce((sum, row) => sum + Math.max(0, row.durationS), 0) / 60;
  // The `hkUuid` tie-break is not decoration. PostgREST guarantees no row
  // order, and two sessions can share a start instant — leaning on a stable
  // sort of the fetched order would make `latestOccurrence` flip between
  // refetches, which re-fires the workout reaction for a session already
  // celebrated. Deterministic beats intuitive here.
  const latest = [...verified].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt) || b.hkUuid.localeCompare(a.hkUuid),
  )[0];
  return { verifiedMinutes, latestOccurrence: latest ? `workout:${latest.hkUuid}` : null };
}
