import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { deleteAccount } from '@/features/auth/session.ts';
import { colors, font, radius, space } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { BackRow, Button, Screen, Text } from '@/ui/index.ts';

/**
 * Erase everything.
 *
 * A route rather than an alert, and a typed word rather than a second "are you
 * sure": this is the one action in the app with no undo, and the consequences
 * are specific enough to be worth reading. A two-tap dialog optimises for the
 * person who already decided; the cost of getting it wrong lands entirely on
 * the person who had not.
 *
 * Deliberately plain about what survives. Saying "everything is deleted" would
 * be simpler and false — squad leadership passes on, battles other people are
 * running keep going without your name on them, and behavioural telemetry stays
 * as anonymous rows. Someone erasing an account to get out of a squad deserves
 * to know the squad continues.
 */
const CONFIRM_WORD = 'DELETE';

export default function DeleteAccount() {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // No navigation: erasure clears the session, and the root gate routes to
      // the sign-in screen on its own. Pushing a route here would race it.
    } catch (cause) {
      // The session is deliberately still intact on this path — `deleteAccount`
      // signs out only after the server confirms. An account half-erased and
      // locked out would be the worst outcome available.
      setError(
        cause instanceof Error
          ? `That didn't go through: ${cause.message}`
          : "That didn't go through.",
      );
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackRow onPress={() => router.back()} disabled={busy} />

      <Text style={styles.title}>Delete your account</Text>
      <Text style={styles.body}>
        This erases your character, your level and mastery, every day
        you have scored, your streak, and your place in any squad. It cannot be
        undone, and nothing here can be recovered afterwards.
      </Text>

      <View style={styles.survives}>
        <Text style={styles.survivesLabel}>WHAT DOES NOT GO WITH YOU</Text>
        <Text style={styles.survivesBody}>
          If you lead a squad, it carries on under its longest-standing member —
          unless you are the only one left, in which case it goes too. A battle
          you started keeps running for everyone else, without your name on it.
        </Text>
      </View>

      <Text style={styles.prompt}>Type {CONFIRM_WORD} to confirm.</Text>
      <TextInput
        maxFontSizeMultiplier={1.4}
        value={typed}
        onChangeText={setTyped}
        editable={!busy}
        autoCapitalize="characters"
        autoCorrect={false}
        // No placeholder repeating the word: a field pre-filled with the answer
        // in grey is a confirmation that confirms nothing.
        accessibilityLabel={`Type ${CONFIRM_WORD} to confirm account deletion`}
        style={styles.input}
      />

      <Button
        label="Delete my account"
        variant="primary"
        busy={busy}
        disabled={!armed}
        onPress={() => void confirm()}
      />

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Button label="Keep my account" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, ...font.body.title, marginTop: space.md },
  body: {
    color: colors.subtle,
    ...font.body.body,
    marginTop: space.sm,
    lineHeight: 21,
  },
  survives: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  survivesLabel: { color: colors.accentDeep, ...font.body.label },
  survivesBody: {
    color: colors.subtle,
    ...font.body.body,
    fontSize: 13,
    marginTop: space.xs,
    lineHeight: 19,
  },
  prompt: {
    color: colors.text,
    ...font.body.strong,
    marginTop: space.lg,
  },
  input: {
    ...font.body.body,
    color: colors.text,
    backgroundColor: colors.surfaceLift,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  error: {
    color: colors.damage,
    ...font.body.body,
    fontSize: 13,
    marginTop: space.md,
    lineHeight: 19,
  },
});
