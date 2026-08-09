import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { INVITE_CODE_LENGTH, isValidInviteCode } from './invite-code.ts';
import { useJoinSquad } from './mutations.ts';
import { boostChipLabel, programLabel, programNote } from './program-copy.ts';
import { useSquadPreview } from './queries.ts';
import { colors, font, radius, space } from '@/theme.ts';
import { BackRow, Button, Label, Panel } from '@/ui/index.ts';

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
    if (!valid || blocked || joinSquad.isPending || submitting.current) return;
    submitting.current = true;
    joinSquad.mutate(code, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  // The program is the game rule, so consenting to it is part of joining —
  // it must be visible *before* the tap, not discovered on the board.
  const preview = useSquadPreview(code, valid);
  const squad = preview.data;
  const busy = joinSquad.isPending;
  const boost = squad ? boostChipLabel(squad.program) : null;
  const note = squad ? programNote(squad.program) : null;
  // Rejoining is idempotent and harmless, so only a genuinely full squad
  // blocks the button. The server still enforces both.
  const blocked = Boolean(squad?.is_full && !squad.already_member);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* The visible exit while the keyboard is up — this pane hides the orbit
          nav, and the ghost "Back" below sits under the keyboard. */}
      <BackRow onPress={onCancel} disabled={busy} />

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

        {valid && preview.isPending && (
          <View style={styles.previewCard}>
            <ActivityIndicator color={colors.subtle} />
          </View>
        )}

        {valid && preview.isSuccess && squad === null && (
          <Text style={styles.error}>
            That code does not match any squad. Check the six characters and try
            again.
          </Text>
        )}

        {squad && (
          <View style={styles.previewCard}>
            <Text style={styles.previewName} numberOfLines={1}>
              {squad.name}
            </Text>
            <View style={styles.previewMeta}>
              <Text style={styles.previewProgram}>
                {programLabel(squad.program)}
              </Text>
              {boost && (
                <View style={styles.boostChip}>
                  <Text style={styles.boostLabel}>{boost}</Text>
                </View>
              )}
              <Text style={styles.previewCount}>
                {squad.member_count} of {squad.max_members}
              </Text>
            </View>
            {note && <Text style={styles.previewNote}>{note}</Text>}
            {squad.already_member && (
              <Text style={styles.previewNote}>You are already on this board.</Text>
            )}
            {squad.is_full && !squad.already_member && (
              <Text style={styles.previewFull}>This squad is full.</Text>
            )}
          </View>
        )}

        {joinSquad.error && <Text style={styles.error}>{joinSquad.error.message}</Text>}
      </Panel>

      <View style={styles.actions}>
        {/* `blocked` is not `!valid`: the code can be well-formed and still
            refused (full squad, already a member), and the preview says so
            above. Dropping it here would offer a button that only fails. */}
        <Button
          label="Join"
          variant="primary"
          busy={busy}
          disabled={!valid || blocked}
          onPress={submit}
        />
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
    // Monospace stays, and so does `fontWeight` with it: the code is checked
    // against a screenshot one glyph at a time, and unlike the bundled Figtree
    // cuts, a system face is selected by weight rather than by family name.
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
    fontSize: 32,
    letterSpacing: 8,
    paddingVertical: space.sm,
  },
  error: { color: colors.damage, ...font.body.body, marginTop: space.md },
  previewCard: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewName: { color: colors.text, ...font.display.small, fontSize: 18 },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  previewProgram: { color: colors.subtle, fontSize: 14, fontFamily: 'Figtree-SemiBold' },
  boostChip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  boostLabel: { color: colors.accent, fontSize: 11, fontFamily: 'Figtree-Bold' },
  previewCount: { color: colors.muted, fontSize: 12, marginLeft: 'auto' },
  previewNote: { color: colors.muted, fontSize: 12, marginTop: space.sm, lineHeight: 18 },
  previewFull: { color: colors.damage, fontSize: 12, marginTop: space.sm },
  actions: { paddingBottom: space.xl },
});
