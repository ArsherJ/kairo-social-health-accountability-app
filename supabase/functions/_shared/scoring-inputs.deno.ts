import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  capabilityWindowStart,
  earnableStatsFor,
  verifiedWorkoutMinutesFrom,
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
    // §3's capability window: has any sleep that SCORES landed in the 14 days
    // ending on the date being scored?
    //
    // Zero minutes is indistinguishable from no data, and an explicitly
    // hand-typed night is `rejected` by `sampleTrust` and scores nothing —
    // counting it would hand the user three earnable stats and only two that
    // can score, factor 1.0 where 1.5 is owed. That filter is user-protective,
    // not anti-cheat. `not.is.true` and not `eq.false` on purpose: every row
    // written before the expand migration has the column NULL, and NULL must
    // stay eligible. A *flagged* night still counts — if a night scores MND it
    // must make MND earnable, which is the 6,200 breach resolved the other way
    // in Phase 1.
    admin
      .from('daily_sleep')
      .select('local_date')
      .eq('user_id', userId)
      .gte('local_date', capabilityWindowStart(localDate))
      .lte('local_date', localDate)
      .gt('minutes', 0)
      .not('was_user_entered', 'is', true),
    // Verified workout minutes for this date. The allowlist is applied here,
    // server-side, on purpose (§3) — a pure function could not reach it, and a
    // client that decided its own verification would be deciding its own
    // score.
    admin
      .from('workout_sessions')
      .select('duration_s, source_bundle_id, was_user_entered, has_heart_rate_evidence')
      .eq('user_id', userId)
      .eq('local_date', localDate),
  ]);

  for (const result of [sleepHistory, sessions]) {
    if (result.error) return { error: result.error.message };
  }

  const scoringSleepDates = (sleepHistory.data ?? []).map(
    (r) => r.local_date as string,
  );

  return {
    earnableStats: earnableStatsFor(scoringSleepDates, localDate),
    verifiedWorkoutMinutes: verifiedWorkoutMinutesFrom(
      (sessions.data ?? []) as WorkoutSessionRow[],
    ),
  };
}
