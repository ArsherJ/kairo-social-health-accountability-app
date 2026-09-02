import { Animated, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import type { CoreStat, Dominance } from '@kairo/core';
import { colors, earnedColor } from '@/theme.ts';
import { GroundShadow, PresenceRing } from '@/ui/GroundShadow.tsx';
import { useFloat } from '@/ui/motion.ts';
import { auraStrength } from './aura.ts';
import {
  KAIRO_BASE_ASSET,
  KAIRO_POSE_ASSETS,
  KAIRO_STATE_ASSETS,
} from './character-assets.ts';
import { figureResponse } from './level-response.ts';
import type { BodyPresence, StaticFigureSelection } from './living-mirror.ts';

/**
 * KAIRO, drawn.
 *
 * **This component interprets no health value.** Which image to draw is
 * `staticFigureSelection` in `living-mirror.ts`; how heavy the ground is is
 * `BodyPresence` from the same module; how loudly the figure answers to
 * progress is `figureResponse` in `level-response.ts`. All three are tested.
 * This performs.
 *
 * Three independent responses, and keeping them independent is the point:
 *
 * - **`figure`** picks one of the checked-in PNGs — reaction pose, non-neutral
 *   Mind state, Motion pose, or the base render, in that order. Priority, not
 *   composition: the art is flattened full-character renders, so there is no
 *   pose × state × Body export and manufacturing one is out of scope.
 * - **`body`** tints and weights the ground shadow, and nothing else. It must
 *   never distort the canonical figure.
 * - **`level`/`stage`** widen and deepen that shadow — *presence*, from §6's
 *   level bands.
 *
 * **The presence ring is `auraStrength()`'s, not Body's.** Peak rating across
 * all three stats, with the All-Rounder's ring unconditional; the argument is
 * in `aura.ts` and predates the Living Mirror. Deriving it from `str_total`
 * would delete it for every Motion- or Mind-dominant player and every
 * All-Rounder — and since this is the only screen that mounts this component
 * (You draws the decorative `KairoThumbnail`), that is the whole app.
 *
 * Still no animation runtime. Rive replaces `staticFigureSelection` and the
 * reaction timer at V1; nothing here decides when a reaction fires.
 */

function sourceFor(selection: StaticFigureSelection): ImageSourcePropType {
  if (selection.kind === 'pose') return KAIRO_POSE_ASSETS[selection.pose];
  if (selection.kind === 'state') return KAIRO_STATE_ASSETS[selection.state];
  return KAIRO_BASE_ASSET;
}

export function CharacterFigure({
  level,
  stage,
  height = 220,
  figure,
  body,
  dominance,
  lifetimePoints,
}: {
  /**
   * `profiles.level`. Passed rather than derived here, so the figure stays a
   * pure function of what it is given — and so the within-band response has a
   * level to read at all. `stage` moves at 6, 11 and 21 only.
   */
  level: number;
  stage: 1 | 2 | 3 | 4;
  /** The figure's box. The diorama stands them taller than a card does. */
  height?: number;
  /** Which single PNG to draw, already resolved. */
  figure: StaticFigureSelection;
  /** Body's contribution: the ground shadow's tint and weight. */
  body: BodyPresence;
  /** Undefined while the query is in flight; null for an unstarted character.
   *  Read only for the All-Rounder's unconditional ring. */
  dominance?: Dominance;
  /**
   * Lifetime per-stat points from `profiles`. Drives the presence ring, which
   * is the mastery's only visual counterpart — see `aura.ts`.
   */
  lifetimePoints?: Record<CoreStat, number>;
}) {
  const art = sourceFor(figure);
  const scale = height / 220;

  // The ring stays with `auraStrength` — peak rating across all three stats,
  // plus the All-Rounder's ring at any rating. Body drives the shadow only.
  const aura = auraStrength({ lifetimePoints, balanced: dominance === 'balanced' });

  // One place decides how loudly the figure answers to progress, and it is
  // tested (spec §5.4). The three expressions this replaced were inline,
  // correct, and almost invisible.
  const response = figureResponse({
    level,
    stage,
    aura,
    shadowWeight: body.shadowWeight,
    height,
  });

  const float = useFloat();
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <View style={[styles.frame, { height }]}>
      <GroundShadow
        width={response.shadowWidth}
        color={body.shade}
        opacity={response.shadowOpacity}
      />

      {/* Rendered on `ringSize !== null` rather than on `aura !== 'none'`: one
          condition, in the module that decides it. */}
      {response.ringSize !== null && (
        <PresenceRing
          size={response.ringSize}
          width={response.ringWidth}
          color={aura === 'strong' ? colors.accent : earnedColor}
        />
      )}

      {/* The float rides above the shadow rather than carrying it: a shadow
          that rises with the figure reads as the whole world bobbing, where
          one that stays put reads as the figure lifting off the ground. */}
      <Animated.View style={[styles.lift, { transform: [{ translateY }] }]}>
        {/* One image, chosen by priority. The display box does not change with
            the selection — a Body tier or a Mind state that resized the bird
            would read as a different bird. */}
        <Image
          source={art}
          style={{ width: 190 * scale, height: 212 * scale }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'flex-end' },
  // The art box is 190×212 at scale 1 — the primitives' old footprint, kept so
  // their removal moved nothing under it. It is sized inline because `scale` is
  // a prop; the ground shadow is `<GroundShadow>`'s job.
  lift: { alignItems: 'center' },
});
