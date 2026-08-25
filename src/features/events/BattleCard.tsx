import { Pressable, StyleSheet, View } from 'react-native';
import type { EventProgress, KairoEvent } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Label, Meter, Text } from '@/ui/index.ts';
import {
  deadlineLine,
  eventHeadline,
  eventLabel,
  eventStatusLine,
  fillFraction,
  paceFraction,
} from './event-copy.ts';

/**
 * One Battle, as a name, a bar and a line of status.
 *
 * The meter carries a **pace marker** — a hairline tick at where the fill should
 * have reached by today, the same mechanism `GoalBar` used and for the same
 * reason: "1,200 of 3,000" is either fine or a disaster depending on how much
 * of the window is gone, and the marker says which without making the reader do
 * the division.
 *
 * The bar is the **squad's**, not the reader's. That is the whole reversal
 * (deviation #48): a squad goal drew your own progress because there was no
 * pooled number to draw, and an Event has nothing but one.
 */
export function BattleCard({
  title,
  event,
  progress,
  windowDays,
  today,
  onPress,
}: {
  title: string;
  event: KairoEvent;
  progress: EventProgress;
  windowDays: number;
  /** The reader's own local date. Passed in; this component reads no clock. */
  today: string;
  onPress?: () => void;
}) {
  // `accessible` alone should collapse this on iOS and did not, on the
  // 2026-08-14 build — so each direct child is hidden explicitly rather than
  // trusting the implicit behaviour. Same fix, same reason, as `LeaderboardRow`.
  // Do not remove one half thinking it is redundant.
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  const tone: Tone = progress.met ? 'done' : progress.onPace === false ? 'behind' : 'ok';

  const body = (
    <>
      <View {...hidden} style={styles.head}>
        <Label tone="sage">{progress.met ? 'BOSS DOWN' : 'BATTLE'}</Label>
        <Text scale="chrome" style={styles.deadline}>
          {deadlineLine(event.endsOn, today)}
        </Text>
      </View>

      <Text {...hidden} style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View {...hidden} style={styles.numbers}>
        <Text scale="chrome" style={styles.headline}>
          {eventHeadline(event)}
        </Text>
        <Text scale="chrome" style={[styles.status, styles[tone]]}>
          {eventStatusLine(progress, { metric: event.metric })}
        </Text>
      </View>

      {/* Hidden rather than labelled: `eventStatusLine` already puts "behind
          pace" into words above, and a progressbar naming the same thing in
          percentages is the duplication `StatCoin` inside `StatRail` was
          reverted for. */}
      <View {...hidden}>
        <Meter
          fraction={fillFraction(progress)}
          color={FILL[tone]}
          pace={paceFraction(progress, windowDays) ?? undefined}
          height={10}
        />
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={eventLabel(title, event, progress)} style={styles.card}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={eventLabel(title, event, progress)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

type Tone = 'done' | 'ok' | 'behind';

/**
 * Three tones, three jobs — the rule `src/theme.ts` states for the whole app.
 * `done` is sage because a beaten boss is an earned thing, not a live one.
 */
const FILL: Record<Tone, string> = {
  done: ramp.sage[600],
  ok: colors.accent,
  behind: colors.damage,
};

const styles = StyleSheet.create({
  card: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
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
  numbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.xs,
    marginBottom: 6,
  },
  headline: { ...font.display.minor, fontSize: 17, color: colors.text, flexShrink: 1 },
  status: { ...font.body.strong, fontSize: 11.5, textAlign: 'right', flexShrink: 1 },
  done: { color: ramp.sage[800] },
  ok: { color: ramp.neutral[700] },
  behind: { color: ramp.accent[900] },
});
