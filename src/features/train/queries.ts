import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  CHALLENGE_WINDOW_DAYS,
  currentLocalDate,
  type ChallengeArea,
  type WorkoutSession,
} from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import type { DailyWalkDay } from './daily-walk.ts';

/**
 * How far back the walk streak is counted.
 *
 * A bound rather than "all of history": this is a card on the home shelf, and
 * an unbounded scan grows with the account forever to answer a question about
 * a run of days. The honest cost is that a streak longer than the window reads
 * as capped at the window — which nobody has yet, and which is a better failure
 * than a query that slows down the longer someone stays.
 */
export const WALK_STREAK_WINDOW_DAYS = 90;

export function walkHistoryKey(userId: string | undefined, today: string | undefined) {
  return ['walk-history', userId ?? 'none', today ?? 'none'] as const;
}

/**
 * The trailing window of days, as "did the walk clear".
 *
 * Reads `tiers->>'AGI'`, which *is* "≥ 10,000 steps" — `DAILY_STEP_BASELINE` is
 * derived from the AGI Gold threshold precisely so this reading is exact.
 * `daily_scores` stores tiers and never raw steps, so this is the whole reason
 * the walk streak needs no new column and no new sync.
 *
 * Today's own row comes back with the rest and is ignored by `dailyWalkState`,
 * which decides today from live steps instead — today's score is still being
 * rescored while the day runs.
 */
export function useWalkHistory(userId: string | undefined, timeZone: string | undefined) {
  const today = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  const since = today ? addDays(today, -WALK_STREAK_WINDOW_DAYS) : undefined;

  return useQuery({
    queryKey: walkHistoryKey(userId, today),
    enabled: Boolean(userId && today),
    queryFn: async (): Promise<DailyWalkDay[]> => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select('local_date, tiers')
        .eq('user_id', userId as string)
        .gte('local_date', since as string)
        .lte('local_date', today as string);

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as ReadonlyArray<{
        local_date: string;
        tiers: Record<string, string> | null;
      }>;

      return rows.map((row) => ({
        localDate: row.local_date,
        met: row.tiers?.AGI === 'gold',
      }));
    },
  });
}

export function sessionsKey(userId: string | undefined, today: string | undefined) {
  return ['workout-sessions', userId ?? 'none', today ?? 'none'] as const;
}

/**
 * The caller's own workout sessions over the challenge window.
 *
 * The client resolves the same challenge the server does, from the same
 * `resolveChallenge()` in `@kairo/core` — so the card and the push can never
 * disagree about what today's target is. That is the `evaluateGoal` arrangement
 * (deviation #18) applied to challenges: a read-time projection over stored
 * rows, with no second implementation and no derived state to go stale.
 *
 * Owner-readable only, and in no projection — a pace carries fitness, and with
 * distance it carries routine.
 */
export function useWorkoutSessions(
  userId: string | undefined,
  timeZone: string | undefined,
) {
  const today = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  const since = today ? addDays(today, -CHALLENGE_WINDOW_DAYS) : undefined;

  return useQuery({
    queryKey: sessionsKey(userId, today),
    enabled: Boolean(userId && today),
    queryFn: async (): Promise<WorkoutSession[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('local_date, activity_type, duration_s, distance_m, active_kcal')
        .eq('user_id', userId as string)
        .gte('local_date', since as string)
        .lte('local_date', today as string);

      if (error) throw new Error(error.message);

      // `numeric` columns arrive as strings over PostgREST — a silent source of
      // string concatenation where arithmetic was meant.
      return (data ?? []).map((row: Record<string, unknown>) => ({
        localDate: row.local_date as string,
        activityType: Number(row.activity_type),
        durationS: Number(row.duration_s ?? 0),
        distanceM: Number(row.distance_m ?? 0),
        activeKcal: Number(row.active_kcal ?? 0),
      }));
    },
  });
}

export interface ChallengeClear {
  area: ChallengeArea;
  localDate: string;
  xpAwarded: number;
}

export function clearsKey(userId: string | undefined) {
  return ['challenge-clears', userId ?? 'none'] as const;
}

/**
 * Recent clears, newest first.
 *
 * Read from `challenge_completions` rather than recomputed: the stored `target`
 * is the answer to "what did I clear in March", and the trailing median can no
 * longer produce it.
 */
export function useChallengeClears(userId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: clearsKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<ChallengeClear[]> => {
      const { data, error } = await supabase
        .from('challenge_completions')
        .select('area, local_date, xp_awarded')
        .eq('user_id', userId as string)
        .order('local_date', { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);

      return (data ?? []).map((row: Record<string, unknown>) => ({
        area: row.area as ChallengeArea,
        localDate: row.local_date as string,
        xpAwarded: Number(row.xp_awarded ?? 0),
      }));
    },
  });
}
