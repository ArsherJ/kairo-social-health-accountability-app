import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCreateSquad } from './mutations.ts';
import { colors, font, radius, space } from '@/theme.ts';

const SQUAD_NAME_MIN = 2;
const SQUAD_NAME_MAX = 30;

/**
 * The database CHECK is `char_length(btrim(name)) between 2 and 30`, so the
 * client validates the *trimmed* length and submits the trimmed value. A rule
 * that disagrees with the constraint just moves the rejection to the server.
 */
function isValidSquadName(raw: string): boolean {
  const length = raw.trim().length;
  return length >= SQUAD_NAME_MIN && length <= SQUAD_NAME_MAX;
}

export function CreateSquadForm({
  userId,
  onCancel,
}: {
  userId: string | undefined;
  onCancel: () => void;
}) {
  const createSquad = useCreateSquad(userId);
  const [name, setName] = useState('');

  const valid = isValidSquadName(name);

  // isPending flips through TanStack's notifyManager on a setTimeout(fn, 0),
  // not synchronously with mutate(). A keyboard "Done" and an already-queued
  // touch both fire in one tick and both still read the previous render's
  // isPending === false. This ref flips before mutate() runs, so the second
  // event is rejected regardless of render timing — the same bug the
  // onboarding name screen hit.
  const submitting = useRef(false);

  function submit() {
    if (!valid || createSquad.isPending || submitting.current) return;
    submitting.current = true;
    createSquad.mutate(name, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  const busy = createSquad.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.top}>
        <Text style={styles.label}>CREATE A SQUAD</Text>
        <Text style={styles.title}>Name it.</Text>
        <Text style={styles.help}>
          Your squad gets a six-character code. Send it to whoever you want on the
          board.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          autoCorrect={false}
          maxLength={SQUAD_NAME_MAX}
          placeholder="Barangay Runners"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        {createSquad.error && (
          <Text style={styles.error}>{createSquad.error.message}</Text>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!valid || busy}
          onPress={submit}
          style={({ pressed }) => [
            styles.primary,
            (!valid || busy) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.primaryLabel}>Create</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Text style={styles.cancelLabel}>Back</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  top: { flex: 1 },
  label: { color: colors.muted, ...font.label },
  title: { color: colors.text, ...font.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body, marginTop: space.sm, lineHeight: 22 },
  input: {
    marginTop: space.xl,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    paddingVertical: space.sm,
  },
  error: { color: colors.danger, ...font.body, marginTop: space.md },
  actions: { paddingBottom: space.xl },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.85 },
  cancel: { paddingVertical: space.md, alignItems: 'center' },
  cancelLabel: { color: colors.muted, fontSize: 15, fontWeight: '600' },
});
