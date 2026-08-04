import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { availableProviders, type SignInProvider } from '@/features/auth/providers.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = availableProviders();

  async function run(provider: SignInProvider) {
    setBusy(true);
    setError(null);
    const result = await provider.signIn();
    if (result.error) setError(result.error);
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
        {providers.map((provider) => (
          <Pressable
            key={provider.id}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run(provider)}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.buttonLabel}>{provider.label}</Text>
            )}
          </Pressable>
        ))}

        {providers.length === 0 && (
          <Text style={styles.error}>
            No sign-in method is configured for this build. Sign in with Apple needs
            the capability enabled on the App ID.
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
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
  brand: { color: colors.text, ...font.display.major },
  tagline: { color: colors.muted, ...font.body.body, marginTop: space.sm },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, ...font.body.body, marginTop: space.md, textAlign: 'center' },
});
