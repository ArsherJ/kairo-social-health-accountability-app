import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { availableProviders, type SignInProvider } from '@/features/auth/providers.ts';
import { track } from '@/features/telemetry/events.ts';
import { Button, Text } from '@/ui/index.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';

/** Matches `Button`'s `minHeight`, so the two stack on one rhythm. */
const APPLE_BUTTON_HEIGHT = 52;

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = availableProviders();

  // Partitioned rather than branched inside the map: the screen still reads
  // whatever `availableProviders()` returns, it just knows that one of them
  // wears Apple's chrome. Apple's Human Interface Guidelines require their
  // button — it cannot be recoloured, and using Kairo's pill instead is an App
  // Review rejection.
  const apple = providers.find((provider) => provider.id === 'apple');
  const rest = providers.filter((provider) => provider.id !== 'apple');

  // The first measurable moment in the funnel. There is no session yet, so
  // `track` buffers this and `flushTelemetryBuffer` attributes it after
  // sign-in, carrying this timestamp rather than the flush time — which is the
  // whole reason the buffer exists.
  useEffect(() => {
    void track(undefined, 'pitch_seen');
  }, []);

  async function run(provider: SignInProvider) {
    setBusy(true);
    setError(null);
    const result = await provider.signIn();
    // `null` from a provider covers the cancelled case too, which is why this
    // clears rather than keeps the previous message: backing out of Apple's
    // sheet should leave the screen exactly as it was.
    setError(result.error);
    // On success the session listener flips the gate; this screen unmounts.
    setBusy(false);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.xl }]}>
      {/* A ScrollView, not a View. This is the only screen in the app whose
          content is all prose, and `prose` scale is 1.8 — at the largest
          accessibility sizes five stacked blocks are taller than any iPhone.
          `flexGrow` keeps it optically centred at every size below that, so
          scrolling only appears when it is actually needed. */}
      <ScrollView style={styles.hero} contentContainerStyle={styles.heroContent}>
        <Text style={styles.brand}>KAIRO</Text>
        <Text style={styles.tagline}>
          Turn everyday movement into a character you level with your friends.
        </Text>

        {/* The loop, in the order it happens. Three lines rather than a
            paragraph: this is the one screen a user reads before deciding
            whether to sign in at all. */}
        <View style={styles.loop}>
          <Step text="Your phone already counts your steps." />
          <Step text="Your character levels from them." />
          <Step text="Your squad sees where you stand today." />
        </View>

        {/* Names who this is for. Design D36: positioning only — the in-app
            nouns stay "your character" and "squad", so deviation #26 stands.
            "Wherever they are" is the wedge doing the work: a squad whose
            members are split across countries is the case Kairo fits and a
            public fitness feed does not. */}
        <Text style={styles.who}>
          Built for small groups who already know each other — your family, your
          friends, wherever they are.
        </Text>

        {/* The privacy line is the strongest thing about the product and was
            previously only visible after signing in. */}
        <Text style={styles.privacy}>
          Your squad sees your progress — never your Health data.
        </Text>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        {error && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        )}

        {apple && (
          // Dimmed and inert while the token is exchanged. Apple's button has
          // no busy state of its own, so it borrows `Button`'s disabled
          // opacity rather than inventing a second one.
          <View
            style={[styles.appleWrap, busy && styles.inert]}
            pointerEvents={busy ? 'none' : 'auto'}
          >
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              // Black, because the ground is cream. Apple's WHITE style lands
              // within a few points of `surfaceLift` and stops reading as a
              // control at all, and WHITE_OUTLINE builds its edge from a
              // border — which is the one thing this system says a surface is
              // never made of.
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              // iOS clamps to half the height, so the token yields a capsule
              // that matches every other button in the app.
              cornerRadius={radius.pill}
              style={styles.appleButton}
              onPress={() => void run(apple)}
            />
          </View>
        )}

        {rest.length > 0 && (
          <View style={styles.devBlock}>
            {/* Not an "or". These are not two ways to do the same thing: the
                path below exists only while `__DEV__` is true and is compiled
                out of anything that reaches TestFlight. Saying which build you
                are looking at is the true thing to say here. */}
            <Text style={styles.eyebrow}>Development build</Text>
            {rest.map((provider) => (
              <Button
                key={provider.id}
                label={provider.label}
                onPress={() => void run(provider)}
                variant="ghost"
                busy={busy}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * One line of the loop.
 *
 * The dot is **sage, not terracotta**. `theme.ts` reserves terracotta for "you,
 * your score, the primary action" and says sage is never a call to action — and
 * the only real action on this screen is Apple's black button. A row of accent
 * dots beside it would be the system's first exception, on the one screen where
 * nothing should compete with the button.
 */
function Step({ text }: { text: string }) {
  return (
    <View style={styles.step}>
      {/* Decorative: the sentence beside it carries the whole meaning, and a
          screen reader announcing "bullet" three times is noise. */}
      <View
        style={styles.dot}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={styles.stepText}>{text}</Text>
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
  hero: { flex: 1 },
  heroContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.lg },
  brand: { color: colors.text, ...font.display.brand },
  // The thesis line, so `colors.text` rather than the muted grey it carried
  // when it read "Every day is a Kairo moment." A sentence this load-bearing
  // set in the same ink as a caption is a sentence nobody reads.
  tagline: {
    color: colors.text,
    ...font.body.body,
    fontSize: 17,
    lineHeight: 24,
    marginTop: space.sm,
  },

  loop: { marginTop: space.lg, gap: space.sm },
  // `flex-start`, so the dot stays on the first line's baseline when the text
  // wraps — which it does at every Dynamic Type size above the default.
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[500],
    // Optically on the first line's centre at the default size. It does not
    // track Dynamic Type — a growing dot would read as a bullet gaining
    // importance, and at the sizes where it drifts the text has already
    // wrapped to three lines and the dot reads as a column marker.
    marginTop: 8,
  },
  stepText: {
    ...font.body.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    flex: 1,
  },
  who: {
    ...font.body.body,
    fontSize: 14,
    color: colors.subtle,
    marginTop: space.lg,
    lineHeight: 20,
  },
  // The one claim that earns weight. `body.strong` is the semibold face at
  // 12.5, overridden to 13 so it sits a half-step above the line above it
  // without becoming a second heading.
  privacy: {
    ...font.body.strong,
    fontSize: 13,
    color: colors.subtle,
    marginTop: space.lg,
    lineHeight: 19,
  },

  appleWrap: { marginTop: space.sm },
  appleButton: { height: APPLE_BUTTON_HEIGHT, width: '100%' },
  inert: { opacity: 0.45 },

  devBlock: { marginTop: space.md },
  eyebrow: {
    color: colors.muted,
    ...font.body.label,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  /**
   * A tint, not a colour. `damage` used to carry this and should not have —
   * it is reserved for a goal slipping away, and a sign-in that failed is not
   * that. The system builds emphasis from surface, so the message sits on a
   * neutral wash and stays in the text colour.
   */
  notice: {
    backgroundColor: ramp.neutral[200],
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  noticeText: { color: colors.text, ...font.body.body, textAlign: 'center' },
});
