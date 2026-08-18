import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { signOut, useSessionStore } from '@/features/auth/session.ts';
import { seedTodayHealthData } from '@/features/health/dev-seed.ts';
import { notifyHealthPermissionGranted } from '@/features/health/useHealthSync.ts';
import { BodyMetricsCard } from '@/features/profile/BodyMetricsCard.tsx';
import { DemoToggle } from '@/features/demo/DemoToggle.tsx';
import { NotificationSettingsCard } from '@/features/notifications/NotificationSettingsCard.tsx';
import { ProfileHeader } from '@/features/profile/ProfileHeader.tsx';
import { StreakCard } from '@/features/profile/StreakCard.tsx';
import { SPECIES_NAMES } from '@/features/character/species.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { Button, Label, Panel, Screen, Text } from '@/ui/index.ts';
import { colors, font, ramp, space } from '@/theme.ts';

export default function ProfileTab() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const streak = useStreak(userId);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  async function seed() {
    const timeZone = profile.data?.timezone;
    if (!timeZone) return;

    setSeedStatus('Writing to Apple Health…');
    try {
      const result = await seedTodayHealthData(new Date(), timeZone);
      setSeedStatus(
        `Wrote ${result.steps.toLocaleString()} steps across ${result.hoursSeeded}h ` +
          `on ${result.localDate}. Syncing…`,
      );
      // Reuse the permission-granted trigger: same intent, sync right now
      // rather than waiting for the next foreground.
      notifyHealthPermissionGranted();
    } catch (cause) {
      setSeedStatus(cause instanceof Error ? cause.message : 'Seeding failed');
    }
  }

  return (
    <Screen>
      {profile.isPending && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {profile.data && (
        <>
          {/* The name lives in the header now, beside the XP ring, rather than
              as a page title above a bar that said the same numbers. */}
          <ProfileHeader
            name={profile.data.character_name}
            totalXp={profile.data.total_xp}
          />

          {/* Streak errors are silent by design: a failed streak fetch must
              not stop the rest of the screen rendering, and StreakCard reads
              a missing row as zeros — which is what a new user has anyway. */}
          <StreakCard streak={streak.data} />

          <BodyMetricsCard userId={userId} profile={profile.data} />

          {/* Above Timezone because it is the one on this screen that can be
              wrong without the user knowing: the zone follows the device, but a
              notification permission revoked in iOS Settings is silent. */}
          <NotificationSettingsCard />

          {/* Above Timezone, because this one is a choice and that one is an
              observation. The picker itself is `/species`, groupless — see
              that file for why it cannot live in `(onboard)` alongside the
              onboarding mount. */}
          <Panel>
            <Label>Companion</Label>
            <Text style={styles.value}>
              {profile.data.species === null
                ? 'Not chosen yet'
                : SPECIES_NAMES[profile.data.species]}
            </Text>
            <Text style={styles.help}>
              Cosmetic only — your stats, scores and streak are untouched by
              which animal you play as.
            </Text>
            <Button
              label={profile.data.species === null ? 'Choose a companion' : 'Change'}
              variant="secondary"
              onPress={() => router.push('/species')}
            />
          </Panel>

          <Panel>
            <Label>Timezone</Label>
            <Text style={styles.value}>{profile.data.timezone}</Text>
            {/* Read-only on purpose. §2 ranks everyone on their own local day,
                and the zone follows the device so travelling does not need a
                settings visit — or let anyone shop for a longer day. */}
            <Text style={styles.help}>
              Follows your device. Your day runs midnight to midnight here, so
              travelling moves your day with you.
            </Text>
          </Panel>
        </>
      )}

      {__DEV__ && (
        // Simulator affordance only. A fresh simulator's Health app is empty,
        // so without this a working ingest pipeline and a broken one both
        // render zero. Compiled out of release builds.
        <>
          <Button
            label="Seed Apple Health (dev)"
            onPress={() => void seed()}
            variant="secondary"
          />
          {seedStatus !== null && <Text style={styles.devStatus}>{seedStatus}</Text>}
          <DemoToggle />
        </>
      )}

      <Button
        label="Sign out"
        onPress={() => void signOut()}
        variant="ghost"
      />

      {/* Below sign-out, and only reachable through a screen that explains
          what it does. Apple requires an in-app path for this; putting it
          anywhere more prominent would make the reversible action compete
          with the irreversible one. */}
      <Button
        label="Delete account"
        onPress={() => router.push('/delete-account')}
        variant="ghost"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  value: { color: colors.text, ...font.display.minor, fontSize: 19, marginTop: space.xs },
  help: { ...font.body.body, fontSize: 12, color: ramp.neutral[600], marginTop: space.sm, lineHeight: 18 },
  devStatus: { ...font.body.body, fontSize: 13, color: colors.subtle, marginTop: space.sm },
});
