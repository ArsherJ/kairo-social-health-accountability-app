/**
 * Squad programs and personal focus (roadmap deviation #12).
 *
 * A squad carries a **program**: the shared game it is playing. A program
 * boosts exactly one stat, and it does so at **read time only** — deviation
 * #11. `daily_scores` stores base, pre-multiplier points; the leaderboard
 * decides what they are worth. That is what lets one Legendary user sit in
 * three squads with three different programs and get three honest views of the
 * same stored rows, and what makes a program change unable to corrupt data.
 *
 * The weights below are duplicated in SQL, in `squad_leaderboard()` — a
 * migration cannot import TypeScript (the `FREE_SQUAD_MAX_MEMBERS` precedent in
 * `squad.ts`). Both sides carry a cross-reference comment, and a differential
 * test in the schema suite asserts the two agree on fixture days, the same way
 * `finalizable_days()` and `isFinalizable()` are kept honest.
 */

import { CORE_STATS, type CoreStat } from './types.ts';

/** The shared game a squad is playing. Fixed at creation for MVP. */
export type SquadProgram = 'all_around' | 'running' | 'gym' | 'walking';

export const SQUAD_PROGRAMS: readonly SquadProgram[] = [
  'all_around',
  'running',
  'gym',
  'walking',
];

export const DEFAULT_SQUAD_PROGRAM: SquadProgram = 'all_around';

/**
 * One number, deliberately. A second boost tier would need its own balance
 * argument, and the beta is measuring whether *any* tilt reads as fair.
 */
export const PROGRAM_BOOST_MULTIPLIER = 1.5;

/**
 * The stat each program boosts, or `null` for the untilted default.
 *
 * **END is never boosted, on purpose.** It rides `AppleExerciseTime`, which may
 * be Watch-only in the wild (Phase 3's open risk). A program built on a stat
 * most beta users cannot earn is a program nobody can win.
 */
const BOOSTED_STAT: Record<SquadProgram, CoreStat | null> = {
  all_around: null,
  running: 'AGI',
  gym: 'STR',
  walking: 'VIT',
};

export function boostedStatFor(program: SquadProgram): CoreStat | null {
  return BOOSTED_STAT[program];
}

function weightRow(program: SquadProgram): Record<CoreStat, number> {
  const boosted = BOOSTED_STAT[program];
  const row = {} as Record<CoreStat, number>;
  for (const stat of CORE_STATS) {
    row[stat] = stat === boosted ? PROGRAM_BOOST_MULTIPLIER : 1;
  }
  return row;
}

/** Read-time multiplier per (program, stat). Mirrored in SQL — see the header. */
export const PROGRAM_WEIGHTS: Record<SquadProgram, Record<CoreStat, number>> = {
  all_around: weightRow('all_around'),
  running: weightRow('running'),
  gym: weightRow('gym'),
  walking: weightRow('walking'),
};

export function programWeight(program: SquadProgram, stat: CoreStat): number {
  return PROGRAM_WEIGHTS[program][stat];
}

export function isSquadProgram(value: unknown): value is SquadProgram {
  return (
    typeof value === 'string' &&
    (SQUAD_PROGRAMS as readonly string[]).includes(value)
  );
}

export interface WeightedBoardInput {
  program: SquadProgram;
  /** Stored, **base** per-stat points — never post-multiplier. */
  statPoints: Record<CoreStat, number>;
  consistencyBonus: number;
  recBonus: number;
}

/**
 * The number a squad member is ranked on.
 *
 * Only the four stats are weighted. The consistency bonus and REC stay
 * universal (§5) — a program tilts what activity is worth, never the reward for
 * showing up on all four stats or for sleeping.
 *
 * The zero floor is unreachable now that every term is non-negative. It stays
 * because the SQL mirror keeps its `greatest(0, …)`, and the differential test
 * compares the two expressions — divergence here would be a difference the test
 * cannot see.
 */
export function weightedBoardTotal(input: WeightedBoardInput): number {
  let weighted = 0;
  for (const stat of CORE_STATS) {
    weighted += input.statPoints[stat] * programWeight(input.program, stat);
  }

  const total = Math.round(weighted) + input.consistencyBonus + input.recBonus;

  return Math.max(0, total);
}
