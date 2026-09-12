import { useQuery } from '@tanstack/react-query';
import { aggregateBuckets, currentLocalDate, type DayTotals, type HourBucket } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { scoredSleepMinutes, type DailySleepVitalsRow } from './sleep-vitals.ts';

export function todayBucketsKey(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return ['today-buckets', userId ?? 'none', localDate ?? 'none'] as const;
}

export interface TodayRaw {
  totals: DayTotals;
}

/**
 * The caller's OWN hourly buckets for today, aggregated.
 *
 * `daily_scores` stores points and tiers, not raw values, so neither the
 * guidance line's "1,240 more steps" nor the TODAY panel's real figures are
 * derivable from it. Own rows only — `health_buckets_select_own` is the whole
 * grant, and §5's projection is untouched: nothing here can widen into a
 * squadmate's raw movement, and heart rate in particular never leaves this
 * query (it is at least as revealing as the hourly step pattern §5 protects).
 */
export function useTodayBuckets(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: todayBucketsKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<TodayRaw> => {
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

      const rows = (data ?? []) as BucketRow[];

      const buckets: HourBucket[] = rows.map((b) => ({
        hour: b.hour,
        steps: b.steps,
        distanceM: Number(b.distance_m),
        activeKcal: Number(b.active_kcal),
        activeMinutes: Number(b.active_minutes),
      }));

      // No rows is a real, correct zero day — not an error and not absence.
      return { totals: aggregateBuckets(buckets) };
    },
  });
}

export function todayVitalsKey(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return ['today-vitals', userId ?? 'none', localDate ?? 'none'] as const;
}

/** The per-day wearable figure. Absent is the phone-only case. */
export interface TodayVitals {
  /**
   * **Gated, not raw.** Null for a hand-typed night as well as for no night at
   * all, because that is what the day scored — see `sleep-vitals.ts`. Every
   * consumer reads this one field, which is why the gate is here and not on
   * any of them.
   */
  sleepMinutes: number | null;
}

/**
 * Today's sleep — the per-day figure only a wearable produces.
 *
 * Owner-readable only, like the buckets above, and absent from every
 * projection.
 */
export function useTodayVitals(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: todayVitalsKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<TodayVitals> => {
      const sleep = await supabase
        .from('daily_sleep')
        // `was_user_entered` is selected because the score reads it. A
        // hand-typed night is stored with its minutes intact and scored at
        // zero, so a client selecting `minutes` alone reports progress the
        // day does not have — `scoredSleepMinutes` is the same gate the
        // Edge Function applies.
        .select('minutes, was_user_entered')
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string)
        .maybeSingle();

      // `maybeSingle` returns no error for no row, so a thrown error here is a
      // real failure rather than "this user has no wearable".
      if (sleep.error) throw new Error(sleep.error.message);

      return { sleepMinutes: scoredSleepMinutes(sleep.data as DailySleepVitalsRow | null) };
    },
  });
}
