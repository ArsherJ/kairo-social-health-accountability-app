import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { signOut, useSessionStore } from '@/features/auth/session.ts';
import { seedTodayHealthData } from '@/features/health/dev-seed.ts';
import { notifyHealthPermissionGranted } from '@/features/health/useHealthSync.ts';
import { BodyMetricsCard } from '@/features/profile/BodyMetricsCard.tsx';
import { FocusCard } from '@/features/profile/FocusCard.tsx';
import { StreakCard } from '@/features/profile/StreakCard.tsx';
import { XpBar } from '@/features/profile/XpBar.tsx';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { Button, Label, Panel, Screen } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

export default function ProfileTab() {
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
      <Text style={styles.title}>{profile.data?.character_name ?? 'Profile'}</Text>

      {profile.isPending && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {profile.data && (
        <>
          <XpBar totalXp={profile.data.total_xp} />

          {/* Streak errors are silent by design: a failed streak fetch must
              not stop the rest of the screen rendering, and StreakCard reads
              a missing row as zeros — which is what a new user has anyway. */}
          <StreakCard streak={streak.data} />

          <BodyMetricsCard userId={userId} profile={profile.data} />

          <FocusCard userId={userId} profile={profile.data} />

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
        </>
      )}

      <Button
        label="Sign out"
        onPress={() => void signOut()}
        variant="ghost"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, ...font.body.title },
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  value: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: space.xs },
  help: { color: colors.muted, fontSize: 12, marginTop: space.sm, lineHeight: 18 },
  devStatus: { color: colors.subtle, fontSize: 13, marginTop: space.sm },
});
