import { Animated, Image, StyleSheet, View } from 'react-native';
import type { CoreStat, Dominance } from '@kairo/core';
import { displaySpecies, type SpeciesId } from './species.ts';
import { SPECIES_FIGURES } from './species-art.ts';
import { colors, earnedColor, ramp } from '@/theme.ts';
import { GroundShadow, PresenceRing } from '@/ui/GroundShadow.tsx';
import { useFloat } from '@/ui/motion.ts';
import { auraStrength } from './aura.ts';
import { figureResponse } from './level-response.ts';

/**
 * The character. Static placeholder art, one figure per species — and since
 * 2026-08-27 (deviation #55) that is always the eagle, resolved here through
 * `displaySpecies`. Still no new dependency (react-native-svg, Rive and
 * Reanimated are all deliberately not installed; §15 scopes MVP to *static*
 * placeholder art, and pulling in an animation runtime for a placeholder is
 * the wrong trade).
 *
 * Two things drive it, and they are independent:
 *
 * - `level` and its `stage` (1–4, from the level bands in §6) are *presence*:
 *   the ground shadow widens and deepens, so levelling visibly does something
 *   whatever you grind. **How loudly it answers is decided in
 *   `level-response.ts`**, which is tested — the arithmetic used to be three
 *   expressions inline here, and it was correct, tasteful and almost
 *   invisible. Tune the constants there, never here.
 * - `dominance` is *weight*, following §6's table — AGI a lighter contact
 *   patch, STR a denser one, MND the recovery tint, balanced the All-Rounder's
 *   gold. It read as silhouette proportions until the primitives went with
 *   deviation #55; the shadow is where it reads now.
 *
 * Commissioned art and Rive replace all of it in V1.
 */

interface Build {
  /**
   * The ground shadow's tint. §6 asked for an aura per build; on the warm
   * system the shadow is where that reads, so a heavier build sits in a
   * darker, denser contact patch rather than glowing a different colour.
   */
  shade: string;
  /** Added to the shadow's base opacity. */
  weight: number;
}

/**
 * The proportion fields — shoulders, torso, height, stance — went with the
 * View primitives on 2026-08-27 (deviation #55). They shaped a figure that can
 * no longer be drawn: `displaySpecies` always resolves art, so there is no
 * "no species" case left for primitives to cover. What survives is the pair
 * the ground shadow reads, which is where dominance still shows.
 */

const BUILDS: Record<Exclude<Dominance, null>, Build> = {
  // "Leaner frame, faster Rive idle animation" — a lighter contact patch is
  // all that survives without an animation runtime.
  AGI: { shade: ramp.sage[700], weight: -0.03 },
  // "Broader silhouette, power aura intensifies."
  STR: { shade: colors.damage, weight: 0.07 },
  // §6's "recovery glow, healthier skin tone", inherited from the VIT build
  // this replaces. MND has no table entry of its own — it joined as a stat in
  // roadmap deviation #41, long after §6 was written — and the recovery build
  // is the nearest thing §6 describes, which makes it a better placeholder
  // than a neutral frame that would read as "no dominance at all".
  MND: { shade: ramp.sage[600], weight: -0.05 },
  // "Rare All-Rounder visual — cannot be bought, must be earned." Gold, and
  // the only build that earns the ring.
  balanced: { shade: earnedColor, weight: 0.03 },
};

/** A character with no points yet: the original neutral placeholder. */
const UNSTARTED: Build = { shade: ramp.sage[700], weight: 0 };

export function CharacterFigure({
  level,
  stage,
  dominance,
  species,
  height = 220,
  lifetimePoints,
}: {
  /**
   * `profiles.level`. Passed rather than derived here, so the figure stays a
   * pure function of what it is given like everything else in this file — and
   * so the within-band response has a level to read at all. `stage` moves at 6,
   * 11 and 21 only.
   */
  level: number;
  stage: 1 | 2 | 3 | 4;
  /** Undefined while the query is in flight; null for an unstarted character. */
  dominance?: Dominance;
  /**
   * Which animal. Null or undefined means the profile predates the choice, or
   * has not loaded — both render the primitives below, which is the neutral
   * figure the one-time picker exists to replace.
   */
  species?: SpeciesId | null;
  /** The figure's box. The diorama stands them taller than a card does. */
  height?: number;
  /**
   * Lifetime per-stat points from `profiles`. Drives the presence ring, which
   * is the ability rating's only visual counterpart — see `aura.ts`.
   */
  lifetimePoints?: Record<CoreStat, number>;
}) {
  const build = dominance ? BUILDS[dominance] : UNSTARTED;
  // `displaySpecies` rather than the stored id (deviation #55): everyone is an
  // eagle. The stored value is still passed in, so the day this is reversed
  // nothing here changes.
  const art = SPECIES_FIGURES[displaySpecies(species ?? null)];

  const scale = height / 220;

  const aura = auraStrength({ lifetimePoints, balanced: dominance === 'balanced' });

  // One place decides how loudly the figure answers to progress, and it is
  // tested (spec §5.4). The three expressions this replaced were inline,
  // correct, and almost invisible.
  const response = figureResponse({ level, stage, aura, shadowWeight: build.weight, height });

  const float = useFloat();
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <View style={[styles.frame, { height }]}>
      <GroundShadow
        width={response.shadowWidth}
        color={build.shade}
        opacity={response.shadowOpacity}
      />

      {/* The ring used to fire only for the All-Rounder. It now also carries
          the ability rating — the number the character sheet leads with and the
          one thing about progress the figure said nothing about. `stage` and
          `dominance` above were already responding; they were invisible during
          the QA session because nothing had scored since 9 August, not because
          they were missing. */}
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
        {/* Always art. Every profile predating the species choice used to fall
            through to View primitives here; `displaySpecies` resolves a figure
            for a null species too (deviation #55), so that branch was
            unreachable and is deleted rather than left to rot. §6's dominance
            table now reads entirely through the ground shadow above. */}
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
  // the removal of that branch moved nothing under it. It is sized inline
  // because `scale` is a prop; the ground shadow is `<GroundShadow>`'s job.
  lift: { alignItems: 'center' },
});
