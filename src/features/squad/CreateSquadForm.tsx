import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DEFAULT_SQUAD_PROGRAM, type SquadProgram } from '@kairo/core';
import { useCreateSquad } from './mutations.ts';
import { PROGRAM_OPTIONS, programNote } from './program-copy.ts';
import { track } from '@/features/telemetry/events.ts';
import { colors, font, radius, space } from '@/theme.ts';
import { BackRow, Button, Label } from '@/ui/index.ts';

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
  const [program, setProgram] = useState<SquadProgram>(DEFAULT_SQUAD_PROGRAM);

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
          small screen once the keyboard is up, and the gym note has to stay
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
          placeholder="Barangay Runners"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
        />

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
  programSelected: { borderColor: colors.accent },
  programLabel: { color: colors.text, fontSize: 15, fontFamily: 'Figtree-Bold' },
  programLabelSelected: { color: colors.accent },
  programBlurb: { color: colors.subtle, fontSize: 12, marginTop: 2 },
  note: { color: colors.muted, fontSize: 12, marginTop: space.md, lineHeight: 18 },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm, lineHeight: 22 },
  input: {
    marginTop: space.lg,
    // Explicitly zero, not omitted. React Native recycles native text inputs,
    // and only applies properties that are *present* — so after Join → Back →
    // Create the recycled view kept `JoinSquadForm`'s `letterSpacing: 8` and
    // truncated this field's placeholder. An omitted property is not a reset.
    letterSpacing: 0,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    color: colors.text,
    fontSize: 28,
    fontFamily: 'Figtree-Bold',
    paddingVertical: space.sm,
  },
  error: { color: colors.damage, ...font.body.body, marginTop: space.md },
  actions: { paddingBottom: space.xl },
});
