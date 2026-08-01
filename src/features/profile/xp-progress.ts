import { levelForXp, xpForLevel } from '@kairo/core';

/**
 * Where a lifetime XP total sits inside its current level — everything the
 * profile screen's progress bar needs.
 *
 * The curve lives in `@kairo/core` (§6); this only reads it. Levelling is
 * quadratic, so the *absolute* XP to the next level grows forever while the
 * fraction stays a fraction — which is the only reason a bar is legible at
 * level 30 at all.
 */
export interface XpProgress {
  level: number;
  /** XP earned since reaching `level`. */
  intoLevel: number;
  /** XP the whole of `level` spans, i.e. `intoLevel` at 100%. */
  neededForNext: number;
  /** `intoLevel / neededForNext`, always within [0, 1]. */
  fraction: number;
}

export function xpProgress(totalXp: number): XpProgress {
  // `total_xp` is a trigger-maintained rollup, so a negative or NaN total
  // means something upstream is wrong. Rendering a backwards bar would hide
  // that behind a visual glitch; an empty level 1 at least reads as "nothing".
  const total = Number.isFinite(totalXp) && totalXp > 0 ? totalXp : 0;

  const level = levelForXp(total);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);

  const neededForNext = ceiling - floor;
  const intoLevel = Math.max(0, total - floor);

  return {
    level,
    intoLevel,
    neededForNext,
    fraction: Math.min(1, intoLevel / neededForNext),
  };
}
