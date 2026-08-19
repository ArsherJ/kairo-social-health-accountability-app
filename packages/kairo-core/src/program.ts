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
 *
 * **One half of that mirror is knowingly incomplete until Phase 3.**
 * `program_weighted_total()` takes `p_agi, p_str, p_end, p_vit, p_rec` and has
 * no `p_mind`, so the `recovery` program's MND boost cannot be expressed in
 * SQL yet — the parameter list changes with the column drop, and doing it here
 * would mean recreating `squad_leaderboard()` in a migration Phase 2 has
 * deliberately not applied. The differential test pins the two sides on
 * everything both can express and says so where it passes MND as 0.
 */

import { CORE_STATS, type CoreStat } from './types.ts';

/**
 * The shared game a squad is playing. Fixed at creation for MVP.
 *
 * `strength` was `gym` until 2026-08-15 (deviation #31). One word for one idea:
 * the Strength challenge measures workout-session calories, and `calisthenics`
 * was rejected because STR rides active calories and cannot tell bodyweight
 * work from weights — a narrower word would promise a distinction the data
 * cannot make.
 */
export type SquadProgram =
  | 'all_around'
  | 'running'
  | 'strength'
  | 'walking'
  | 'recovery';

export const SQUAD_PROGRAMS: readonly SquadProgram[] = [
  'all_around',
  'running',
  'strength',
  'walking',
  'recovery',
];

export const DEFAULT_SQUAD_PROGRAM: SquadProgram = 'all_around';

/**
 * One number, deliberately. A second boost tier would need its own balance
 * argument, and the beta is measuring whether *any* tilt reads as fair.
 */
export const PROGRAM_BOOST_MULTIPLIER = 1.5;

/**
 * The stat each program boosts, or `null` for the untilted default. Keyed by
 * **program**, valued by stat — several programs may name the same stat.
 *
 * `walking` boosted VIT until deviation #41 retired that stat. It boosts AGI
 * now, which is what walking always measured: VIT's hourly-movement signal
 * survives as AGI's spread shift, so a walking squad is still rewarded for
 * spreading its steps — through easier bands rather than through weight.
 * Running and walking therefore boost the same stat and stay separate
 * programs, because they are different games people mean different things by;
 * collapsing them would be a product decision, not a refactor.
 *
 * `recovery` is new and boosts MND. It is the first program a person can play
 * without moving, which is exactly why sleep had to become a stat before it
 * could exist.
 *
 * **The old warning still applies in its new place.** END was never boosted
 * because it rode `AppleExerciseTime`, which may be Watch-only in the wild — a
 * program built on a stat most beta users cannot earn is a program nobody can
 * win. MND has the same shape: it needs a trusted sleep source. What makes
 * `recovery` defensible where an END program was not is normalization — a
 * user who cannot earn MND is scaled up rather than left short — but a
 * recovery *squad* is still only worth founding where its members can track
 * sleep, and §15's per-program risk question now covers it.
 */
const BOOSTED_STAT: Record<SquadProgram, CoreStat | null> = {
  all_around: null,
  running: 'AGI',
  strength: 'STR',
  walking: 'AGI',
  recovery: 'MND',
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
  strength: weightRow('strength'),
  walking: weightRow('walking'),
  recovery: weightRow('recovery'),
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
  /**
   * `daily_scores.rec_points`, which still exists.
   *
   * The REC *bonus* is gone from scoring — deviation #41 promoted sleep to
   * MND, and nothing writes a non-zero value here any more. The field stays
   * because the SQL mirror still sums the column and the differential test
   * compares the two expressions: dropping it on one side only would be a
   * divergence the test cannot see. Phase 3 drops the column, this field, and
   * `program_weighted_total`'s `p_rec` together.
   */
  recBonus: number;
}

/**
 * The number a squad member is ranked on.
 *
 * Only the stats are weighted. The consistency bonus stays universal (§5) — a
 * program tilts what activity is worth, never the reward for showing up on
 * every stat available to you.
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
