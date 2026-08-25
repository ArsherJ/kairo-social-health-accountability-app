import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { currentLocalDate } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { CreateEventForm } from '@/features/events/CreateEventForm.tsx';
import { useSquadMemberCount } from '@/features/squad/queries.ts';
import { colors } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { Screen } from '@/ui/index.ts';

/**
 * Start a battle.
 *
 * A route rather than a sheet: the form has four decisions in it and a date
 * picker, and a sheet that tall is a screen wearing a costume. `squadId`
 * arrives as a query param from the squad panel — an Event always belongs to a
 * squad (`events_need_squad`), so without one there is nothing to create.
 *
 * **No disclosure gate**, unlike `/goal/new` before it. An Event is a squad's
 * shared thing, and a member who just joined a squad with a fight running has
 * as much business starting the next one as anybody else.
 */
export default function NewEvent() {
  const { squadId } = useLocalSearchParams<{ squadId?: string }>();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const members = useSquadMemberCount(squadId);

  // The orbit nav is a tab-shell thing, and this route is a card *over* the
  // tab shell — so it is covered, not absent, and `Screen` would otherwise
  // reserve `TAB_PILL_CLEARANCE` for a nav that is not on screen. The cleanup
  // is the load-bearing half.
  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  // The window starts on the user's OWN local date (§2). Without a timezone
  // there is no honest start date, so the form waits rather than guessing UTC
  // and starting a fight that began yesterday for somebody in Manila.
  const timeZone = profile.data?.timezone;
  const today = timeZone ? currentLocalDate(new Date(), timeZone) : null;

  if (!today || !squadId || members.data === undefined) {
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
      <CreateEventForm
        userId={session?.user.id}
        today={today}
        squadId={squadId}
        memberCount={members.data}
        onDone={() => router.back()}
        onCancel={() => router.back()}
      />
    </Screen>
  );
}
