import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles, useTheme } from '@/ui/index.ts';

/**
 * Level and streak, as two chips in the dashboard's header row.
 *
 * Two elements, not five. The level disc and its XP track are one proposition
 * and read as one stop; the streak is genuinely separate and gets its own.
 * Both halves of the grouping fix on each — the documented collapse did not
 * happen on the 2026-08-14 build and removing either half is how
 * twelve-stops-per-row comes back.
 *
 * They stood on glass over the sky until deviation #72; on the page they are
 * quiet washes with their family's ink, and the streak's flame is the one
 * saturated thing in the row.
 */
export function TodayChips({
  level,
  xp,
  streak,
}: {
  level: number;
  xp: { fraction: number; intoLevel: number; neededForNext: number };
  streak: number;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;
  const fill = `${Math.round(Math.min(1, Math.max(0, xp.fraction)) * 100)}%` as const;

  return (
    <View style={styles.chipRow}>
      <View
        accessible
        accessibilityLabel={
          `Level ${level}, ${xp.intoLevel.toLocaleString()} of ` +
          `${xp.neededForNext.toLocaleString()} XP`
        }
        style={styles.levelChip}
      >
        <Text {...hidden} scale="fixed" style={styles.levelWord}>
          LV
        </Text>
        <Text {...hidden} scale="fixed" style={styles.levelNumber}>
          {level}
        </Text>
        {/* The track alone, with no figure beside it: the label spells the XP
            out, and a painted number here would be a second reading of a thing
            the shape already says. */}
        <View {...hidden} style={styles.levelTrack}>
          <View style={[styles.levelFill, { width: fill }]} />
        </View>
      </View>

      {/* "3 day streak", not "3-day": the hyphenated form is right on screen
          and wrong out loud, the same rule `row-label.ts` tests. */}
      {streak > 0 && (
        <View accessible accessibilityLabel={`${streak} day streak`} style={styles.streakChip}>
          <MaterialCommunityIcons {...hidden} name="fire" size={15} color={colors.coral} />
          <Text {...hidden} scale="fixed" style={styles.streakNumber}>
            {streak}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = ({ colors, ramp }: Theme) =>
  StyleSheet.create({
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    levelChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 7,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: radius.pill,
      backgroundColor: ramp.accent[200],
    },
    levelWord: { ...font.body.label, fontSize: 10, color: colors.accentDeep },
    levelNumber: { ...font.display.small, fontSize: 15, color: colors.accentDeep },
    levelTrack: {
      width: 40,
      height: 5,
      borderRadius: radius.pill,
      backgroundColor: ramp.accent[300],
      overflow: 'hidden',
      marginLeft: 2,
    },
    levelFill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.accent },
    streakChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: colors.coralTint,
    },
    streakNumber: { ...font.display.small, fontSize: 15, color: colors.damage },
  });
