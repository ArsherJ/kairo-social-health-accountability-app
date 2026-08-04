import { Animated, StyleSheet, View } from 'react-native';
import type { Dominance } from '@kairo/core';
import { colors, tierColors } from '@/theme.ts';
import { Aura } from '@/ui/Aura.tsx';
import { useFloat } from '@/ui/motion.ts';

/**
 * Placeholder Hunter, drawn with plain Views — no asset pipeline and no new
 * dependency (react-native-svg, Rive and Reanimated are all deliberately not
 * installed; §15 scopes MVP to placeholder art, and pulling in an animation
 * runtime for a placeholder is the wrong trade).
 *
 * Two things drive it, and they are independent:
 *
 * - `stage` (1–4, from the level bands in §6) is *presence*: the aura grows and
 *   brightens, so levelling visibly does something whatever you grind.
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
  /** The aura's colour. */
  aura: string;
  /** Added to the aura's base opacity. */
  glow: number;
  /** Stance width. Zero means no legs drawn. */
  stance: number;
}

const BUILDS: Record<Exclude<Dominance, null>, Build> = {
  // "Leaner frame, faster Rive idle animation" — the frame is all that
  // survives without an animation runtime.
  AGI: { shoulders: 0.86, torso: 0.84, height: 1.0, aura: colors.accent, glow: 0, stance: 0 },
  // "Broader silhouette, power aura intensifies."
  STR: { shoulders: 1.18, torso: 1.14, height: 0.94, aura: colors.danger, glow: 0.1, stance: 0 },
  // "Endurance stance" — the particle effect needs Rive, the stance does not.
  END: { shoulders: 1.0, torso: 0.98, height: 1.12, aura: tierColors.bronze, glow: 0, stance: 58 },
  // "Recovery glow, healthier skin tone."
  VIT: { shoulders: 0.96, torso: 1.0, height: 1.0, aura: tierColors.silver, glow: 0.16, stance: 0 },
  // "Rare All-Rounder visual — cannot be bought, must be earned." Gold, evenly
  // proportioned, and the only build with a full halo ring.
  balanced: { shoulders: 1.04, torso: 1.04, height: 1.04, aura: tierColors.gold, glow: 0.12, stance: 34 },
};

/** A character with no points yet: the original neutral placeholder. */
const UNSTARTED: Build = {
  shoulders: 1,
  torso: 1,
  height: 1,
  aura: colors.accent,
  glow: 0,
  stance: 0,
};

const BASE_SHOULDERS = 132;
const BASE_TORSO_WIDTH = 104;
const BASE_TORSO_HEIGHT = 96;

export function HunterSilhouette({
  stage,
  dominance,
}: {
  stage: 1 | 2 | 3 | 4;
  /** Undefined while the query is in flight; null for an unstarted character. */
  dominance?: Dominance;
}) {
  const build = dominance ? BUILDS[dominance] : UNSTARTED;

  const auraSize = 160 + stage * 14;
  const auraOpacity = 0.1 + stage * 0.12 + build.glow;

  const float = useFloat();
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <Animated.View style={[styles.frame, { transform: [{ translateY }] }]}>
      <Aura size={auraSize} color={build.aura} opacity={auraOpacity} halo={dominance === 'balanced'} />

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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 220, alignItems: 'center', justifyContent: 'flex-end' },
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
