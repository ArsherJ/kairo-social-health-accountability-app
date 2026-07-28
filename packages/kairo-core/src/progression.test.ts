import { describe, expect, it } from 'vitest';
import {
  MAX_REALISTIC_DAILY_XP,
  evolutionStageForLevel,
  levelForXp,
  xpForLevel,
} from './progression.ts';

describe('levelForXp', () => {
  it('starts everyone at level 1', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('never returns below level 1, even for nonsense input', () => {
    expect(levelForXp(-500)).toBe(1);
  });

  it('increases monotonically', () => {
    let previous = 0;
    for (let xp = 0; xp <= 30_000; xp += 137) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('round-trips with xpForLevel', () => {
    for (let level = 1; level <= 40; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      // One XP short of the threshold must still be the previous level.
      if (level > 1) {
        expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
      }
    }
  });
});

describe('curve calibration', () => {
  // A committed player earns roughly 95-140 XP/day (see the XP tests in
  // scoring.test.ts: 10/25/50 per bronze/silver/gold across four stats).
  const TYPICAL_DAILY_XP = 100;
  const days = (n: number) => levelForXp(TYPICAL_DAILY_XP * n);

  it('reaches the second evolution stage inside the first fortnight', () => {
    // Level 6 is the first visual change (§6). If that takes a month, the
    // character never feels responsive during the window that decides
    // retention.
    expect(days(14)).toBeGreaterThanOrEqual(6);
    expect(days(3)).toBeLessThan(6);
  });

  it('reaches the third stage around the first month', () => {
    expect(days(30)).toBeGreaterThanOrEqual(11);
    expect(days(14)).toBeLessThan(11);
  });

  it('reaches the final stage around the 100-day mark', () => {
    // Deliberately lines up with the 100-day streak legendary cosmetic (§19),
    // so the two long-term goals land together.
    expect(days(100)).toBeGreaterThanOrEqual(21);
    expect(days(60)).toBeLessThan(21);
  });

  it('cannot be rushed past the first stage in a single day', () => {
    expect(levelForXp(MAX_REALISTIC_DAILY_XP)).toBeLessThan(6);
  });
});

describe('evolutionStageForLevel', () => {
  it('maps the spec bands', () => {
    for (const level of [1, 3, 5]) expect(evolutionStageForLevel(level)).toBe(1);
    for (const level of [6, 8, 10]) expect(evolutionStageForLevel(level)).toBe(2);
    for (const level of [11, 15, 20]) expect(evolutionStageForLevel(level)).toBe(3);
    for (const level of [21, 40, 99]) expect(evolutionStageForLevel(level)).toBe(4);
  });

  it('clamps nonsense input to the first stage', () => {
    expect(evolutionStageForLevel(0)).toBe(1);
    expect(evolutionStageForLevel(-3)).toBe(1);
  });
});
