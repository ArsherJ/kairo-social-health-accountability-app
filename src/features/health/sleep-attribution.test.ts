import { describe, expect, it } from 'vitest';
import {
  ASLEEP_VALUES,
  SLEEP_IN_BED,
  SLEEP_AWAKE,
  sleepMinutesByDate,
  type SleepSegment,
} from './sleep-attribution.ts';

const MANILA = 'Asia/Manila';

/** Manila wall-clock time as a UTC epoch. Manila is UTC+8 year round. */
function manila(day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, 7, day, hour - 8, minute);
}

function segment(startMs: number, endMs: number, value: number): SleepSegment {
  return { startMs, endMs, value };
}

const NIGHT_DATES = ['2026-08-01', '2026-08-02'];

describe('sleepMinutesByDate', () => {
  it('returns nothing for no segments', () => {
    expect(sleepMinutesByDate([], NIGHT_DATES, MANILA)).toEqual([]);
  });

  it('sums a simple night and attributes it to the wake date', () => {
    // 23:00 on 1 Aug to 07:00 on 2 Aug is eight hours of sleep "for" 2 Aug,
    // which is how Apple Health frames it and what recBonusFor expects.
    const result = sleepMinutesByDate(
      [segment(manila(1, 23), manila(2, 7), 1)],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 480 }]);
  });

  it('counts core, deep and REM as sleep', () => {
    const result = sleepMinutesByDate(
      [
        segment(manila(1, 23), manila(2, 1), 3), // core
        segment(manila(2, 1), manila(2, 3), 4), // deep
        segment(manila(2, 3), manila(2, 5), 5), // REM
      ],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 360 }]);
  });

  it('ignores in-bed and awake', () => {
    // Counting inBed would hand REC's bonus to someone who read for nine hours.
    const result = sleepMinutesByDate(
      [
        segment(manila(1, 22), manila(2, 8), SLEEP_IN_BED),
        segment(manila(2, 3), manila(2, 4), SLEEP_AWAKE),
        segment(manila(1, 23), manila(2, 7), 1),
      ],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 480 }]);
  });

  it('counts a night reported by two sources once', () => {
    // A watch and a sleep app both recording the same eight hours must not
    // report sixteen — that crosses REC's over-nine-hours penalty.
    const result = sleepMinutesByDate(
      [
        segment(manila(1, 23), manila(2, 7), 1),
        segment(manila(1, 23), manila(2, 7), 3),
      ],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 480 }]);
  });

  it('unions partially overlapping sources rather than adding them', () => {
    // 23:00-06:00 plus 05:30-07:15 is 23:00-07:15, i.e. 495 minutes.
    const result = sleepMinutesByDate(
      [
        segment(manila(1, 23), manila(2, 6), 1),
        segment(manila(2, 5, 30), manila(2, 7, 15), 1),
      ],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 495 }]);
  });

  it('joins adjacent segments into one night', () => {
    const result = sleepMinutesByDate(
      [
        segment(manila(1, 23), manila(2, 2), 3),
        segment(manila(2, 2), manila(2, 7), 4),
      ],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 480 }]);
  });

  it('attributes a session ending exactly at midnight to the day that ended', () => {
    const result = sleepMinutesByDate(
      [segment(manila(1, 20), manila(2, 0), 1)],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-01', minutes: 240 }]);
  });

  it('adds a nap to the same date as the night', () => {
    const result = sleepMinutesByDate(
      [
        segment(manila(1, 23), manila(2, 7), 1),
        segment(manila(2, 14), manila(2, 15), 1),
      ],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 540 }]);
  });

  it('excludes a night whose wake date is not requested', () => {
    const result = sleepMinutesByDate(
      [segment(manila(4, 23), manila(5, 7), 1)],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([]);
  });

  it('omits a date entirely rather than reporting zero minutes', () => {
    // daily_sleep's absence means "no REC bonus"; a zero row would mean
    // "measured, and it was nothing", which is a different claim (§5).
    const result = sleepMinutesByDate(
      [segment(manila(1, 23), manila(2, 7), SLEEP_AWAKE)],
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([]);
  });

  it('rounds to whole minutes', () => {
    const result = sleepMinutesByDate(
      [segment(manila(2, 1), manila(2, 1) + 89_000, 1)], // 1m29s
      NIGHT_DATES,
      MANILA,
    );
    expect(result).toEqual([{ localDate: '2026-08-02', minutes: 1 }]);
  });

  it('clamps an absurd total to a whole day', () => {
    // The column is `check (minutes between 0 and 1440)`; anything more is a
    // 500 from the server rather than a rejected field.
    const result = sleepMinutesByDate(
      [segment(manila(1, 0), manila(2, 23), 1)],
      NIGHT_DATES,
      MANILA,
    );
    expect(result[0]?.minutes).toBe(1440);
  });

  it('returns dates in ascending order', () => {
    const result = sleepMinutesByDate(
      [
        segment(manila(1, 1), manila(1, 6), 1),
        segment(manila(2, 1), manila(2, 6), 1),
      ],
      NIGHT_DATES,
      MANILA,
    );
    expect(result.map((r) => r.localDate)).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('exposes the asleep values it recognises', () => {
    expect([...ASLEEP_VALUES].sort()).toEqual([1, 3, 4, 5]);
  });
});
