import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Placement, Racer } from '@kairo/core';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { KAIRO_THUMBNAIL_POSE } from '@/features/character/character-surface-policy.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles } from '@/ui/index.ts';
// The figure's box — how big a bird on the corridor is, ordinary and your own.
// Imported rather than declared here: the Sky's top inset exists to keep the
// topmost bird clear of the pinned flock rail, and the only test that can
// prove it has to know how big a bird is. See `flight-frame.ts` for why that
// puts the two numbers in a module root Vitest can load.
import { SKY_FIGURE, SKY_SELF_FIGURE } from './flight-frame.ts';
import { raceLaneLabel } from './race-label.ts';
import { skyMarkerLabelAbove } from './sky-marker-label.ts';

/**
 * One bird on the corridor.
 *
 * **One accessibility element, both halves of the grouping fix.** A marker is a
 * figure and a name pill; left as separate elements a six-person race is twelve
 * stops, which is the measured failure the 2026-08-14 device pass found on
 * leaderboard rows. The parent carries `accessible` + `accessibilityLabel` and
 * every direct child is hidden with **both** props — the documented collapse
 * did not happen on that build, so neither half is redundant.
 *
 * The label is `raceLaneLabel`'s, unchanged: position, who, how far. It says a
 * percentage rather than a step count, because the corridor draws a distance to
 * a flag and a label naming a figure the screen does not show would describe a
 * different product.
 *
 * Absolutely positioned, and this is the one place in the race where that is
 * right: the corridor is drawn geometry rather than a flow, and `placeRacers`
 * has already decided where this sits. The rule the six-lane track carried —
 * flow-based layout, no `top` on any child — was about a *lane*, whose height
 * had to follow Dynamic Type. A marker on a curve has no such obligation; what
 * it must do instead is keep its pill legible when the type grows, which is
 * what `numberOfLines` and the pill's intrinsic width do below.
 */

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function SkyMarker({
  racer,
  placement,
  boxWidth,
  boxHeight,
  bottomClearance,
}: {
  racer: Racer;
  placement: Placement;
  boxWidth: number;
  boxHeight: number;
  bottomClearance: number;
}) {
  const label = raceLaneLabel({
    rank: racer.rank,
    characterName: racer.characterName,
    isSelf: racer.isSelf,
    progressPercent: racer.progress * 100,
    finished: racer.finished,
    isGhost: racer.isGhost ?? false,
  });

  const size = racer.isSelf ? SKY_SELF_FIGURE : SKY_FIGURE;
  const [pillHeight, setPillHeight] = useState(0);
  const styles = useStyles(makeStyles);
  const labelAbove = skyMarkerLabelAbove({
    placementY: placement.y,
    boxHeight,
    figureSize: size,
    pillHeight,
    gap: space.xs,
    bottomClearance,
  });

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.marker,
        {
          left: placement.x * boxWidth - size / 2,
          top: placement.y * boxHeight - size / 2,
        },
      ]}
    >
      <View {...HIDDEN} style={racer.isGhost && styles.ghost}>
        <KairoThumbnail pose={KAIRO_THUMBNAIL_POSE.skyMarker} size={size} decorative />
      </View>

      <View
        {...HIDDEN}
        onLayout={(event) => {
          const measured = event.nativeEvent.layout.height;
          setPillHeight((current) => current === measured ? current : measured);
        }}
        style={[
          styles.pill,
          racer.isSelf ? styles.pillSelf : styles.pillOther,
          labelAbove ? [styles.pillAbove, { bottom: size + space.xs }] : null,
        ]}
      >
        <Text
          scale="fixed"
          numberOfLines={1}
          style={[styles.pillLabel, racer.isSelf ? styles.inkSelf : styles.inkOther]}
        >
          {racer.isSelf ? 'You' : racer.characterName}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = ({ colors, ramp }: Theme) => StyleSheet.create({
  // `alignItems: 'center'` and no width: the marker is as wide as its pill,
  // which is as wide as the name. A fixed width would clip a long one and
  // leave a short one floating off-centre.
  marker: { position: 'absolute', alignItems: 'center', gap: space.xs },
  ghost: { opacity: 0.45 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    maxWidth: 120,
  },
  pillAbove: { position: 'absolute', alignSelf: 'center' },
  // Amber for you, ink for everybody else — the same "you are the accent" rule
  // the whole app runs on. Both are fills with a readable ink on them, never
  // accent-coloured text.
  pillSelf: { backgroundColor: colors.accent },
  // `night` rather than `neutral[900]`: the flight is drawn on `night` in
  // both schemes, and under the dark one `neutral[900]` is cream.
  pillOther: { backgroundColor: colors.night },
  pillLabel: { ...font.body.label, letterSpacing: 0.3 },
  inkSelf: { color: colors.ink },
  inkOther: { color: colors.onDeep },
});
