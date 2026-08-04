import { resolveStanding, type StandingRow } from '../character/standing.ts';

export type SquadStanding =
  | { kind: 'unknown' }
  | { kind: 'unranked'; of: number }
  | { kind: 'ranked'; rank: number; of: number; back: number | null };

/**
 * The Squad screen's hero.
 *
 * `back` is the gap to the player immediately above, matching the Character
 * screen's standing line — two different gaps under one word would be worse
 * than either. `of` comes from squad_members, never from the board's length.
 */
export function resolveSquadStanding({
  rows,
  memberCount,
}: {
  rows: readonly StandingRow[] | undefined;
  memberCount: number | undefined;
}): SquadStanding {
  if (rows === undefined || memberCount === undefined) return { kind: 'unknown' };

  const standing = resolveStanding({ hasSquad: true, rows });
  if (standing.kind !== 'ranked') return { kind: 'unranked', of: memberCount };

  return {
    kind: 'ranked',
    rank: standing.rank,
    of: memberCount,
    back: standing.ahead ? standing.ahead.gap : null,
  };
}
