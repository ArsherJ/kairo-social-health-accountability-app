import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { goalWindowDays, isGoalWindowClosed } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { CtaPill, Label } from '@/ui/index.ts';
import { GoalBar } from './GoalBar.tsx';
import { deadlineLine } from './goal-copy.ts';
import { pickLiveGoal, toGoal, useGoalDetail, useMyGoals } from './queries.ts';

/**
 * The user's own goal, on the home screen.
 *
 * Lives in the slot the sabotage callout and banana pill vacated — the one place
 * on this screen that is about a commitment rather than about today. Shows one
 * goal, the one closing soonest, because a list of five belongs on its own
 * screen and this shelf already carries the day's score.
 *
 * Progress comes from `goal_window_scores` evaluated by the same
 * `evaluateGoal()` the server pays XP from (deviation #18), so the number here
 * can never disagree with the notification that announced it.
 */
export function GoalCard({
  userId,
  today,
  onSetGoal,
}: {
  userId: string | undefined;
  /** The user's own local date. Passed in; this component reads no clock. */
  today: string | undefined;
  onSetGoal: () => void;
}) {
  const router = useRouter();
  const goals = useMyGoals(userId);

  // Derived before any early return, and the detail hook is called
  // unconditionally with a possibly-undefined id — `enabled` inside the hook is
  // what defers the request, not a conditional call here.
  const live = goals.isSuccess && today ? pickLiveGoal(goals.data, today, { fallbackToPast: true }) : null;
  const detail = useGoalDetail(live?.id, userId, today);

  // Nothing at all until the goal list is known. A card that renders the empty
  // state and swaps to a real goal a frame later reads as a glitch, and this one
  // has a tap target that would move under the user's thumb.
  if (!userId || !today || !goals.isSuccess) return null;

  if (!live) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Set a target"
        onPress={onSetGoal}
        style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
      >
        <Label tone="muted">NO GOAL YET</Label>
        <Text style={styles.emptyTitle}>Set a target</Text>
        <Text style={styles.emptyBody}>
          Pick a number and a date. Days, weeks, a year — or no deadline at all.
        </Text>
        <CtaPill label="Set a target" />
      </Pressable>
    );
  }

  // The title and the deadline are known from the goal row, so they render
  // immediately. The meter waits for the window scores rather than showing a
  // zero it would then correct — a bar that fills in from empty on every open
  // would misreport a goal in progress as one not started.
  const standing = detail.data?.standings.find((s) => s.isSelf);
  // An open-ended goal is never closed, which `isGoalWindowClosed` already
  // knows — so the card asks it rather than comparing a possibly-null date.
  const closed = isGoalWindowClosed(toGoal(live), today);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${live.title}. Open goal.`}
      onPress={() => router.push(`/goal/${live.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Label>{closed ? 'GOAL CLOSED' : 'GOAL IN FLIGHT'}</Label>
        <Text style={styles.deadline}>{deadlineLine(live.ends_on, today)}</Text>
      </View>

      {standing ? (
        <GoalBar row={live} standing={standing} windowDays={goalWindowDays(toGoal(live))} />
      ) : (
        <Text style={styles.title} numberOfLines={1}>
          {live.title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    // Dashed, following `LockedSlot`: this app already says "a place something
    // goes" with a dashed edge, and an empty goal slot is the same idea as an
    // empty squad seat. A solid card here would read as one that failed to load.
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
  emptyTitle: { ...font.display.small, fontSize: 16, color: colors.text, marginTop: space.xs },
  emptyBody: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: 2 },
});
