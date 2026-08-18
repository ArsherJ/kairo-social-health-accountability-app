import { Animated, Image, StyleSheet, View } from 'react-native';
import type { CoreStat, Dominance } from '@kairo/core';
import type { SpeciesId } from './species.ts';
import { SPECIES_FIGURES } from './species-art.ts';
import { colors, earnedColor, ramp } from '@/theme.ts';
import { GroundShadow, PresenceRing } from '@/ui/GroundShadow.tsx';
import { useFloat } from '@/ui/motion.ts';
import { auraStrength } from './aura.ts';

/**
 * The character. Static placeholder art where an asset exists for the
 * (stage × dominance) pair, and the original View primitives everywhere else —
 * still no new dependency (react-native-svg, Rive and Reanimated are all
 * deliberately not installed; §15 scopes MVP to *static* placeholder art, and
 * pulling in an animation runtime for a placeholder is the wrong trade).
 *
 * Two things drive it, and they are independent:
 *
 * - `stage` (1–4, from the level bands in §6) is *presence*: the ground
 *   shadow widens and deepens, so levelling visibly does something
 *   whatever you grind.
 * - `dominance` is *shape*, following §6's table — AGI leaner, STR broader,
 *   END a planted stance, VIT a recovery glow, balanced the All-Rounder.
 *
 * The proportions below are the honest reading of that table within the
 * primitives available. Commissioned art and Rive replace all of it in V1.
 */

interface Build {
  /** Multiplies shoulder width. Under 1 reads lean, over 1 reads broad. */
  shoulders: number;
  /** Multiplies torso width. */
  torso: number;
  /** Multiplies torso height — a taller torso plants the figure. */
  height: number;
  /**
   * The ground shadow's tint. §6 asked for an aura per build; on the warm
   * system the shadow is where that reads, so a heavier build sits in a
   * darker, denser contact patch rather than glowing a different colour.
   */
  shade: string;
  /** Added to the shadow's base opacity. */
  weight: number;
  /** Stance width. Zero means no legs drawn. */
  stance: number;
}

const BUILDS: Record<Exclude<Dominance, null>, Build> = {
  // "Leaner frame, faster Rive idle animation" — the frame is all that
  // survives without an animation runtime.
  AGI: { shoulders: 0.86, torso: 0.84, height: 1.0, shade: ramp.sage[700], weight: -0.03, stance: 0 },
  // "Broader silhouette, power aura intensifies."
  STR: { shoulders: 1.18, torso: 1.14, height: 0.94, shade: colors.damage, weight: 0.07, stance: 0 },
  // "Endurance stance" — the particle effect needs Rive, the stance does not.
  END: { shoulders: 1.0, torso: 0.98, height: 1.12, shade: ramp.sage[800], weight: 0.04, stance: 58 },
  // "Recovery glow, healthier skin tone."
  VIT: { shoulders: 0.96, torso: 1.0, height: 1.0, shade: ramp.sage[600], weight: -0.05, stance: 0 },
  // "Rare All-Rounder visual — cannot be bought, must be earned." Gold, evenly
  // proportioned, and the only build that earns the ring.
  balanced: { shoulders: 1.04, torso: 1.04, height: 1.04, shade: earnedColor, weight: 0.03, stance: 34 },
};

/** A character with no points yet: the original neutral placeholder. */
const UNSTARTED: Build = {
  shoulders: 1,
  torso: 1,
  height: 1,
  shade: ramp.sage[700],
  weight: 0,
  stance: 0,
};

const BASE_SHOULDERS = 132;
const BASE_TORSO_WIDTH = 104;
const BASE_TORSO_HEIGHT = 96;

export function CharacterFigure({
  stage,
  dominance,
  species,
  height = 220,
  lifetimePoints,
}: {
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
  const art = species ? SPECIES_FIGURES[species] : undefined;

  const scale = height / 220;
  const shadowWidth = (128 + stage * 18) * scale;
  const shadowOpacity = 0.14 + stage * 0.03 + build.weight;

  const aura = auraStrength({ lifetimePoints, balanced: dominance === 'balanced' });

  const float = useFloat();
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <View style={[styles.frame, { height }]}>
      <GroundShadow width={shadowWidth} color={build.shade} opacity={shadowOpacity} />

      {/* The ring used to fire only for the All-Rounder. It now also carries
          the ability rating — the number the character sheet leads with and the
          one thing about progress the figure said nothing about. `stage` and
          `dominance` above were already responding; they were invisible during
          the QA session because nothing had scored since 9 August, not because
          they were missing. */}
      {aura !== 'none' && (
        <PresenceRing
          size={shadowWidth * (aura === 'strong' ? 1.5 : 1.35)}
          color={aura === 'strong' ? colors.accent : earnedColor}
        />
      )}

      {/* The float rides above the shadow rather than carrying it: a shadow
          that rises with the figure reads as the whole world bobbing, where
          one that stays put reads as the figure lifting off the ground. */}
      <Animated.View style={[styles.lift, { transform: [{ translateY }] }]}>
        {/* Art when there is art, primitives when there is not. This branch is
            live, not leftover: every profile predating the species choice (or
            still loading it) has no `species`, so `art` is undefined and the
            primitives render — they are also what carries §6's dominance
            table (leaner AGI, broader STR, END's planted stance). Drop them
            only once every profile has a species and real per-species art
            covers every case. */}
        {art ? (
          <Image
            source={art}
            style={{ width: 190 * scale, height: 212 * scale }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.figure}>
            <View style={styles.head} />
            <View
              style={[styles.shoulders, { width: BASE_SHOULDERS * build.shoulders }]}
            />
            <View
              style={[
                styles.torso,
                {
                  width: BASE_TORSO_WIDTH * build.torso,
                  height: BASE_TORSO_HEIGHT * build.height,
                },
              ]}
            />

            {build.stance > 0 && (
              <View style={[styles.legs, { width: build.stance }]}>
                <View style={styles.leg} />
                <View style={styles.leg} />
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'flex-end' },
  // The art box matches the primitives' overall footprint (head + shoulders +
  // torso + legs ≈ 212 tall) so swapping one for the other does not move the
  // layout under it. It is sized inline because `scale` is a prop now; the
  // ground shadow is `<GroundShadow>`'s job, not styles here.
  lift: { alignItems: 'center' },
  figure: { alignItems: 'center' },
  head: {
    width: 46,
    height: 52,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: colors.text,
  },
  shoulders: {
    height: 34,
    marginTop: -6,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: colors.text,
  },
  torso: {
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: colors.text,
  },
  legs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  leg: {
    width: 18,
    height: 30,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.text,
  },
});
