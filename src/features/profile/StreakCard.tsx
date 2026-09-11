import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles, useTheme } from '@/ui/index.ts';
import { shieldNote } from './shield-note.ts';
import type { Streak } from './queries.ts';

/**
 * Streak and Streak Shield (§19).
 *
 * `streak` is null for anyone who has never scored — the row is created on the
 * first scoring day — so this renders zeros rather than an error.
 *
 * What the shield pill says is `shieldNote`'s decision, not this component's:
 * `shield_available_on === null` only means no shield is *recharging*, and the
 * streak minimum is the other half. The pill's colour reads the same decision
 * as its words, so the two cannot disagree.
 *
 * A surface card with the streak's own flame beside its figure (deviation
 * #72). It was a sage wash with a bloom off the corner; the bloom was the one
 * ornament on the tab that meant nothing, and a card in a family's wash sat
 * beside three cards in white and read as a different kind of thing.
 */
export function StreakCard({ streak }: { streak: Streak | null | undefined }) {
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();
  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const shield = shieldNote(streak);

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View style={styles.card}>
      {/* Each figure pairs with its caption as one element. Both texts inside
          each figure are hidden explicitly — the documented collapse did not
          happen on the 2026-08-14 build. */}
      <View style={styles.figures}>
        <View accessible accessibilityLabel={`Current streak, ${current} days`} style={styles.figure}>
          <View {...hidden} style={styles.figureRow}>
            <MaterialCommunityIcons name="fire" size={18} color={colors.coral} />
            <Text scale="fixed" style={styles.number}>
              {current}
            </Text>
          </View>
          <Text {...hidden} scale="chrome" style={styles.caption}>
            day streak
          </Text>
        </View>
        <View {...hidden} style={styles.rule} />
        <View accessible accessibilityLabel={`Longest streak, ${longest} days`} style={styles.figure}>
          <Text {...hidden} scale="fixed" style={[styles.number, styles.numberQuiet]}>
            {longest}
          </Text>
          <Text {...hidden} scale="chrome" style={styles.caption}>
            longest
          </Text>
        </View>
      </View>

      {/* The shield is a thing you hold, not a note in the margin: §19 only
          works if you know you have one *before* the day you need it. */}
      <View style={[styles.shield, shield.banked && styles.shieldBanked]}>
        <MaterialCommunityIcons
          name={shield.banked ? 'shield-check' : 'shield-outline'}
          size={17}
          color={shield.banked ? ramp.gold[700] : colors.muted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={shield.banked ? styles.shieldReady : styles.shieldSpent}>{shield.text}</Text>
      </View>
    </View>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) =>
  StyleSheet.create({
    card: {
      marginTop: space.md,
      padding: space.md,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      ...shadow.sm,
    },
    figures: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    figure: { flex: 1 },
    figureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
    number: { ...font.display.major, fontSize: 30, lineHeight: 36, color: colors.text },
    /** Your best is context for your current, not a rival to it. */
    numberQuiet: { color: colors.subtle },
    caption: { ...font.body.strong, fontSize: 12, color: colors.muted, marginTop: 2 },
    shield: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      alignSelf: 'stretch',
      minWidth: 0,
      marginTop: space.md,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: ramp.neutral[200],
    },
    shieldBanked: { backgroundColor: ramp.gold[200] },
    shieldReady: {
      flex: 1,
      minWidth: 0,
      ...font.body.strong,
      fontSize: 12.5,
      color: ramp.gold[800],
    },
    shieldSpent: {
      flex: 1,
      minWidth: 0,
      ...font.body.strong,
      fontSize: 12.5,
      color: colors.muted,
    },
  });
