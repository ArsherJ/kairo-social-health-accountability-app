import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { currentLocalDate, evaluateSquadGoal, goalWindowDays } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { GoalBar } from '@/features/goals/GoalBar.tsx';
import {
  progressLine,
  windowLine,
  squadRequirementLine,
  statusLine,
} from '@/features/goals/goal-copy.ts';
import { useAbandonGoal } from '@/features/goals/mutations.ts';
import { toGoal, useGoalDetail } from '@/features/goals/queries.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { Avatar, BackRow, Button, Label, Screen, Text } from '@/ui/index.ts';

/**
 * One goal, in full: the window, your own bar, and where everybody else on it
 * has got to.
 *
 * A stacked route rather than a tab. Goals are reached from the two cards that
 * summarise them, and `TabPill` is a four-item orbit nav at three items — adding
 * a fifth surface to the shell for something you visit occasionally would cost
 * the nav its shape.
 */
export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  // The user's OWN local date (§2), not the device's calendar date — the same
  // derivation every other screen uses. A goal window abroad would otherwise be
  // measured against the wrong day.
  const timeZone = profile.data?.timezone;
  const today = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  const detail = useGoalDetail(id, userId, today);
  const abandon = useAbandonGoal(userId);
  const disclosure = useDisclosure(userId);

  // A card over the tab shell: the orbit nav is covered, not absent, so its
  // clearance must stand down with it. Same shape as `goal/new`.
  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  const confirmAbandon = useCallback(() => {
    if (!id) return;
    const shared = Boolean(detail.data?.row.squad_id);
    Alert.alert(
      shared ? 'Leave this goal?' : 'Abandon this goal?',
      shared
        ? 'You come off the roster. The squad keeps the goal, and the target it needs does not change.'
        : 'The goal and its progress go. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: shared ? 'Leave' : 'Abandon',
          style: 'destructive',
          onPress: () =>
            abandon.mutate(id, {
              onSuccess: () => router.back(),
            }),
        },
      ],
    );
  }, [abandon, detail.data?.row.squad_id, id, router]);

  // The last Goals surface reachable without an entry point. `notificationTarget`
  // routes a `goal_completed` push straight here, and a `core` user really can
  // receive one: a squad goal freezes its roster from squad membership at
  // creation, so somebody who joined a squad on day one is on a goal a
  // squadmate created, without ever having seen a goal screen.
  //
  // Gated anyway, and the consequence is deliberate: at `core` a goal is a
  // thing that does not exist yet, and showing one goal detail screen to
  // somebody with no goal card, no `/goal/new` and no squad goal panel would
  // explain nothing. The goal keeps running and their days keep counting toward
  // it — nothing here is scored on screen — and it appears with everything else
  // at three scored days.
  //
  // `resolved` for the same reason `/train` and `/goal/new` need it: 'core' is
  // the reading while the count is in flight, and this route's most likely
  // arrival is a push tap on a cold launch, which is exactly when no count is
  // cached.
  if (disclosure.resolved && disclosure.stage === 'core') return <Redirect href="/" />;

  if (detail.isPending) {
    return (
      <Screen>
        <BackRow onPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
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
            {detail.error?.message ?? 'That goal is no longer here.'}
          </Text>
        </View>
      </Screen>
    );
  }

  const { row, standings } = detail.data;
  const windowDays = goalWindowDays(toGoal(row));
  const mine = standings.find((s) => s.isSelf);
  const shared = row.squad_id !== null;

  const rollup = shared
    ? evaluateSquadGoal(
        standings.map((s) => ({ userId: s.userId, result: s.progress })),
        row.required_members ?? standings.length,
      )
    : null;

  return (
    <Screen scroll>
      <BackRow onPress={() => router.back()} />

      <Label tone={shared ? 'sage' : 'accent'}>{shared ? 'SQUAD GOAL' : 'YOUR GOAL'}</Label>
      <Text style={styles.title}>{row.title}</Text>
      <Text style={styles.window}>
        {windowLine({
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          today: today ?? row.starts_on,
          metric: row.metric,
          windowDays,
          dailyTarget: row.kind === 'consistency' ? row.target : null,
        })}
      </Text>

      {/* The "why", under the "what". Rendered only when there is one — an
          empty line of muted text under every goal without a description would
          be a hole in the layout rather than an absence. */}
      {row.description !== null && row.description.trim() !== '' && (
        <Text style={styles.description}>{row.description}</Text>
      )}

      {rollup && standings.length > 0 && (
        <Text style={styles.rollup}>
          {squadRequirementLine(rollup.membersMet, rollup.requiredMembers, standings.length)}
        </Text>
      )}

      {mine && (
        <View style={styles.mine}>
          <GoalBar row={row} standing={mine} windowDays={windowDays} showTitle={false} />
        </View>
      )}

      {shared && standings.length > 1 && (
        <>
          <Text style={styles.section}>Everyone on it</Text>
          {standings.map((standing) => (
            <View
              key={standing.userId}
              style={[styles.member, standing.isSelf && styles.memberSelf]}
            >
              <Avatar name={standing.characterName} self={standing.isSelf} />
              <View style={styles.memberBody}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {standing.characterName || 'Someone'}
                </Text>
                <Text style={styles.memberMeta}>
                  {progressLine(row.kind, row.metric, standing.progress)} · {statusLine(standing.progress)}
                </Text>
              </View>
              {/* The latched fact, not the computed one. A member whose day has
                  not finalized yet can be `met` locally and still not have the
                  completion the server pays XP from. */}
              {standing.completed && <Text style={styles.tick}>✓</Text>}
            </View>
          ))}
        </>
      )}

      {/* At the foot, not in a header: this is rare, irreversible, and must not
          sit next to anything tapped every day. It *is* a button now — the
          outlined `destructive` variant keeps it from competing with anything
          above it while still reading as a control. Same treatment as leaving a
          squad, and the Alert.alert confirm is still the real guard. */}
      <View style={styles.leaveBlock}>
        {abandon.isError && <Text style={styles.error}>{abandon.error.message}</Text>}
        <Button
          label={shared ? 'Leave this goal' : 'Abandon this goal'}
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
  rollup: { ...font.body.strong, fontSize: 12.5, color: ramp.sage[800], marginTop: space.sm },
  mine: { marginTop: space.lg },
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
  memberSelf: {
    backgroundColor: ramp.accent[200],
    borderWidth: 2,
    borderColor: ramp.accent[500],
  },
  memberBody: { flex: 1, minWidth: 0 },
  memberName: { ...font.display.small, fontSize: 16, color: colors.text },
  memberMeta: { ...font.body.strong, fontSize: 11.5, color: ramp.neutral[700], marginTop: 2 },
  tick: { ...font.display.minor, color: ramp.sage[800] },
  // `stretch`, not `center`: the button sizes itself, and centring it would
  // shrink-wrap the pill to its label and undo the 52pt target.
  leaveBlock: { marginTop: space.xl, gap: space.sm },
  pressed: { opacity: 0.6 },
  error: { ...font.body.strong, fontSize: 12.5, color: ramp.accent[900] },
});
