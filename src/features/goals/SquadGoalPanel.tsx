import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { evaluateSquadGoal, goalWindowDays } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { CtaPill, Label } from '@/ui/index.ts';
import { GoalBar } from './GoalBar.tsx';
import { deadlineLine, squadRequirementLine } from './goal-copy.ts';
import { pickLiveGoal, toGoal, useGoalDetail, useSquadGoals } from './queries.ts';

/**
 * The squad's shared goal, on the squad screen.
 *
 * Sits where the sabotage feed was, below the board — the same slot, doing the
 * opposite job: the feed was about what people did *to* each other, this is what
 * they committed to together.
 *
 * §8's shared goals are N-of-M, "everyone must hit it", against a roster frozen
 * at creation. So the headline number is how many members have hit it, and the
 * meter under it is the caller's own progress — a pooled bar would be the wrong
 * mechanic, and there is no single number the group shares.
 */
export function SquadGoalPanel({
  squadId,
  userId,
  today,
  onSetGoal,
}: {
  squadId: string;
  userId: string | undefined;
  today: string | undefined;
  onSetGoal: () => void;
}) {
  const router = useRouter();
  const goals = useSquadGoals(squadId);

  const live = goals.isSuccess && today ? pickLiveGoal(goals.data, today) : null;
  const detail = useGoalDetail(live?.id, userId, today);

  if (!userId || !today || !goals.isSuccess) return null;

  if (!live) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Set a squad goal"
        onPress={onSetGoal}
        style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
      >
        <Label tone="sage">NO SQUAD GOAL</Label>
        <Text style={styles.emptyTitle}>Commit to something together</Text>
        <Text style={styles.emptyBody}>
          Everyone on the squad gets the same target. It counts when enough of you
          hit it.
        </Text>
        <CtaPill label="Set a squad goal" tone="sage" />
      </Pressable>
    );
  }

  const standings = detail.data?.standings ?? [];
  const mine = standings.find((s) => s.isSelf);
  const rollup = evaluateSquadGoal(
    standings.map((s) => ({ userId: s.userId, result: s.progress })),
    live.required_members ?? standings.length,
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${live.title}. Open squad goal.`}
      onPress={() => router.push(`/goal/${live.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Label tone="sage">SQUAD GOAL</Label>
        <Text style={styles.deadline}>{deadlineLine(live.ends_on, today)}</Text>
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {live.title}
      </Text>

      {standings.length > 0 && (
        <Text style={[styles.rollup, rollup.met && styles.rollupMet]}>
          {squadRequirementLine(rollup.membersMet, rollup.requiredMembers, standings.length)}
        </Text>
      )}

      {/* The caller's own bar, not the squad's. There is no pooled number in an
          everyone-must-hit-it goal, and inventing an average would be a claim the
          mechanic does not make. */}
      {mine && (
        <View style={styles.mine}>
          <GoalBar
            row={live}
            standing={mine}
            windowDays={goalWindowDays(toGoal(live))}
            showTitle={false}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  empty: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    // Dashed, matching LockedSlot and the personal goal card: the app's
    // established shape for "a place something goes".
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ramp.neutral[400],
  },
  pressed: { opacity: 0.75 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  deadline: { ...font.body.strong, fontSize: 11.5, color: ramp.neutral[600] },
  title: { ...font.display.small, fontSize: 16, color: colors.text, marginTop: space.xs },
  rollup: { ...font.body.strong, fontSize: 11.5, color: ramp.sage[800], marginTop: 2 },
  rollupMet: { color: ramp.sage[900] },
  mine: { marginTop: space.sm },
  emptyTitle: { ...font.display.small, fontSize: 16, color: colors.text, marginTop: space.xs },
  emptyBody: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: 2 },
});
