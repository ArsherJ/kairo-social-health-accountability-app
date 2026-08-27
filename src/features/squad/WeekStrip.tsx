import { StyleSheet, View } from 'react-native';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Text } from '@/ui/index.ts';

/**
 * The squad's week, as seven discs (`Canvas.dc.html` 2d).
 *
 * A day is `done` (somebody's day is in), `waiting` (today, still open) or
 * `future`. It draws no names and no figures — that is the board below it —
 * and it never draws a count, because a squad spans timezones and "three of
 * four are in" is a claim about a moment that does not exist for everybody at
 * once (§2).
 *
 * One accessibility element for the whole strip. Seven discs that each say a
 * letter is seven stops for a picture whose meaning is the shape of the row.
 */
export interface WeekDay {
  /** The weekday initial, already localised by the caller. */
  letter: string;
  state: 'done' | 'waiting' | 'future';
}

export function WeekStrip({ days }: { days: readonly WeekDay[] }) {
  const done = days.filter((d) => d.state === 'done').length;

  return (
    <View
      accessible
      accessibilityLabel={`This week: ${done} ${done === 1 ? 'day' : 'days'} recorded`}
      accessibilityElementsHidden={false}
      style={styles.strip}
    >
      {days.map((day, i) => (
        <View
          // The index is the key: two Tuesdays cannot occur in one week, but
          // two days share an initial (T, T and S, S) and the letter alone
          // would collide.
          key={i}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.day}
        >
          <Text scale="fixed" style={[styles.letter, day.state === 'future' && styles.letterFuture]}>
            {day.letter}
          </Text>
          <View style={[styles.disc, styles[day.state]]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  day: { flex: 1, alignItems: 'center', gap: space.xs },
  letter: { ...font.body.label, color: ramp.accent[700] },
  letterFuture: { color: ramp.neutral[400] },
  disc: { width: 34, height: 34, borderRadius: radius.pill },
  done: { backgroundColor: colors.accent },
  // The one that moves. Today is open, and an outline says so without
  // claiming anything about whether anybody has walked yet.
  waiting: { backgroundColor: ramp.accent[200], borderWidth: 2, borderColor: colors.accent },
  future: { backgroundColor: ramp.neutral[200] },
});
