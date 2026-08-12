import { CORE_STATS, ratingForStatPoints, type CoreStat } from '@kairo/core';

/**
 * How strongly the character's presence ring reads.
 *
 * **This is not a new progression axis, and that is the point.** The QA pass
 * reported that "stat changes did not morph the character", and the character
 * already had two responses: `stage` (level bands, §6) widens and deepens the
 * ground shadow, and `dominance` changes the build's proportions and the
 * shadow's tint. Both were invisible during the session for the same reason
 * everything else was — nothing had scored since 9 August, so level sat at 1
 * and dominance was null. The response existed; there was no progress to
 * respond to.
 *
 * What genuinely had no visual counterpart is the **ability rating**, the
 * number the character sheet and the leaderboard both lead with. So rather than
 * inventing a third visual language on top of two that had never been seen
 * working, this reuses the ring `CharacterFigure` already draws — until now
 * only for the `balanced` All-Rounder — and lets a rating drive its strength.
 *
 * Peak rather than total or mean: the ring answers "how far has this character
 * actually got in anything", and averaging punishes the specialist §6 exists to
 * describe. `balanced` keeps its ring at any rating, because the All-Rounder
 * signal is about *shape*, not magnitude, and it predates this.
 */

/**
 * Rating 5 is about 1,600 lifetime points in one stat — a couple of strong days,
 * so it arrives early enough to be a reward rather than a distant promise.
 * Rating 10 is ~8,100, which is weeks of them.
 */
export const AURA_RATING = 5;
export const AURA_STRONG_RATING = 10;

export type AuraStrength = 'none' | 'present' | 'strong';

export function auraStrength(input: {
  /** Lifetime per-stat points, as `profiles.agi_total` etc. Absent while loading. */
  lifetimePoints: Record<CoreStat, number> | undefined;
  /** The All-Rounder keeps its ring however far along it is. */
  balanced: boolean;
}): AuraStrength {
  const points = input.lifetimePoints;
  if (!points) return input.balanced ? 'present' : 'none';

  let peak = 1;
  for (const stat of CORE_STATS) {
    const rating = ratingForStatPoints(points[stat] ?? 0);
    if (rating > peak) peak = rating;
  }

  if (peak >= AURA_STRONG_RATING) return 'strong';
  if (peak >= AURA_RATING || input.balanced) return 'present';
  return 'none';
}
