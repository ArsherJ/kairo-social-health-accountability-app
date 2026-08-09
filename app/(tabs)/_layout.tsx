import { Fragment } from 'react';
import { Tabs } from 'expo-router';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { useTimezoneSync } from '@/features/profile/timezone-sync.ts';
import { useHealthSync } from '@/features/health/useHealthSync.ts';
import { useMySquad } from '@/features/squad/queries.ts';
import { PermissionAsks } from '@/features/permissions/PermissionAsks.tsx';
import {
  useAppOpenTelemetry,
  useDeviceTokenRegistration,
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

  // Mounted at the shell rather than on one screen: the ask is keyed to what
  // has happened to the user, not to where they happen to be standing. The
  // query is already in cache from the squad screen, so this costs nothing.
  // The Health ask moved here from the character screen for the same reason,
  // and because two independently-mounted `<Modal>`s cannot both present.
  const squad = useMySquad(session?.user.id);

  return (
    <Fragment>
      <Tabs
        tabBar={(props) => <TabPill {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Character' }} />
        <Tabs.Screen name="squad" options={{ title: 'Squad' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>

      {/* `PermissionAsks` lives here rather than on a screen: the ask is keyed
          to what has happened to the user, not to where they are standing, and
          two independently-mounted `<Modal>`s cannot both present. */}
      <PermissionAsks userId={session?.user.id} hasSquad={Boolean(squad.data)} />
    </Fragment>
  );
}
