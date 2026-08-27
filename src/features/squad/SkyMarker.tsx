import { Image, StyleSheet, View } from 'react-native';
import type { Placement, Racer } from '@kairo/core';
import { SPECIES_FIGURES } from '@/features/character/species-art.ts';
import { displaySpecies, type SpeciesId } from '@/features/character/species.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Text } from '@/ui/index.ts';
import { raceLaneLabel } from './race-label.ts';

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

/** The figure's box. Six of these share one corridor. */
const FIGURE = 44;
const SELF_FIGURE = 60;

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function SkyMarker({
  racer,
  placement,
  boxWidth,
  boxHeight,
}: {
  racer: Racer;
  placement: Placement;
  boxWidth: number;
  boxHeight: number;
}) {
  const label = raceLaneLabel({
    rank: racer.rank,
    characterName: racer.characterName,
    isSelf: racer.isSelf,
    progressPercent: racer.progress * 100,
    finished: racer.finished,
    isGhost: racer.isGhost ?? false,
  });

  const size = racer.isSelf ? SELF_FIGURE : FIGURE;

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
      <Image
        {...HIDDEN}
        // Everyone is an eagle (deviation #55). The stored value is still
        // passed, so reversing that changes nothing here.
        source={SPECIES_FIGURES[displaySpecies(racer.species as SpeciesId | null)]}
        style={[{ width: size, height: size }, racer.isGhost && styles.ghost]}
        resizeMode="contain"
      />

      <View {...HIDDEN} style={[styles.pill, racer.isSelf ? styles.pillSelf : styles.pillOther]}>
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

const styles = StyleSheet.create({
  // `alignItems: 'center'` and no width: the marker is as wide as its pill,
  // which is as wide as the name. A fixed width would clip a long one and
  // leave a short one floating off-centre.
  marker: { position: 'absolute', alignItems: 'center', gap: space.xs },
  ghost: { opacity: 0.45 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    maxWidth: 120,
  },
  // Amber for you, ink for everybody else — the same "you are the accent" rule
  // the whole app runs on. Both are fills with a readable ink on them, never
  // accent-coloured text.
  pillSelf: { backgroundColor: colors.accent },
  pillOther: { backgroundColor: ramp.neutral[900] },
  pillLabel: { ...font.body.label, letterSpacing: 0.3 },
  inkSelf: { color: colors.text },
  inkOther: { color: colors.bg },
});
