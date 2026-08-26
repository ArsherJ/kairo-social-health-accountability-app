import { rankRacers } from './core.ts';

/**
 * The race-snapshot half of `finalize-days`, kept free of I/O so it can be
 * tested in plain Node with no Deno, no Docker and no database.
 *
 * Nothing here re-implements the ranking — `rankRacers()` in `@kairo/core` is
 * the single implementation, and the client's live track calls the same
 * function. A second ordering here would mean the history disagreed with the
 * board everybody watched all day, which is the one thing a snapshot exists to
 * prevent.
 */

export interface StandingRow {
  user_id: string;
  rank: number;
  capped_steps: number;
  species: string | null;
}

/**
 * Whether every member of the squad has finalized that local date.
 *
 * Days are per-user local (§2), so a squad spans several calendar dates at any
 * instant and its race for date *D* is not final until every member's *D* is.
 * Writing on the first member's finalization would crown whoever's timezone
 * happens to be furthest west.
 *
 * An empty roster is **false**, not vacuously true: `every` over an empty list
 * is true, which would write an empty standings row and permanently occupy the
 * primary key for a squad nobody is in — and the row is write-once, so nothing
 * would ever correct it.
 */
export function squadDayIsComplete(input: {
  members: readonly string[];
  finalUserIds: readonly string[];
}): boolean {
  if (input.members.length === 0) return false;
  const final = new Set(input.finalUserIds);
  return input.members.every((id) => final.has(id));
}

/**
 * The board, as a stored standing.
 *
 * `steps` may be null — that is a member who has not consented, as
 * `squad_leaderboard()` withholds it. They read as **zero rather than absent**:
 * a member who has not shared their figure still ran the race and still belongs
 * in the history, and dropping them would make the stored result disagree with
 * the board their squad watched. Their stored `capped_steps` of 0 is then
 * withheld again on the way out by `race_result()`, so nothing is disclosed by
 * the substitution.
 *
 * Exactly four fields are stored, and the narrowness is deliberate: this JSON
 * is read by every member of the squad, so anything riding along in it is a
 * disclosure `race_result()` has no way to withhold. The character name is
 * joined at read time from `profiles` instead, where a rename follows.
 */
export function buildStandings(
  rows: readonly {
    user_id: string;
    character_name: string;
    species: string | null;
    steps: number | null;
    total: number;
  }[],
): StandingRow[] {
  return rankRacers(
    rows.map((r) => ({
      userId: r.user_id,
      characterName: r.character_name,
      species: r.species,
      steps: r.steps ?? 0,
      total: r.total,
      isSelf: false,
    })),
  ).map((racer) => ({
    user_id: racer.userId,
    rank: racer.rank,
    capped_steps: racer.cappedSteps,
    species: racer.species,
  }));
}
