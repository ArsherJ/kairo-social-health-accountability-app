import { Fragment, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { redirectTarget, resolveRoute } from '@/features/auth/route.ts';
import { startSessionListener, useSessionStore } from '@/features/auth/session.ts';
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
 *
 * **The navigator is mounted unconditionally.** Both non-`ready` states render
 * as an overlay *over* the `<Stack>`, never in place of it. Swapping the
 * navigator out for a spinner unmounts every navigator beneath it, and
 * React Navigation deletes an unmounted navigator's state — so a transient
 * `useProfile` refetch would silently reset the tab bar to its initial screen.
 * That was half of the "back from a goal lands on the wrong tab" bug; the
 * `<Stack>` below is the other half.
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
    // The whole rule — including 'profile-error' and 'loading' having nowhere
    // to navigate to, since both render in place — lives in redirectTarget(),
    // which is tested in Node. This effect only performs the answer.
    const target = redirectTarget({ route, group: segments[0] });
    if (target) router.replace(target);
  }, [route, segments, router]);

  return (
    <Fragment>
      {/* No `<Stack.Screen>` children: Expo Router generates one per route
          file, and naming them by hand is a second list to keep in step with
          `app/`. Groups without a layout — `(auth)`, `(onboard)` — flatten into
          this navigator exactly as they did under `<Slot/>`, so `segments[0]`
          is unchanged and `redirectTarget()` keeps its tests. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />

      {route === 'loading' && (
        <View style={[styles.overlay, styles.centered]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {route === 'profile-error' && (
        // profile-error has nowhere to navigate to — it covers in place, same
        // as loading, so the user lands back exactly where the fetch failed
        // once they retry successfully.
        <View style={[styles.overlay, styles.errorContainer]}>
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
      )}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  // Opaque, and absolutely positioned over the navigator rather than replacing
  // it. `backgroundColor` is what makes it a cover: without it the half-built
  // screen underneath shows through, which is exactly what these two states
  // exist to hide.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
  centered: { justifyContent: 'center' },
  errorContainer: {
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
