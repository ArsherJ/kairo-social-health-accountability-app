import { useQuery } from '@tanstack/react-query';
import { aggregateBuckets, currentLocalDate, type DayTotals, type HourBucket } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

export function todayBucketsKey(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return ['today-buckets', userId ?? 'none', localDate ?? 'none'] as const;
}

/**
 * The caller's OWN hourly buckets for today, aggregated.
 *
 * `daily_scores` stores points and tiers, not raw values, so the stat detail
 * line's "1,240 more steps for Gold" is not derivable from it. Own rows only —
 * `health_buckets_select_own` is the whole grant, and §5's projection is
 * untouched: nothing here can widen into a squadmate's raw movement.
 */
export function useTodayBuckets(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: todayBucketsKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<DayTotals> => {
      const { data, error } = await supabase
        .from('health_buckets')
        .select('hour, steps, distance_m, active_kcal, active_minutes')
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string);

      if (error) throw new Error(error.message);

      // distance_m, active_kcal, active_minutes are Postgres numerics, which
      // supabase-js hands back as strings — Number() below normalises them.
      type BucketRow = {
        hour: number;
        steps: number;
        distance_m: number | string;
        active_kcal: number | string;
        active_minutes: number | string;
      };

      const buckets: HourBucket[] = ((data ?? []) as BucketRow[]).map((b) => ({
        hour: b.hour,
        steps: b.steps,
        distanceM: Number(b.distance_m),
        activeKcal: Number(b.active_kcal),
        activeMinutes: Number(b.active_minutes),
      }));

      // No rows is a real, correct zero day — not an error and not absence.
      return aggregateBuckets(buckets);
    },
  });
}
