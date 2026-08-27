import { StyleSheet, View } from 'react-native';
import { colors, earnedColor, font, radius, ramp, space } from '@/theme.ts';
import { Label, Meter, Text } from '@/ui/index.ts';
import { dailyWalkState, walkLines } from './daily-walk.ts';
import { useWalkHistory } from './queries.ts';

/**
 * The Daily Walk, on the home shelf.
 *
 * **What this card is not.** It is not a second reading of today's steps. The
 * hero above it already sets them at 64pt, and `detailCopy` on the same screen
 * already names the steps still to go — the same figure, because AGI Gold and
 * `DAILY_STEP_BASELINE` are one threshold by construction. So the card says the
 * two things nothing else on the screen says: that the target is **fixed at
 * 10,000 forever**, and how many days in a row it has been cleared.
 *
 * That is also why the run of days is the display figure rather than the
 * progress. The target cannot grow, so the streak is the only thing that can —
 * and a card whose biggest number never changes is a card nobody reads twice.
 *
 * The meter is the one place today's progress appears, as a shape rather than a
 * number. It fills in terracotta while the day is open and switches to
 * `earnedColor` once cleared — the system's existing "earned" ink, already
 * carrying a banked Streak Shield and the All-Rounder ring. Not sage: sage is
 * the lane and squad warmth, and a cleared walk is neither.
 */
export function DailyWalkCard({
  userId,
  timeZone,
  today,
  todaySteps,
}: {
  userId: string | undefined;
  timeZone: string | undefined;
  /** The user's own local date. Passed in; this component reads no clock. */
  today: string | undefined;
  /** Live steps from `useTodayBuckets`. Undefined before the first sync. */
  todaySteps: number | undefined;
}) {
  const history = useWalkHistory(userId, timeZone);

  // Nothing until the window is known. A card that renders a zero streak and
  // corrects itself to six a frame later has told the user they lost a streak
  // they did not lose — the same reasoning as `SquadEventPanel`'s guard, and the
  // stakes here are higher because the wrong value is the discouraging one.
  if (!today || !history.isSuccess) return null;

  const state = dailyWalkState({ todaySteps, today, days: history.data });
  const lines = walkLines(state);

  return (
    // One element, one meaning. The meter is unlabelled and therefore hidden by
    // its own default, and both children are hidden explicitly as well — the
    // parent's `accessible` alone did not collapse descendants on the 2026-08-14
    // device build, and neither half of the pair is redundant (CLAUDE.md).
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`Daily walk. ${lines.headline}. ${lines.body}`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Always terracotta: the block belongs to the user, which is what
            `tone` encodes. Toning it by whether the day is cleared would be a
            third signal for a state the meter's ink and the copy both already
            carry. */}
        <Label>DAILY WALK</Label>

        {/* `fixed` scale: this line sits directly above a drawn bar, and at the
            largest Dynamic Type sizes a `prose` display line would push the
            meter out of the card's own padding. */}
        <Text scale="fixed" style={styles.headline}>
          {lines.headline}
        </Text>
      </View>

      <View
        style={styles.meter}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Meter
          fraction={state.fraction}
          color={state.met ? earnedColor : colors.accent}
        />
      </View>

      <Text
        style={styles.body}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {lines.body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches `BattleCard`'s filled card exactly. These sit adjacent on the
  // shelf, and a different radius or ground between them would read as one of
  // them having failed to load rather than as a distinction.
  card: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  headline: {
    ...font.display.small,
    fontSize: 20,
    color: colors.text,
    marginTop: space.xs,
  },
  meter: { marginTop: space.sm },
  body: {
    ...font.body.body,
    fontSize: 13,
    color: ramp.neutral[600],
    marginTop: space.sm,
    lineHeight: 18,
  },
});
