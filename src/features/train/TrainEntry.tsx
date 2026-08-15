import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { clearingSession, resolveChallenge, type ChallengeArea } from '@kairo/core';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, earnedColor, font, radius, ramp, space } from '@/theme.ts';
import { CtaPill, Label, Text } from '@/ui/index.ts';
import { AREA_NAMES, challengeHeadline } from './challenge-copy.ts';
import { useWorkoutSessions } from './queries.ts';

/**
 * The home shelf's way into `/train`.
 *
 * It shows the live target **as text**, so a user learns what the mechanic is
 * without navigating. For a cold-start user that reads as "Log one run of 1 km"
 * — an invitation, which is the correct first impression for a screen they have
 * never opened.
 *
 * Compact on purpose: home is the densest screen in the app, and this is a door
 * rather than a destination. The full hint copy lives behind the door.
 */
export function TrainEntry({
  userId,
  timeZone,
  today,
}: {
  userId: string | undefined;
  timeZone: string | undefined;
  /** The user's own local date. Passed in; this component reads no clock. */
  today: string | undefined;
}) {
  const router = useRouter();
  const profile = useProfile(userId);
  const sessions = useWorkoutSessions(userId, timeZone);

  const optIn: Record<ChallengeArea, boolean> = {
    run: profile.data?.trains_run ?? false,
    strength: profile.data?.trains_strength ?? false,
  };
  const chosen = (['run', 'strength'] as const).filter((area) => optIn[area]);

  if (!profile.isSuccess) return null;

  // Nothing opted into: a single invitation, not two empty cards. The picker
  // itself lives on `/train`, so this stays one line on the densest screen.
  if (chosen.length === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Set up a training challenge"
        onPress={() => router.push('/train')}
        style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
      >
        <Label tone="muted">TRAIN</Label>
        <Text style={styles.emptyTitle}>Add a challenge</Text>
        <Text style={styles.emptyBody}>
          A running or strength target set from your own recent sessions.
        </Text>
        <CtaPill label="Pick an area" />
      </Pressable>
    );
  }

  // Wait for the sessions rather than showing a cold-start target and
  // correcting it: "Log one run" swapping to "5 km under 4:51/km" would tell
  // the user their history had been lost.
  if (!sessions.isSuccess || !today) return null;

  const lines = chosen.map((area) => {
    const challenge = resolveChallenge(area, sessions.data, today);
    return {
      area,
      headline: challengeHeadline(challenge),
      cleared: clearingSession(challenge, sessions.data, today) !== null,
    };
  });

  const spoken = lines
    .map((l) => `${AREA_NAMES[l.area]}: ${l.headline}.${l.cleared ? ' Cleared today.' : ''}`)
    .join(' ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Training. ${spoken} Open.`}
      onPress={() => router.push('/train')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Label>TRAIN</Label>
        {lines.map((line) => (
          <View key={line.area} style={styles.row}>
            <Text style={styles.area}>{AREA_NAMES[line.area]}</Text>
            <Text
              style={[styles.headline, line.cleared && styles.cleared]}
              numberOfLines={1}
            >
              {line.headline}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Matches `GoalCard` and `DailyWalkCard`: three cards adjacent on one shelf,
  // and a different ground between them would read as one having failed rather
  // than as a distinction.
  card: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  empty: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ramp.neutral[400],
  },
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.xs,
  },
  // Fixed width so two areas' targets line up as a column rather than starting
  // at two different x positions.
  area: { ...font.body.label, textTransform: 'uppercase', color: ramp.neutral[600], width: 64 },
  headline: { ...font.body.strong, color: colors.text, flexShrink: 1 },
  cleared: { color: earnedColor },
  emptyTitle: { ...font.display.small, fontSize: 16, color: colors.text, marginTop: space.xs },
  emptyBody: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: 2 },
});
