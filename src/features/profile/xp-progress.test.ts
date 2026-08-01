import { describe, expect, it } from 'vitest';
import { levelForXp, xpForLevel } from '@kairo/core';
import { xpProgress } from './xp-progress.ts';

describe('xpProgress', () => {
  it('starts a brand new character at the bottom of level 1', () => {
    expect(xpProgress(0)).toEqual({
      level: 1,
      intoLevel: 0,
      neededForNext: 25,
      fraction: 0,
    });
  });

  it('sits at zero progress on an exact level boundary', () => {
    // 625 XP is exactly level 6 — the second evolution stage.
    expect(xpForLevel(6)).toBe(625);
    expect(xpProgress(625)).toEqual({
      level: 6,
      intoLevel: 0,
      neededForNext: 275,
      fraction: 0,
    });
  });

  it('reports how far into the current level the XP sits', () => {
    const progress = xpProgress(625 + 137);

    expect(progress.level).toBe(6);
    expect(progress.intoLevel).toBe(137);
    expect(progress.neededForNext).toBe(275);
    expect(progress.fraction).toBeCloseTo(137 / 275);
  });

  it('is one XP short of the next level, not into it', () => {
    const progress = xpProgress(xpForLevel(7) - 1);

    expect(progress.level).toBe(6);
    expect(progress.fraction).toBeGreaterThan(0.99);
    expect(progress.fraction).toBeLessThan(1);
  });

  // The curve is quadratic, so a large total makes each band enormous. The bar
  // must stay a bar rather than overflowing or inverting.
  it('keeps the fraction inside [0, 1] for a very large total', () => {
    const progress = xpProgress(1_000_000_000);

    expect(progress.level).toBe(levelForXp(1_000_000_000));
    expect(progress.fraction).toBeGreaterThanOrEqual(0);
    expect(progress.fraction).toBeLessThanOrEqual(1);
    expect(progress.intoLevel).toBeGreaterThanOrEqual(0);
  });

  // total_xp is a trigger-maintained rollup and should never go negative, but
  // a bar that renders backwards is a worse failure than one that reads zero.
  it('treats a nonsense total as an empty level 1', () => {
    expect(xpProgress(-500)).toEqual({
      level: 1,
      intoLevel: 0,
      neededForNext: 25,
      fraction: 0,
    });
    expect(xpProgress(Number.NaN).fraction).toBe(0);
  });
});
