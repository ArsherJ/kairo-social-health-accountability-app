import { Image, StyleSheet, View } from 'react-native';
import { KAIRO_BASE_ASSET, KAIRO_BASE_CREST } from './character-assets.ts';
import type { KairoPose } from './character-contract.ts';
import { CrestLayer } from './CrestLayer.tsx';
import { crestTint, type LifetimePoints } from './plumage.ts';

/**
 * Compact static KAIRO for list and race surfaces.
 *
 * **Interim state (2026-08-28):** every compact surface renders the single
 * static base render while the Rive character is authored. `pose` is still
 * accepted so the call sites and `KAIRO_THUMBNAIL_POSE` do not have to change;
 * it is ignored until the per-pose exports (or Rive) come back.
 *
 * **`lifetimePoints` tints the crest** (issue #33), and the mask is the base
 * render's own, because that is the one drawing this component makes. A caller
 * that has no per-stat figures — every onboarding card, where the bird stands
 * for nobody in particular — passes nothing and gets exactly the thumbnail it
 * always got.
 */

type KairoThumbnailProps = {
  pose: KairoPose;
  size: number;
  /**
   * The subject's lifetime per-stat points, when the thumbnail stands for a
   * particular player: `profiles`' rollups, or a squadmate's `ratings` off
   * `squad_leaderboard()`. Undefined draws the untinted bird.
   */
  lifetimePoints?: LifetimePoints;
} & (
  | { decorative: true; accessibilityLabel?: never }
  | { decorative?: false; accessibilityLabel: string }
);

export function KairoThumbnail({
  pose: _pose,
  size,
  decorative,
  accessibilityLabel,
  lifetimePoints,
}: KairoThumbnailProps) {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('KairoThumbnail size must be positive');
  }

  const crest = crestTint(lifetimePoints);

  // The accessible half sits on the wrapper rather than on the bird, so the
  // pair reads as one element. `accessible` alone should collapse the children
  // on iOS and did not on the 2026-08-14 build, so they are hidden explicitly
  // — the same two-part fix `LeaderboardRow` carries, and for the same reason.
  const grouping = decorative
    ? {
        accessible: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      }
    : {
        accessible: true,
        accessibilityRole: 'image' as const,
        // Deliberately unchanged by the crest. The tint carries the dominant
        // stat, which every surface drawing this thumbnail already speaks in
        // its own reading order — a hue announced here would say it twice, in
        // a vocabulary nobody asked for.
        accessibilityLabel,
      };

  return (
    <View style={[styles.frame, { width: size, height: size }]} {...grouping}>
      <Image
        source={KAIRO_BASE_ASSET}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      {/* One box for both images, so the hue lands on the head feathers rather
          than beside them. `CrestLayer` carries the rest. */}
      {crest !== null && <CrestLayer source={KAIRO_BASE_CREST} tint={crest} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Square, and the same footprint the bare `<Image>` had: the images fill it
  // absolutely, so nothing under a caller's layout moved when the crest layer
  // arrived.
  frame: { aspectRatio: 1 },
});
