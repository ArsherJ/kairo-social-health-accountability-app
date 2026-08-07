import { USER_FOCUSES, type UserFocus } from '@kairo/core';

/**
 * The focus question's copy, in one place because two screens ask it — the
 * onboarding step and the Profile edit row — and they must not drift.
 *
 * The order leads with the three specific answers and puts "a bit of
 * everything" last: a question whose first option is "no preference" is a
 * question most people answer with "no preference".
 */
export type FocusOption = {
  value: UserFocus;
  label: string;
  /** One line under the label. Says what Kairo will do, not what you must do. */
  blurb: string;
};

export const FOCUS_OPTIONS: readonly FocusOption[] = [
  { value: 'running', label: 'Running', blurb: 'Distance and pace lead the way' },
  { value: 'gym', label: 'Gym', blurb: 'Strength sessions and effort' },
  { value: 'walking', label: 'Walking', blurb: 'Steps and staying on your feet' },
  { value: 'general', label: 'A bit of everything', blurb: 'No single lane' },
];

/**
 * The promise the screen has to make out loud, because the honest answer to
 * "does this change my score?" is no. Focus changes what Kairo highlights; the
 * squad's program is the thing that changes points, and you consent to that
 * when you join a squad.
 */
export const FOCUS_RULE_COPY =
  'Every stat still counts — focus changes what Kairo highlights for you, not the score.';

export function focusLabel(focus: UserFocus | null): string {
  if (focus === null) return 'Not set';
  return FOCUS_OPTIONS.find((o) => o.value === focus)?.label ?? 'Not set';
}

/** Every focus the core declares has copy. Asserted by `focus-options.test.ts`. */
export const FOCUS_OPTION_VALUES: readonly UserFocus[] = FOCUS_OPTIONS.map(
  (o) => o.value,
);

export { USER_FOCUSES };
