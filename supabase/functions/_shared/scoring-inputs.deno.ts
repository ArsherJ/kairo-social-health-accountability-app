import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  DAILY_SLEEP_SELECT,
  WORKOUT_SESSION_SELECT,
  capabilityWindowStart,
  earnableStatsFor,
  scoringSleepDates,
  scoringSleepMinutes,
  verifiedWorkoutMinutesFrom,
  type DailySleepRow,
  type WorkoutSessionRow,
} from './scoring-inputs.ts';

/**
 * The stored reads behind §2's normalization and §3's STR shift.
 *
 * Split from `scoring-inputs.ts` for the reason the whole `_shared` tree is:
 * this half imports a Deno-only specifier and cannot be loaded by vitest, so
 * everything that *decides* anything lives in the pure module beside it and is
 * tested in plain Node. This file only asks the database.
 *
 * Called by both write paths — `sync-health` and `rescore` — because they must
 * agree. Wiring one and not the other would be worse than wiring neither:
 * replayed history normalized and every subsequent day not, a permanent silent
 * divergence.
 */
export interface ScoringInputs {
  earnableStats: number;
  verifiedWorkoutMinutes: number;
  /**
   * The scored date's sleep as `planDay` should see it, **already gated** — a
   * hand-typed night reads null here.
   *
   * It lives here rather than in each handler's own `daily_sleep` read because
   * the gate and §3's capability window have to agree, and they only agree if
   * one predicate answers both. Two handlers reading sleep two ways is how the
   * 6,200-against-4,400 breach returns: a night that scores MND while the
   * window excludes it gives the day three contributing stats and two earnable.
   */
  sleepMinutes: number | null;
}

/**
 * `localDate` is **the date being scored**, never wall-clock today, and both
 * reads are keyed on it. `sync-health` scores every date in its payload, so
 * this belongs inside that loop and not hoisted above it — hoisting is the
 * same class of bug as reading the clock, and it fails the same way: sleep on
 * the scored date still makes MND score while the capability window is
 * measured somewhere else entirely, so the day pays 6,200 against a 4,400
 * ceiling with `contributing_stats` at 3.
 *
 * Errors are returned, not thrown, so the caller decides — matching every
 * other `admin.from(...)` read in these two handlers.
 */
export async function readScoringInputs(
  admin: SupabaseClient,
  args: { userId: string; localDate: string },
): Promise<ScoringInputs | { error: string }> {
  const { userId, localDate } = args;

  const [sleepHistory, sessions] = await Promise.all([
    // §3's capability window, **unfiltered on purpose**. The window is
    // inclusive of the scored date, so these same rows answer both questions:
    // which nights make MND earnable, and how many minutes the scored date
    // itself contributes. One query, one predicate, and therefore no way for
    // the two answers to disagree — which is the 6,200 breach.
    //
    // The filtering that used to live in this query (`gt('minutes', 0)`,
    // `not('was_user_entered', 'is', true)`) moved into `scoringSleepDates`
    // and `scoringSleepMinutes`, where it is tested in plain Node. A decision
    // in a PostgREST chain in this file is a decision no test can reach — the
    // whole reason the pure/`.deno.ts` seam exists. The hand-typed row is
    // still read rather than filtered away, so the gate is legible at the
    // point it is applied.
    admin
      .from('daily_sleep')
      .select(DAILY_SLEEP_SELECT)
      .eq('user_id', userId)
      .gte('local_date', capabilityWindowStart(localDate))
      .lte('local_date', localDate),
    // Verified workout minutes for this date. The allowlist is applied here,
    // server-side, on purpose (§3) — a pure function could not reach it, and a
    // client that decided its own verification would be deciding its own
    // score.
    admin
      .from('workout_sessions')
      .select(WORKOUT_SESSION_SELECT)
      .eq('user_id', userId)
      .eq('local_date', localDate),
  ]);

  for (const result of [sleepHistory, sessions]) {
    if (result.error) return { error: result.error.message };
  }

  // Both select strings are constants derived from these row types, and both
  // sides of that pairing are guarded — `satisfies` at compile time, and a
  // test that builds its fixtures by parsing the strings. A cast checks
  // nothing, and a drifted select would read `undefined` on every field: a
  // zero STR shift and an unscored night, with no error anywhere.
  const sleepRows = (sleepHistory.data ?? []) as unknown as DailySleepRow[];

  return {
    earnableStats: earnableStatsFor(scoringSleepDates(sleepRows), localDate),
    sleepMinutes: scoringSleepMinutes(sleepRows, localDate),
    verifiedWorkoutMinutes: verifiedWorkoutMinutesFrom(
      (sessions.data ?? []) as unknown as WorkoutSessionRow[],
    ),
  };
}
