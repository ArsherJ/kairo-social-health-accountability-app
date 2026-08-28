import { Image, StyleSheet } from 'react-native';

import { KAIRO_BASE_ASSET } from './character-assets.ts';
import type { KairoPose } from './character-contract.ts';

/**
 * Compact static KAIRO for list and race surfaces.
 *
 * **Interim state (2026-08-28):** every compact surface renders the single
 * static base render while the Rive character is authored. `pose` is still
 * accepted so the call sites and `KAIRO_THUMBNAIL_POSE` do not have to change;
 * it is ignored until the per-pose exports (or Rive) come back.
 */

type KairoThumbnailProps =
  | {
      pose: KairoPose;
      size: number;
      decorative: true;
      accessibilityLabel?: never;
    }
  | {
      pose: KairoPose;
      size: number;
      decorative?: false;
      accessibilityLabel: string;
    };

export function KairoThumbnail({ pose: _pose, size, decorative, accessibilityLabel }: KairoThumbnailProps) {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('KairoThumbnail size must be positive');
  }

  if (decorative) {
    return (
      <Image
        source={KAIRO_BASE_ASSET}
        style={[styles.image, { width: size, height: size }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }

  return (
    <Image
      source={KAIRO_BASE_ASSET}
      style={[styles.image, { width: size, height: size }]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  image: { aspectRatio: 1 },
});
