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
  /**
   * Apple's `HKWasUserEntered` on the sample. Undefined reads as false at the
   * read site — absent is not a claim of manual entry.
   */
  wasUserEntered: boolean;
}

/** One local date's sleep, as `daily_sleep` stores it. */
export interface SleepNight {
  localDate: string;
  minutes: number;
  /**
   * True only when **every** asleep segment behind this date was hand-typed.
   *
   * Decided here rather than on the server because `daily_sleep` holds one row
   * per date and the segments are gone by then. A day with any genuine segment
   * is not user-entered: partial manual entry must not void real data.
   *
   * The server gates on it twice, and both gates have to agree — the night
   * scores no MND *and* it does not open §3's capability window. Scoring one
   * without the other is the 6,200-against-4,400 breach `capability.ts:34-41`
   * documents, reached from whichever side is left un-gated.
   */
  wasUserEntered: boolean;
}

export function sleepMinutesByDate(
  segments: readonly SleepSegment[],
  dates: readonly string[],
  timeZone: string,
): SleepNight[] {
  const wanted = new Set(dates);

  const asleep = segments.filter(
    (s) => ASLEEP_VALUES.includes(s.value) && s.endMs > s.startMs,
  );
  const intervals: Interval[] = asleep.map((s) => ({
    startMs: s.startMs,
    endMs: s.endMs,
  }));

  const totals = new Map<string, number>();
  /** Dates with at least one asleep segment Apple did not mark hand-typed. */
  const genuine = new Set<string>();

  // Merged before attribution, not after: two sources reporting the same night
  // must become one interval before anyone counts minutes.
  for (const interval of mergeIntervals(intervals)) {
    // Attributed by wake time — "last night's sleep" belongs to the day you
    // get up on. `endMs - 1` so a session ending exactly at local midnight
    // lands on the day that just ended rather than the one starting.
    const localDate = currentLocalDate(new Date(interval.endMs - 1), timeZone);
    if (!wanted.has(localDate)) continue;

    const minutes = (interval.endMs - interval.startMs) / 60_000;
    totals.set(localDate, (totals.get(localDate) ?? 0) + minutes);

    // A merge is a union, so every segment falls wholly inside exactly one
    // merged interval — containment is an exact test, not an approximation.
    // The date the *interval* was attributed to is the one that inherits the
    // evidence, which is why this is not read off the segment's own end time:
    // the two can disagree, and the minutes follow the interval.
    for (const s of asleep) {
      if (
        !s.wasUserEntered &&
        s.startMs >= interval.startMs &&
        s.endMs <= interval.endMs
      ) {
        genuine.add(localDate);
        break;
      }
    }
  }

  return [...totals.entries()]
    .map(([localDate, minutes]) => ({
      localDate,
      minutes: Math.min(MAX_SLEEP_MINUTES, Math.round(minutes)),
      wasUserEntered: !genuine.has(localDate),
    }))
    // A date with no asleep time is omitted entirely. `daily_sleep`'s absence
    // means "no REC bonus"; a zero row would claim it was measured as nothing.
    // It also means a date with no segments carries no `wasUserEntered` claim,
    // which is the honest reading — absence is not hand entry.
    .filter((r) => r.minutes > 0)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : 1));
}
