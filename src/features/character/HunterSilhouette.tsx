import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';
import type { Dominance } from '@kairo/core';
import { colors, radius, tierColors } from '@/theme.ts';

/**
 * The Hunter. Static placeholder art where an asset exists for the
 * (stage × dominance) pair, and the original View primitives everywhere else —
 * still no new dependency (react-native-svg, Rive and Reanimated are all
 * deliberately not installed; §15 scopes MVP to *static* placeholder art, and
 * pulling in an animation runtime for a placeholder is the wrong trade).
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
 * To add one, drop the PNG in `assets/hunter/` and add its line here:
 *
 *     '3-STR': require('../../../assets/hunter/3-STR.png'),
 *
 * `assets/hunter/README.md` lists every key and what each is meant to look
 * like. Roughly 2:1 portrait, transparent background — the aura is drawn
 * behind the image by this component, not baked into it, so the same asset
 * reads correctly at every stage's aura size.
 */
const HUNTER_ART: Partial<Record<ArtKey, ImageSourcePropType>> = {};

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
  const art = HUNTER_ART[artKey(stage, dominance)];

  const auraSize = 160 + stage * 14;
  const auraOpacity = 0.1 + stage * 0.12 + build.glow;

  return (
    <View style={styles.frame}>
      <View
        style={[
          styles.aura,
          {
            width: auraSize,
            height: auraSize,
            opacity: auraOpacity,
            backgroundColor: build.aura,
          },
        ]}
      />

      {/* The All-Rounder's halo. A ring rather than more glow, so it survives
          being screenshotted next to a bright STR aura. */}
      {dominance === 'balanced' && (
        <View
          style={[
            styles.halo,
            { width: auraSize + 22, height: auraSize + 22, borderColor: build.aura },
          ]}
        />
      )}

      {/* Art when there is art, primitives when there is not. A character that
          fails to render is worse than a plain one, so the fallback is a
          permanent branch rather than a migration step. */}
      {art ? (
        <Image
          source={art}
          style={styles.art}
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
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 220, alignItems: 'center', justifyContent: 'flex-end' },
  aura: { position: 'absolute', borderRadius: radius.pill },
  halo: {
    position: 'absolute',
    borderRadius: radius.pill,
    borderWidth: 2,
    opacity: 0.55,
  },
  // Matches the primitives' overall footprint (head + shoulders + torso + legs
  // ≈ 212 tall) so swapping one for the other does not move the layout under
  // the TODAY card.
  art: { width: 190, height: 212 },
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
