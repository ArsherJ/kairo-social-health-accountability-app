import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { redirectTarget, resolveRoute } from '@/features/auth/route.ts';
import { startSessionListener, useSessionStore } from '@/features/auth/session.ts';
import { useOnboardingStore } from '@/features/onboarding/store.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { queryClient } from '@/lib/query-client.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function RootLayout() {
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
  errorTitle: { color: colors.text, ...font.title, textAlign: 'center' },
  errorBody: {
    color: colors.subtle,
    ...font.body,
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
