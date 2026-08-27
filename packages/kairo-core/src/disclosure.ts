/**
 * How much of Kairo exists yet, for this account (design §5).
 *
 * A new user met eight retention systems at once — level and XP, four ability
 * ratings, a daily score, streaks, raw metrics, a leaderboard, long-horizon
 * Challenges and squad program multipliers — before having a single day of data to
 * read any of them against. This is the decision to show one loop first:
 * activity, visible character progress, the squad gap, and the Daily Walk as
 * the one daily action.
 *
 * **Hidden, never deleted.** Every gated surface stays built, tested and
 * reachable; the threshold below is one constant, so reversing this is a
 * one-line change plus a test update. That property is what makes it safe to
 * try on a cohort at all.
 *
 * Pure, like everything in this package — the day count is an argument, never
 * a read.
 */

export type DisclosureStage =
  /** The one loop. Challenges and per-stat detail are not on screen. */
  | 'core'
  /** Everything. */
  | 'full';

/**
 * Scored days before the rest of the app appears.
 *
 * Three, not seven: long enough that the Daily Walk streak on screen is a real
 * baseline to read a Challenge target against, short enough that a curious user is not
 * locked out of the app's depth for a week. Pinned by a test, because moving it
 * changes what every new user sees and nothing else would signal the change.
 */
export const DISCLOSURE_THRESHOLD_DAYS = 3;

/**
 * `lifetimeScoredDays` is a count of the account's `daily_scores` rows — every
 * day it has ever scored, not a recent window. That distinction is load-bearing:
 * a gate on recent activity would demote someone returning from a quiet week
 * back to the reduced app, and that user is precisely the one the retention
 * measurement is about.
 */
export function disclosureStage(lifetimeScoredDays: number): DisclosureStage {
  // Guards a NaN from a failed count as well as a negative: `NaN >= n` is
  // false, so both fall to 'core' without a branch of their own.
  return lifetimeScoredDays >= DISCLOSURE_THRESHOLD_DAYS ? 'full' : 'core';
}
