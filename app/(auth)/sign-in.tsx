import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { availableProviders, type SignInProvider } from '@/features/auth/providers.ts';
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
      <View style={styles.hero}>
        <Text style={styles.brand}>KAIRO</Text>
        <Text style={styles.tagline}>Every day is a Kairo moment.</Text>
      </View>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
  },
  hero: { flex: 1, justifyContent: 'center' },
  brand: { color: colors.text, ...font.display.brand },
  tagline: { color: colors.muted, ...font.body.body, marginTop: space.sm },

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
