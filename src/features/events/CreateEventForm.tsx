import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays, bossHp, type EventDifficulty } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { BackRow, Button, Label, Text } from '@/ui/index.ts';
import { useCreateEvent } from './mutations.ts';
import { useSquadKcalHistory } from './queries.ts';
import { shortDate } from './event-copy.ts';

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 280;

/**
 * The windows offered, in days, plus a date picker behind `Custom`.
 *
 * Shorter than the Goal form's list on purpose: a Battle is a fight, and a
 * year-long one is a bar that fills so slowly nobody looks at it. The picker is
 * still there for a squad that wants a specific date to aim at.
 */
const WINDOWS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
] as const;

const DIFFICULTIES: readonly { value: EventDifficulty; label: string; note: string }[] = [
  { value: 'skirmish', label: 'Skirmish', note: 'A warm-up' },
  { value: 'standard', label: 'Standard', note: 'Keep doing what you do' },
  { value: 'raid', label: 'Raid', note: 'Everyone has to push' },
];

/** The calendar day a `Date` falls on, in the device's own zone. */
function isoDateOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A `YYYY-MM-DD` back as a local `Date`, for seeding the picker. */
function dateOfIso(localDate: string): Date {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Thousands separators, matching `event-copy.ts` rather than the device locale. */
function num(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Start a battle.
 *
 * **Three questions and a computed fourth.** The Goal form asked for a target
 * the user had no way to evaluate before typing it, so the number was arbitrary
 * and missing it read as the algorithm's fault. A boss's HP is derived from the
 * squad's own last fortnight instead, and shown before submitting — which is
 * what makes a snapshotted number legible rather than arbitrary.
 *
 * `EVENT_DIFFICULTIES`' multipliers are deliberately **not printed**. They are
 * the engine's, and 0.85 on a screen invites a squad to reason about the formula
 * instead of about the fight.
 *
 * Adventure is deferred (spec §11), so kind is always `battle` and the metric
 * follows from it. Both are sent explicitly: `create_event` has no defaults.
 */
export function CreateEventForm({
  userId,
  today,
  squadId,
  memberCount,
  onDone,
  onCancel,
}: {
  userId: string | undefined;
  /** The user's own local date — the window starts today, in their timezone. */
  today: string;
  squadId: string;
  /** The roster the boss is scaled against, so a floor squad still gets a fight. */
  memberCount: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createEvent = useCreateEvent(userId);
  const history = useSquadKcalHistory(squadId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<EventDifficulty>('standard');
  const [span, setSpan] = useState<'preset' | 'custom'>('preset');
  const [presetDays, setPresetDays] = useState<number>(7);
  const [customEnd, setCustomEnd] = useState<string>(() => addDays(today, 6));
  const [pickerOpen, setPickerOpen] = useState(false);

  const endsOn = span === 'custom' ? customEnd : addDays(today, presetDays - 1);

  const windowDays = useMemo(() => {
    const from = Date.parse(`${today}T00:00:00Z`);
    const to = Date.parse(`${endsOn}T00:00:00Z`);
    return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
  }, [today, endsOn]);

  /**
   * The boss's HP, **snapshotted here and never recomputed** (deviation #49).
   *
   * `history.data` is undefined while the query is in flight, and `undefined`
   * propagates rather than falling back to 0 on purpose: a fallback would apply
   * the floor and set a boss far easier than the squad's own history warrants,
   * permanently, with nothing on screen to notice. The submit button below is
   * disabled until this resolves.
   */
  const target =
    history.data === undefined
      ? undefined
      : bossHp({
          pooledMedianDaily: history.data,
          windowDays,
          members: Math.max(1, memberCount),
          difficulty,
        });

  const titleOk = title.trim().length >= 1 && title.trim().length <= TITLE_MAX;
  const windowOk = endsOn >= today;
  const valid = titleOk && windowOk && target !== undefined;

  /**
   * Why the button is off, in the order the user would hit them.
   *
   * A disabled pill at 45% opacity says "no" and nothing else. Naming the
   * missing piece is the difference between a form that looks broken and one
   * that looks unfinished — and here the most common reason is a query still in
   * flight, which the user cannot fix and should not be blamed for.
   */
  const blocker = valid
    ? null
    : !titleOk
      ? 'Name the boss first.'
      : !windowOk
        ? 'Pick an end date that is not in the past.'
        : history.isError
          ? 'Could not read your squad’s recent days. Try again in a moment.'
          : 'Working out how strong it should be…';

  // isPending flips through TanStack's notifyManager on a setTimeout(fn, 0), not
  // synchronously with mutate() — so a keyboard "Done" and an already-queued
  // touch in the same tick both read the previous render's false. Same guard as
  // CreateGoalForm had, for the same bug.
  const submitting = useRef(false);

  function submit() {
    if (!valid || target === undefined || submitting.current) return;
    submitting.current = true;
    createEvent.mutate(
      {
        title,
        description,
        kind: 'battle',
        metric: 'active_kcal',
        target,
        startsOn: today,
        endsOn,
        squadId,
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
      {/* Outside the ScrollView: a back control that scrolls away is one the
          user has to scroll up to reach. */}
      <BackRow onPress={onCancel} />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Label tone="sage">NEW BATTLE</Label>
        <Text style={styles.heading}>What are you all fighting?</Text>

        <TextInput
          maxFontSizeMultiplier={1.4}
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Name the boss"
          placeholderTextColor={ramp.neutral[500]}
          maxLength={TITLE_MAX}
          returnKeyType="next"
          accessibilityLabel="Battle name"
        />

        {/* The "why" under the "what". Optional, and said to be — an unlabelled
            second box reads as another required field. */}
        <Text style={styles.section}>Why it matters (optional)</Text>
        <TextInput
          maxFontSizeMultiplier={1.4}
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What this is for, or what it looks like when you win"
          placeholderTextColor={ramp.neutral[500]}
          maxLength={DESCRIPTION_MAX}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel="Battle description"
        />

        <Text style={styles.section}>How long</Text>
        <View style={styles.row}>
          {WINDOWS.map((w) => (
            <Choice
              key={w.days}
              label={w.label}
              selected={span === 'preset' && presetDays === w.days}
              onPress={() => {
                setSpan('preset');
                setPresetDays(w.days);
              }}
            />
          ))}
          <Choice
            label="Pick a date"
            selected={span === 'custom'}
            onPress={() => {
              setSpan('custom');
              setPickerOpen(true);
            }}
          />
        </View>

        {span === 'custom' && (
          <View style={styles.picker}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change the end date"
              onPress={() => setPickerOpen((open) => !open)}
              style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
            >
              <Text style={styles.pickerLabel}>Ends</Text>
              <Text style={styles.pickerValue}>{shortDate(customEnd, today)}</Text>
            </Pressable>

            {pickerOpen && (
              <DateTimePicker
                value={dateOfIso(customEnd)}
                mode="date"
                display="inline"
                // The window cannot end before it starts, and it starts today.
                minimumDate={dateOfIso(today)}
                onValueChange={(_event, picked) => {
                  if (Platform.OS !== 'ios') setPickerOpen(false);
                  // `isoDateOf`, not `toISOString()`: the latter is UTC, so a
                  // date picked in Manila after 08:00 would be stored as the
                  // day before.
                  if (picked) setCustomEnd(isoDateOf(picked));
                }}
                onDismiss={() => {
                  if (Platform.OS !== 'ios') setPickerOpen(false);
                }}
              />
            )}
          </View>
        )}

        <Text style={styles.section}>How hard</Text>
        {/* Column, not a row. Three labelled choices with notes could not fit
            side by side past about 1.3x Dynamic Type — the permission sheet's
            2026-08-17 lesson in a new place. */}
        <View style={styles.column}>
          {DIFFICULTIES.map((d) => (
            <Choice
              key={d.value}
              label={d.label}
              note={d.note}
              selected={difficulty === d.value}
              onPress={() => setDifficulty(d.value)}
            />
          ))}
        </View>

        {/* The computed fourth answer, shown before committing to it. The first
            clause is `challenge-copy.ts`'s, for the same reason: it is what
            makes a derived number legible rather than arbitrary.

            The second clause is **not** borrowed, and the difference is
            deviation #49. A Challenge says "so it moves as you do" because its
            target really is re-derived on every read; a boss's HP is
            snapshotted, so the same sentence beside a fixed number would
            promise the one thing this screen must not — a bar that rises
            mid-fight. Saying which half moves is the only way to keep the
            legibility without the lie. */}
        <View
          accessible
          accessibilityLabel={
            target === undefined
              ? 'Working out how strong the boss should be.'
              : `${num(target)} kcal to beat, over ${windowDays} days. Set from your squad’s last two weeks. Fixed once you start; the next one moves as you do.`
          }
          style={styles.hp}
        >
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.hpValue}
          >
            {target === undefined ? '—' : `${num(target)} kcal`}
          </Text>
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.hpNote}
          >
            Set from your squad’s last two weeks. Fixed once you start — the
            next one moves as you do.
          </Text>
        </View>

        <Text style={styles.window}>
          {`Starts today, ends ${shortDate(endsOn, today)}. Fixed once you set it.`}
        </Text>

        {createEvent.isError && <Text style={styles.error}>{createEvent.error.message}</Text>}
      </ScrollView>

      {/* Pinned. Everything above scrolls; the one action does not. */}
      <View style={styles.footer}>
        {blocker !== null && <Text style={styles.blocker}>{blocker}</Text>}
        <Button
          label="Start the battle"
          variant="primary"
          disabled={!valid}
          busy={createEvent.isPending}
          onPress={submit}
        />
      </View>
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
  body: { paddingBottom: space.lg, gap: space.sm },
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
  // Body face, not the display one: a paragraph set in Caprasimo is unreadable
  // past a few words, and this field is the only place the user writes prose.
  multiline: { ...font.body.body, fontSize: 15, minHeight: 84, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  column: { gap: space.sm },
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
  picker: { marginTop: space.sm },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pickerLabel: { ...font.body.strong, fontSize: 13, color: ramp.neutral[700] },
  pickerValue: { ...font.display.small, fontSize: 16, color: ramp.accent[800] },
  hp: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: ramp.sage[200],
  },
  hpValue: { ...font.display.small, fontSize: 24, color: ramp.sage[900] },
  hpNote: { ...font.body.body, fontSize: 12.5, color: ramp.sage[800], marginTop: 2 },
  window: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: space.sm },
  error: { ...font.body.strong, fontSize: 12.5, color: ramp.accent[900], marginTop: space.sm },
  // A hairline over the footer so the pinned action reads as chrome rather than
  // as the next thing in the list.
  footer: {
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ramp.neutral[200],
  },
  blocker: {
    ...font.body.strong,
    fontSize: 12.5,
    color: ramp.neutral[600],
    textAlign: 'center',
  },
});
