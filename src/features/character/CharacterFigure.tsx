import { Animated, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import type { CoreStat, Dominance, EvolutionStage } from '@kairo/core';
import { useTheme } from '@/ui/use-theme.ts';
import { GroundShadow, PresenceRing } from '@/ui/GroundShadow.tsx';
import { useFloat } from '@/ui/motion.ts';
import { auraStrength } from './aura.ts';
import {
  KAIRO_BASE_ASSET,
  KAIRO_BASE_CREST,
  KAIRO_POSE_ASSETS,
  KAIRO_POSE_CRESTS,
  KAIRO_STAGE_ASSETS,
  KAIRO_STAGE_CRESTS,
  KAIRO_STATE_ASSETS,
  KAIRO_STATE_CRESTS,
} from './character-assets.ts';
import { CrestLayer } from './CrestLayer.tsx';
import { figureResponse } from './level-response.ts';
import { crestTint } from './plumage.ts';
import type { BodyPresence, StaticFigureSelection } from './living-mirror.ts';

/**
 * The two images the selection resolves to: the render, and its crest mask.
 *
 * **One cascade, not two.** A mask belongs to exactly one drawing, so reading
 * them out of the same branch is what makes it impossible for the crest on
 * screen to belong to a bird that is not.
 *
 * **The growth stage comes off the selection, not off the `stage` prop**, even
 * though the two hold the same value: `staticFigureSelection` has already
 * decided what a pre-adult reaction draws, and re-reading the prop here would
 * let a later edit answer that question a second time in a place with none of
 * the reasoning. The prop stays for the ground shadow, the ring and the body's
 * scale, which read the stage as *presence* and *size* rather than as a body.
 */
function imagesFor(selection: StaticFigureSelection): {
  art: ImageSourcePropType;
  crest: ImageSourcePropType;
} {
  if (selection.kind === 'stage') {
    return {
      art: KAIRO_STAGE_ASSETS[selection.stage][selection.pose],
      crest: KAIRO_STAGE_CRESTS[selection.stage][selection.pose],
    };
  }
  if (selection.kind === 'pose') {
    return { art: KAIRO_POSE_ASSETS[selection.pose], crest: KAIRO_POSE_CRESTS[selection.pose] };
  }
  if (selection.kind === 'state') {
    return { art: KAIRO_STATE_ASSETS[selection.state], crest: KAIRO_STATE_CRESTS[selection.state] };
  }
  return { art: KAIRO_BASE_ASSET, crest: KAIRO_BASE_CREST };
}

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
 *   pose × state × Body export and manufacturing one is out of scope. The three
 *   poses that draw carry the **growth stage**, so the body itself changes at
 *   levels 6, 11 and 21.
 * - **`body`** tints and weights the ground shadow, and nothing else. It must
 *   never distort the canonical figure.
 * - **`level`/`stage`** widen and deepen that shadow — *presence*, from §6's
 *   level bands — and scale the drawn body inside its unchanged frame, so the
 *   four artworks read as four ages even while three of them alias the fourth.
 * - **`lifetimePoints`** tints the **crest**, and only the crest (issue #33). The
 *   figure already says four things by shape and a fifth drawn on the body
 *   would turn the centrepiece into a readout; the head feathers are the one
 *   part that reads at 44pt in a flock row and at 220pt here. A balanced
 *   character takes no hue — `plumage.ts` carries that argument.
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

export function CharacterFigure({
  level,
  stage,
  height = 220,
  figure,
  body,
  dominance,
  lifetimePoints,
  compact = false,
}: {
  /**
   * `profiles.level`. Passed rather than derived here, so the figure stays a
   * pure function of what it is given — and so the within-band response has a
   * level to read at all. `stage` moves at 6, 11 and 21 only.
   */
  level: number;
  stage: EvolutionStage;
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
   * is the mastery's only visual counterpart (see `aura.ts`), and the crest's
   * hue — the same three numbers `squad_leaderboard()` projects as `ratings`,
   * which is what keeps this figure and a flock row agreeing.
   */
  lifetimePoints?: Record<CoreStat, number>;
  /** The perch carries stage and plumage; the hero owns shadow and halo. */
  compact?: boolean;
}) {
  const { art, crest: crestMask } = imagesFor(figure);
  const scale = height / 220;

  // Issue #33. Null for a balanced, unstarted or still-loading character, and
  // the crest is then simply not drawn — `plumage.ts` owns that rule and this
  // renders its answer. **The lifetime rollups, not the `dominance` prop**:
  // that prop is the last fortnight, which a flock row cannot see, and the two
  // surfaces have to agree about what somebody looks like.
  //
  // So this figure holds two readings of "balanced" at once, deliberately. The
  // ring below asks whether the last fortnight was even (`dominance`); the
  // crest asks what a lifetime has earned most of. A player can wear the
  // All-Rounder's ring *and* a stat's crest, and that is not a contradiction —
  // it says a balanced fortnight sits on top of a career that leans. Collapsing
  // them would mean either giving the ring a lifetime memory it was argued out
  // of in `aura.ts`, or giving the crest a fortnight a squadmate cannot see.
  const crest = crestTint(lifetimePoints);

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

  const { colors, earnedColor } = useTheme();
  const float = useFloat();
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <View style={[styles.frame, { height, width: 190 * scale }]}>
      {!compact && <GroundShadow
        width={response.shadowWidth}
        color={body.shade}
        opacity={response.shadowOpacity}
      />}

      {/* Rendered on `ringSize !== null` rather than on `aura !== 'none'`: one
          condition, in the module that decides it. */}
      {!compact && response.ringSize !== null && (
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
            would read as a different bird. The **growth stage** does change it,
            and only it: `bodyScale` shrinks the art inside the same frame, so a
            hatchling stands smaller in the space an adult fills rather than
            moving anything around it. */}
        <View style={{ width: 190 * scale * response.bodyScale, height: 212 * scale * response.bodyScale }}>
          <Image
            source={art}
            style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* One box for both images, so the mask lands on the head feathers
              rather than beside them — `CrestLayer` carries the rest of the
              argument, including why it says nothing. */}
          {crest !== null && <CrestLayer source={crestMask} tint={crest} />}
        </View>
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
