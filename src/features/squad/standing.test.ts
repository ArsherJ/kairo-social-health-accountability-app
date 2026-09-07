import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveSquadStanding, standingHero, standingSubline } from './standing.ts';
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

  // A squad of one is not a standing. The tab next door tells the same player
  // they have the sky to themselves and the ridge is the opponent; this band
  // used to answer "1st · of 1 · leading" — the app refusing to flatter you on
  // one screen and doing it on the next. The leader line beside it was already
  // guarded on two or more rows; this sentence never was.
  it('states no standing at all in a squad of one', () => {
    const rows = [row(1, 'You', 4_820, true)];
    expect(resolveSquadStanding({ rows, memberCount: 1 })).toEqual({ kind: 'alone' });
  });

  it('is alone before the lone member has scored, too', () => {
    // Nobody on the board yet is still a squad of one. The denominator, not
    // the board, is what makes it one.
    expect(resolveSquadStanding({ rows: [], memberCount: 1 })).toEqual({ kind: 'alone' });
  });

  it('carries no rank for a squad of one to render', () => {
    // A contract on the shape as much as on the words: there is no rank, no
    // denominator and no gap in the value, so no later edit can reach for one.
    const alone = resolveSquadStanding({ rows: [], memberCount: 1 }) as Record<string, unknown>;
    expect(Object.keys(alone)).toEqual(['kind']);
  });
});

describe('what the flock band says', () => {
  const alone = { kind: 'alone' } as const;

  it('gives a squad of one the sky\'s sentence, and no ordinal beside it', () => {
    expect(standingHero(alone)).toBeNull();
    expect(standingSubline(alone)).toBeNull();
  });

  it('reads that sentence from the Sky rather than writing one of its own', () => {
    // One string, two surfaces — asserted as *identity*, never by re-scanning
    // its words. `sky-reading.test.ts` already bans a rank from that sentence,
    // and a second scan of one rule is how the two drift: this one had already
    // dropped "first", "place" and "ahead of" from its copy of the list before
    // the review caught it. The band's job is to reach for the shared string,
    // and the source read is what proves it did.
    const band = readFileSync(new URL('./Leaderboard.tsx', import.meta.url), 'utf8');

    expect(band).toContain('SOLO_SKY_OBSERVATION');
    // And writes no sentence of its own beside it. The observation is the
    // Sky's, so the words may only ever appear in one file.
    expect(band).not.toMatch(/sky to yourself/i);
  });

  it('is unchanged for a squad of two or more', () => {
    expect(standingHero({ kind: 'ranked', rank: 1, of: 4, back: null })).toBe('1st');
    expect(standingSubline({ kind: 'ranked', rank: 1, of: 4, back: null })).toEqual([
      { text: 'of 4 · leading' },
    ]);
    expect(standingSubline({ kind: 'ranked', rank: 2, of: 4, back: 0 })).toEqual([
      { text: 'of 4 · tied with the player above' },
    ]);
    expect(standingSubline({ kind: 'ranked', rank: 3, of: 4, back: 400 })).toEqual([
      { text: 'of 4 · ' },
      { text: '400', emphasis: true },
      { text: ' back' },
    ]);
    expect(standingHero({ kind: 'unranked', of: 4 })).toBe('Unranked');
    expect(standingSubline({ kind: 'unranked', of: 4 })).toEqual([{ text: 'of 4' }]);
    expect(standingHero({ kind: 'unknown' })).toBeNull();
    expect(standingSubline({ kind: 'unknown' })).toBeNull();
  });

  it('keeps the irregular ordinals', () => {
    const at = (rank: number) => standingHero({ kind: 'ranked', rank, of: 20, back: null });
    expect([at(1), at(2), at(3), at(4), at(11), at(12), at(13), at(21)]).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st',
    ]);
  });
});
