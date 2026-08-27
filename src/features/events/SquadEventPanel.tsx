import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { eventWindowDays } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { CtaPill, Label, Text } from '@/ui/index.ts';
import { BattleCard } from './BattleCard.tsx';
import { toEvent, useEventDetail, useSquadEvents } from './queries.ts';

/**
 * The squad's Battle, on the squad screen.
 *
 * Sits where the squad goal panel was, below the board and below the race —
 * the same slot, doing a different job. A squad goal was N-of-M, so it drew
 * *your* bar and a "3 hit it · needs everyone" rollup; a Battle is pooled, so
 * there is one bar and it belongs to all of you (deviation #48).
 *
 * **No disclosure gate**, unlike the panel it replaces. An Event is a squad's
 * shared thing, and gating it on one member's scored-day count would hide from
 * a new member something the rest of the squad is already looking at.
 */
export function SquadEventPanel({
  squadId,
  today,
}: {
  squadId: string;
  /** The reader's own local date. Passed in; this component reads no clock. */
  today: string | undefined;
}) {
  const router = useRouter();
  const events = useSquadEvents(squadId);

  // Derived before any early return, and the detail hook is called
  // unconditionally with a possibly-undefined id — `enabled` inside the hook is
  // what defers the request, not a conditional call here.
  const live = events.data?.[0] ?? null;
  const detail = useEventDetail(live?.id, today);

  // Nothing at all until the list is known. A panel that renders the empty
  // state and swaps to a real Battle a frame later reads as a glitch, and this
  // one has a tap target that would move under the user's thumb.
  if (!today || !events.isSuccess) return null;

  if (!live) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start a battle"
        onPress={() => router.push(`/event/new?squadId=${squadId}`)}
        style={({ pressed }) => [styles.empty, pressed && styles.pressed]}
      >
        <Label tone="sage">NO BATTLE RUNNING</Label>
        <Text style={styles.emptyTitle}>Fight something together</Text>
        <Text style={styles.emptyBody}>
          One bar, everybody’s effort in it. Somebody carrying you is the point.
        </Text>
        <CtaPill label="Start a battle" tone="sage" />
      </Pressable>
    );
  }

  const event = toEvent(live);

  // The title and the deadline are known from the row, so they render
  // immediately. The bar waits for the progress rather than showing a zero it
  // would then correct — a bar that fills in from empty on every open would
  // misreport a fight in progress as one not started.
  if (!detail.data) {
    return (
      <View style={styles.card}>
        <Label tone="sage">BATTLE</Label>
        <Text style={styles.title} numberOfLines={1}>
          {live.title}
        </Text>
      </View>
    );
  }

  return (
    <BattleCard
      title={live.title}
      event={event}
      progress={detail.data.progress}
      windowDays={eventWindowDays(event)}
      today={today}
      onPress={() => router.push(`/event/${live.id}`)}
    />
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
    // Dashed, matching LockedSlot and the panel this replaces: the app's
    // established shape for "a place something goes".
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ramp.neutral[400],
  },
  pressed: { opacity: 0.75 },
  title: { ...font.display.small, fontSize: 16, color: colors.text, marginTop: space.xs },
  emptyTitle: { ...font.display.small, fontSize: 16, color: colors.text, marginTop: space.xs },
  emptyBody: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: 2 },
});
