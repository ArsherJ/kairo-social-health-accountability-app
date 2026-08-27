import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { INVITE_CODE_LENGTH, isValidInviteCode } from './invite-code.ts';
import { useJoinSquad } from './mutations.ts';
import { boostChipLabel, programLabel, programNote } from './program-copy.ts';
import { useSquadPreview } from './queries.ts';
import { useSquadDataConsent } from './consent.ts';
import { SquadDataConsentSheet } from './SquadDataConsentSheet.tsx';
import { colors, font, radius, space } from '@/theme.ts';
import { BackRow, Button, Label, Panel, Text } from '@/ui/index.ts';

export function JoinSquadForm({
  userId,
  onCancel,
  initialCode,
  notice,
}: {
  userId: string | undefined;
  onCancel: () => void;
  /**
   * Prefilled from a `/join/<code>` universal link. Seeded rather than
   * submitted automatically: a link can be stale, wrong, or tapped by someone
   * who did not mean to join, and a form the user confirms is the difference
   * between an accelerator and a trap.
   */
  initialCode?: string;
  /**
   * Why the field is empty when the user expected it filled. Set only by the
   * link route, and only when the link carried nothing usable — a blank form
   * after tapping an invite reads as the app losing the code.
   */
  notice?: string;
}) {
  const joinSquad = useJoinSquad(userId);
  const { consented, isSuccess } = useSquadDataConsent(userId);


  // A lazy initialiser, not a `useEffect`: seeding from an effect would run
  // again on any re-render that changed the prop, wiping whatever the user had
  // typed over it.
  const [code, setCode] = useState(() => initialCode ?? '');

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

  // **The decision comes first, and it replaces the form rather than covering
  // it.** Racing is the reason to have a squad, and racing discloses health
  // data (deviation #47) — so agreeing is part of joining, exactly as
  // consenting to the squad's program already is. A modal over a half-filled
  // form would make it look like an interruption to dismiss.
  //
  // `isSuccess &&`, never `!consented` alone: while the query is in flight
  // `consented` reads false, which is indistinguishable from a refusal, and a
  // sheet that flashes over the form on every mount reads as a bug.
  //
  // **Below every hook, deliberately.** An early return above one of them is a
  // conditional hook: the count changes the frame consent lands, and React
  // throws rather than re-rendering.
  if (isSuccess && !consented) {
    return <SquadDataConsentSheet userId={userId} onDecline={onCancel} />;
  }

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
          {initialCode
            ? 'From the link you tapped. Check it against what you were sent, then join.'
            : 'Six characters, from whoever runs the squad. Dashes and spaces are fine.'}
        </Text>

        {notice && <Text style={styles.notice}>{notice}</Text>}

        <TextInput
          value={code}
          onChangeText={setCode}
          // Not when the code arrived from a link: the keyboard would cover
          // the squad preview, which is the whole reason to confirm rather
          // than auto-submit.
          autoFocus={!initialCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          // Room for the dashes and spaces normalizeInviteCode strips, so a
          // code typed as `AB1-2CD` is not cut off mid-entry.
          maxLength={INVITE_CODE_LENGTH + 4}
          // Instruction, not example — and the one field where the example was
          // actively misleading: "AB12CD" is a well-formed code, so it read as
          // a code already pasted in, next to a disabled Join button. This says
          // what to type instead of showing something that looks typed.
          placeholder={`${INVITE_CODE_LENGTH}-character code`}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
          // The field's only visible name is the eyebrow and the title two
          // lines up, which a screen reader reaches as separate elements
          // before it ever gets here — so unlabelled it announces as "text
          // field, AB12CD" and the placeholder reads as a value already
          // entered.
          accessibilityLabel="Squad invite code"
          accessibilityHint={`${INVITE_CODE_LENGTH} characters, letters and numbers`}
          // The field is the whole form and it is autofocused, so a cap here
          // is what keeps the code visible as it is typed rather than
          // scrolling out of a fixed-height box.
          maxFontSizeMultiplier={1.4}
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
  // Muted, not `damage`: nothing has failed, the link just carried nothing to
  // fill in. Red here would read as an error the user caused.
  notice: { color: colors.muted, ...font.body.body, marginTop: space.md, lineHeight: 20 },
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
