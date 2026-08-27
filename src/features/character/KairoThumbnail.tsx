import { Image, StyleSheet } from 'react-native';

import { KAIRO_POSE_ASSETS } from './character-assets.ts';
import type { KairoPose } from './character-contract.ts';

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

export function KairoThumbnail({ pose, size, decorative, accessibilityLabel }: KairoThumbnailProps) {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('KairoThumbnail size must be positive');
  }

  if (decorative) {
    return (
      <Image
        source={KAIRO_POSE_ASSETS[pose]}
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
      source={KAIRO_POSE_ASSETS[pose]}
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
