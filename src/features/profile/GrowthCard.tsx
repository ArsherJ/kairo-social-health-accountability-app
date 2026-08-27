import { StyleSheet, View } from 'react-native';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Panel, STAT_NAMES, Text } from '@/ui/index.ts';

/**
 * How your Kairo grows (`Canvas.dc.html` 2e).
 *
 * A static explainer, not a reading of the account — it says what each stat is
 * *for*, in the bird's terms, and never what the reader has earned. The ratings
 * are on `StatRail`, which is gated; this is not, because a new account needs
 * to know what the three things are before it has any of them.
 *
 * **The design draws `AGI` / `STR` / `MND` chips here and this does not.**
 * Those are engine keys and deviation #51 took the last of them off the
 * surface — `boostChipLabel` printed `AGI ×1.5` and was the final one. The
 * layout and the colour coding are the design's; the vocabulary is
 * `STAT_NAMES`'.
 */

/** What each stat is for, in the bird's terms. One line each. */
const GROWTH: Record<CoreStat, string> = {
  AGI: 'Walks and runs make it faster in the air',
  STR: 'Sessions in the gym widen its wings',
  MND: 'Sleep is what it flies on the next day',
};

/**
 * A dot per stat, and the tint behind its name.
 *
 * Three families, one each, and none of them is the accent: this card is not a
 * call to action. Motion is sage because that is what "your lane" already means
 * in this system; Body is the damage coral, which is the only other hue with an
 * ink dark enough to set a word in; Mind is amber's deep step, which is
 * `earnedColor`'s family and reads as rest rather than as a button.
 */
const DOT: Record<CoreStat, string> = {
  AGI: colors.sage,
  STR: colors.damage,
  MND: colors.accentEdge,
};

const CHIP_BG: Record<CoreStat, string> = {
  AGI: ramp.sage[200],
  STR: colors.tealTint,
  MND: ramp.accent[200],
};

const CHIP_INK: Record<CoreStat, string> = {
  AGI: ramp.sage[800],
  STR: colors.tealInk,
  MND: ramp.accent[800],
};

export function GrowthCard() {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <Panel>
      <Text scale="chrome" style={styles.title}>
        HOW YOUR KAIRO GROWS
      </Text>

      {CORE_STATS.map((stat) => (
        // One element per row: a dot, a sentence and a chip read as three
        // stops otherwise, and the dot and the chip say nothing on their own.
        <View
          key={stat}
          accessible
          accessibilityLabel={`${STAT_NAMES[stat]}. ${GROWTH[stat]}`}
          style={styles.row}
        >
          <View {...hidden} style={[styles.dot, { backgroundColor: DOT[stat] }]} />
          <Text {...hidden} style={styles.body}>
            {GROWTH[stat]}
          </Text>
          <View {...hidden} style={[styles.chip, { backgroundColor: CHIP_BG[stat] }]}>
            <Text scale="chrome" style={[styles.chipLabel, { color: CHIP_INK[stat] }]}>
              {STAT_NAMES[stat]}
            </Text>
          </View>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  title: { ...font.display.small, color: colors.text, marginBottom: space.sm },
  // `alignItems: 'flex-start'` rather than 'center': past ~1.3x the sentence
  // wraps to three lines and a centred dot floats in the middle of it.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.md },
  dot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: 6 },
  body: { flex: 1, ...font.body.body, fontSize: 14, lineHeight: 20, color: colors.subtle },
  chip: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  chipLabel: { ...font.body.label, letterSpacing: 0.5 },
});
