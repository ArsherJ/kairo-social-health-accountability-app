import { describe, expect, it } from 'vitest';
import { hourlySampleInstants, mergeIntervals } from './intervals.ts';

const HOUR = 3_600_000;

describe('mergeIntervals', () => {
  it('returns an empty list unchanged', () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it('leaves disjoint intervals alone, sorted', () => {
    expect(
      mergeIntervals([
        { startMs: 300, endMs: 400 },
        { startMs: 100, endMs: 200 },
      ]),
    ).toEqual([
      { startMs: 100, endMs: 200 },
      { startMs: 300, endMs: 400 },
    ]);
  });

  it('merges overlapping intervals into one', () => {
    // Two sources recording the same night. HKStatistics does this for
    // quantity types automatically; category samples get no such help, so
    // without it a shared night counts twice.
    expect(
      mergeIntervals([
        { startMs: 0, endMs: 500 },
        { startMs: 300, endMs: 800 },
      ]),
    ).toEqual([{ startMs: 0, endMs: 800 }]);
  });

  it('merges intervals that merely touch', () => {
    expect(
      mergeIntervals([
        { startMs: 0, endMs: 500 },
        { startMs: 500, endMs: 900 },
      ]),
    ).toEqual([{ startMs: 0, endMs: 900 }]);
  });

  it('absorbs an interval fully contained in another', () => {
    expect(
      mergeIntervals([
        { startMs: 0, endMs: 1000 },
        { startMs: 200, endMs: 300 },
      ]),
    ).toEqual([{ startMs: 0, endMs: 1000 }]);
  });

  it('collapses a chain of overlaps', () => {
    expect(
      mergeIntervals([
        { startMs: 0, endMs: 100 },
        { startMs: 90, endMs: 200 },
        { startMs: 150, endMs: 400 },
      ]),
    ).toEqual([{ startMs: 0, endMs: 400 }]);
  });

  it('does not mutate its input', () => {
    const input = [
      { startMs: 300, endMs: 400 },
      { startMs: 100, endMs: 200 },
    ];
    mergeIntervals(input);
    expect(input[0]).toEqual({ startMs: 300, endMs: 400 });
  });
});

describe('hourlySampleInstants', () => {
  it('marks both hours a short interval straddles', () => {
    // A run from 08:50 to 09:10 happened in hour 8 and hour 9.
    const start = 8.5 * HOUR + 20 * 60_000; // 08:50
    const instants = hourlySampleInstants(start, start + 20 * 60_000);
    expect(instants).toHaveLength(2);
    expect(instants[0]).toBe(start);
    expect(instants.at(-1)).toBe(start + 20 * 60_000 - 1);
  });

  it('marks every hour a long interval covers', () => {
    const instants = hourlySampleInstants(0, 3 * HOUR);
    // 0, 1h, 2h, and the final instant inside the third hour.
    expect(instants).toEqual([0, HOUR, 2 * HOUR, 3 * HOUR - 1]);
  });

  it('does not mark the hour an interval ends exactly on', () => {
    // Half-open. A workout ending at 10:00 did nothing during hour 10.
    const instants = hourlySampleInstants(9 * HOUR, 10 * HOUR);
    expect(instants).toEqual([9 * HOUR, 10 * HOUR - 1]);
  });

  it('marks its own hour for a zero-length interval', () => {
    expect(hourlySampleInstants(9 * HOUR, 9 * HOUR)).toEqual([9 * HOUR]);
  });

  it('treats a reversed interval as a point', () => {
    expect(hourlySampleInstants(9 * HOUR, 8 * HOUR)).toEqual([9 * HOUR]);
  });

  it('does not emit duplicates for a sub-millisecond interval', () => {
    expect(hourlySampleInstants(100, 101)).toEqual([100]);
  });
});
