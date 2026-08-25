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
  /**
   * 24 entries, one per hour, `null` where nothing was measured. Feeds
   * `computeStrain()`; empty of readings for a phone-only user, which is what
   * makes strain null rather than zero for them.
   */
  hourlyAvgHr: (number | null)[];
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
        .select('hour, steps, distance_m, active_kcal, active_minutes, avg_heart_rate')
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
        avg_heart_rate: number | string | null;
      };

      const rows = (data ?? []) as BucketRow[];

      const buckets: HourBucket[] = rows.map((b) => ({
        hour: b.hour,
        steps: b.steps,
        distanceM: Number(b.distance_m),
        activeKcal: Number(b.active_kcal),
        activeMinutes: Number(b.active_minutes),
      }));

      // Indexed by hour rather than pushed in row order: rows arrive unordered,
      // and strain sums over them anyway — but an array of 24 keeps "hour 14
      // was not measured" expressible, which a filtered list would lose.
      const hourlyAvgHr: (number | null)[] = Array.from({ length: 24 }, () => null);
      for (const b of rows) {
        // null stays null. A measured 0 would read as an hour below resting;
        // an unmeasured hour contributes nothing at all.
        if (b.avg_heart_rate === null) continue;
        if (b.hour >= 0 && b.hour < 24) hourlyAvgHr[b.hour] = Number(b.avg_heart_rate);
      }

      // No rows is a real, correct zero day — not an error and not absence.
      return { totals: aggregateBuckets(buckets), hourlyAvgHr };
    },
  });
}

export function todayVitalsKey(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return ['today-vitals', userId ?? 'none', localDate ?? 'none'] as const;
}

/** The two per-day wearable figures. Both absent is the phone-only case. */
export interface TodayVitals {
  restingHr: number | null;
  /**
   * **Gated, not raw.** Null for a hand-typed night as well as for no night at
   * all, because that is what the day scored — see `sleep-vitals.ts`. Both
   * consumers on the home screen (`resolveStatDetail`'s Mind gap and
   * `TodayPanel`'s sleep row) read this one field, which is why the gate is
   * here and not on either of them.
   */
  sleepMinutes: number | null;
}

/**
 * Today's resting heart rate and sleep — the two figures that are per-day
 * rather than per-hour, and the two that only a wearable produces.
 *
 * Two tables, one hook: they are always wanted together (strain needs the
 * resting rate; the TODAY panel shows both), they are the same shape, and a
 * second hook would double the round trips for two single-row reads.
 *
 * Owner-readable only, like the buckets above. Neither reaches any projection —
 * `daily_heart` in particular is deliberately absent from `squad_leaderboard()`
 * and `event_progress()`.
 */
export function useTodayVitals(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: todayVitalsKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<TodayVitals> => {
      const [heart, sleep] = await Promise.all([
        supabase
          .from('daily_heart')
          .select('resting_hr')
          .eq('user_id', userId as string)
          .eq('local_date', localDate as string)
          .maybeSingle(),
        supabase
          .from('daily_sleep')
          // `was_user_entered` is selected because the score reads it. A
          // hand-typed night is stored with its minutes intact and scored at
          // zero, so a client selecting `minutes` alone reports progress the
          // day does not have — `scoredSleepMinutes` is the same gate the
          // Edge Function applies.
          .select('minutes, was_user_entered')
          .eq('user_id', userId as string)
          .eq('local_date', localDate as string)
          .maybeSingle(),
      ]);

      // `maybeSingle` returns no error for no row, so a thrown error here is a
      // real failure rather than "this user has no wearable".
      if (heart.error) throw new Error(heart.error.message);
      if (sleep.error) throw new Error(sleep.error.message);

      return {
        restingHr: (heart.data as { resting_hr: number } | null)?.resting_hr ?? null,
        sleepMinutes: scoredSleepMinutes(sleep.data as DailySleepVitalsRow | null),
      };
    },
  });
}
