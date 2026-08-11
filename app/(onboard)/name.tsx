import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHARACTER_NAME_MAX, isValidCharacterName } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useCreateProfile } from '@/features/profile/create-profile.ts';
import { Button, Label } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

export default function NameYourCharacter() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
      // The profile row now exists, so the route gate reads this user as
      // onboarded and would send them here on its own. Replacing explicitly
      // rather than relying on that effect keeps the transition predictable and
      // one frame earlier. This is the last onboarding step — the focus
      // question that used to follow it is gone.
      onSuccess: () => router.replace('/'),
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  const [inputFocused, setInputFocused] = useState(false);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top + space.xl }]}
    >
      <View style={styles.top}>
        <Label>NAME YOUR CHARACTER</Label>
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
          style={[
            styles.input,
            {
              borderBottomColor: inputFocused ? colors.accent : colors.borderStrong,
            },
          ]}
          returnKeyType="done"
          onSubmitEditing={submit}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
        />

        {createProfile.error && (
          <Text style={styles.error}>{createProfile.error.message}</Text>
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        <Button
          label="Begin"
          onPress={submit}
          variant="primary"
          disabled={!valid}
          busy={createProfile.isPending}
        />
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
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm },
  input: {
    marginTop: space.xl,
    borderBottomWidth: 2,
    color: colors.text,
    fontSize: 28,
    fontFamily: 'Figtree-Bold',
    paddingVertical: space.sm,
  },
  error: { color: colors.damage, ...font.body.body, marginTop: space.md },
});
