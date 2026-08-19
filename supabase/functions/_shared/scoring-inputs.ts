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
 * One `daily_sleep` row inside §3's capability window, as PostgREST hands it
 * back.
 *
 * `minutes` is `numeric`-adjacent in transit: PostgREST returns integers as
 * numbers but a widened column would arrive as a string, so this reads both
 * rather than trusting one.
 */
export interface DailySleepRow {
  local_date: string;
  minutes: number | string | null;
  was_user_entered: boolean | null;
}

/**
 * Whether a stored night SCORES.
 *
 * **One predicate, used twice, and that is the whole point.** It answers both
 * "does this night make MND earnable" and "does this night's `minutes` reach
 * `planDay`" — and those two answers must never differ. A night that scores
 * MND while being excluded from the capability window gives the day three
 * contributing stats and two earnable ones: `(1,200 x 3) x 1.5 + 800 = 6,200`
 * against a 4,400 ceiling, with `contributing_stats` at 3 so the check
 * constraint waves it through. That is the breach `capability.ts:34-41`
 * documents, and two predicates is how it comes back.
 *
 * `!== true` and not `=== false` on purpose: every row written before the
 * expand migration has the column NULL, and so does every row written before
 * the client learned to send it. NULL must stay eligible — absent is not a
 * claim of hand entry, and reading it as one would silently un-score a
 * fortnight of real nights for the whole existing cohort.
 *
 * Zero minutes does not score, because it is indistinguishable from no data.
 */
function sleepScores(row: DailySleepRow): boolean {
  return Number(row.minutes ?? 0) > 0 && row.was_user_entered !== true;
}

/**
 * The dates `hasSleepCapability` should judge, out of the window's rows.
 *
 * A *flagged* night still counts — the allowlist does not affect score, and
 * an obscure-but-real sleep app scoring zero is indistinguishable from Kairo
 * being broken. Only a hand-typed night is excluded, and that exclusion is
 * user-protective rather than anti-cheat: it is paired with the night not
 * scoring at all.
 */
export function scoringSleepDates(rows: readonly DailySleepRow[]): string[] {
  return rows.filter(sleepScores).map((row) => row.local_date);
}

/**
 * The scored date's own sleep, as `planDay` should see it — or null.
 *
 * Null rather than zero: `computeDay` reads `sleepMinutes !== null` as
 * `has_rec`, so a zero would claim the night was measured and empty, which is
 * a different statement from not having one.
 *
 * The row is **read, not filtered out of the query**. A hand-typed night still
 * exists in `daily_sleep` with its minutes intact — the decision is made here,
 * where it is legible and tested, rather than by a row quietly missing.
 */
export function scoringSleepMinutes(
  rows: readonly DailySleepRow[],
  localDate: string,
): number | null {
  const row = rows.find((r) => r.local_date === localDate);
  if (row === undefined || !sleepScores(row)) return null;
  return Number(row.minutes);
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
 * The PostgREST select lists, and the reason they are constants.
 *
 * `readScoringInputs` casts what PostgREST returns straight to these row
 * types, and a cast checks nothing. A typo or a rename in a select string
 * yields `undefined` on every field it names, `Number(undefined ?? 0)` is 0
 * and `Boolean(undefined)` is false — so the STR shift silently becomes zero
 * and the night silently stops scoring, with **no error anywhere**. The pure
 * tests below cannot catch it either, because they build their own fixtures.
 *
 * So the string and the type are tied together from both sides, the way
 * `disclosure.test.ts` ties the requested HealthKit types to the disclosed
 * ones. `satisfies` fails compilation if a column named here is not on the
 * row type; the `Unselected` assertions fail if a field on the row type is
 * not named here; and the tests build their fixtures by *parsing these
 * strings*, so a column that drifts out of the select drops out of the
 * fixture and the assertion goes red.
 */
export const WORKOUT_SESSION_COLUMNS = [
  'duration_s',
  'source_bundle_id',
  'was_user_entered',
  'has_heart_rate_evidence',
] as const satisfies readonly (keyof WorkoutSessionRow)[];

export const WORKOUT_SESSION_SELECT = WORKOUT_SESSION_COLUMNS.join(', ');

export const DAILY_SLEEP_COLUMNS = [
  'local_date',
  'minutes',
  'was_user_entered',
] as const satisfies readonly (keyof DailySleepRow)[];

export const DAILY_SLEEP_SELECT = DAILY_SLEEP_COLUMNS.join(', ');

/** Empty when every field of the row type is named in the select list. */
type UnselectedWorkoutColumn = Exclude<
  keyof WorkoutSessionRow,
  (typeof WORKOUT_SESSION_COLUMNS)[number]
>;
type UnselectedSleepColumn = Exclude<
  keyof DailySleepRow,
  (typeof DAILY_SLEEP_COLUMNS)[number]
>;

// Referenced by the export so `noUnusedLocals` cannot delete the guard by
// complaining about it — the same arrangement `activity-types.ts` uses.
const _workoutColumnsComplete: [UnselectedWorkoutColumn] extends [never] ? true : never =
  true;
const _sleepColumnsComplete: [UnselectedSleepColumn] extends [never] ? true : never = true;

export const SELECT_LISTS_CHECKED = [
  _workoutColumnsComplete,
  _sleepColumnsComplete,
] as const;

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
