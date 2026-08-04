import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resolveRoute } from '@/features/auth/route.ts';
import { startSessionListener, useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { queryClient } from '@/lib/query-client.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function RootLayout() {
  // A font error proceeds rather than blocking: RN falls back to the system
  // face for an unknown family, and a degraded screen beats a dead app.
  const [fontsLoaded, fontError] = useFonts({
    'ChakraPetch-Bold': require('../assets/fonts/ChakraPetch-Bold.ttf'),
    'ChakraPetch-SemiBold': require('../assets/fonts/ChakraPetch-SemiBold.ttf'),
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
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

  useEffect(() => startSessionListener(), []);

  const route = resolveRoute({
    sessionLoading,
    hasSession: Boolean(session),
    profileLoading: profile.isPending,
    profileError: profile.isError,
    hasProfile: Boolean(profile.data),
  });

  useEffect(() => {
    // 'profile-error' has nowhere to navigate to — it renders in place, same
    // as 'loading', so the user lands back exactly where the fetch failed
    // once they retry successfully.
    if (route === 'loading' || route === 'profile-error') return;

    const group = segments[0];
    if (route === 'signed-out' && group !== '(auth)') router.replace('/sign-in');
    else if (route === 'needs-profile' && group !== '(onboard)') router.replace('/name');
    else if (route === 'ready' && group !== '(tabs)') router.replace('/');
  }, [route, segments, router]);

  if (route === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (route === 'profile-error') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Couldn't reach your Hunter</Text>
        <Text style={styles.errorBody}>
          That's usually just a bad connection. Check your signal and try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => profile.refetch()}
          style={({ pressed }) => [styles.errorButton, pressed && styles.errorButtonPressed]}
        >
          <Text style={styles.errorButtonLabel}>Try again</Text>
        </Pressable>
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
  errorTitle: { color: colors.text, ...font.body.title, textAlign: 'center' },
  errorBody: {
    color: colors.subtle,
    ...font.body.body,
    textAlign: 'center',
    marginTop: space.sm,
  },
  errorButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
    marginTop: space.xl,
  },
  errorButtonPressed: { opacity: 0.85 },
  errorButtonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
});
