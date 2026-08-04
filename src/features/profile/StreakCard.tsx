import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme.ts';
import type { Streak } from './queries.ts';

/**
 * Streak and Streak Shield (§19).
 *
 * `streak` is null for anyone who has never scored — the row is created on the
 * first scoring day — so this renders zeros rather than an error. A new user
 * seeing "0 days" is correct; a new user seeing a failure is not.
 *
 * `shield_available_on` null means a shield is banked *now* (see the column
 * comment in 20260727120300_progression_and_infra.sql). Saying so out loud is
 * the point of the mechanic: the shield only prevents churn if the user knows
 * they have one before the day they need it.
 */
export function StreakCard({ streak }: { streak: Streak | null | undefined }) {
  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const shieldBanked = streak ? streak.shield_available_on === null : false;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>STREAK</Text>

      <View style={styles.figures}>
        <View>
          <Text style={styles.big}>{current}</Text>
          <Text style={styles.caption}>current</Text>
        </View>
        <View>
          <Text style={styles.bigMuted}>{longest}</Text>
          <Text style={styles.caption}>longest</Text>
        </View>
      </View>

      <Text style={shieldBanked ? styles.shieldReady : styles.shieldSpent}>
        {shieldBanked
          ? 'Streak Shield banked — one missed day will not break it.'
          : streak
            ? `Streak Shield recharges ${streak.shield_available_on}.`
            : 'Score once to start a streak.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.muted, ...font.body.label },
  figures: { flexDirection: 'row', gap: space.xl, marginTop: space.sm },
  big: { color: colors.accent, fontSize: 36, fontWeight: '800' },
  bigMuted: { color: colors.text, fontSize: 36, fontWeight: '800' },
  caption: { color: colors.muted, fontSize: 12 },
  shieldReady: { color: colors.text, fontSize: 13, marginTop: space.md, lineHeight: 18 },
  shieldSpent: { color: colors.muted, fontSize: 13, marginTop: space.md, lineHeight: 18 },
});
