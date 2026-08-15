/**
 * How far each row sits behind the one above it.
 *
 * The board stopped printing absolute totals (see
 * `docs/superpowers/specs/2026-08-15-points-stop-being-spoken-design.md`), so a
 * relative figure is what carries "am I catchable today". Pure and tested here
 * rather than inline in the component because ties are the edge that reads as
 * obviously right and is wrong: `squad_leaderboard` shares a rank between tied
 * members, so "the row above" is not "the previous array element".
 */
export interface GapRow {
  user_id: string;
  rank: number;
  total: number;
}

export function leaderboardGaps(
  rows: readonly GapRow[],
): Map<string, number | null> {
  // Sorted rather than trusted: the caller's order is a render order, and this
  // has to be right even if that changes.
  const ordered = [...rows].sort((a, b) => a.rank - b.rank || b.total - a.total);

  const gaps = new Map<string, number | null>();

  // The row immediately above, not the leader. "600 behind" when the person
  // one place ahead is 600 up is actionable; the same row measured against a
  // runaway leader would read as hopeless and say nothing about the place you
  // are actually contesting. This is the same choice `resolveStanding` already
  // made for the character screen's own standing line.
  //
  // Sorted descending by total within a rank, so `previous` is always >= the
  // current row and the subtraction cannot go negative. A tie yields 0.
  let previous: number | null = null;

  for (const row of ordered) {
    gaps.set(row.user_id, previous === null ? null : previous - row.total);
    previous = row.total;
  }

  return gaps;
}
