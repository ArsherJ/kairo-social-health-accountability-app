import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Text } from '@/ui/index.ts';

/**
 * The bird's two observations, side by side.
 *
 * These are the Strain/Sleep rows in their fourth dress — a row, then a card,
 * then a `VoiceCard`, now a tile. **Still gated to `full`** (deviation #37) by
 * the caller; the shape changed and the rule did not.
 *
 * Two tones, and they are the two families that are not the accent: teal is
 * rest, sage is your lane. Neither is a call to action, which is why neither is
 * orange — the screen spends its one accent on the day's number, and this is
 * the pair that would most plausibly steal it.
 *
 * **A tile may show a figure, and it comes from the same reading the sentence
 * does.** The sleep tile prints "7h 20" above the line about it; the lane tile
 * prints the stat's own name, because a lane has no number and inventing one
 * would be the readout these have spent three redesigns getting away from. A
 * tile with no figure simply has none — `figure` is optional and the layout
 * closes up, rather than reserving a slot that reads as a missing value.
 *
 * One accessibility element per tile with both halves of the grouping fix: an
 * eyebrow, a figure and a sentence read as three stops otherwise, and the
 * eyebrow alone is not a sentence.
 */
export function TodayTiles({
  sleep,
  lane,
}: {
  sleep: { eyebrow: string; body: string; figure: string | null };
  lane: { eyebrow: string; body: string; figure: string | null } | null;
}) {
  return (
    <View style={styles.row}>
      <VoiceTile tone="teal" icon="weather-night" {...sleep} />
      {lane && <VoiceTile tone="sage" icon="compass-outline" {...lane} />}
    </View>
  );
}

function VoiceTile({
  tone,
  icon,
  eyebrow,
  body,
  figure,
}: {
  tone: 'teal' | 'sage';
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  eyebrow: string;
  body: string;
  figure: string | null;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  const skin = tone === 'teal' ? TEAL : SAGE;

  return (
    <View
      accessible
      // The figure is deliberately not in the label. Where there is one it is
      // already said by the sentence ("slept seven hours twenty"), and reading
      // "7h 20" before that sentence makes a screen reader announce the same
      // fact twice in two formats.
      accessibilityLabel={`${eyebrow}. ${body}`}
      style={[styles.tile, { backgroundColor: skin.wash }]}
    >
      <MaterialCommunityIcons {...hidden} name={icon} size={22} color={skin.glyph} />
      {figure && (
        <Text {...hidden} scale="fixed" style={[styles.figure, { color: skin.ink }]}>
          {figure}
        </Text>
      )}
      <Text {...hidden} scale="chrome" numberOfLines={3} style={[styles.body, { color: skin.ink }]}>
        {body}
      </Text>
    </View>
  );
}

/**
 * Wash, glyph and ink per tone.
 *
 * The glyph takes the bright step and the type takes the deep one, which is the
 * palette's standing rule rather than a choice made here: `ramp.teal[500]` and
 * `ramp.sage[500]` are fills that fail as text, and `contrast.test.ts` pins the
 * inks that do not.
 */
const TEAL = { wash: colors.tealTint, glyph: ramp.teal[600], ink: colors.tealInk } as const;
const SAGE = { wash: ramp.sage[200], glyph: ramp.sage[500], ink: ramp.sage[800] } as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 14 },
  // `flex: 1` on each and no fixed width: two tiles side by side is exactly the
  // two-column row that could not fit past ~1.3x Dynamic Type on the 2026-08-17
  // permission sheet. Here the text wraps inside a growing tile instead, and
  // `numberOfLines={3}` bounds the growth rather than the width.
  tile: {
    flex: 1,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    gap: 6,
  },
  figure: { ...font.display.minor, fontSize: 19 },
  body: { ...font.body.strong, fontSize: 11.5, lineHeight: 16 },
});
