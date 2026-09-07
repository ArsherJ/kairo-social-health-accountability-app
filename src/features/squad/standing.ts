import { resolveStanding, type StandingRow } from '../character/standing.ts';
import { ordinal } from './ordinal.ts';

export type SquadStanding =
  | { kind: 'unknown' }
  /**
   * A squad of one. There is no standing to state and nothing to be ahead of,
   * so this carries **no rank and no denominator** — a contract on the shape as
   * much as on the words, so no later edit can reach for one.
   */
  | { kind: 'alone' }
  | { kind: 'unranked'; of: number }
  | { kind: 'ranked'; rank: number; of: number; back: number | null };

/**
 * The Squad screen's hero.
 *
 * `back` is the gap to the player immediately above, matching the Character
 * screen's standing line — two different gaps under one word would be worse
 * than either. `of` comes from squad_members, never from the board's length.
 *
 * **A squad of one is answered before anything else is computed.** The band's
 * leader line was already guarded on two or more rows for this reason — "you
 * are ahead" in a squad of one is the app congratulating somebody for being
 * alone — but this, the second and separate sentence beside it, was not, and
 * read "1st · of 1 · leading" on the tab immediately next to the one that says
 * you have the sky to yourself. The size of the squad, not the board, is what
 * decides it: the RPC reaches `daily_scores` by left join, so a member who has
 * not moved is still a row, and an empty board is still a squad of one.
 */
export function resolveSquadStanding({
  rows,
  memberCount,
}: {
  rows: readonly StandingRow[] | undefined;
  memberCount: number | undefined;
}): SquadStanding {
  if (rows === undefined || memberCount === undefined) return { kind: 'unknown' };
  if (memberCount <= 1) return { kind: 'alone' };

  const standing = resolveStanding({ hasSquad: true, rows });
  if (standing.kind !== 'ranked') return { kind: 'unranked', of: memberCount };

  return {
    kind: 'ranked',
    rank: standing.rank,
    of: memberCount,
    back: standing.ahead ? standing.ahead.gap : null,
  };
}

/**
 * The figure the band leads with, or null when there is none to state.
 *
 * Null for `unknown` because a pending query must never render a claim —
 * nothing beats a placeholder or a dash, both of which state something false.
 * Null for `alone` for the opposite reason: the answer is known and is not a
 * number. The screen reads `SOLO_SKY_OBSERVATION` in its place.
 */
export function standingHero(standing: SquadStanding): string | null {
  switch (standing.kind) {
    case 'unknown':
    case 'alone':
      return null;
    case 'unranked':
      return 'Unranked';
    case 'ranked':
      return ordinal(standing.rank);
  }
}

/**
 * The hero line, sitting *beside* the rank rather than under it.
 *
 * Returned in segments so the gap can carry the emphasis the design puts on
 * it without picking the number back out of a finished sentence with a regex.
 * `back === null` means nobody is ahead; `back === 0` means tied with the row
 * directly above — two different facts that must not collapse into one.
 *
 * Here rather than in `Leaderboard.tsx` because root Vitest cannot load a
 * component file: the words a squad of one may never read are a rule, and a
 * rule that lives in a `.tsx` has no guard on it.
 */
export type SublinePart = { text: string; emphasis?: boolean };

export function standingSubline(standing: SquadStanding): SublinePart[] | null {
  switch (standing.kind) {
    case 'unknown':
    case 'alone':
      return null;
    case 'unranked':
      return [{ text: `of ${standing.of}` }];
    case 'ranked': {
      const of = `of ${standing.of}`;
      if (standing.back === null) return [{ text: `${of} · leading` }];
      if (standing.back === 0) return [{ text: `${of} · tied with the player above` }];
      return [
        { text: `${of} · ` },
        { text: standing.back.toLocaleString(), emphasis: true },
        { text: ' back' },
      ];
    }
  }
}
