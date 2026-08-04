import { STAT_POINTS_MAX, STAT_POINTS_MAX_FEATURED } from '@kairo/core';

/**
 * A stat's points as a 0–1 fraction of its ceiling, for sizing a chip or a bar.
 *
 * A featured stat scores at 1.5x (§6), so a featured Gold reaches 1,350.
 * Sizing every bar against the unfeatured Gold ceiling (900) would peg a
 * featured Gold at 100% and make it indistinguishable from an ordinary
 * Gold — erasing the only visual difference the weekly ×1.5 meta produces.
 * So the ceiling itself moves with `featured`, and both the stat row's chips
 * and the expanded bars size against the same ceiling for the same stat.
 */
export function statFraction(points: number, featured: boolean): number {
  const ceiling = featured ? STAT_POINTS_MAX_FEATURED : STAT_POINTS_MAX;
  return Math.max(0, Math.min(1, points / ceiling));
}
