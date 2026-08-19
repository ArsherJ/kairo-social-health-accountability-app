/**
 * The two inputs `planDay` cannot derive for itself: how many stats this user
 * can earn on the date being scored (§2), and how many verified workout
 * minutes that date carried (§3).
 *
 * Both are decisions about *stored data*, so neither can live in `@kairo/core`
 * — that package reads no I/O and holds no policy. They are here, pure and
 * testable in plain Node, with the Supabase reads that feed them isolated in
 * `scoring-inputs.deno.ts`. One implementation, two write paths: `sync-health`
 * and `rescore` must agree, and two copies of a rule this subtle drift.
 */

import {
  SLEEP_CAPABILITY_WINDOW_DAYS,
  addDays,
  earnableStats,
  hasSleepCapability,
  workoutVerified,
} from './core.ts';

export { SLEEP_CAPABILITY_WINDOW_DAYS };

/**
 * Workout sources whose sessions may shift STR's thresholds (§3).
 *
 * **The list lives server-side on purpose.** `trust.ts` takes it as a
 * parameter so it can change without an app release, and so a forged client
 * cannot promote itself past a list it does not hold.
 *
 * **Every entry below is PROVISIONAL and must be validated against observed
 * `workout_sessions.source_bundle_id` values after deploy.** No verified list
 * exists: the spec says only that one lives here, and the Phase 1 spike
 * explicitly left "what bundle identifier Apple reports" unverified. So this
 * is seeded with Apple's own workout recorders and nothing else.
 *
 * Seeding conservatively is safe in one direction only, which is why it is the
 * right direction: an unrecognised source is `flagged`, never `trusted`, so
 * `workoutVerified` returns false and the shift is 0. An incomplete allowlist
 * is **inert, never inflationary** — the same "inert beats wrong" posture
 * `workout-units.ts` takes when it meets a unit it does not recognise. A
 * permissive one silently inflates STR from a source a client can claim.
 *
 * `com.apple.Health` is deliberately absent and must stay absent. That is the
 * Health app — i.e. where hand-entered workouts come from — and it is the one
 * identifier that must never be trusted.
 */
export const WORKOUT_SOURCE_ALLOWLIST: readonly string[] = [
  // PROVISIONAL — the Workout app on watchOS, the expected source for an
  // Apple Watch session.
  'com.apple.workout',
  // PROVISIONAL — the Fitness app on iOS, the expected source for a session
  // recorded without a watch.
  'com.apple.Fitness',
];

/**
 * The first local date inside §3's trailing sleep-capability window.
 *
 * Inclusive of the scored date, so the span is `WINDOW_DAYS` dates and the
 * start is `WINDOW_DAYS - 1` back. It exists to bound the query; the verdict
 * still comes from `hasSleepCapability`, which re-checks both edges.
 */
export function capabilityWindowStart(localDate: string): string {
  return addDays(localDate, -(SLEEP_CAPABILITY_WINDOW_DAYS - 1));
}

/**
 * How many of the three stats this user can earn on **the date being scored**.
 *
 * `localDate` is that date, never wall-clock today. On a live sync they are
 * the same and the distinction is invisible; on a backfill or a replay they
 * are not, and wall-clock today is a real breach rather than an approximation
 * — sleep on the scored date still makes MND score while an empty recent
 * window drops the count to 2, so the day pays 6,200 against a 4,400 ceiling
 * with `contributing_stats` at 3, which the check constraint waves through.
 */
export function earnableStatsFor(
  scoringSleepDates: readonly string[],
  localDate: string,
): number {
  return earnableStats(hasSleepCapability(scoringSleepDates, localDate));
}

/**
 * One `workout_sessions` row, as PostgREST hands it back.
 *
 * The three origin columns arrive with the three-stat expand migration and are
 * nullable, so every row written before it — and every row written before the
 * client learns to send them — reads NULL. `Boolean(null)` is false on all
 * three, which is the honest reading: absent evidence is not evidence.
 */
export interface WorkoutSessionRow {
  duration_s: number | string | null;
  source_bundle_id: string | null;
  was_user_entered: boolean | null;
  has_heart_rate_evidence: boolean | null;
}

/**
 * Verified workout minutes for one date, which is what shifts STR's bands.
 *
 * **`duration_s` is SECONDS.** There is no `duration_minutes` column; reading
 * it as one would hand a single hour-long session a 60x shift, and the 25% cap
 * would absorb that silently into "always maxed" — a scoring error with no
 * symptom. Seconds are summed once and converted once, so nothing compounds a
 * rounding step per session.
 */
export function verifiedWorkoutMinutesFrom(
  rows: readonly WorkoutSessionRow[],
  allowlist: readonly string[] = WORKOUT_SOURCE_ALLOWLIST,
): number {
  let seconds = 0;
  for (const row of rows) {
    const verified = workoutVerified(
      {
        wasUserEntered: Boolean(row.was_user_entered),
        sourceBundleId: row.source_bundle_id ?? null,
        hasHeartRateEvidence: Boolean(row.has_heart_rate_evidence),
      },
      allowlist,
    );
    if (verified) seconds += Number(row.duration_s ?? 0);
  }
  return seconds / 60;
}
