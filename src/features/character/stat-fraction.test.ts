import { describe, expect, it } from 'vitest';
import { STAT_POINTS_MAX } from '@kairo/core';
import { statFraction } from './stat-fraction.ts';

/**
 * These used to assert a second, higher ceiling for a featured stat — §6's
 * weekly ×1.5 rotation. Deviation #10 retired the rotation from stored scoring
 * and `STAT_POINTS_MAX_FEATURED` was deleted with it, so the cases that pinned
 * the two ceilings apart are gone rather than rewritten: there is nothing left
 * for them to distinguish.
 */
describe('statFraction', () => {
  it('reaches 1 at the Gold ceiling (900)', () => {
    expect(statFraction(STAT_POINTS_MAX)).toBe(1);
  });

  it('reads Silver (500) as a fraction of 900', () => {
    expect(statFraction(500)).toBeCloseTo(500 / 900);
  });

  it('reads Bronze (200) as a fraction of 900', () => {
    expect(statFraction(200)).toBeCloseTo(200 / 900);
  });

  it('clamps a value above the ceiling to 1', () => {
    expect(statFraction(STAT_POINTS_MAX + 500)).toBe(1);
  });

  it('clamps a negative value to 0', () => {
    expect(statFraction(-50)).toBe(0);
  });

  it('reads zero as zero', () => {
    expect(statFraction(0)).toBe(0);
  });
});
