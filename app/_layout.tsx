import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { redirectTarget, resolveRoute } from '@/features/auth/route.ts';
import { startSessionListener, useSessionStore } from '@/features/auth/session.ts';
import { useOnboardingStore } from '@/features/onboarding/store.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { Panel, Button } from '@/ui/index.ts';
import { queryClient } from '@/lib/query-client.ts';
import { colors, font, space } from '@/theme.ts';

export default function RootLayout() {
  // A font error proceeds rather than blocking: RN falls back to the system
  // face for an unknown family, and a degraded screen beats a dead app.
  const [fontsLoaded, fontError] = useFonts({
    'Caprasimo-Regular': require('../assets/fonts/Caprasimo-Regular.ttf'),
    'Figtree-Regular': require('../assets/fonts/Figtree-Regular.ttf'),
    'Figtree-SemiBold': require('../assets/fonts/Figtree-SemiBold.ttf'),
    'Figtree-Bold': require('../assets/fonts/Figtree-Bold.ttf'),
    // The nav, the empty seat and the streak shield are all Feather glyphs.
    // Loading the face here rather than letting the icon component do it
    // lazily is what stops the first paint flashing a missing-glyph box.
    ...Feather.font,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* The ground is cream now, so the clock and the battery have to be
            ink. `light` here would render them invisible. */}
        <StatusBar style="dark" />
        <Gate />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/**
 * Sends the user to the shell they belong in.
 *
 * Profile-row existence is the onboarding marker: character_name is NOT NULL,
 * so the row exists if and only if the name step completed. No extra column,
 * and no local flag that can desync from the server.
 */
function Gate() {
  const router = useRouter();
  const segments = useSegments();
  const session = useSessionStore((s) => s.session);
  const sessionLoading = useSessionStore((s) => s.loading);
  const profile = useProfile(session?.user.id);
  const finishingOnboarding = useOnboardingStore((s) => s.finishingOnboarding);

  useEffect(() => startSessionListener(), []);

  const route = resolveRoute({
    sessionLoading,
    hasSession: Boolean(session),
    profileLoading: profile.isPending,
    profileError: profile.isError,
    hasProfile: Boolean(profile.data),
  });

  useEffect(() => {
    // The whole rule — including 'profile-error' and 'loading' having nowhere
    // to navigate to, since both render in place — lives in redirectTarget(),
    // which is tested in Node. This effect only performs the answer.
    const target = redirectTarget({
      route,
      group: segments[0],
      finishingOnboarding,
    });
    if (target) router.replace(target);
  }, [route, segments, router, finishingOnboarding]);

  if (route === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (route === 'profile-error') {
    // profile-error has nowhere to navigate to — it renders in place, same
    // as loading, so the user lands back exactly where the fetch failed
    // once they retry successfully.
    return (
      <View style={styles.errorContainer}>
        <Panel variant="plain" style={styles.panelOverride}>
          <Text style={styles.errorTitle}>Couldn't reach your Hunter</Text>
          <Text style={styles.errorBody}>
            That's usually just a bad connection. Check your signal and try again.
          </Text>
          <Button
            label="Try again"
            onPress={() => profile.refetch()}
            variant="primary"
            disabled={false}
            busy={false}
          />
        </Panel>
      </View>
    );
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  panelOverride: { marginTop: 0 },
  errorTitle: { color: colors.text, ...font.body.title, textAlign: 'center' },
  errorBody: {
    color: colors.subtle,
    ...font.body.body,
    textAlign: 'center',
    marginTop: space.sm,
  },
});
