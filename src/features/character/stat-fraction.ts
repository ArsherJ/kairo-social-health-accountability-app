import { STAT_POINTS_MAX, STAT_POINTS_MAX_FEATURED } from '@kairo/core';

/**
 * A stat's points as a 0–1 fraction of its ceiling, for sizing a chip or a bar.
 *
 * A featured stat scores at 1.5x (§6), so a featured Gold reaches 1,350. Both
 * a featured and an ordinary Gold clamp to 100% regardless of which ceiling
 * they size against, so that is not where sizing against the unfeatured
 * ceiling (900) would go wrong. It is everything *below* Gold: the same raw
 * points read as a smaller fraction on a featured stat than on an ordinary
 * one, because the featured ceiling is higher — silently flattening the
 * weekly ×1.5 meta's effect on the bar for every tier short of Gold.
 * So the ceiling itself moves with `featured`, and both the stat row's chips
 * and the expanded bars size against the same ceiling for the same stat.
 */
export function statFraction(points: number, featured: boolean): number {
  const ceiling = featured ? STAT_POINTS_MAX_FEATURED : STAT_POINTS_MAX;
  return Math.max(0, Math.min(1, points / ceiling));
}
