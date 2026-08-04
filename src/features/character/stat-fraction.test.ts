import { describe, expect, it } from 'vitest';
import { STAT_POINTS_MAX, STAT_POINTS_MAX_FEATURED } from '@kairo/core';
import { statFraction } from './stat-fraction.ts';

describe('statFraction', () => {
  it('reaches 1 for an unfeatured stat at the Gold ceiling (900)', () => {
    expect(statFraction(STAT_POINTS_MAX, false)).toBe(1);
  });

  it('reads an unfeatured stat at Silver (500) as a fraction of 900', () => {
    expect(statFraction(500, false)).toBeCloseTo(500 / 900);
  });

  it('reads an unfeatured stat at Bronze (200) as a fraction of 900', () => {
    expect(statFraction(200, false)).toBeCloseTo(200 / 900);
  });

  it('reaches exactly 1 for a featured stat at the featured ceiling (1,350)', () => {
    expect(statFraction(STAT_POINTS_MAX_FEATURED, true)).toBe(1);
  });

  // The whole point of the featured ceiling: a featured Gold (900 points)
  // must NOT read as 100% — that would erase the only visual difference the
  // weekly ×1.5 meta produces, which is exactly what measuring against the
  // unfeatured ceiling (900) would do.
  it('does not peg a featured Gold at 1 when measured against the unfeatured ceiling', () => {
    const fraction = statFraction(STAT_POINTS_MAX, true);
    expect(fraction).toBeLessThan(1);
    expect(fraction).toBeCloseTo(STAT_POINTS_MAX / STAT_POINTS_MAX_FEATURED);
  });

  it('clamps a value above the ceiling to 1', () => {
    expect(statFraction(STAT_POINTS_MAX_FEATURED + 500, false)).toBe(1);
    expect(statFraction(STAT_POINTS_MAX_FEATURED * 2, true)).toBe(1);
  });

  it('clamps a negative value to 0', () => {
    expect(statFraction(-50, false)).toBe(0);
  });

  it('reads zero as zero', () => {
    expect(statFraction(0, false)).toBe(0);
    expect(statFraction(0, true)).toBe(0);
  });
});
