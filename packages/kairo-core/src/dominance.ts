/**
 * Which stat a character has actually been grinding (§6).
 *
 * §6 wants two players at the same level to look different depending on what
 * earned them the points, and gives exactly one quantitative rule for it: the
 * All-Rounder is "all within 20% of each other". That predicate lives here,
 * beside the tier logic, rather than in a screen — it is the sort of rule a
 * silhouette, a label and (eventually) the squad's view of you all have to
 * agree on.
 *
 * The caller decides what window the points cover. Nothing here reads a clock.
 */

import { CORE_STATS, type CoreStat } from './types.ts';

/** §6's All-Rounder band: every stat within 20% of the strongest. */
export const BALANCED_TOLERANCE = 0.2;

export type Dominance = CoreStat | 'balanced' | null;

export function dominantStat(points: Record<CoreStat, number>): Dominance {
  const values = CORE_STATS.map((stat) => points[stat] ?? 0);

  const max = Math.max(...values);
  const min = Math.min(...values);

  // Nothing earned is *unstarted*, not balanced. Four zeros are trivially
  // within 20% of each other, so without this a brand new character would be
  // handed the All-Rounder treatment for having done nothing at all.
  if (max <= 0) return null;

  // Multiplied rather than divided so the inclusive edge lands exactly:
  // 1000 and 800 differ by precisely the tolerance and count as balanced.
  if (max - min <= max * BALANCED_TOLERANCE) return 'balanced';

  // Strictly greater, so CORE_STATS order breaks ties: a dead heat resolves
  // the same way on every render instead of flickering between two
  // silhouettes.
  return CORE_STATS.reduce((leader, stat) =>
    (points[stat] ?? 0) > (points[leader] ?? 0) ? stat : leader,
  );
}
