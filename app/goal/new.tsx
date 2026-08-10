import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { currentLocalDate } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { CreateGoalForm } from '@/features/goals/CreateGoalForm.tsx';
import { colors } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { Screen } from '@/ui/index.ts';

/**
 * Set a target.
 *
 * A route rather than a sheet: the form has five decisions in it, and a sheet
 * that tall is a screen wearing a costume. `squadId` arrives as a query param
 * from the squad panel — its presence is the only difference between a personal
 * goal and one the whole squad is frozen onto.
 */
export default function NewGoal() {
  const { squadId } = useLocalSearchParams<{ squadId?: string }>();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);

  // The orbit nav is a tab-shell thing, and this route is a card *over* the
  // tab shell — so it is covered, not absent, and `Screen` would otherwise
  // reserve `TAB_PILL_CLEARANCE` for a nav that is not on screen. Same
  // `useFocusEffect` shape as the squad create pane: the cleanup is the
  // load-bearing half.
  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  // The window starts on the user's OWN local date (§2). Without a timezone
  // there is no honest start date, so the form waits rather than guessing UTC
  // and setting a goal that begins yesterday for somebody in Manila.
  const timeZone = profile.data?.timezone;
  const today = timeZone ? currentLocalDate(new Date(), timeZone) : null;

  if (!today) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  // `Screen scroll={false}` supplies the safe-area insets and the page padding,
  // the same wrapper the squad screen puts CreateSquadForm in. The form scrolls
  // itself, so Screen must not.
  return (
    <Screen scroll={false}>
      <CreateGoalForm
        userId={session?.user.id}
        today={today}
        squadId={squadId ?? null}
        onDone={() => router.back()}
        onCancel={() => router.back()}
      />
    </Screen>
  );
}
