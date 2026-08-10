import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CoreStat } from '@kairo/core';
import { colors, font, radius, space } from '@/theme.ts';
import { firstSyncHeadline } from './first-sync.ts';
import { hasSeenFirstSync, markFirstSyncSeen } from './moments.ts';
import { useTodaySteps } from './queries.ts';

/**
 * Shown once, the first time real health data reaches the server.
 *
 * The data already floods in the moment HealthKit access is granted — a day the
 * user already lived is scored before they have done anything in the app. That
 * is the strongest moment in the funnel and today it happens in silence.
 *
 * Deliberately dismissible and deliberately once: a callout that returns is an
 * ad, not a moment.
 */
export function FirstSyncCallout({
  userId,
  timeZone,
  points,
  hasScore,
}: {
  userId: string | undefined;
  timeZone: string | undefined;
  points: Record<CoreStat, number>;
  /** A `daily_scores` row exists, so at least one sync has landed. */
  hasScore: boolean;
}) {
  // Read once per mount rather than on every render: markFirstSyncSeen() must
  // not make the callout vanish mid-animation the instant it is shown.
  const [seen, setSeen] = useState(() =>
    userId ? hasSeenFirstSync(userId) : true,
  );
  const eligible = Boolean(userId) && hasScore && !seen;

  const steps = useTodaySteps(userId, timeZone, eligible);

  const headline = eligible
    ? firstSyncHeadline({ steps: steps.data ?? 0, points })
    : null;

  // Marked the moment it is actually on screen, not when it became eligible —
  // a user who force-quits before it renders has not had their moment yet.
  useEffect(() => {
    if (headline !== null && userId) markFirstSyncSeen(userId);
  }, [headline, userId]);

  if (headline === null) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>YOUR FIRST SYNC</Text>
      <Text style={styles.headline}>{headline}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setSeen(true)}
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
      >
        <Text style={styles.dismissLabel}>Got it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  label: { color: colors.accent, ...font.body.label },
  headline: { color: colors.text, fontSize: 16, fontFamily: 'Figtree-Bold', marginTop: space.xs, lineHeight: 22 },
  dismiss: { alignSelf: 'flex-start', marginTop: space.sm, paddingVertical: space.xs },
  dismissLabel: { color: colors.subtle, fontSize: 13, fontFamily: 'Figtree-SemiBold' },
  pressed: { opacity: 0.85 },
});
