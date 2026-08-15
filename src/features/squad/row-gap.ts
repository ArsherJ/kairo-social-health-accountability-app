/**
 * How far each row sits behind the one above it.
 *
 * The board stopped printing absolute totals (see
 * `docs/superpowers/specs/2026-08-15-points-stop-being-spoken-design.md`), so a
 * relative figure is what carries "am I catchable today". Pure and tested here
 * rather than inline in the component because ties are the edge that reads as
 * obviously right and is wrong: `squad_leaderboard` shares a rank between tied
 * members, so rank alone cannot order the board.
 *
 * The sort is what makes "the row above" and "the previous array element" the
 * same thing. Rank is the primary key and `total` **descending** is the
 * secondary, so within a shared rank the higher total always lands first — and
 * therefore the element immediately before any row is the best total above it.
 * That is the whole reason a running maximum is not needed here, and the whole
 * reason the secondary sort key is not cosmetic: drop it, and two tied rows in
 * an arbitrary order make the second one's gap negative.
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
  // Sorted descending by total within a rank, so `previous` should always be
  // >= the current row and a tie should yield 0.
  let previous: number | null = null;

  for (const row of ordered) {
    // Clamped anyway. "Should" above is a statement about our sort, not about
    // the data: `squad_leaderboard` computes rank server-side, and a row whose
    // rank disagrees with its total would otherwise render as "−−340" — a
    // typographic accident that reads as neither a number nor an error.
    gaps.set(
      row.user_id,
      previous === null ? null : Math.max(0, previous - row.total),
    );
    previous = row.total;
  }

  return gaps;
}
