import { describe, expect, it } from 'vitest';
import {
  MAX_REALISTIC_DAILY_XP,
  evolutionStageForLevel,
  levelForXp,
  ratingForStatPoints,
  statPointsForRating,
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

// ---------------------------------------------------------------------------
// Per-stat ability ratings
// ---------------------------------------------------------------------------
//
// The number that replaced Bronze/Silver/Gold on the character sheet. The tier
// engine still scores exactly as it did — `TIER_POINTS`, `tierFor()` and
// `daily_scores.tiers` are untouched — but a medal describes one day, and the
// question the sheet is answering is "how strong am I", which is cumulative.

describe('ratingForStatPoints', () => {
  it('starts at 1, so a new character has abilities rather than nothing', () => {
    // Same floor as `levelForXp`. A stat displayed as 0 reads as broken; a stat
    // displayed as 1 reads as untrained, which is what it is.
    expect(ratingForStatPoints(0)).toBe(1);
  });

  it('treats nonsense input as untrained rather than throwing', () => {
    expect(ratingForStatPoints(-500)).toBe(1);
    expect(ratingForStatPoints(Number.NaN)).toBe(1);
    expect(ratingForStatPoints(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('never decreases as points accumulate', () => {
    let previous = 0;
    for (let points = 0; points <= 200_000; points += 137) {
      const rating = ratingForStatPoints(points);
      expect(rating).toBeGreaterThanOrEqual(previous);
      previous = rating;
    }
  });

  it('always returns a whole number', () => {
    for (const points of [0, 1, 99, 100, 12_345, 900_000]) {
      expect(Number.isInteger(ratingForStatPoints(points))).toBe(true);
    }
  });

  it('grows sub-linearly, so a year of grinding does not run away', () => {
    // Doubling the points must not double the rating — the curve is what keeps
    // an established player and a new one on the same readable scale.
    const early = ratingForStatPoints(10_000);
    const late = ratingForStatPoints(20_000);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(early * 2);
  });

  it('lands a month of gold days on a rating that reads alongside Level', () => {
    // 30 gold days at 900 points a day. The divisor is chosen so this sits in
    // the same range as the level such a player would hold, rather than racing
    // far ahead of it and making the sheet look like two unrelated systems.
    expect(ratingForStatPoints(30 * 900)).toBe(17);
  });
});

describe('statPointsForRating', () => {
  it('is the exact inverse at every boundary', () => {
    // This pair is what gives the stat bar its fill: the fraction between the
    // current rating's floor and the next one's. If they disagree the bar can
    // render past full, or sit at zero on the frame a rating is gained.
    for (let rating = 1; rating <= 60; rating++) {
      expect(ratingForStatPoints(statPointsForRating(rating))).toBe(rating);
    }
  });

  it('puts one point below a boundary in the band beneath it', () => {
    for (let rating = 2; rating <= 60; rating++) {
      expect(ratingForStatPoints(statPointsForRating(rating) - 1)).toBe(rating - 1);
    }
  });

  it('costs nothing to be rating 1', () => {
    expect(statPointsForRating(1)).toBe(0);
    expect(statPointsForRating(0)).toBe(0);
    expect(statPointsForRating(-3)).toBe(0);
  });

  it('gets more expensive every rating, never cheaper', () => {
    let previousCost = -1;
    for (let rating = 2; rating <= 60; rating++) {
      const cost = statPointsForRating(rating) - statPointsForRating(rating - 1);
      expect(cost).toBeGreaterThan(previousCost);
      previousCost = cost;
    }
  });
});
