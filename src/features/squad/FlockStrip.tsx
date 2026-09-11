import { StyleSheet, View } from 'react-native';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles } from '@/ui/index.ts';
import type { FlockMark } from './flock-walk.ts';

/**
 * How many of the flock cleared the Daily Walk, as one disc per member.
 *
 * **This was the week strip, and the change is what it counts rather than how
 * it draws.** Seven day discs showed *your* last seven days on the one tab
 * explicitly about other people, and for a new squad they were a row of empty
 * circles. The marks are the flock now: one per member, filled for everybody
 * who cleared the Daily Walk on the board's day, with their initial **above** it
 * so the row says *who* and not only *how many* — the issue's title asks for
 * who, and the ranked rows directly beneath already name everybody.
 *
 * **Above, not on.** The filled disc is `colors.accent`, and a letter laid over
 * it would be cream on a bright fill at 2.65:1 — the one pairing the palette
 * forbids, and one `contrast.test.ts` could not catch here because these are
 * inline alphas on a gradient rather than tokens.
 *
 * Three states, and the third is the one that matters. `withheld` is a member
 * whose totals the reciprocal consent gate holds back (deviation #47) — drawn
 * as a ring rather than a filled disc, because a grey filled disc is what
 * "did not walk" looks like and accusing somebody of missing a day for keeping
 * their numbers private is worse than saying nothing. `flock-walk.ts` decides
 * every one of these; this file only paints them.
 *
 * One accessibility element for the whole strip, with the count in it once.
 * Six discs that each say a letter are six stops for a picture whose meaning
 * is the shape of the row.
 */
export function FlockStrip({ marks, label }: { marks: readonly FlockMark[]; label: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityElementsHidden={false}
      style={styles.strip}
    >
      {marks.map((mark, i) => (
        <View
          // The index is the key: two members can share an initial, and the
          // letter alone would collide.
          key={i}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.mark}
        >
          <Text scale="fixed" style={styles.letter} numberOfLines={1}>
            {mark.letter}
          </Text>
          <View style={[styles.disc, styles[mark.state]]} />
        </View>
      ))}
    </View>
  );
}

const makeStyles = ({ colors, ramp }: Theme) => StyleSheet.create({
  strip: { flexDirection: 'row', gap: space.sm },
  mark: { flex: 1, alignItems: 'center', gap: space.xs },
  // On the page since deviation #72, so the letters take the page's muted ink
  // and the discs the page's washes.
  letter: { ...font.body.label, color: colors.muted },
  disc: { width: 24, height: 24, borderRadius: radius.pill },
  cleared: { backgroundColor: colors.accent },
  unmet: { backgroundColor: ramp.neutral[300] },
  // A ring, not a fill. Nothing is known about this member's day, and an empty
  // outline is the only one of the three that says so rather than guessing.
  withheld: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: ramp.neutral[400],
  },
});
