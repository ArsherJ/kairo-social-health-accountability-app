import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserFocus } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { FocusChips } from '@/features/onboarding/FocusChips.tsx';
import { FOCUS_RULE_COPY } from '@/features/onboarding/focus-options.ts';
import { beginFocusStep, endFocusStep } from '@/features/onboarding/store.ts';
import { useUpdateProfile } from '@/features/profile/update-profile.ts';
import { track } from '@/features/telemetry/events.ts';
import { colors, font, radius, space } from '@/theme.ts';

/**
 * The focus question (§5), asked once and skippable.
 *
 * It runs *after* the profile row exists, so the route gate already reads this
 * user as onboarded — `beginFocusStep()` is what holds the gate off until this
 * screen is done. See `redirectTarget` in `features/auth/route.ts`.
 *
 * Skipping writes nothing at all. A null focus is a first-class value, not a
 * missing one: it means the character screen highlights nothing in particular,
 * which is a perfectly good way to use Kairo.
 */
export default function FocusStep() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const updateProfile = useUpdateProfile(userId);
  const [focus, setFocus] = useState<UserFocus | null>(null);

  // Held for the lifetime of this screen. The cleanup also covers the user
  // navigating back, so the flag can never outlive the question.
  useEffect(() => {
    beginFocusStep();
    return endFocusStep;
  }, []);

  function finish() {
    endFocusStep();
    router.replace('/');
  }

  function confirm() {
    if (updateProfile.isPending) return;
    if (focus === null) {
      skip();
      return;
    }
    // Telemetry first: the answer is what §15's segmentation needs, and it
    // should not be lost because the write failed on a bad connection.
    track(userId, 'focus_selected', { focus });
    updateProfile.mutate({ focus }, { onSuccess: finish });
  }

  function skip() {
    track(userId, 'focus_skipped');
    finish();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.xl }]}>
      <View style={styles.top}>
        <Text style={styles.label}>YOUR FOCUS</Text>
        <Text style={styles.title}>What are you here to do?</Text>
        <Text style={styles.help}>{FOCUS_RULE_COPY}</Text>

        <View style={styles.chips}>
          <FocusChips
            value={focus}
            onChange={setFocus}
            disabled={updateProfile.isPending}
          />
        </View>

        {updateProfile.error && (
          <Text style={styles.error}>{updateProfile.error.message}</Text>
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl, gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          disabled={updateProfile.isPending}
          onPress={confirm}
          style={({ pressed }) => [
            styles.button,
            updateProfile.isPending && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {updateProfile.isPending ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.buttonLabel}>Continue</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={updateProfile.isPending}
          onPress={skip}
          style={({ pressed }) => [styles.skip, pressed && styles.buttonPressed]}
        >
          <Text style={styles.skipLabel}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
  },
  top: { flex: 1 },
  label: { color: colors.muted, ...font.body.label },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm },
  chips: { marginTop: space.lg },
  error: { color: colors.danger, ...font.body.body, marginTop: space.md },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.35 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  skip: { paddingVertical: space.md, alignItems: 'center' },
  skipLabel: { color: colors.subtle, fontSize: 15, fontWeight: '600' },
});
