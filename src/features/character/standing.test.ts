import { describe, expect, it } from 'vitest';
import { resolveStanding, type StandingRow } from './standing.ts';

const row = (
  rank: number,
  character_name: string,
  total: number,
  is_self = false,
): StandingRow => ({ rank, character_name, total, is_self });

const board: StandingRow[] = [
  row(1, 'Ligaya', 6_240),
  row(2, 'Jun', 5_220),
  row(3, 'You', 4_820, true),
];

describe('resolveStanding', () => {
  // A pending query is not an answer. The line renders nothing rather than
  // guessing, the same discipline squad.tsx already applies to its board.
  it('is unknown while squad membership is still loading', () => {
    expect(resolveStanding({ hasSquad: undefined, rows: board })).toEqual({
      kind: 'unknown',
    });
  });

  it('is unknown while the board is still loading', () => {
    expect(resolveStanding({ hasSquad: true, rows: undefined })).toEqual({
      kind: 'unknown',
    });
  });

  it('is solo when the user has no squad', () => {
    expect(resolveStanding({ hasSquad: false, rows: undefined })).toEqual({
      kind: 'solo',
    });
  });

  // squad_leaderboard returns only members who have SCORED, so a user who has
  // not moved today is legitimately absent from their own squad's board.
  it('is unranked when the user has not scored today', () => {
    expect(
      resolveStanding({ hasSquad: true, rows: [row(1, 'Ligaya', 6_240)] }),
    ).toEqual({ kind: 'unranked' });
  });

  it('is unranked when the squad exists but nobody has scored', () => {
    expect(resolveStanding({ hasSquad: true, rows: [] })).toEqual({
      kind: 'unranked',
    });
  });

  it('names the rank and the gap to the player immediately above', () => {
    expect(resolveStanding({ hasSquad: true, rows: board })).toEqual({
      kind: 'ranked',
      rank: 3,
      ahead: { name: 'Jun', gap: 400 },
    });
  });

  // Leading is the one case with nothing to chase.
  it('has nobody ahead in first place', () => {
    const leading = [row(1, 'You', 6_240, true), row(2, 'Jun', 5_220)];
    expect(resolveStanding({ hasSquad: true, rows: leading })).toEqual({
      kind: 'ranked',
      rank: 1,
      ahead: null,
    });
  });

  // Ties share a rank in the RPC's output, so "the row above" is not always
  // rank - 1, and a naive lookup would find nothing and claim first place.
  // When two players are tied both on rank and on total, either is equally
  // "the one above" — the sort is stable, so the first such row in the board's
  // order wins. Deterministic, and the choice carries no meaning.
  it('finds the nearest higher-placed player when ranks tie', () => {
    const tied = [
      row(1, 'Ligaya', 6_240),
      row(1, 'Jun', 6_240),
      row(3, 'You', 4_820, true),
    ];
    expect(resolveStanding({ hasSquad: true, rows: tied })).toEqual({
      kind: 'ranked',
      rank: 3,
      ahead: { name: 'Ligaya', gap: 1_420 },
    });
  });

  it('reports a zero gap when tied with the player above', () => {
    const level = [row(1, 'Jun', 4_820), row(1, 'You', 4_820, true)];
    expect(resolveStanding({ hasSquad: true, rows: level })).toEqual({
      kind: 'ranked',
      rank: 1,
      ahead: { name: 'Jun', gap: 0 },
    });
  });

  // The RPC orders by rank, but nothing in the type system says so.
  it('does not depend on the rows arriving sorted', () => {
    expect(resolveStanding({ hasSquad: true, rows: [...board].reverse() })).toEqual({
      kind: 'ranked',
      rank: 3,
      ahead: { name: 'Jun', gap: 400 },
    });
  });
});
