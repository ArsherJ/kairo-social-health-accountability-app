import { Image, StyleSheet, type ImageSourcePropType } from 'react-native';

import { CREST_TINT_OPACITY } from './plumage.ts';

/**
 * The crest, in the hue of the dominant stat (issue #33).
 *
 * One component because there are two callers — `CharacterFigure` on the day
 * screen and `KairoThumbnail` in a flock row — and what they share is not just
 * a shape: it is a pair of accessibility props that must both be present. The
 * 2026-08-14 device pass found `accessible` alone failing to collapse a
 * subtree on iOS, and the fix has been two props ever since; a decorative
 * layer duplicated across two files is exactly where one of them goes missing.
 *
 * **Absolutely filled and `contain`, over an image drawn the same way.** The
 * mask is generated from the render it sits on and shares its 570×636 canvas,
 * so identical framing is what puts the hue on the head feathers rather than
 * beside them. It is the caller's job to give both images one box.
 *
 * `CREST_TINT_OPACITY` rather than full strength: `tintColor` keeps an image's
 * alpha and replaces everything else, so a mask at full strength erases the
 * outlines and shading it is drawn over and the crest reads as a coloured blob
 * glued to a bird.
 *
 * It says nothing. The dominant stat is already in the reading order of every
 * surface that draws a particular player — three ratings on a flock row, the
 * rail on You — so a crest announcing its hue would say the same fact twice, in
 * a vocabulary nobody asked for.
 */
export function CrestLayer({ source, tint }: { source: ImageSourcePropType; tint: string }) {
  return (
    <Image
      source={source}
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', tintColor: tint, opacity: CREST_TINT_OPACITY }]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
