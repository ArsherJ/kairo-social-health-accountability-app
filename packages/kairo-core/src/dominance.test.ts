import { describe, expect, it } from 'vitest';
import { BALANCED_TOLERANCE, dominantStat } from './dominance.ts';
import type { CoreStat } from './types.ts';

function points(agi: number, str: number, mnd = 0): Record<CoreStat, number> {
  return { AGI: agi, STR: str, MND: mnd };
}

describe('dominantStat', () => {
  it('names the stat with the most points', () => {
    expect(dominantStat(points(900, 300, 250))).toBe('AGI');
    expect(dominantStat(points(100, 900, 250))).toBe('STR');
  });

  // A character with no points is unstarted, not "an All-Rounder". Calling it
  // balanced would award the rarest-sounding treatment for doing nothing.
  it('returns null when nothing has been earned', () => {
    expect(dominantStat(points(0, 0, 0))).toBeNull();
  });

  it('calls three identical stats balanced', () => {
    // dominantStat loops over every CORE_STATS member, so an unmentioned MND
    // would default to 0 and break the "identical" premise. It is passed
    // explicitly for that reason.
    expect(dominantStat(points(400, 400, 400))).toBe('balanced');
  });

  it('calls a spread of exactly the tolerance balanced', () => {
    // 800 is 20% below 1000 — the edge is inclusive.
    expect(BALANCED_TOLERANCE).toBe(0.2);
    expect(dominantStat(points(1000, 850, 800))).toBe('balanced');
  });

  it('names a winner one point past the tolerance', () => {
    expect(dominantStat(points(1000, 850, 799))).toBe('AGI');
  });

  it('names the only stat that scored', () => {
    expect(dominantStat(points(0, 0, 500))).toBe('MND');
  });

  /**
   * The phone-only cohort's permanent state: no trusted sleep source, so MND
   * is always 0. Two strong stats and a zero is a lopsided character, and must
   * never render as an All-Rounder — normalization fixes their *score*, not
   * what their silhouette should look like.
   */
  it('does not read a permanently zero MND as balanced', () => {
    expect(dominantStat(points(900, 900, 0))).toBe('AGI');
  });

  // Ties have to resolve the same way every render, or the character flickers
  // between two silhouettes on refetch.
  it('breaks a tie for the lead in a stable, declared order', () => {
    expect(dominantStat(points(500, 500, 0))).toBe('AGI');
    expect(dominantStat(points(0, 500, 500))).toBe('STR');
  });

  // Stat points are non-negative by construction, so a negative stat should not
  // exist — but a silhouette must not depend on that holding.
  it('treats an all-negative day as unstarted', () => {
    expect(dominantStat(points(-10, -5, -20))).toBeNull();
  });
});
