import { Fragment } from 'react';
import { Tabs } from 'expo-router';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { useTimezoneSync } from '@/features/profile/timezone-sync.ts';
import { useHealthSync } from '@/features/health/useHealthSync.ts';
import { useMySquad } from '@/features/squad/queries.ts';
import { useSquadFeed } from '@/features/sabotage/queries.ts';
import { NotificationPermissionSheet } from '@/features/notifications/NotificationPermissionSheet.tsx';
import {
  useAppOpenTelemetry,
  useDeviceTokenRegistration,
} from '@/features/notifications/useNotifications.ts';
import { colors } from '@/theme.ts';

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

  // Mounted at the shell rather than on one screen: the ask is keyed to what
  // has happened to the user, not to where they happen to be standing. Both
  // queries are already in cache from the squad screen, so this costs nothing.
  const squad = useMySquad(session?.user.id);
  const feed = useSquadFeed(squad.data?.id);
  const hasBeenSabotaged = (feed.data ?? []).some((event) => event.target_is_self);

  return (
    <Fragment>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Character' }} />
        <Tabs.Screen name="squad" options={{ title: 'Squad' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>

      <NotificationPermissionSheet
        hasSquad={Boolean(squad.data)}
        hasBeenSabotaged={hasBeenSabotaged}
      />
    </Fragment>
  );
}
