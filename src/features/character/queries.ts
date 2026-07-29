import { useQuery } from '@tanstack/react-query';
import { currentLocalDate } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

export type TodayScore = {
  agi_points: number;
  str_points: number;
  end_points: number;
  vit_points: number;
  rec_points: number;
  consistency_points: number;
  sabotage_delta: number;
  total: number;
  tiers: Record<string, string>;
  contributing_stats: number;
  featured_stat: string | null;
  status: 'provisional' | 'final';
};

/**
 * Today's row, in the user's own timezone (§2) — not the device's calendar
 * date, and not UTC. A squad spans several calendar dates at any instant.
 */
export function useTodayScore(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: ['today-score', userId ?? 'none', localDate ?? 'none'],
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<TodayScore | null> => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select(
          'agi_points, str_points, end_points, vit_points, rec_points, ' +
            'consistency_points, sabotage_delta, total, tiers, ' +
            'contributing_stats, featured_stat, status',
        )
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // null until sync-health writes the first bucket. The UI renders zeros.
      return (data as TodayScore | null) ?? null;
    },
  });
}
