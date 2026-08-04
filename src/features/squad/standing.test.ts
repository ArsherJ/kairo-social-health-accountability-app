import { describe, expect, it } from 'vitest';
import { resolveSquadStanding } from './standing.ts';
import type { StandingRow } from '../character/standing.ts';

const row = (
  rank: number,
  character_name: string,
  total: number,
  is_self = false,
): StandingRow => ({ rank, character_name, total, is_self });

describe('resolveSquadStanding', () => {
  it('is unknown while the board is loading', () => {
    expect(resolveSquadStanding({ rows: undefined, memberCount: 5 })).toEqual({
      kind: 'unknown',
    });
  });

  it('is unknown while the member count is loading', () => {
    expect(resolveSquadStanding({ rows: [], memberCount: undefined })).toEqual({
      kind: 'unknown',
    });
  });

  it('reports rank, squad size and the gap to the player above', () => {
    const rows = [row(1, 'Ligaya', 6_240), row(2, 'Jun', 5_220), row(3, 'You', 4_820, true)];
    expect(resolveSquadStanding({ rows, memberCount: 5 })).toEqual({
      kind: 'ranked',
      rank: 3,
      of: 5,
      back: 400,
    });
  });

  // The denominator is squad_members, never rows.length: the RPC returns only
  // members who have SCORED, so a squadmate who has not moved is missing from
  // the board but is emphatically still in the squad.
  it('counts the squad, not the scored rows', () => {
    const rows = [row(1, 'You', 4_820, true)];
    expect(resolveSquadStanding({ rows, memberCount: 5 })).toEqual({
      kind: 'ranked',
      rank: 1,
      of: 5,
      back: null,
    });
  });

  it("is unranked with the day's total when the user has not scored", () => {
    const rows = [row(1, 'Ligaya', 6_240)];
    expect(resolveSquadStanding({ rows, memberCount: 5 })).toEqual({
      kind: 'unranked',
      of: 5,
    });
  });
});
