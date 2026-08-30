import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { DEFAULT_SQUAD_PROGRAM, type SquadProgram } from '@kairo/core';
import { useCreateSquad } from './mutations.ts';
import { useSquadDataConsent } from './consent.ts';
import { SquadDataConsentSheet } from './SquadDataConsentSheet.tsx';
import { PROGRAM_OPTIONS, programNote } from './program-copy.ts';
import { isValidSquadName, SQUAD_NAME_MAX, squadNameHint } from './squad-name.ts';
import { track } from '@/features/telemetry/events.ts';
import { colors, font, radius, space } from '@/theme.ts';
import { BackRow, Button, Label, Text } from '@/ui/index.ts';

export function CreateSquadForm({
  userId,
  onCancel,
}: {
  userId: string | undefined;
  onCancel: () => void;
}) {
  const createSquad = useCreateSquad(userId);
  const { consented, isSuccess } = useSquadDataConsent(userId);


  const [name, setName] = useState('');
  const [program, setProgram] = useState<SquadProgram>(DEFAULT_SQUAD_PROGRAM);

  const valid = isValidSquadName(name);
  const nameHint = squadNameHint(name);

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
    track(userId, 'squad_program_selected', { program });
    createSquad.mutate(
      { name, program },
      {
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  const busy = createSquad.isPending;

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
      {/* Outside the ScrollView so the way out never scrolls away — this pane
          hides the orbit nav, so it is the only exit visible with the keyboard
          up. Disabled while the create is in flight, like every other control. */}
      <BackRow onPress={onCancel} disabled={busy} />

      {/* Scrollable, not a Panel: the name field plus four programs overflows a
          small screen once the keyboard is up, and the strength note has to stay
          reachable — it is the one piece of copy on this screen written for the
          person who is about to commit their squad to a program. */}
      <ScrollView
        style={styles.top}
        contentContainerStyle={styles.topContent}
        keyboardShouldPersistTaps="handled"
      >
        <Label>CREATE A SQUAD</Label>
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
          accessibilityLabel="Squad name"
          accessibilityHint={`Up to ${SQUAD_NAME_MAX} characters`}
          maxFontSizeMultiplier={1.4}
          // Instruction, not example. "Barangay Runners" read as a name already
          // typed while Create sat disabled — which reads as an app that has
          // stopped responding rather than a form waiting for input.
          placeholder="Name your squad"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accentDeep}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        {/* `maxLength` silently stops accepting characters at the limit — the
            field just goes dead under your thumb with nothing to explain it,
            which is what the QA pass hit reaching for a long name. The counter
            appears only near the ceiling: a permanent 0/30 is noise on a field
            almost nobody fills, and a limit you cannot see coming is the whole
            complaint. Below it, an unarmed Create button gets a reason. */}
        {nameHint !== null && <Text style={styles.nameHint}>{nameHint}</Text>}

        <Text style={styles.sectionLabel}>WHAT IS THIS SQUAD PLAYING?</Text>
        <Text style={styles.sectionHelp}>
          The program boosts one stat for everyone on this board. It cannot be
          changed later.
        </Text>

        {/* Above the picker, not below it: the note is conditional, and where it
            used to sit it rendered below the fold at the moment Gym was tapped
            — so the person it is written for was the one person who never saw
            it. The honest-capability rule only serves the choice if it is
            visible while the choice is being made. On the other three programs
            the note is empty and the layout is unchanged. */}
        {programNote(program) && (
          <Text style={styles.note}>{programNote(program)}</Text>
        )}

        <View style={styles.programs}>
          {PROGRAM_OPTIONS.map((option) => {
            const selected = option.value === program;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: busy }}
                accessibilityLabel={`${option.label}. ${option.blurb}`}
                disabled={busy}
                onPress={() => setProgram(option.value)}
                style={({ pressed }) => [
                  styles.program,
                  selected && styles.programSelected,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={[
                    styles.programLabel,
                    selected && styles.programLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={styles.programBlurb}>{option.blurb}</Text>
              </Pressable>
            );
          })}
        </View>

        {createSquad.error && (
          <Text style={styles.error}>{createSquad.error.message}</Text>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Create" variant="primary" busy={busy} disabled={!valid} onPress={submit} />
        <Button label="Back" variant="ghost" disabled={busy} onPress={onCancel} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  top: { flex: 1 },
  topContent: { paddingBottom: space.lg },
  sectionLabel: { color: colors.muted, ...font.body.label, marginTop: space.xl },
  sectionHelp: {
    color: colors.subtle,
    fontSize: 13,
    marginTop: space.xs,
    lineHeight: 19,
  },
  programs: { gap: space.sm, marginTop: space.md },
  program: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  programSelected: { borderColor: colors.accentDeep },
  programLabel: { color: colors.text, fontSize: 15, fontFamily: font.body.body.fontFamily },
  programLabelSelected: { color: colors.accentDeep },
  programBlurb: { color: colors.subtle, fontSize: 12, marginTop: 2 },
  note: { color: colors.muted, fontSize: 12, marginTop: space.md, lineHeight: 18 },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm, lineHeight: 22 },
  nameHint: { color: colors.muted, ...font.body.strong, marginTop: space.sm },
  input: {
    marginTop: space.lg,
    // Explicitly zero, not omitted. React Native recycles native text inputs,
    // and only applies properties that are *present* — so after Join → Back →
    // Create the recycled view kept `JoinSquadForm`'s `letterSpacing: 8` and
    // truncated this field's placeholder. An omitted property is not a reset.
    letterSpacing: 0,
    borderBottomWidth: 2,
    borderBottomColor: colors.accentDeep,
    color: colors.text,
    fontSize: 28,
    fontFamily: font.body.body.fontFamily,
    paddingVertical: space.sm,
  },
  error: { color: colors.damage, ...font.body.body, marginTop: space.md },
  actions: { paddingBottom: space.xl },
});
