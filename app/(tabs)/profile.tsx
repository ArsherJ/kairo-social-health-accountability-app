import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut, useSessionStore } from '@/features/auth/session.ts';
import { seedTodayHealthData } from '@/features/health/dev-seed.ts';
import { notifyHealthPermissionGranted } from '@/features/health/useHealthSync.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
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
    <View style={[styles.container, { paddingTop: insets.top + space.lg }]}>
      <Text style={styles.title}>{profile.data?.character_name ?? 'Profile'}</Text>
      <Text style={styles.body}>Timezone {profile.data?.timezone ?? '—'}</Text>
      <Text style={styles.body}>Level {profile.data?.level ?? 1}</Text>

      {__DEV__ && (
        // Simulator affordance only. A fresh simulator's Health app is empty,
        // so without this a working ingest pipeline and a broken one both
        // render zero. Compiled out of release builds.
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => void seed()}
            style={({ pressed }) => [styles.devButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.devLabel}>Seed Apple Health (dev)</Text>
          </Pressable>
          {seedStatus !== null && <Text style={styles.devStatus}>{seedStatus}</Text>}
        </>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.buttonLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  title: { color: colors.text, ...font.title },
  body: { color: colors.muted, ...font.body, marginTop: space.sm },
  button: {
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonLabel: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  devButton: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  devLabel: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  devStatus: { color: colors.subtle, fontSize: 13, marginTop: space.sm },
});
