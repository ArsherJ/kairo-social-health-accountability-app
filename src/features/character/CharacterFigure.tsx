import { Animated, Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';
import type { Dominance } from '@kairo/core';
import { colors, earnedColor, ramp } from '@/theme.ts';
import { GroundShadow, PresenceRing } from '@/ui/GroundShadow.tsx';
import { useFloat } from '@/ui/motion.ts';

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

/** `${stage}-${dominance}`, with `none` for an unstarted or in-flight one. */
type ArtKey = `${1 | 2 | 3 | 4}-${Exclude<Dominance, null> | 'none'}`;

function artKey(stage: 1 | 2 | 3 | 4, dominance: Dominance | undefined): ArtKey {
  return `${stage}-${dominance ?? 'none'}`;
}

/**
 * Placeholder art, keyed by the same two inputs the primitives switch on.
 *
 * **Deliberately incomplete, and safe that way.** A missing key renders the
 * primitives below, so art can land one file at a time and nothing has to be
 * generated in one sitting. That is also why the map is written out rather than
 * built from the key: Metro resolves `require` statically, so a path with no
 * file behind it is a bundling error, not a runtime miss.
 *
 * To add one, drop the PNG in `assets/character/` and add its line here:
 *
 *     '3-STR': require('../../../assets/character/3-STR.png'),
 *
 * `assets/character/README.md` lists every key and what each is meant to look
 * like. Up to 2:1 portrait, transparent background — the ground shadow is
 * drawn by this component, not baked into the art, so the same asset reads
 * correctly at every stage.
 */
const CHARACTER_ART: Partial<Record<ArtKey, ImageSourcePropType>> = {};

/**
 * The baseline figure, used for any key `CHARACTER_ART` does not cover yet.
 *
 * §15's "AI-placeholder static art" as one asset instead of 24: the same
 * character every key is meant to depict, in the neutral build, with the
 * shadow left to `<GroundShadow>` as the README requires. Presence still
 * grows with `stage` because the shadow does; what the anchor cannot express
 * is `dominance`, so a per-key entry above always wins over it.
 *
 * Built from the generated render by `scripts/prep_character_art.py` — the render
 * ships on white with no alpha, which would show as a card on `colors.bg`.
 */
const CHARACTER_ANCHOR: ImageSourcePropType = require('../../../assets/character/anchor.png');

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
  height = 220,
}: {
  stage: 1 | 2 | 3 | 4;
  /** Undefined while the query is in flight; null for an unstarted character. */
  dominance?: Dominance;
  /** The figure's box. The diorama stands them taller than a card does. */
  height?: number;
}) {
  const build = dominance ? BUILDS[dominance] : UNSTARTED;
  const art = CHARACTER_ART[artKey(stage, dominance)] ?? CHARACTER_ANCHOR;

  const scale = height / 220;
  const shadowWidth = (128 + stage * 18) * scale;
  const shadowOpacity = 0.14 + stage * 0.03 + build.weight;

  const float = useFloat();
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <View style={[styles.frame, { height }]}>
      <GroundShadow width={shadowWidth} color={build.shade} opacity={shadowOpacity} />

      {dominance === 'balanced' && (
        <PresenceRing size={shadowWidth * 1.35} color={earnedColor} />
      )}

      {/* The float rides above the shadow rather than carrying it: a shadow
          that rises with the figure reads as the whole world bobbing, where
          one that stays put reads as the figure lifting off the ground. */}
      <Animated.View style={[styles.lift, { transform: [{ translateY }] }]}>
        {/* Art when there is art, primitives when there is not. With the anchor
            in place the second branch no longer renders — it stays because the
            anchor is a placeholder, and it is the primitives that carry §6's
            dominance table (leaner AGI, broader STR, END's planted stance).
            Drop them only when real per-dominance art replaces what they
            encode. */}
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
