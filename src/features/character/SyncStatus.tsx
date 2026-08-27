import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/index.ts';
import Feather from '@expo/vector-icons/Feather';
import { useTodayBuckets } from '@/features/character/buckets.ts';
import { useScoredDayCount } from '@/features/character/queries.ts';
import { requestSync, useSyncStatusStore } from '@/features/health/status-store.ts';
import { syncStatus } from '@/features/health/sync-status.ts';
import { colors, font, space } from '@/theme.ts';

/**
 * Where the figures above came from, and when.
 *
 * Sits directly under the TODAY panel and is deliberately not a card: it is
 * that panel's provenance line, not a notice of its own. The numbers and their
 * age are one object, and you cannot read the first without the second — which
 * is the whole point. For two days in August the character screen showed real,
 * climbing step counts that the server had already refused to score, and said
 * nothing at all.
 *
 * **No alarm colour.** `damage` is reserved for a battle slipping away and
 * nothing else, and inventing a red here would be the system's first exception.
 * A problem announces itself by being *present and legible* — a rule, an icon,
 * and a terracotta action, terracotta being what the system already means by
 * "the thing to press". Healthy stays a grey half-line most people never read.
 */
export function SyncStatus({
  userId,
  timeZone,
}: {
  userId: string | undefined;
  timeZone: string | undefined;
}) {
  const { syncing, lastSyncedAt, firstSyncedAt, lastError } = useSyncStatusStore();

  // **Two signals, because one of them answers a different question.**
  //
  // `useScoredDayCount` counts days that scored *above zero*, and Bronze AGI is
  // 1,000 steps — so an account whose phone is demonstrably sending data, from
  // somebody who walked 400 steps, has a count of 0. On its own it would let
  // 'no-data' tell that user Apple Health is sending nothing and point them at
  // Settings, which is the accusation the whole state exists to avoid. The
  // message makes a claim about *HealthKit*; that query answers a question
  // about *scoring*.
  //
  // Today's buckets close the gap: any non-zero figure in them is data that
  // arrived, scored or not. Both hooks are already fetched on this screen with
  // the same keys, so neither costs a request.
  const scoredDays = useScoredDayCount(userId);
  const buckets = useTodayBuckets(userId, timeZone);

  const totals = buckets.data?.totals;
  // Parenthesised deliberately: `a ?? 0 > 0` parses as `a ?? (0 > 0)`, which is
  // `a ?? false` and truthy for any real count.
  //
  // Defaults to `false` while loading, which cannot mislead: the grace window
  // in `syncStatus` outlives any query, so a pending read never reaches the
  // 'no-data' branch on its own.
  const everReceivedData =
    (scoredDays.data ?? 0) > 0 ||
    (totals?.steps ?? 0) > 0 ||
    (totals?.activeKcal ?? 0) > 0 ||
    (totals?.activeMinutes ?? 0) > 0;

  // Re-render on a slow tick so "3 minutes ago" ages honestly while the screen
  // is open. A minute is the finest granularity `describeAge` reports, so
  // anything faster would repaint without ever changing a word.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const status = syncStatus({
    syncing,
    lastSyncedAt,
    firstSyncedAt,
    lastError,
    everReceivedData,
    now: Date.now(),
  });

  const icon = ICONS[status.kind];
  const tone = status.attention ? colors.text : colors.muted;

  return (
    <View style={styles.row}>
      <Feather name={icon} size={12} color={tone} style={styles.icon} />
      <Text style={[styles.message, { color: tone }]} numberOfLines={1}>
        {status.message}
      </Text>

      {status.action !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${status.action}. ${status.message}`}
          // 'no-data' is the one state whose action is not a retry — every
          // sync in its window already succeeded, so there is nothing to run
          // again. The fix, if there is one, is in iOS Settings.
          onPress={
            status.kind === 'no-data' ? () => void Linking.openSettings() : requestSync
          }
          // The line is 12pt type; the tappable area is not.
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionLabel}>{status.action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Feather throughout: this is chrome you operate, not a stat you are. */
const ICONS = {
  syncing: 'refresh-cw',
  never: 'clock',
  fresh: 'check',
  stale: 'clock',
  failed: 'alert-circle',
  // Not `alert-circle`. This state is the app saying it has nothing, not the
  // app saying something broke — and reusing the failure glyph would put back
  // the technical-error reading the state exists to remove.
  'no-data': 'inbox',
} as const satisfies Record<string, React.ComponentProps<typeof Feather>['name']>;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.sm,
    paddingTop: space.sm,
    // A hairline rule, which is what `border` is still for once cards stopped
    // being built from borders.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  icon: { marginRight: space.xs },
  message: { ...font.body.strong, flexShrink: 1 },
  action: { marginLeft: 'auto', paddingLeft: space.sm },
  actionLabel: { ...font.body.strong, color: colors.accentDeep },
  pressed: { opacity: 0.6 },
});
