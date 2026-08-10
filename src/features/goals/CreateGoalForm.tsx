import { useMemo, useRef, useState } from 'react';
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
import { addDays } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { BackRow, Button, Label } from '@/ui/index.ts';
import { useCreateGoal } from './mutations.ts';
import { shortDate } from './goal-copy.ts';

const TITLE_MAX = 60;

/**
 * The windows offered, in days.
 *
 * A date picker was the obvious build and the wrong one: the spec's own framing
 * is "days, weeks, or years", nobody commits to *17* days, and an arbitrary end
 * date is the single most common way to create a goal whose required_days cannot
 * fit its window. Fixed lengths make that class of error unreachable rather than
 * validated.
 */
const WINDOWS = [
  { days: 7, label: '1 week' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 365, label: '1 year' },
] as const;

type Kind = 'cumulative' | 'consistency';

/**
 * Set a target.
 *
 * Two kinds, because "walk 1,000 km by March" and "be good 25 days out of 30"
 * are different commitments and the app should not make somebody express one as
 * the other. The daily bar and the day count are the same field in the schema
 * (`target` / `required_days`), and this screen is where the difference is made
 * legible.
 */
export function CreateGoalForm({
  userId,
  today,
  squadId,
  onDone,
  onCancel,
}: {
  userId: string | undefined;
  /** The user's own local date — the window starts today, in their timezone. */
  today: string;
  /** Set for a squad goal; the whole squad is frozen onto it at creation. */
  squadId?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createGoal = useCreateGoal(userId);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('cumulative');
  const [windowDays, setWindowDays] = useState<number>(30);
  const [target, setTarget] = useState('');
  const [requiredDays, setRequiredDays] = useState('');

  const endsOn = useMemo(() => addDays(today, windowDays - 1), [today, windowDays]);

  const targetNumber = Number.parseInt(target, 10);
  const daysNumber = Number.parseInt(requiredDays, 10);

  const titleOk = title.trim().length >= 1 && title.trim().length <= TITLE_MAX;
  const targetOk = Number.isFinite(targetNumber) && targetNumber > 0;
  // Mirrors the goals_validate trigger. Checking it here means the common
  // mistake is caught before a round trip, not that the server stops checking.
  const daysOk =
    kind === 'cumulative' ||
    (Number.isFinite(daysNumber) && daysNumber > 0 && daysNumber <= windowDays);

  const valid = titleOk && targetOk && daysOk;

  // isPending flips through TanStack's notifyManager on a setTimeout(fn, 0), not
  // synchronously with mutate() — so a keyboard "Done" and an already-queued
  // touch in the same tick both read the previous render's false. Same guard as
  // CreateSquadForm, for the same bug.
  const submitting = useRef(false);

  function submit() {
    if (!valid || submitting.current) return;
    submitting.current = true;
    createGoal.mutate(
      {
        title,
        kind,
        target: targetNumber,
        startsOn: today,
        endsOn,
        requiredDays: kind === 'consistency' ? daysNumber : null,
        squadId: squadId ?? null,
      },
      {
        onSuccess: onDone,
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.fill}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <BackRow onPress={onCancel} />

        <Label>{squadId ? 'NEW SQUAD GOAL' : 'NEW GOAL'}</Label>
        <Text style={styles.heading}>
          {squadId ? 'What are you all going for?' : 'What are you going for?'}
        </Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Name it"
          placeholderTextColor={ramp.neutral[500]}
          maxLength={TITLE_MAX}
          returnKeyType="next"
          accessibilityLabel="Goal name"
        />

        <Text style={styles.section}>How it counts</Text>
        <View style={styles.row}>
          <Choice
            label="A total"
            note="Add up to a number"
            selected={kind === 'cumulative'}
            onPress={() => setKind('cumulative')}
          />
          <Choice
            label="Most days"
            note="Clear a daily bar"
            selected={kind === 'consistency'}
            onPress={() => setKind('consistency')}
          />
        </View>

        <Text style={styles.section}>
          {kind === 'cumulative' ? 'Points to reach' : 'Points to clear each day'}
        </Text>
        <TextInput
          style={styles.input}
          value={target}
          onChangeText={setTarget}
          placeholder={kind === 'cumulative' ? '60000' : '2500'}
          placeholderTextColor={ramp.neutral[500]}
          keyboardType="number-pad"
          accessibilityLabel={kind === 'cumulative' ? 'Points to reach' : 'Daily points'}
        />

        {kind === 'consistency' && (
          <>
            <Text style={styles.section}>Days you need to clear it</Text>
            <TextInput
              style={styles.input}
              value={requiredDays}
              onChangeText={setRequiredDays}
              placeholder={String(Math.round(windowDays * 0.8))}
              placeholderTextColor={ramp.neutral[500]}
              keyboardType="number-pad"
              accessibilityLabel="Days required"
            />
            {requiredDays.length > 0 && !daysOk && (
              <Text style={styles.hint}>
                Pick a number between 1 and {windowDays} — the length of the window.
              </Text>
            )}
          </>
        )}

        <Text style={styles.section}>How long</Text>
        <View style={styles.row}>
          {WINDOWS.map((w) => (
            <Choice
              key={w.days}
              label={w.label}
              selected={windowDays === w.days}
              onPress={() => setWindowDays(w.days)}
            />
          ))}
        </View>

        <Text style={styles.window}>
          Starts today, ends {shortDate(endsOn, today)}. Fixed once you set it.
        </Text>

        {createGoal.isError && <Text style={styles.error}>{createGoal.error.message}</Text>}

        <Button
          label="Set the goal"
          variant="primary"
          disabled={!valid}
          busy={createGoal.isPending}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({
  label,
  note,
  selected,
  onPress,
}: {
  label: string;
  note?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceOn,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
      {note && <Text style={[styles.choiceNote, selected && styles.choiceNoteOn]}>{note}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // No padding or background here: `Screen` supplies both, the same division
  // CreateSquadForm uses. Setting them in both places double-pads the page and
  // puts BackRow under the status bar.
  fill: { flex: 1 },
  body: { paddingBottom: space.xl, gap: space.sm },
  heading: { ...font.display.small, fontSize: 22, color: colors.text, marginBottom: space.sm },
  section: { ...font.body.strong, fontSize: 12, color: ramp.neutral[700], marginTop: space.md },
  input: {
    ...font.display.minor,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: {
    flexGrow: 1,
    flexBasis: '30%',
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  choiceOn: { backgroundColor: ramp.accent[200] },
  pressed: { opacity: 0.75 },
  choiceLabel: { ...font.display.small, fontSize: 15, color: colors.text },
  choiceLabelOn: { color: ramp.accent[900] },
  choiceNote: { ...font.body.body, fontSize: 12, color: colors.muted, marginTop: 1 },
  choiceNoteOn: { color: ramp.accent[800] },
  window: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: space.sm },
  hint: { ...font.body.strong, fontSize: 12, color: ramp.accent[900] },
  error: { ...font.body.strong, fontSize: 12.5, color: ramp.accent[900], marginTop: space.sm },
});
