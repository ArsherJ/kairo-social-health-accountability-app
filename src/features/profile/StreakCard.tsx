import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Label, Text } from '@/ui/index.ts';
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
 *
 * The card is sage in both states. It used to flip `Panel` between `plain` and
 * `earned`, which made the whole block change colour on a fact the pill below
 * already states — two signals for one thing, and the louder one attached to
 * "streak" rather than to "shield". Sage is simply what a streak is here.
 */
export function StreakCard({ streak }: { streak: Streak | null | undefined }) {
  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const shieldBanked = streak ? streak.shield_available_on === null : false;

  return (
    <View style={styles.card}>
      {/* Behind the figures, bleeding off the corner — the same device the
          squad panel uses, so the two sage moments in the app rhyme. */}
      <View style={styles.bloom} />

      <Label tone="sage">Streak</Label>

      <View style={styles.figures}>
        <View>
          <Text style={styles.figure}>{current}</Text>
          <Text style={styles.caption}>current</Text>
        </View>
        <View>
          <Text style={[styles.figure, styles.figureQuiet]}>{longest}</Text>
          <Text style={styles.caption}>longest</Text>
        </View>
      </View>

      {/* The shield is a thing you hold, not a note in the margin. §19 only
          works if you know you have one *before* the day you need it, and a
          line of small print under two big numbers is not where anyone looks. */}
      <View style={[styles.shield, shieldBanked && styles.shieldBanked]}>
        <Feather name="shield" size={19} color={ramp.sage[700]} />
        <Text style={shieldBanked ? styles.shieldReady : styles.shieldSpent}>
          {shieldBanked
            ? 'Shield banked — one missed day is safe'
            : streak
              ? `Shield recharges ${streak.shield_available_on}`
              : 'Score once to start a streak'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: ramp.sage[200],
    overflow: 'hidden',
  },
  bloom: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[300],
  },
  figures: { flexDirection: 'row', gap: space.xl, marginTop: space.sm },
  figure: { ...font.display.hero, fontSize: 42, letterSpacing: -0.5, color: ramp.sage[900] },
  /** Your best is context for your current, not a rival to it. */
  figureQuiet: { color: ramp.sage[800], opacity: 0.65 },
  caption: { ...font.body.strong, fontSize: 12, color: ramp.sage[800] },
  shield: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    marginTop: space.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[100],
  },
  shieldBanked: { backgroundColor: ramp.neutral[100] },
  shieldReady: { ...font.body.strong, fontSize: 13, color: ramp.sage[900] },
  shieldSpent: { ...font.body.strong, fontSize: 13, color: colors.muted },
});
