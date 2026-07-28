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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHARACTER_NAME_MAX, isValidCharacterName } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useCreateProfile } from '@/features/profile/create-profile.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function NameYourHunter() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const createProfile = useCreateProfile(session?.user.id);
  const [name, setName] = useState('');

  const valid = isValidCharacterName(name);

  // createProfile.isPending flips through TanStack's notifyManager, which by
  // default schedules the update via setTimeout(fn, 0) rather than delivering
  // it synchronously with mutate(). A keyboard "Done" and an already-queued
  // touch can both fire within the same tick and both still read the
  // previous render's isPending === false, producing two inserts with the
  // same id. This ref is flipped synchronously, before mutate() runs, so the
  // second event in the same tick is rejected regardless of render timing.
  const submitting = useRef(false);

  function submit() {
    if (!valid || createProfile.isPending || submitting.current) return;
    submitting.current = true;
    createProfile.mutate(name, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top + space.xl }]}
    >
      <View style={styles.top}>
        <Text style={styles.label}>NAME YOUR HUNTER</Text>
        <Text style={styles.title}>Who are you going to be?</Text>
        <Text style={styles.help}>
          This is the name your squad will see on the leaderboard. You can change it
          later.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          autoCorrect={false}
          maxLength={CHARACTER_NAME_MAX}
          placeholder="Aeon"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        {createProfile.error && (
          <Text style={styles.error}>{createProfile.error.message}</Text>
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        <Pressable
          accessibilityRole="button"
          disabled={!valid || createProfile.isPending}
          onPress={submit}
          style={({ pressed }) => [
            styles.button,
            (!valid || createProfile.isPending) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {createProfile.isPending ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.buttonLabel}>Begin</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  label: { color: colors.muted, ...font.label },
  title: { color: colors.text, ...font.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body, marginTop: space.sm },
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
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.35 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
});
