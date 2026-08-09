import { StyleSheet, Text, View } from 'react-native';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Label, Numeral, Panel } from '@/ui/index.ts';
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
    <Panel variant={shieldBanked ? 'earned' : 'plain'}>
      <Label>Streak</Label>

      <View style={styles.figures}>
        <View>
          <Numeral value={current} size="major" />
          <Text style={styles.caption}>current</Text>
        </View>
        <View>
          <Numeral value={longest} size="major" />
          <Text style={styles.caption}>longest</Text>
        </View>
      </View>

      {/* The shield is a thing you hold, not a note in the margin. §19 only
          works if you know you have one *before* the day you need it, and a
          line of small print under two big numbers is not where anyone looks. */}
      <View style={[styles.shield, shieldBanked && styles.shieldBanked]}>
        <Text style={styles.shieldGlyph}>{shieldBanked ? '\u25c6' : '\u25c7'}</Text>
        <Text style={shieldBanked ? styles.shieldReady : styles.shieldSpent}>
          {shieldBanked
            ? 'Shield banked — one missed day is safe'
            : streak
              ? `Shield recharges ${streak.shield_available_on}`
              : 'Score once to start a streak'}
        </Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', gap: space.xl, marginTop: space.sm },
  caption: { ...font.body.strong, color: ramp.sage[800] },
  shield: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    marginTop: space.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[200],
  },
  shieldBanked: { backgroundColor: ramp.neutral[100] },
  shieldGlyph: { fontSize: 15, color: ramp.sage[700] },
  shieldReady: { ...font.body.strong, fontSize: 13, color: ramp.sage[900] },
  shieldSpent: { ...font.body.strong, fontSize: 13, color: colors.muted },
});
