import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  currentLocalDate,
  dominantStat,
  type CoreStat,
  type Dominance,
} from '@kairo/core';
import { DEMO_SCORE } from '@/features/demo/fixtures.ts';
import { demoResult, useDemoOn } from '@/features/demo/useDemo.ts';
import { supabase } from '@/lib/supabase.ts';

export type TodayScore = {
  agi_points: number;
  str_points: number;
  mind_points: number;
  consistency_points: number;
  total: number;
  tiers: Record<string, string>;
  contributing_stats: number;
  status: 'provisional' | 'final';
};

/**
 * Twin of `profileKey()`. `sync-health` invalidates this the moment it writes
 * a bucket, so the key has to be reconstructable outside the hook.
 */
export function todayScoreKey(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return ['today-score', userId ?? 'none', localDate ?? 'none'] as const;
}

/**
 * Today's row, in the user's own timezone (§2) — not the device's calendar
 * date, and not UTC. A squad spans several calendar dates at any instant.
 */
export function useTodayScore(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  const demo = useDemoOn();

  const query = useQuery({
    queryKey: todayScoreKey(userId, localDate),
    enabled: !demo && Boolean(userId && localDate),
    queryFn: async (): Promise<TodayScore | null> => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select(
          'agi_points, str_points, mind_points, ' +
            'consistency_points, total, tiers, ' +
            'contributing_stats, status',
        )
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // null until sync-health writes the first bucket. The UI renders zeros.
      return (data as TodayScore | null) ?? null;
    },
  });

  return demo ? demoResult<TodayScore | null>(DEMO_SCORE) : query;
}

/**
 * How many days of scores "what you've been grinding" covers.
 *
 * §6 implies lifetime — "two people at the same overall level look different
 * based on which stats they grinded" — but no lifetime per-stat rollup exists:
 * `profiles.total_xp` rolls up `xp_awarded`, not per-stat points. Summing the
 * user's own recent `daily_scores` instead costs no migration and reads as
 * recent behaviour, which is arguably the better signal for a character that
 * should respond to what you do. Named so widening it is one edit.
 */
export const DOMINANCE_WINDOW_DAYS = 14;

export function dominanceKey(
  userId: string | undefined,
  throughLocalDate: string | undefined,
) {
  return ['dominance', userId ?? 'none', throughLocalDate ?? 'none'] as const;
}

/**
 * The stat the caller has been grinding lately (§6), or 'balanced', or null
 * for a character that has not started.
 *
 * The caller's own `daily_scores` rows only — squadmates' per-stat points are
 * exactly what §5's projection exists to withhold, and there is nothing here
 * that could widen into them.
 */
export function useDominantStat(
  userId: string | undefined,
  timeZone: string | undefined,
) {
  const today = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  // Inclusive of both ends, so a window of 14 covers today and 13 before it.
  const since = today ? addDays(today, -(DOMINANCE_WINDOW_DAYS - 1)) : undefined;

  return useQuery({
    queryKey: dominanceKey(userId, today),
    enabled: Boolean(userId && today),
    queryFn: async (): Promise<Dominance> => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select('agi_points, str_points, mind_points')
        .eq('user_id', userId as string)
        .gte('local_date', since as string)
        .lte('local_date', today as string);

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as ReadonlyArray<Record<string, number>>;
      // Explicit per-stat columns, never `${stat.toLowerCase()}_points`. MND's
      // column is `mind_points`, not `mnd_points` — it is the one stat whose
      // id and column name disagree, so string-building the key silently read
      // undefined, `?? 0` swallowed it, and MND could never be dominant.
      const totals: Record<CoreStat, number> = { AGI: 0, STR: 0, MND: 0 };
      for (const row of rows) {
        totals.AGI += row.agi_points ?? 0;
        totals.STR += row.str_points ?? 0;
        totals.MND += row.mind_points ?? 0;
      }

      return dominantStat(totals);
    },
  });
}

/** Cache key for the account's lifetime scored-day count. */
export function scoredDayCountKey(userId: string | undefined) {
  return ['scored-day-count', userId] as const;
}

/**
 * How many days this account has ever scored **above zero**.
 *
 * The `total > 0` filter is load-bearing, not tidiness. `sync-health` writes a
 * `daily_scores` row for every date in the payload whether or not it scored,
 * and `resolveSyncWindow` always sends today *and* yesterday
 * (`ROUTINE_WINDOW_DAYS = 2`). So a bare row count reads 2 the moment a user
 * installs and syncs once, and 3 the next day — meaning the disclosure gate
 * would open on day 1 for someone who has done nothing, which is the whole
 * design defeated. Counting real days makes the threshold mean what it says.
 *
 * A `head: true` count rather than a select: the rows themselves are never
 * needed, only how many there are, and a user a year in has 365 of them.
 * Clients hold SELECT on their own `daily_scores` rows, so this needs no RPC.
 *
 * Feeds `disclosureStage`, so it is deliberately a **lifetime** count and not a
 * windowed one — see the note in `packages/kairo-core/src/disclosure.ts`. Its
 * second reader is `SyncStatus`, which asks the same question for a different
 * reason: "has anything ever arrived from Apple Health".
 */
export function useScoredDayCount(userId: string | undefined) {
  return useQuery({
    queryKey: scoredDayCountKey(userId),
    enabled: userId !== undefined,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('daily_scores')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId as string)
        .gt('total', 0);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

/**
 * Today's step count, summed from the caller's own hourly buckets.
 *
 * Only the first-sync callout needs this — `daily_scores` stores points and
 * tiers, not raw measurements, and "4,300 steps" is the number a person
 * recognises as their day. The caller's own `health_buckets` rows only; §5's
 * projection exists precisely so nobody else's are reachable.
 */
export function todayStepsKey(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return ['today-steps', userId ?? 'none', localDate ?? 'none'] as const;
}

export function useTodaySteps(
  userId: string | undefined,
  timeZone: string | undefined,
  enabled: boolean,
) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: todayStepsKey(userId, localDate),
    enabled: enabled && Boolean(userId && localDate),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('health_buckets')
        .select('steps')
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string);

      if (error) throw new Error(error.message);
      return ((data ?? []) as ReadonlyArray<{ steps: number }>).reduce(
        (sum, row) => sum + Number(row.steps),
        0,
      );
    },
  });
}
