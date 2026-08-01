import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, radius, space } from '@/theme.ts';
import { shouldRevealUnlock } from './slots.ts';

/**
 * §7's "squad slot unlocked" moment.
 *
 * There is nothing to subscribe to — the `daily_scores` trigger does not fire
 * on membership changes (Phase 4 follow-up #8) — so the reveal is driven by a
 * refetch observing the member count rise, and lands on the next foreground or
 * pull-to-refresh rather than instantly. That is the honest cost of not adding
 * a trigger and a topic for something that happens once.
 *
 * It renders where the slot that just filled used to be, which is why the
 * caller places it at the head of the locked-slot section.
 */

/** Long enough to notice on a foreground, short enough not to become furniture. */
const REVEAL_HOLD_MS = 2600;
const REVEAL_DURATION_MS = 320;

export function useSlotUnlockReveal(memberCount: number | undefined) {
  const previous = useRef<number | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!shouldRevealUnlock(previous.current, memberCount)) {
      // An in-flight refetch reports undefined; forgetting the last real count
      // there would make the following refetch look like a first load and
      // swallow the reveal.
      previous.current = memberCount ?? previous.current;
      return;
    }

    previous.current = memberCount;
    setVisible(true);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: REVEAL_DURATION_MS,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => setVisible(false), REVEAL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [memberCount, progress]);

  return { visible, progress };
}

export function SlotUnlockReveal({ progress }: { progress: Animated.Value }) {
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.row,
        {
          opacity: progress,
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.title}>SQUAD SLOT UNLOCKED</Text>
      <Text style={styles.body}>Somebody joined. One fewer empty seat.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  title: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  body: { color: colors.subtle, fontSize: 13, marginTop: space.xs },
});
