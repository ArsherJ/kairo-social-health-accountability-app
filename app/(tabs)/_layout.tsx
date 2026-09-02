import { Fragment } from 'react';
import { Tabs } from 'expo-router';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { useTimezoneSync } from '@/features/profile/timezone-sync.ts';
import { useHealthSync } from '@/features/health/useHealthSync.ts';
import { useScoredDayCount } from '@/features/character/queries.ts';
import { useMySquad } from '@/features/squad/queries.ts';
import { usePendingInvite } from '@/features/squad/usePendingInvite.ts';
import { useSquadEvents } from '@/features/events/queries.ts';
import { PermissionAsks } from '@/features/permissions/PermissionAsks.tsx';
import {
  useAppOpenTelemetry,
  useDeviceTokenRegistration,
  useNotificationRouting,
} from '@/features/notifications/useNotifications.ts';
import { colors } from '@/theme.ts';
import { TabPill } from '@/ui/TabPill.tsx';

export default function TabsLayout() {
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);

  // Order matters. The reconcile writes `profiles.timezone` from the device,
  // and `sync-health` writes it through again from the payload. Running the
  // reconcile first means the two agree instead of overwriting each other.
  useTimezoneSync(session?.user.id, profile.data?.timezone);
  useHealthSync(session?.user.id, profile.data?.timezone);

  useAppOpenTelemetry(session?.user.id);
  useDeviceTokenRegistration(session?.user.id);

  // Deliberately here and not in `Gate`. This layout only mounts for a user
  // `resolveRoute()` calls 'ready', so mounting it is the readiness check —
  // and a tap that launched the app cold is still waiting in
  // `useLastNotificationResponse()` by the time we get here.
  useNotificationRouting();

  // Here for exactly the same reason, and it is the reason: a universal link
  // tapped by somebody with no account stashes its code and gets bounced to
  // sign-in. This layout mounting is the proof that they came back with a
  // profile, which is the only moment the code can be spent.
  usePendingInvite();

  // Mounted at the shell rather than on one screen: the ask is keyed to what
  // has happened to the user, not to where they happen to be standing. The
  // query is already in cache from the squad screen, so this costs nothing.
  // The Health ask moved here from the character screen for the same reason,
  // and because two independently-mounted `<Modal>`s cannot both present.
  const squad = useMySquad(session?.user.id);
  const events = useSquadEvents(squad.data?.id);

  // The notification ask's third reason, and the only one a solo player can
  // reach (deviation #60). The same query the disclosure gate reads, on the
  // same TanStack key, so this costs no extra request and the two cannot
  // disagree about whether the account has ever scored. `data` is undefined
  // while it is in flight, which reads as "not yet" — the safe direction, since
  // the ask is deferred rather than spent.
  const scoredDays = useScoredDayCount(session?.user.id);

  return (
    <Fragment>
      <Tabs
        tabBar={(props) => <TabPill {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        {/* This order is the navigator's; `TabPill`'s own `order` array is the
            bar's. They are allowed to differ, and here they agree. */}
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="sky" options={{ title: 'Sky' }} />
        <Tabs.Screen name="flock" options={{ title: 'Flock' }} />
        <Tabs.Screen name="profile" options={{ title: 'You' }} />
      </Tabs>

      {/* `PermissionAsks` lives here rather than on a screen: the ask is keyed
          to what has happened to the user, not to where they are standing, and
          two independently-mounted `<Modal>`s cannot both present. */}
      <PermissionAsks
        userId={session?.user.id}
        hasSquad={Boolean(squad.data)}
        hasEvent={(events.data ?? []).length > 0}
        hasScoredDay={(scoredDays.data ?? 0) > 0}
      />
    </Fragment>
  );
}
