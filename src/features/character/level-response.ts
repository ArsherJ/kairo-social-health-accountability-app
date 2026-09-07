import type { EvolutionStage } from '@kairo/core';
import type { AuraStrength } from './aura.ts';
// The one value import in a module that is otherwise types only, and it is the
// point: the adult stage is the size everything else is measured against, and a
// second `4` here would restate a growth threshold `character-contract.ts`
// already owns.
import { ADULT_STAGE } from './character-contract.ts';

/**
 * How much the character has visibly become.
 *
 * **Extracted from `CharacterFigure.tsx` so the bands could be widened against
 * assertions rather than by eye.** The old arithmetic was three expressions
 * inline — `(128 + stage * 18) * scale`, `0.14 + stage * 0.03 + weight`, and a
 * ring at 1.35 or 1.5 — and it was correct, tasteful and almost invisible: 146
 * points of shadow at level 1 against 200 at level 21 is a 37% span across the
 * entire game, and the QA pass reported that the character "did not morph".
 *
 * Two things change here and only one of them is a number.
 *
 * **The bands are wider.** A shadow that spans well over 1.7× rather than
 * 1.37× is the difference between a change you can see and one you can
 * measure.
 *
 * **Levelling does something every time.** `stage` moves at levels 6, 11 and 21
 * and nowhere else, so 12 → 13 used to change nothing at all. A within-band
 * term now nudges the shadow at every level, with the band boundary still much
 * the bigger jump — so the four artworks stay the milestone and each level in
 * between is still a reward.
 *
 * **The body itself follows the growth stage** (issue #33). The four artworks
 * are one bird at four ages, and until issue #31 commissions them they are one
 * bird four times; a scale that falls with the stage means a hatchling reads as
 * a hatchling either way, and it is a number rather than a commission. It is a
 * multiple of the art's box and never of the box itself, so nothing around the
 * figure moves.
 *
 * No new dependency. `react-native-svg`, Rive and Reanimated all stay
 * uninstalled; this is a tuning pass on the primitives that already draw
 * (spec §5.4), not an animation build.
 *
 * Pure and tested in Node — it imports only types.
 */

/** The reference box every figure is drawn against. */
const REFERENCE_HEIGHT = 220;

/** Shadow width before any band or level is added. */
const SHADOW_BASE = 104;
/** Added per evolution stage — the milestone step. */
const SHADOW_PER_STAGE = 34;
/** Added per level inside a band — the every-level step. */
const SHADOW_PER_LEVEL = 2.6;

/**
 * The level past which nothing grows any further.
 *
 * Unbounded growth eventually pushes the figure out of the diorama, and a
 * two-year-old account should not render as a poster. 40 is roughly a year of
 * strong daily play, so the ceiling is reached by almost nobody and is there
 * for the case where it is.
 */
const LEVEL_CEILING = 40;

/**
 * How much of the adult's size a stage loses, per stage below adult.
 *
 * The second half of the ticket, and deliberately the cheap half: the nine
 * growth-stage images are somebody else's commission (issue #31) and scale is
 * a number, so a hatchling reads as small today whether or not that artwork
 * lands on time.
 *
 * **The figure's box does not move.** The art is drawn inside the frame the
 * caller sized and the frame stands the figure on its bottom edge, so a smaller
 * body sits lower in the same space rather than pushing anything around it —
 * which is what stops a level-up from relaying the day screen. This is why the
 * scale is a multiple of the art rather than a change to `height`.
 */
const BODY_SCALE_PER_STAGE = 0.09;

const OPACITY_BASE = 0.15;
const OPACITY_PER_STAGE = 0.055;
/** Past this the contact patch stops reading as a shadow and starts as a hole. */
const OPACITY_MAX = 0.45;

/**
 * Ring diameter as a multiple of the shadow's width. Null means no ring.
 *
 * Both multiples are above 1 on purpose: a ring drawn inside the contact patch
 * it encircles reads as a puddle rather than as a halo.
 */
const RING_SCALE: Record<AuraStrength, number | null> = {
  none: null,
  present: 1.34,
  strong: 1.58,
};

export interface FigureResponse {
  shadowWidth: number;
  shadowOpacity: number;
  /**
   * The art's size as a multiple of its box. 1 at the adult stage and below it
   * at every stage under that, so the drawn body never leaves the frame.
   */
  bodyScale: number;
  /** Null when there is no ring to draw. */
  ringSize: number | null;
  ringWidth: number;
}

export function figureResponse(input: {
  /** `profiles.level`. 0 or NaN while the profile loads. */
  level: number;
  stage: EvolutionStage;
  aura: AuraStrength;
  /** The build's contribution to shadow density, from `BUILDS[dominance].weight`. */
  shadowWeight: number;
  /** The figure's box. The diorama stands them taller than a card does. */
  height: number;
}): FigureResponse {
  const scale = input.height / REFERENCE_HEIGHT;

  // `|| 1` catches NaN and 0 together: an unloaded profile renders a level-1
  // character rather than a collapsed one, which is the same thing a brand-new
  // account sees and therefore never looks like a bug.
  const level = Math.min(LEVEL_CEILING, Math.max(1, Math.floor(input.level) || 1));

  const width =
    (SHADOW_BASE + input.stage * SHADOW_PER_STAGE + level * SHADOW_PER_LEVEL) * scale;

  // Deliberately not scaled by the box. Width is geometry and follows the
  // figure; density is identity, and a shadow that faded on a card and
  // darkened in the diorama would read as two different characters.
  const opacity = Math.min(
    OPACITY_MAX,
    OPACITY_BASE + input.stage * OPACITY_PER_STAGE + input.shadowWeight,
  );

  const ringScale = RING_SCALE[input.aura];

  return {
    shadowWidth: width,
    shadowOpacity: opacity,
    // Unitless on purpose: the caller multiplies its own box by it, so one
    // number is right for a 220pt diorama and a 120pt card alike. Scaling
    // `height` here instead would move the frame and relay the screen.
    bodyScale: 1 - (ADULT_STAGE - input.stage) * BODY_SCALE_PER_STAGE,
    ringSize: ringScale === null ? null : width * ringScale,
    // The ring reads the mastery through `aura`; thickening it by band
    // lets it read level too, so the one earned device on the figure answers to
    // both axes rather than to one.
    ringWidth: 2 + input.stage,
  };
}
