import { describe, expect, it } from 'vitest';
import { buildStandings, squadDayIsComplete } from './race-result-plan.ts';

describe('squadDayIsComplete', () => {
  it('is true only when every member has a final row for that date', () => {
    // Days are per-user local, so a squad spans several calendar dates at any
    // instant. Writing the result when the first member finalizes would crown
    // whoever's timezone happens to be furthest west.
    expect(
      squadDayIsComplete({ members: ['a', 'b', 'c'], finalUserIds: ['a', 'b', 'c'] }),
    ).toBe(true);
  });

  it('is false while one member is still living in that date', () => {
    expect(
      squadDayIsComplete({ members: ['a', 'b', 'c'], finalUserIds: ['a', 'b'] }),
    ).toBe(false);
  });

  it('is false for an empty squad rather than vacuously true', () => {
    // `every` over an empty list is true, which would write an empty standings
    // row for a squad nobody is in and permanently occupy a write-once key.
    expect(squadDayIsComplete({ members: [], finalUserIds: [] })).toBe(false);
  });

  it('ignores a final row from somebody who has since left', () => {
    expect(
      squadDayIsComplete({ members: ['a', 'b'], finalUserIds: ['a', 'b', 'gone'] }),
    ).toBe(true);
  });
});

describe('buildStandings', () => {
  const rows = [
    { user_id: 'slow', character_name: 'Tala', species: 'tamaraw', steps: 4_000, total: 1_800 },
    { user_id: 'fast', character_name: 'Bayani', species: 'eagle', steps: 40_000, total: 3_100 },
    { user_id: 'broad', character_name: 'Diwa', species: 'carabao', steps: 12_000, total: 4_000 },
  ];

  it('ranks by CAPPED steps, so a 40,000-step day does not out-rank a 12,000 one', () => {
    // The finish line is the anti-cheat. Both of these are past it, so the tie
    // falls through to the daily score — which is the whole point of the cap.
    const standings = buildStandings(rows);
    expect(standings.map((s) => s.user_id)).toEqual(['broad', 'fast', 'slow']);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('stores the capped figure, never the raw one', () => {
    const standings = buildStandings(rows);
    expect(standings.find((s) => s.user_id === 'fast')!.capped_steps).toBeLessThan(40_000);
  });

  it('carries species, and null for anyone predating the choice', () => {
    const standings = buildStandings([
      { user_id: 'old', character_name: 'Ana', species: null, steps: 100, total: 10 },
    ]);
    expect(standings[0]!.species).toBeNull();
  });

  it('treats a withheld step count as zero rather than dropping the member', () => {
    // A member who has not consented still ran the race and still belongs in
    // the history. Dropping them would make the stored result disagree with
    // the board everybody watched all day.
    const standings = buildStandings([
      { user_id: 'quiet', character_name: 'Noel', species: null, steps: null, total: 900 },
      { user_id: 'loud', character_name: 'Rey', species: null, steps: 5_000, total: 800 },
    ]);
    expect(standings).toHaveLength(2);
    expect(standings.find((s) => s.user_id === 'quiet')!.capped_steps).toBe(0);
  });

  it('carries nothing a viewer is not entitled to beyond the four snapshot fields', () => {
    // The stored JSON is read by every member of the squad. Anything else that
    // rode along here — a raw step count, a name, a daily total — would be a
    // disclosure race_result() has no way to withhold.
    const standings = buildStandings(rows);
    expect(Object.keys(standings[0]!).sort()).toEqual([
      'capped_steps',
      'rank',
      'species',
      'user_id',
    ]);
  });

  it('returns nothing for an empty board', () => {
    expect(buildStandings([])).toEqual([]);
  });
});
