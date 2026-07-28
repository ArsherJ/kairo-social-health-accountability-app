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
