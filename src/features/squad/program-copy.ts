import {
  PROGRAM_BOOST_MULTIPLIER,
  SQUAD_PROGRAMS,
  boostedStatFor,
  type SquadProgram,
} from '@kairo/core';

/**
 * How a squad's program is described to people. One module because three
 * surfaces say it — the create form, the join confirmation and the board header
 * — and a program that reads as three different games is worse than no program
 * at all.
 */
export type ProgramOption = {
  value: SquadProgram;
  label: string;
  /** What the squad is actually competing on. */
  blurb: string;
};

/**
 * Focused programs first. All-around is the default the database applies, but
 * leading with it in the UI would make it the answer most founders pick by
 * inertia — and the beta needs squads on each program to answer §15's
 * per-program risk question at all.
 */
export const PROGRAM_OPTIONS: readonly ProgramOption[] = [
  { value: 'running', label: 'Running', blurb: 'Distance and pace count for more' },
  { value: 'gym', label: 'Gym', blurb: 'Strength and effort count for more' },
  { value: 'walking', label: 'Walking', blurb: 'Steps and active hours count for more' },
  {
    value: 'all_around',
    label: 'All-around',
    blurb: 'A bit of everything — every stat weighs the same',
  },
];

export function programLabel(program: SquadProgram | undefined): string {
  if (!program) return 'All-around';
  return PROGRAM_OPTIONS.find((o) => o.value === program)?.label ?? 'All-around';
}

/**
 * The boost, said out loud — e.g. `AGI ×1.5`. Null on an untilted board.
 *
 * This has to be visible on the user's own row. The character screen shows the
 * **unweighted** own-day total (stored scores are program-independent), so a
 * squadmate comparing the two numbers will find them different. Explaining the
 * gap costs one chip; hiding it costs trust in the score.
 */
export function boostChipLabel(program: SquadProgram | undefined): string | null {
  const stat = program ? boostedStatFor(program) : null;
  return stat === null ? null : `${stat} ×${PROGRAM_BOOST_MULTIPLIER}`;
}

/**
 * The honest-capability rule, applied where it bites hardest. STR comes from
 * estimated active energy, which a phone in a pocket measures poorly during a
 * lifting session — so a gym squad founded on phones alone may feel dead. Say
 * it at the moment the choice is made, not in a support article.
 */
export const GYM_ACCURACY_NOTE =
  'Gym tracking is most accurate with a watch or band.';

export function programNote(program: SquadProgram): string | null {
  return program === 'gym' ? GYM_ACCURACY_NOTE : null;
}

/** Every program the core declares. Asserted by `program-copy.test.ts`. */
export const PROGRAM_OPTION_VALUES: readonly SquadProgram[] = PROGRAM_OPTIONS.map(
  (o) => o.value,
);

export { SQUAD_PROGRAMS };
