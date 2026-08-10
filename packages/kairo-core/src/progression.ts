/**
 * Character level and visual evolution (spec §6).
 *
 * The spec fixes the evolution bands — 1-5, 6-10, 11-20, 21+ — but never
 * defines an XP curve, so this one is derived from what a real day actually
 * earns. Scoring awards 10/25/50 XP per bronze/silver/gold stat across four
 * stats, so a committed player lands near 100 XP/day and an exceptional day
 * caps at 200.
 *
 * A quadratic curve with a divisor of 25 puts the milestones here:
 *
 *   level  6 (2nd visual)  →    625 XP  ≈  6 days
 *   level 11 (3rd visual)  →  2,500 XP  ≈ 25 days
 *   level 21 (4th visual)  → 10,000 XP  ≈ 100 days
 *
 * The last one is deliberate: it lands with the 100-day streak legendary
 * cosmetic (§19), so both long-term goals mature together instead of the
 * character topping out while the streak is still running.
 *
 * Level is permanent and never resets — it reflects lifetime effort, so a bad
 * week costs progress but never takes anything away.
 */

/** Quadratic steepness. Larger means slower levelling. */
export const LEVEL_XP_DIVISOR = 25;

/** Four gold stats in one day. The ceiling a single day can contribute. */
export const MAX_REALISTIC_DAILY_XP = 200;

/** Floating-point guard so an exact square never floors to the level below. */
const EPSILON = 1e-9;

export function levelForXp(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp <= 0) return 1;
  return Math.floor(Math.sqrt(totalXp / LEVEL_XP_DIVISOR) + EPSILON) + 1;
}

/** Total lifetime XP required to reach `level`. */
export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 1) return 0;
  return LEVEL_XP_DIVISOR * (level - 1) ** 2;
}

/** Which of the four character artworks a level shows. */
export type EvolutionStage = 1 | 2 | 3 | 4;

export function evolutionStageForLevel(level: number): EvolutionStage {
  if (level >= 21) return 4;
  if (level >= 11) return 3;
  if (level >= 6) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Per-stat ability ratings
// ---------------------------------------------------------------------------

/**
 * AGI 41, STR 28 — what the character sheet shows in place of a medal.
 *
 * **The tier engine is unchanged.** `TIER_POINTS`, `tierFor()` and
 * `daily_scores.tiers` still score every day exactly as §5 and §6 specify.
 * Bronze/Silver/Gold simply stopped being the thing the user is shown, because
 * they answer a different question from the one the sheet is asking: a medal
 * describes *today*, and "how strong is my character" is cumulative — the same
 * shape as Level, which is why this is the same curve.
 *
 * The input is lifetime points in one stat, rolled up on `profiles` by the same
 * trigger that maintains `total_xp`.
 *
 * A divisor of 100 is chosen so ratings read *alongside* Level rather than
 * racing ahead of it — a month of Gold days in one stat lands at 17 against a
 * level of about 16, and a year at 58 against about 55. Two numbers on one
 * screen that move at wildly different speeds read as two unrelated systems.
 */
export const STAT_RATING_DIVISOR = 100;

/**
 * Never below 1. A stat rendered as 0 reads as broken; 1 reads as untrained,
 * which is what a stat nobody has worked actually is. Same floor as `levelForXp`
 * for the same reason.
 */
export function ratingForStatPoints(points: number): number {
  if (!Number.isFinite(points) || points <= 0) return 1;
  return Math.floor(Math.sqrt(points / STAT_RATING_DIVISOR) + EPSILON) + 1;
}

/**
 * Lifetime points required to reach `rating` — the exact inverse of
 * `ratingForStatPoints`.
 *
 * The pair is what gives the stat bar its fill: the fraction between this
 * rating's floor and the next one's. Kept as a mirrored pair rather than left to
 * each caller, because a bar computed from a slightly different inverse renders
 * past full, or empty on the exact frame a rating is gained.
 */
export function statPointsForRating(rating: number): number {
  if (!Number.isFinite(rating) || rating <= 1) return 0;
  return STAT_RATING_DIVISOR * (rating - 1) ** 2;
}
