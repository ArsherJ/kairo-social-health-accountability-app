import { StyleSheet, View } from 'react-native';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Panel, STAT_NAMES, Text, useStyles, useTheme } from '@/ui/index.ts';

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
 * A quiet dot per stat. None uses the accent: this card explains rather than
 * asks the player to act.
 */
function palette({ colors }: Theme) {
  const dot: Record<CoreStat, string> = { AGI: colors.sage, STR: colors.damage, MND: colors.accentEdge };
  return { dot };
}

export function GrowthCard() {
  const styles = useStyles(makeStyles);
  const { dot } = palette(useTheme());
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <Panel>
      <Text scale="chrome" style={styles.title}>
        How your Kairo grows
      </Text>

      {CORE_STATS.map((stat) => (
        // One element per row: the dot is decorative and the visible name and
        // explanation form a single spoken thought.
        <View
          key={stat}
          accessible
          accessibilityLabel={`${STAT_NAMES[stat]}. ${GROWTH[stat]}`}
          style={styles.row}
        >
          <View {...hidden} style={[styles.dot, { backgroundColor: dot[stat] }]} />
          <View {...hidden} style={styles.words}>
            <Text scale="chrome" style={styles.statName}>
              {STAT_NAMES[stat]}
            </Text>
            <Text style={styles.body}>{GROWTH[stat]}</Text>
          </View>
        </View>
      ))}
    </Panel>
  );
}

const makeStyles = ({ colors }: Theme) => StyleSheet.create({
  title: { ...font.display.small, color: colors.text, marginBottom: space.sm },
  // `alignItems: 'flex-start'` rather than 'center': past ~1.3x the sentence
  // wraps to three lines and a centred dot floats in the middle of it.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.md },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    marginTop: 6,
  },
  words: { flex: 1, minWidth: 0, gap: 2 },
  statName: { ...font.body.label, color: colors.text },
  body: { flex: 1, ...font.body.body, fontSize: 14, lineHeight: 20, color: colors.subtle },
});
