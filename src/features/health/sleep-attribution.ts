import { currentLocalDate } from '@kairo/core';
import { mergeIntervals, type Interval } from './intervals.ts';

/**
 * Sleep samples -> minutes per local date, for REC (§5).
 *
 * REC is a wearable bonus and never a penalty, so the expensive mistake here is
 * *over*-reporting: `mindTierFor` flattens above nine hours, so double-counting
 * a shared night turns a healthy eight into an oversleep penalty.
 */

/** `CategoryValueSleepAnalysis`: inBed = 0, awake = 2. Neither is sleep. */
export const SLEEP_IN_BED = 0;
export const SLEEP_AWAKE = 2;

/** asleepUnspecified, asleepCore, asleepDeep, asleepREM. */
export const ASLEEP_VALUES: readonly number[] = [1, 3, 4, 5];

const MAX_SLEEP_MINUTES = 1_440;

export interface SleepSegment {
  startMs: number;
  endMs: number;
  /** The raw `CategoryValueSleepAnalysis`. */
  value: number;
}

export function sleepMinutesByDate(
  segments: readonly SleepSegment[],
  dates: readonly string[],
  timeZone: string,
): Array<{ localDate: string; minutes: number }> {
  const wanted = new Set(dates);

  const asleep: Interval[] = segments
    .filter((s) => ASLEEP_VALUES.includes(s.value) && s.endMs > s.startMs)
    .map((s) => ({ startMs: s.startMs, endMs: s.endMs }));

  const totals = new Map<string, number>();

  // Merged before attribution, not after: two sources reporting the same night
  // must become one interval before anyone counts minutes.
  for (const interval of mergeIntervals(asleep)) {
    // Attributed by wake time — "last night's sleep" belongs to the day you
    // get up on. `endMs - 1` so a session ending exactly at local midnight
    // lands on the day that just ended rather than the one starting.
    const localDate = currentLocalDate(new Date(interval.endMs - 1), timeZone);
    if (!wanted.has(localDate)) continue;

    const minutes = (interval.endMs - interval.startMs) / 60_000;
    totals.set(localDate, (totals.get(localDate) ?? 0) + minutes);
  }

  return [...totals.entries()]
    .map(([localDate, minutes]) => ({
      localDate,
      minutes: Math.min(MAX_SLEEP_MINUTES, Math.round(minutes)),
    }))
    // A date with no asleep time is omitted entirely. `daily_sleep`'s absence
    // means "no REC bonus"; a zero row would claim it was measured as nothing.
    .filter((r) => r.minutes > 0)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : 1));
}
