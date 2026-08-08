import { STAT_POINTS_MAX } from '@kairo/core';

/**
 * A stat's points as a 0–1 fraction of its ceiling, for sizing a chip or a bar.
 *
 * There is exactly one ceiling. This used to take a `featured` flag and size
 * against `STAT_POINTS_MAX_FEATURED`, because §6's weekly ×1.5 rotation made
 * a featured stat's ceiling 1,350. Deviation #10 retired that rotation from
 * stored scoring — squad programs carry the meta now, and stored points are
 * program-independent — so `STAT_POINTS_MAX_FEATURED` was deleted rather than
 * left stranded, and there is no second ceiling left to choose between.
 *
 * Both the stat row's chips and the expanded bars size against this one, so a
 * Gold is the same width wherever it appears.
 */
export function statFraction(points: number): number {
  return Math.max(0, Math.min(1, points / STAT_POINTS_MAX));
}
