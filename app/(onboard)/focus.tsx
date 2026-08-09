import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserFocus } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { FocusChips } from '@/features/onboarding/FocusChips.tsx';
import { FOCUS_RULE_COPY } from '@/features/onboarding/focus-options.ts';
import { beginFocusStep, endFocusStep } from '@/features/onboarding/store.ts';
import { useUpdateProfile } from '@/features/profile/update-profile.ts';
import { track } from '@/features/telemetry/events.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Button, Label } from '@/ui/index.ts';

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
    <View
      style={[
        styles.container,
        // The design's 96pt top is measured on a mock with no safe area. Hold
        // it as a floor so a notched phone gets clearance and a small one
        // still gets the breathing room the layout was drawn with.
        { paddingTop: Math.max(insets.top + space.md, HEADER_TOP) },
      ]}
    >
      {/* The one shape on the screen. Bleeding off the corner rather than
          sitting inside the margin is what stops it reading as an illustration
          of something — it is the page's ground, not an object on it. */}
      <View style={styles.bloom} />

      <View style={styles.top}>
        <Label tone="muted">Your focus</Label>
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

      {/* `ui/Button`, not two hand-rolled Pressables. The pair used to
          reimplement the primary and ghost variants with a different face, a
          different disabled opacity and no press scale — three ways for this
          screen to drift from every other button in the app. */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + FOOTER_BOTTOM }]}>
        <Button
          label="Continue"
          variant="primary"
          busy={updateProfile.isPending}
          onPress={confirm}
        />
        <Button
          label="Skip for now"
          variant="ghost"
          disabled={updateProfile.isPending}
          onPress={skip}
        />
      </View>
    </View>
  );
}

/** The design's page margins, which are tighter than `space.lg` on purpose. */
const HEADER_TOP = 96;
const GUTTER = 26;
const FOOTER_BOTTOM = 46;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: GUTTER,
    // The bloom below runs off two edges; without this it paints over them.
    overflow: 'hidden',
  },
  bloom: {
    position: 'absolute',
    top: -70,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[200],
  },
  top: { flex: 1 },
  title: {
    color: colors.text,
    ...font.display.major,
    fontSize: 38,
    lineHeight: 41,
    maxWidth: 280,
    marginTop: space.sm,
  },
  help: {
    color: ramp.neutral[700],
    ...font.body.body,
    fontSize: 14.5,
    lineHeight: 22,
    maxWidth: 300,
    marginTop: space.sm,
  },
  chips: { marginTop: space.lg },
  error: { color: colors.damage, ...font.body.body, marginTop: space.md },
  actions: { gap: space.xs },
});
