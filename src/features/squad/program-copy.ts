import {
  PROGRAM_BOOST_MULTIPLIER,
  SQUAD_PROGRAMS,
  boostedStatFor,
  type SquadProgram,
} from '@kairo/core';

// Relative, and not `@/ui/index.ts`, for two separate reasons — this module is
// tested by root Vitest, which has neither the `@/` alias nor a parser for
// React Native's Flow syntax, and the barrel re-exports every component. The
// same double constraint is why `event-copy.ts` reaches `kairo-core` by path.
import { STAT_NAMES } from '../../ui/stat-names.ts';

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
 *
 * **A program's name is not a stat's name.** `strength` stays "Strength" and
 * `running` stays "Running" — those name the *game the squad is playing*, and
 * renaming them alongside the stats (deviation #51) would be a second,
 * unrequested change to a concept members already consented to. What each blurb
 * must do is name the stat it weights in the player's current vocabulary, which
 * is why "Strength and effort count for more" is now wrong and "Body and effort"
 * is right.
 */
export const PROGRAM_OPTIONS: readonly ProgramOption[] = [
  { value: 'running', label: 'Running', blurb: 'Motion counts for more — distance and pace' },
  {
    value: 'strength',
    label: 'Strength',
    blurb: 'Body counts for more — effort and active calories',
  },
  { value: 'walking', label: 'Walking', blurb: 'Motion counts for more — steps and active hours' },
  {
    value: 'recovery',
    label: 'Recovery',
    blurb: 'Mind counts for more — the one game you win by resting',
  },
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
 * The boost, said out loud — e.g. `Motion ×1.5`. Null on an untilted board.
 *
 * This is **program information**: what game this squad is playing. It lives on
 * the board header, next to the program name.
 *
 * It used to sit on the user's own row instead, to explain why that row's total
 * differed from the character screen's unweighted one. Neither total is rendered
 * any more (see
 * `docs/superpowers/specs/2026-08-15-points-stop-being-spoken-design.md`), so
 * there are no two numbers left to reconcile and the row's copy was removed.
 *
 * It also used to print the raw `CoreStat` key, which was the last surface in
 * the app showing an engine name to a player — and the one a rename would most
 * obviously have missed, because it never contained a stat *word* to grep for.
 * `STAT_NAMES` is the one table of stat words (deviation #51) and this reads it
 * rather than inventing a shorter one: a chip is not a reason for a second
 * vocabulary.
 */
export function boostChipLabel(program: SquadProgram | undefined): string | null {
  const stat = program ? boostedStatFor(program) : null;
  return stat === null ? null : `${STAT_NAMES[stat]} ×${PROGRAM_BOOST_MULTIPLIER}`;
}

/**
 * The honest-capability rule, applied where it bites hardest. Body (STR) comes from
 * estimated active energy, which a phone in a pocket measures poorly during a
 * lifting session — so a strength squad founded on phones alone may feel dead.
 * Say it at the moment the choice is made, not in a support article.
 */
export const STRENGTH_ACCURACY_NOTE =
  'Strength tracking is most accurate with a watch or band.';

/**
 * The same rule, and the sharper case of it. Recovery weights Mind, which a
 * phone cannot measure at all — it needs a sleep-tracking device or app. A
 * member without one is not scored *down* for it (their day scales to the same
 * ceiling), but the squad's tilt buys them nothing, so a recovery squad
 * founded on phones alone is an all-around squad with extra words.
 */
export const RECOVERY_ACCURACY_NOTE =
  'Recovery needs a sleep tracker — a watch, a band, or a sleep app.';

export function programNote(program: SquadProgram): string | null {
  if (program === 'strength') return STRENGTH_ACCURACY_NOTE;
  if (program === 'recovery') return RECOVERY_ACCURACY_NOTE;
  return null;
}

/** Every program the core declares. Asserted by `program-copy.test.ts`. */
export const PROGRAM_OPTION_VALUES: readonly SquadProgram[] = PROGRAM_OPTIONS.map(
  (o) => o.value,
);

export { SQUAD_PROGRAMS };
