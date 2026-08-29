import { describe, expect, it } from 'vitest';
import { computeDay } from './compute.ts';
import type { HourBucket } from './types.ts';

const MANILA = 'Asia/Manila';
const DAY = '2026-07-27';

/**
 * A gym day: 2,000 steps spread over six active hours, 450 kcal, 45 exercise
 * minutes.
 *
 * Under the three-stat model that is AGI bronze (250) — the six active hours
 * shift its bands 15% and 2,000 still does not reach the 4,250 silver — plus
 * STR gold (1,200), no sleep, and a two-of-three breadth bonus of 400. 1,850.
 */
function gymDay(): HourBucket[] {
  const buckets: HourBucket[] = [];
  for (let hour = 0; hour < 6; hour++) {
    buckets.push({
      hour,
      steps: hour === 5 ? 750 : 250,
      distanceM: 0,
      activeKcal: hour === 0 ? 450 : 0,
      activeMinutes: hour === 0 ? 45 : 0,
    });
  }
  return buckets;
}

describe('computeDay', () => {
  it('stores the health total as the day total', () => {
    const result = computeDay({
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
    });

    expect(result.score.healthTotal).toBe(1_985);
    expect(result.total).toBe(1_985);
  });

  it('is provisional before the grace window closes', () => {
    const result = computeDay({
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T17:00:00Z'), // 1h into the grace window
      buckets: gymDay(),
    });
    expect(result.status).toBe('provisional');
  });

  it('is final once the grace window closes', () => {
    const result = computeDay({
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T18:00:00Z'),
      buckets: gymDay(),
    });
    expect(result.status).toBe('final');
  });

  it('scores base points with no featured stat by default (deviation #10)', () => {
    // 2026-07-27 is a Monday in ISO week 31, which the retired rotation would
    // have made an AGI week (31 - 1 = 30, 30 % 3 = 0 -> AGI). Squad programs
    // carry the meta now, at read time, so stored points must be pre-multiplier.
    const result = computeDay({
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
    });
    expect(result.score.featuredStat).toBeNull();
    expect(result.score.stats.AGI.base).toBe(385);
    expect(result.score.stats.AGI.points).toBe(385);
  });

  it('honours an explicitly supplied featured stat', () => {
    const result = computeDay({
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
      featuredStat: 'STR',
    });
    expect(result.score.featuredStat).toBe('STR');
    expect(result.score.stats.STR.points).toBe(1_800);
  });

  // The two inputs `sync-health` fills in during Phase 3. They are forwarded
  // rather than derived — deriving either would need a clock and I/O, which is
  // the one thing this package may not have.
  it('forwards earnableStats to the scorer', () => {
    const base = {
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
    };
    expect(computeDay(base).score.normalizationFactor).toBe(1);
    expect(computeDay({ ...base, earnableStats: 2 }).score.normalizationFactor).toBe(1.5);
  });

  it('forwards verifiedStrengthMinutes to the scorer', () => {
    const base = {
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      // 300 kcal: Body silver on its own, gold once 60 verified strength
      // minutes are credited into the raw value (240 kcal-equivalent).
      buckets: [
        { hour: 0, steps: 0, distanceM: 0, activeKcal: 300, activeMinutes: 60 },
      ] as HourBucket[],
    };
    expect(computeDay(base).score.stats.STR.tier).toBe('silver');
    expect(
      computeDay({ ...base, verifiedStrengthMinutes: 60 }).score.stats.STR.tier,
    ).toBe('gold');
  });

  it('scores a rest day as zero, never negative', () => {
    const result = computeDay({
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: [],
    });
    expect(result.total).toBe(0);
  });

  it('is idempotent — recomputing the same inputs gives the same result', () => {
    const input = {
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
    };
    expect(computeDay(input)).toEqual(computeDay(input));
  });
});
