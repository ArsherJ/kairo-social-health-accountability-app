import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import {
  clearingSession,
  currentLocalDate,
  resolveChallenge,
  type ChallengeArea,
} from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { useUpdateProfile } from '@/features/profile/update-profile.ts';
import { ChallengeCard } from '@/features/train/ChallengeCard.tsx';
import { AREA_NAMES } from '@/features/train/challenge-copy.ts';
import { useChallengeClears, useWorkoutSessions } from '@/features/train/queries.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { BackRow, CtaPill, Label, Screen, Text } from '@/ui/index.ts';

/**
 * Train — the Challenges screen.
 *
 * A **stacked route, not a fourth tab**. `TabPill` stays at three items and
 * this is pushed over the shell, the precedent the goal routes set: a tab is
 * for a place you return to constantly, and a challenge is checked once a day
 * at most.
 *
 * The challenge shown here is resolved on the client from the same
 * `resolveChallenge()` in `@kairo/core` that `finalize-days` uses, over the
 * same stored sessions. There is no second implementation and no derived state
 * to go stale — the arrangement goal progress already has (deviation #18).
 *
 * Opting in happens here, on first visit, rather than in onboarding: onboarding
 * stays at two screens, and the profile row still commits exactly once, on the
 * name screen.
 */
export default function Train() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const sessions = useWorkoutSessions(userId, profile.data?.timezone);
  const clears = useChallengeClears(userId);
  const update = useUpdateProfile(userId);
  const disclosure = useDisclosure(userId);

  // Same shape as the goal routes: a card over the tab shell, so the orbit nav
  // is covered rather than absent and `Screen` must not reserve room for it.
  // The cleanup is the load-bearing half.
  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  // A hidden entry point is not a closed door: `notificationTarget` can route a
  // Challenge push here, and a user who installed, cleared their data and came
  // back has a live token. Redirect rather than render an empty screen.
  //
  // Gated on `resolved`, not on the stage alone. The stage reads 'core' while
  // the count is in flight, and a push tap that cold-launches straight here has
  // no cached count — redirecting on that frame would send a `full` user home
  // and read exactly like Challenges having been removed. The screen below
  // already renders its own pending states, so waiting costs nothing.
  if (disclosure.resolved && disclosure.stage === 'core') return <Redirect href="/" />;

  const today = profile.data?.timezone
    ? currentLocalDate(new Date(), profile.data.timezone)
    : undefined;

  const optIn: Record<ChallengeArea, boolean> = {
    run: profile.data?.trains_run ?? false,
    strength: profile.data?.trains_strength ?? false,
  };

  const chosen = (['run', 'strength'] as const).filter((area) => optIn[area]);

  function toggle(area: ChallengeArea) {
    update.mutate(
      area === 'run' ? { trains_run: !optIn.run } : { trains_strength: !optIn.strength },
    );
  }

  return (
    <Screen>
      <BackRow onPress={() => router.back()} />

      <Text style={styles.title}>Train</Text>
      <Text style={styles.standfirst}>
        A target set from your own recent sessions. It moves as you do — up when
        you push, back down after a quiet stretch.
      </Text>

      {/* Nothing until the profile is known. A picker that renders and then
          swaps to two live cards a frame later reads as a glitch, and both
          states carry tap targets that would move under the user's thumb. */}
      {profile.isSuccess && chosen.length === 0 && (
        <View style={styles.block}>
          <Label>PICK AN AREA</Label>
          <Text style={styles.help}>
            Both start off. Turn on what you actually do — Kairo will never show
            you a target for something you do not train.
          </Text>

          {(['run', 'strength'] as const).map((area) => (
            <Pressable
              key={area}
              accessibilityRole="button"
              accessibilityLabel={`Turn on ${AREA_NAMES[area]} challenges`}
              disabled={update.isPending}
              onPress={() => toggle(area)}
              style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
            >
              <Text style={styles.pickTitle}>{AREA_NAMES[area]}</Text>
              <Text style={styles.pickBody}>
                {area === 'run'
                  ? 'Pace over a distance, from your logged runs.'
                  : 'Calories in one session, from your logged strength work.'}
              </Text>
              <CtaPill label={`Turn on ${AREA_NAMES[area]}`} />
            </Pressable>
          ))}
        </View>
      )}

      {/* The cards wait for the sessions rather than showing a cold-start
          target they would then correct. "Log one run of 1 km" swapping to
          "5 km under 4:51/km" would have told the user their history was gone. */}
      {chosen.length > 0 &&
        sessions.isSuccess &&
        today &&
        chosen.map((area) => {
          const challenge = resolveChallenge(area, sessions.data, today);
          return (
            <ChallengeCard
              key={area}
              challenge={challenge}
              cleared={clearingSession(challenge, sessions.data, today) !== null}
            />
          );
        })}

      {clears.isSuccess && clears.data.length > 0 && (
        <View style={styles.block}>
          <Label tone="muted">RECENT CLEARS</Label>
          {clears.data.map((clear) => (
            <View
              key={`${clear.area}-${clear.localDate}`}
              style={styles.clear}
              accessible
              accessibilityLabel={`${AREA_NAMES[clear.area]} cleared on ${clear.localDate}.`}
            >
              <Text
                style={styles.clearArea}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {AREA_NAMES[clear.area]}
              </Text>
              <Text
                style={styles.clearDate}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {clear.localDate}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Turning an area off is here rather than in Settings because this is
          where it was turned on, and because it is the same decision reversed.
          Off is not a punishment: the clears already earned stay. */}
      {chosen.length > 0 && (
        <View style={styles.block}>
          <Label tone="muted">AREAS</Label>
          {(['run', 'strength'] as const).map((area) => (
            <Pressable
              key={area}
              accessibilityRole="switch"
              accessibilityState={{ checked: optIn[area] }}
              accessibilityLabel={`${AREA_NAMES[area]} challenges`}
              disabled={update.isPending}
              onPress={() => toggle(area)}
              hitSlop={space.sm}
              style={({ pressed }) => [styles.areaRow, pressed && styles.pressed]}
            >
              <Text style={styles.areaName}>{AREA_NAMES[area]}</Text>
              <Text style={[styles.areaState, optIn[area] && styles.areaStateOn]}>
                {optIn[area] ? 'On' : 'Off'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {update.isError && (
        <Text style={styles.error}>
          {update.error instanceof Error ? update.error.message : 'Could not save that.'}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, ...font.body.title, marginTop: space.md },
  standfirst: {
    color: colors.subtle,
    ...font.body.body,
    marginTop: space.sm,
    lineHeight: 21,
  },
  block: { marginTop: space.lg },
  help: {
    color: ramp.neutral[600],
    ...font.body.body,
    fontSize: 13,
    marginTop: space.xs,
    lineHeight: 18,
  },
  // Dashed, following `LockedSlot` and the empty `GoalCard`: this app says "a
  // place something goes" with a dashed edge, and an area not yet turned on is
  // the same idea. A filled card here would read as already active.
  pick: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ramp.neutral[400],
  },
  pressed: { opacity: 0.75 },
  pickTitle: { ...font.display.small, fontSize: 16, color: colors.text },
  pickBody: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  clear: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.sm,
  },
  clearArea: { ...font.body.strong, color: colors.text },
  clearDate: { ...font.body.strong, color: ramp.neutral[600] },
  areaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.sm,
  },
  areaName: { ...font.body.strong, color: colors.text },
  areaState: { ...font.body.strong, color: ramp.neutral[600] },
  areaStateOn: { color: colors.accent },
  error: { ...font.body.body, fontSize: 13, color: colors.damage, marginTop: space.md },
});
