/**
 * What the Character screen's standing line says (redesign spec, §5, §7).
 *
 * The row type is a structural subset of `squad_leaderboard`'s output rather
 * than an import from `queries.ts`: that module pulls in `@/lib/supabase.ts`,
 * and vitest resolves neither the alias nor the native client.
 */

export interface StandingRow {
  rank: number;
  character_name: string;
  total: number;
  is_self: boolean;
}

export type Standing =
  /** A query is still in flight. Render nothing — never a guess. */
  | { kind: 'unknown' }
  /** No squad yet. */
  | { kind: 'solo' }
  /** In a squad, but with no scored row today. */
  | { kind: 'unranked' }
  | { kind: 'ranked'; rank: number; ahead: { name: string; gap: number } | null };

export function resolveStanding({
  hasSquad,
  rows,
}: {
  hasSquad: boolean | undefined;
  rows: readonly StandingRow[] | undefined;
}): Standing {
  if (hasSquad === undefined) return { kind: 'unknown' };
  if (!hasSquad) return { kind: 'solo' };
  if (rows === undefined) return { kind: 'unknown' };

  const self = rows.find((r) => r.is_self);
  if (!self) return { kind: 'unranked' };

  // Not `rank - 1`: squad_leaderboard shares a rank between tied members, so
  // the row above may be two ranks up, or may share the caller's own rank.
  const above = rows
    .filter((r) => !r.is_self && r.rank <= self.rank)
    .sort((a, b) => b.rank - a.rank || a.total - b.total)[0];

  return {
    kind: 'ranked',
    rank: self.rank,
    ahead: above
      ? { name: above.character_name, gap: above.total - self.total }
      : null,
  };
}
