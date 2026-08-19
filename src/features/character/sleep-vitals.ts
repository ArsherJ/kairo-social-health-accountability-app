/**
 * The night's sleep as the *score* saw it, for the surfaces that report it.
 *
 * **The client must never claim a number the score does not have.** As of the
 * three-stat switch a hand-typed night scores nothing: `scoringSleepMinutes`
 * in `supabase/functions/_shared/scoring-inputs.ts` gates it, so
 * `daily_scores` gets `mind_points` 0 and MND `none`. The row in `daily_sleep`
 * still carries its minutes — deliberately, so the decision is legible where
 * it is made rather than hidden by a missing row — and a client reading that
 * column raw would put "1h more sleep for Gold Mind" under a stat the server
 * scored at zero, and a sleep figure in the TODAY panel to match.
 *
 * `profiles.has_wearable` does not shield this and cannot: it only goes false
 * for someone whose *every* night is hand-typed, so a watch owner who types in
 * one night is exactly the reader who sees both surfaces lie.
 *
 * Zero imports, so root Vitest can load it — `buckets.ts` reaches Supabase
 * through the `@/` alias and cannot be tested, which is why the decision is
 * here and only the query is there. Same seam as `read.ts` and
 * `sleep-attribution.ts`.
 *
 * **This must stay identical to the server's rule.** The two are not shared
 * code — one is an Edge Function and one is a screen — so they are kept
 * honest by being one line each and by both being tested against the same
 * three cases: a measured night scores, a hand-typed night does not, and NULL
 * is a measured night. NULL is the whole pre-switch cohort and every client
 * that has not updated; reading it as hand entry would blank the sleep row for
 * everyone using Kairo today.
 */

export interface DailySleepVitalsRow {
  /** PostgREST returns an integer column as a number; a widened one as text. */
  minutes: number | string | null;
  was_user_entered: boolean | null;
}

/**
 * **`null`, never `0`.** `stat-detail.ts` already distinguishes "no sleep
 * data" from "zero minutes" — a zero raw value would put MND permanently at
 * the bottom of the closest-gap ranking and let it win the guidance line over
 * stats with real progress. Absent is the honest answer for a night that did
 * not score, and it is the same answer the server hands `planDay`.
 */
export function scoredSleepMinutes(
  row: DailySleepVitalsRow | null | undefined,
): number | null {
  if (row === null || row === undefined) return null;
  if (row.was_user_entered === true) return null;
  const minutes = Number(row.minutes ?? 0);
  return minutes > 0 ? minutes : null;
}
