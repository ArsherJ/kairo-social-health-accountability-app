import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { currentLocalDate, eventWindowDays } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { KAIRO_THUMBNAIL_POSE } from '@/features/character/character-surface-policy.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { BattleCard } from '@/features/events/BattleCard.tsx';
import { eventWindowLine } from '@/features/events/event-copy.ts';
import { useAbandonEvent } from '@/features/events/mutations.ts';
import { memberShares, useEventDetail } from '@/features/events/queries.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { BackRow, Button, Screen, Text } from '@/ui/index.ts';

/** Thousands separators, matching `event-copy.ts` rather than the device locale. */
function num(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * One Battle, in full: the window, the squad's bar, and who put what into it.
 *
 * A stacked route rather than a tab. Battles are reached from the card that
 * summarises them and from a push, and `TabPill` is an orbit nav at three
 * items — adding a surface to the shell for something you visit occasionally
 * would cost the nav its shape.
 *
 * **No disclosure gate**, unlike the goal detail screen it replaces. That gate
 * existed because a `core` user could be frozen onto a squad goal they had no
 * other surface for; an Event has a panel on the squad tab at every stage, so
 * there is nothing to explain and nothing to hide.
 */
export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  // The user's OWN local date (§2), not the device's calendar date — the same
  // derivation every other screen uses. A window abroad would otherwise be
  // measured against the wrong day.
  const timeZone = profile.data?.timezone;
  const today = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  const detail = useEventDetail(id, today);
  const abandon = useAbandonEvent(userId);

  // A card over the tab shell: the orbit nav is covered, not absent, so its
  // clearance must stand down with it. The cleanup is the load-bearing half.
  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  const confirmAbandon = useCallback(() => {
    if (!id) return;
    Alert.alert(
      'Leave this battle?',
      'You come off the roster and stop counting toward it. The squad keeps the fight, and the boss does not get any weaker.',
      [
        { text: 'Stay in', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => abandon.mutate(id, { onSuccess: () => router.back() }),
        },
      ],
    );
  }, [abandon, id, router]);

  if (detail.isPending) {
    return (
      <Screen>
        <BackRow onPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accentDeep} />
        </View>
      </Screen>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <BackRow onPress={() => router.back()} />
        <View style={styles.centered}>
          <Text style={styles.empty}>
            {detail.error?.message ?? 'That battle is no longer here.'}
          </Text>
        </View>
      </Screen>
    );
  }

  const { row, event, rows, progress } = detail.data;
  const shares = memberShares(rows);

  return (
    <Screen scroll>
      <BackRow onPress={() => router.back()} />

      <Text style={styles.title}>{row.title}</Text>
      <Text style={styles.window}>{eventWindowLine(event, today ?? event.startsOn)}</Text>

      {/* The "why", under the "what". Rendered only when there is one — an
          empty line of muted text under every Battle without a description
          would be a hole in the layout rather than an absence. */}
      {row.description !== null && row.description.trim() !== '' && (
        <Text style={styles.description}>{row.description}</Text>
      )}

      {/* The squad's bar, and the only bar. There is no per-member version of
          this number, which is the whole reversal (deviation #48). */}
      <BattleCard
        title={row.title}
        event={event}
        progress={progress}
        windowDays={eventWindowDays(event)}
        today={today ?? event.startsOn}
        showTitle={false}
      />

      {shares.length > 0 && (
        <>
          <Text style={styles.section}>Everyone in it</Text>
          {shares.map((share) => (
            <View
              key={share.userId}
              style={[styles.member, share.userId === userId && styles.memberSelf]}
            >
              {/* Replaces the disc rather than joining it, the same rule the
                  leaderboard row follows. Nothing is added to what this row
                  *says* — the name is right there in text. */}
              <KairoThumbnail pose={KAIRO_THUMBNAIL_POSE.eventMember} size={36} decorative />
              <View style={styles.memberBody}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {share.characterName || 'Someone'}
                </Text>
                <Text style={styles.memberMeta}>
                  {/* Null is not zero. `event_progress` withholds a member's
                      own figure unless both of you have agreed to share daily
                      totals, and printing "0 kcal" for that would accuse
                      somebody of a quiet week they may not have had. */}
                  {share.contributed === null
                    ? 'not sharing daily totals'
                    : `${num(share.contributed)} kcal in`}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.pooledNote}>
            Every one of you is paid when the bar fills, whoever put the work in.
          </Text>
        </>
      )}

      {/* At the foot, not in a header: this is rare, irreversible, and must not
          sit next to anything tapped every day. The outlined `destructive`
          variant keeps it from competing with anything above it while still
          reading as a control, and the Alert confirm is the real guard. */}
      <View style={styles.leaveBlock}>
        {abandon.isError && <Text style={styles.error}>{abandon.error.message}</Text>}
        <Button
          label="Leave this battle"
          variant="destructive"
          onPress={confirmAbandon}
          disabled={abandon.isPending}
          busy={abandon.isPending}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  empty: { ...font.body.body, fontSize: 14, color: colors.muted, textAlign: 'center' },
  title: { ...font.display.small, fontSize: 24, color: colors.text, marginTop: space.xs },
  window: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: space.xs },
  description: {
    ...font.body.body,
    fontSize: 14,
    color: ramp.neutral[700],
    marginTop: space.sm,
    lineHeight: 20,
  },
  section: {
    ...font.body.label,
    textTransform: 'uppercase',
    color: ramp.neutral[600],
    marginTop: space.xl,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  memberSelf: { backgroundColor: ramp.accent[200] },
  memberBody: { flex: 1, minWidth: 0 },
  memberName: { ...font.display.small, fontSize: 15, color: colors.text },
  memberMeta: { ...font.body.body, fontSize: 12.5, color: ramp.neutral[700], marginTop: 1 },
  pooledNote: {
    ...font.body.body,
    fontSize: 12.5,
    color: colors.muted,
    marginTop: space.sm,
  },
  leaveBlock: { marginTop: space.xl, gap: space.sm },
  error: { ...font.body.strong, fontSize: 12.5, color: ramp.accent[900] },
});
