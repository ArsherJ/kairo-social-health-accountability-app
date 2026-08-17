import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays, goalWindowDays } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { BackRow, Button, Label, Text } from '@/ui/index.ts';
import { useCreateGoal } from './mutations.ts';
import { shortDate } from './goal-copy.ts';

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 280;

/**
 * The windows offered, in days.
 *
 * These stay as the fast path — most commitments really are "a month" or "a
 * year", and a chip is one tap where a picker is four. **A date picker sits
 * behind `Custom` alongside them**, which overturns this file's original
 * position ("nobody commits to *17* days"). The reasoning that outlived it:
 * an arbitrary end date is the most common way to create a goal whose
 * `required_days` cannot fit its window — so `windowDays` below is derived from
 * whatever end date is chosen, and the same check runs against it either way.
 * The error became reachable again; it did not become unguarded.
 */
const WINDOWS = [
  { days: 7, label: '1 week' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 365, label: '1 year' },
] as const;

type Kind = 'cumulative' | 'consistency';

/** How the end of the window is being chosen. */
type Span = 'preset' | 'custom' | 'open';

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

/**
 * Set a target.
 *
 * Two kinds, because "walk 1,000 km by March" and "be good 25 days out of 30"
 * are different commitments and the app should not make somebody express one as
 * the other. The daily bar and the day count are the same field in the schema
 * (`target` / `required_days`), and this screen is where the difference is made
 * legible.
 *
 * The submit button is **pinned**, not the last thing in the scroll. Picking
 * "Most days" adds two fields, which pushed it off the bottom of the screen —
 * hand-testing read that as the form having no submit at all. A footer also
 * gives the disabled state somewhere to explain itself, which matters more here
 * than usual: the button spends most of its life disabled on a target that has
 * not been typed yet.
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
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Kind>('cumulative');
  const [span, setSpan] = useState<Span>('preset');
  const [presetDays, setPresetDays] = useState<number>(30);
  const [customEnd, setCustomEnd] = useState<string>(() => addDays(today, 29));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [requiredDays, setRequiredDays] = useState('');

  // Open-ended is cumulative-only (`goals_consistency_needs_end`), so switching
  // to "Most days" while it is selected has to move the choice rather than let
  // the form sit in a state the server will refuse.
  useEffect(() => {
    if (kind === 'consistency' && span === 'open') setSpan('preset');
  }, [kind, span]);

  const endsOn = useMemo(() => {
    if (span === 'open') return null;
    if (span === 'custom') return customEnd;
    return addDays(today, presetDays - 1);
  }, [span, customEnd, today, presetDays]);

  // Through `goalWindowDays` rather than a second date subtraction here: it is
  // the tested implementation, and the number this validates against has to be
  // the same one the server's trigger measures.
  const windowDays = goalWindowDays({
    id: 'draft',
    // `goalWindowDays` reads only the two dates, so the metric here is inert —
    // it is present because `Goal` requires it, not because it is consulted.
    metric: 'daily_score',
    kind,
    target: 0,
    requiredDays: null,
    startsOn: today,
    endsOn,
  });

  const targetNumber = Number.parseInt(target, 10);
  const daysNumber = Number.parseInt(requiredDays, 10);

  const titleOk = title.trim().length >= 1 && title.trim().length <= TITLE_MAX;
  const targetOk = Number.isFinite(targetNumber) && targetNumber > 0;
  const windowOk = endsOn === null || endsOn >= today;
  // Mirrors the goals_validate trigger. Checking it here means the common
  // mistake is caught before a round trip, not that the server stops checking.
  const daysOk =
    kind === 'cumulative' ||
    (windowDays !== null &&
      Number.isFinite(daysNumber) &&
      daysNumber > 0 &&
      daysNumber <= windowDays);

  const valid = titleOk && targetOk && windowOk && daysOk;

  /**
   * Why the button is off, in the order the user would hit them.
   *
   * A disabled pill at 45% opacity says "no" and nothing else, and the most
   * common reason by far is a target that has not been typed. Naming the
   * missing piece is the difference between a form that looks broken and one
   * that looks unfinished.
   */
  const blocker = valid
    ? null
    : !titleOk
      ? 'Name it first.'
      : !targetOk
        ? kind === 'cumulative'
          ? 'Add a points target.'
          : 'Add the points to clear each day.'
        : !windowOk
          ? 'Pick an end date that is not in the past.'
          : windowDays !== null && requiredDays.length > 0
            ? `Days must be between 1 and ${windowDays} — the length of the window.`
            : 'Say how many days you need to clear it.';

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
        description,
        kind,
        // Replaced by the form's own choice in the next commit. Until then the
        // form can only produce the metric it could always produce.
        metric: 'daily_score',
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
      {/* Outside the ScrollView: a back control that scrolls away is one the
          user has to scroll up to reach. */}
      <BackRow onPress={onCancel} />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Label>{squadId ? 'NEW SQUAD GOAL' : 'NEW GOAL'}</Label>
        <Text style={styles.heading}>
          {squadId ? 'What are you all going for?' : 'What are you going for?'}
        </Text>

        <TextInput
          maxFontSizeMultiplier={1.4}
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Name it"
          placeholderTextColor={ramp.neutral[500]}
          maxLength={TITLE_MAX}
          returnKeyType="next"
          accessibilityLabel="Goal name"
        />

        {/* The "why" under the "what". Optional, and said to be — an unlabelled
            second box reads as another required field. */}
        <Text style={styles.section}>Why it matters (optional)</Text>
        <TextInput
          maxFontSizeMultiplier={1.4}
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What this is for, or what it looks like when you get there"
          placeholderTextColor={ramp.neutral[500]}
          maxLength={DESCRIPTION_MAX}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel="Goal description"
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
          maxFontSizeMultiplier={1.4}
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
              maxFontSizeMultiplier={1.4}
              style={styles.input}
              value={requiredDays}
              onChangeText={setRequiredDays}
              placeholder={windowDays === null ? '24' : String(Math.round(windowDays * 0.8))}
              placeholderTextColor={ramp.neutral[500]}
              keyboardType="number-pad"
              accessibilityLabel="Days required"
            />
          </>
        )}

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
          {/* Hidden rather than disabled under "Most days": a greyed choice
              invites a tap that has to then be explained, and the reason is
              structural rather than temporary. */}
          {kind === 'cumulative' && (
            <Choice
              label="No end date"
              note="Until you get there"
              selected={span === 'open'}
              onPress={() => setSpan('open')}
            />
          )}
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
                // Bounding the picker is what keeps `goals_window_ordered` from
                // being something the user can trip over.
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

        <Text style={styles.window}>
          {endsOn === null
            ? 'Starts today, runs until you hit it. No deadline.'
            : `Starts today, ends ${shortDate(endsOn, today)}. Fixed once you set it.`}
        </Text>

        {createGoal.isError && <Text style={styles.error}>{createGoal.error.message}</Text>}
      </ScrollView>

      {/* Pinned. Everything above scrolls; the one action does not. */}
      <View style={styles.footer}>
        {blocker !== null && <Text style={styles.blocker}>{blocker}</Text>}
        <Button
          label="Set the goal"
          variant="primary"
          disabled={!valid}
          busy={createGoal.isPending}
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
