import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { availableProviders, type SignInProvider } from '@/features/auth/providers.ts';
import { Button } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

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
          <Button
            key={provider.id}
            label={provider.label}
            onPress={() => void run(provider)}
            variant="primary"
            disabled={false}
            busy={busy}
          />
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
  brand: { color: colors.text, ...font.display.brand },
  tagline: { color: colors.muted, ...font.body.body, marginTop: space.sm },
  error: { color: colors.danger, ...font.body.body, marginTop: space.md, textAlign: 'center' },
});
