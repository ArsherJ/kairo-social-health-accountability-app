import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { INVITE_CODE_LENGTH, isValidInviteCode } from './invite-code.ts';
import { useJoinSquad } from './mutations.ts';
import { colors, font, space } from '@/theme.ts';
import { Button, Label, Panel } from '@/ui/index.ts';

export function JoinSquadForm({
  userId,
  onCancel,
}: {
  userId: string | undefined;
  onCancel: () => void;
}) {
  const joinSquad = useJoinSquad(userId);
  const [code, setCode] = useState('');

  // isValidInviteCode normalises first, so `AB1-2CD` and `ab1 2cd` are both
  // accepted — people retype codes from screenshots and group chats.
  const valid = isValidInviteCode(code);

  // Same synchronous guard as CreateSquadForm: isPending arrives a tick too
  // late to stop a keyboard "Done" and a touch landing together.
  const submitting = useRef(false);

  function submit() {
    if (!valid || joinSquad.isPending || submitting.current) return;
    submitting.current = true;
    joinSquad.mutate(code, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  const busy = joinSquad.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Panel variant="plain" style={styles.panel}>
        <Label>JOIN A SQUAD</Label>
        <Text style={styles.title}>Enter the code.</Text>
        <Text style={styles.help}>
          Six characters, from whoever runs the squad. Dashes and spaces are fine.
        </Text>

        <TextInput
          value={code}
          onChangeText={setCode}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          // Room for the dashes and spaces normalizeInviteCode strips, so a
          // code typed as `AB1-2CD` is not cut off mid-entry.
          maxLength={INVITE_CODE_LENGTH + 4}
          placeholder="AB12CD"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        {joinSquad.error && <Text style={styles.error}>{joinSquad.error.message}</Text>}
      </Panel>

      <View style={styles.actions}>
        <Button label="Join" variant="primary" busy={busy} disabled={!valid} onPress={submit} />
        <Button label="Back" variant="ghost" disabled={busy} onPress={onCancel} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  panel: { flex: 1 },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm, lineHeight: 22 },
  input: {
    marginTop: space.xl,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    color: colors.text,
    // Wide letter-spacing so six characters can be checked against a
    // screenshot one glyph at a time.
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 8,
    paddingVertical: space.sm,
  },
  error: { color: colors.danger, ...font.body.body, marginTop: space.md },
  actions: { paddingBottom: space.xl },
});
