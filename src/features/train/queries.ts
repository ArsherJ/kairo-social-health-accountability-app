import { useQuery } from '@tanstack/react-query';
import { addDays, currentLocalDate } from '@kairo/core';
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
