import { dominantStat, type CoreStat } from '@kairo/core';
// Relative, not `@/` — root Vitest defines no alias, so a value import through
// it is a load failure for `plumage.test.ts`. `stat-colors.ts` reaches only
// `theme.ts`, which is import-free apart from an erased `import type`.
import { STAT_COLORS } from '../../ui/stat-colors.ts';
import { laneStat } from './lane.ts';

/**
 * Lifetime per-stat points, as every surface that has them holds them: the
 * `profiles` rollups on the day screen and the You tab, and the identical
 * figures `squad_leaderboard()` projects as a row's `ratings`.
 *
 * Partial because that projection is a `Record<string, number>` off an RPC and
 * a stat can simply be absent from it. A missing stat reads as zero below.
 */
export type LifetimePoints = Partial<Record<CoreStat, number>>;

/**
 * The crest's hue — what a player's dominant stat does to the bird (issue #33).
 *
 * **The crest changes, not the bird.** The figure already says four things by
 * shape (which growth stage it is standing in, the ground shadow's spread by
 * level, its weight and tint by Body, the presence ring by mastery) and a fifth
 * drawn on the body would turn the centrepiece into a readout. The crest is the
 * one part of the silhouette that reads at 44pt in a flock row and at 220pt on
 * the day screen, which is both surfaces the ticket asks for.
 *
 * **It takes lifetime points, and it takes them on purpose.** `useDominantStat`
 * answers a different question — which stat somebody has been grinding over the
 * last fortnight — and it is the right input for the lane and for the
 * All-Rounder's ring, which are about *now*. It is the wrong input here for a
 * reason that is structural rather than aesthetic: `squad_leaderboard()`
 * projects the lifetime rollups and nothing narrower, so a flock row could not
 * compute the fortnight's answer without widening a projection §5 keeps
 * narrow — and a crest that was violet on my own screen and coral in my
 * flockmate's list is two values behind one noun. Both surfaces feed this the
 * same three numbers, so they cannot disagree about what somebody looks like.
 *
 * **Through `laneStat`, so the balanced rule has one home.** A player whose
 * stats are level takes no tint at all: choosing a stat to speak for them would
 * invent a preference they have not shown, which is the argument `lane.ts`
 * already makes for the lane bar and which is worth making once. `dominantStat`
 * answers `null` for a character that has earned nothing, and `undefined` here
 * is a profile still loading; both withhold the tint, because a colour that
 * arrives on a guess and changes a frame later reads as a bug.
 *
 * The hues themselves are `STAT_COLORS`, the one place the redesign allows
 * per-stat colour. Nothing is invented here.
 */
export function crestTint(lifetimePoints: LifetimePoints | undefined): string | null {
  if (lifetimePoints === undefined) return null;
  // Written out rather than mapped over `CORE_STATS`, for `useDominantStat`'s
  // reason: a stat missing from the record has to read as zero rather than as
  // `undefined` slipping into the comparison.
  const stat = laneStat(
    dominantStat({
      AGI: lifetimePoints.AGI ?? 0,
      STR: lifetimePoints.STR ?? 0,
      MND: lifetimePoints.MND ?? 0,
    }),
  );
  return stat === null ? null : STAT_COLORS[stat];
}

/**
 * How strongly the hue is laid over the crest.
 *
 * The mask is filled with a **flat** colour — `tintColor` keeps an image's
 * alpha and replaces everything else — and it is drawn over flattened art, so
 * at full strength the feather outlines and the shading under it disappear and
 * the crest reads as a coloured blob glued to a bird. Held below full, the
 * drawing shows through and the crest reads as plumage that happens to be that
 * colour.
 */
export const CREST_TINT_OPACITY = 0.62;
