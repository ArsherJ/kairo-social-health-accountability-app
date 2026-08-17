import { describe, expect, it } from 'vitest';
// `standings.ts`, not `queries.ts`: the latter imports the Supabase client, which
// vitest cannot resolve. That split is the reason this module exists.
import { pickLiveGoal, standingsFor } from './standings.ts';
import type { Completion, GoalRow, WindowScore } from './standings.ts';

const ME = 'me';
const THEM = 'them';
const TODAY = '2026-01-15';

function goal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'g1',
    squad_id: 'sq',
    created_by: ME,
    title: 'Together',
    description: null,
    kind: 'cumulative',
    metric: 'daily_score',
    target: 10_000,
    required_days: null,
    required_members: 2,
    starts_on: '2026-01-01',
    ends_on: '2026-01-30',
    ...overrides,
  };
}

function score(overrides: Partial<WindowScore> = {}): WindowScore {
  return {
    user_id: ME,
    character_name: 'Me',
    local_date: '2026-01-02',
    total: 1_000,
    status: 'final',
    walk_cleared: false,
    ...overrides,
  };
}

function build(scores: WindowScore[], completions: Completion[] = [], row = goal()) {
  return standingsFor({ row, scores, completions, userId: ME, today: TODAY });
}

describe('standingsFor', () => {
  it('never credits one member’s day to another', () => {
    // The worst bug this file could have. Two members, one day each.
    const standings = build([
      score({ user_id: ME, character_name: 'Me', total: 1_000 }),
      score({ user_id: THEM, character_name: 'Them', total: 7_000 }),
    ]);
    const mine = standings.find((s) => s.userId === ME)!;
    const theirs = standings.find((s) => s.userId === THEM)!;
    expect(mine.progress.progress).toBe(1_000);
    expect(theirs.progress.progress).toBe(7_000);
  });

  it('keeps a participant whose only row is null-extended', () => {
    // The RPC left-joins, so a member with no scored day arrives as one row with
    // null local_date. They belong on the roster at zero — dropping them hides
    // exactly who has not started on an everyone-must-hit-it goal.
    const standings = build([
      score({ user_id: ME, total: 1_000 }),
      score({
        user_id: THEM,
        character_name: 'Them',
        local_date: null,
        total: null,
        status: null,
      }),
    ]);
    expect(standings).toHaveLength(2);
    const theirs = standings.find((s) => s.userId === THEM)!;
    expect(theirs.characterName).toBe('Them');
    expect(theirs.progress.progress).toBe(0);
    expect(theirs.progress.met).toBe(false);
  });

  it('does not count a null row as a zero-point day on a consistency goal', () => {
    // `Number(null)` is 0, and a phantom day at 0 would be counted as a day that
    // failed the bar rather than as no day at all. Harmless for the count, but it
    // would make `daysUnresolved` wrong and could report a live goal as dead.
    const consistency = goal({ kind: 'consistency', target: 500, required_days: 3 });
    const standings = build(
      [
        score({ user_id: ME, local_date: null, total: null, status: null }),
      ],
      [],
      consistency,
    );
    expect(standings[0]!.progress.daysMet).toBe(0);
    expect(standings[0]!.progress.stillPossible).toBe(true);
  });

  it('marks the caller, and only the caller', () => {
    const standings = build([
      score({ user_id: ME }),
      score({ user_id: THEM, character_name: 'Them' }),
    ]);
    expect(standings.filter((s) => s.isSelf).map((s) => s.userId)).toEqual([ME]);
  });

  it('reports the latched completion, which is not the same as computed met', () => {
    // A member can be `met` locally from a provisional day while the server has
    // paid nothing yet. The tick renders from the latch.
    const standings = build(
      [score({ user_id: ME, total: 99_000, status: 'provisional' })],
      [{ goal_id: 'g1', user_id: THEM, xp_awarded: 164 }],
    );
    const mine = standings.find((s) => s.userId === ME)!;
    expect(mine.progress.met).toBe(false);
    expect(mine.completed).toBe(false);
  });

  it('sorts furthest along first, then by name', () => {
    const standings = build([
      score({ user_id: 'c', character_name: 'Cara', total: 500 }),
      score({ user_id: 'a', character_name: 'Ana', total: 500 }),
      score({ user_id: 'b', character_name: 'Bea', total: 9_000 }),
    ]);
    expect(standings.map((s) => s.characterName)).toEqual(['Bea', 'Ana', 'Cara']);
  });

  it('sums several days for the same member', () => {
    const standings = build([
      score({ local_date: '2026-01-02', total: 1_000 }),
      score({ local_date: '2026-01-03', total: 2_000 }),
      score({ local_date: '2026-01-04', total: 3_000 }),
    ]);
    expect(standings[0]!.progress.progress).toBe(6_000);
  });

  it('returns nothing for a goal with no rows at all', () => {
    expect(build([])).toEqual([]);
  });

  it('coerces a total that arrived as a string', () => {
    const standings = build([
      score({ total: '2500' as unknown as number }),
    ]);
    expect(standings[0]!.progress.progress).toBe(2_500);
  });
});

describe('pickLiveGoal', () => {
  const started = { starts_on: '2026-01-01' };

  it('returns nothing when there are no goals', () => {
    expect(pickLiveGoal([], TODAY)).toBeNull();
  });

  it('ignores a window that has not opened yet', () => {
    const future = goal({ id: 'future', starts_on: '2026-02-01', ends_on: '2026-02-28' });
    expect(pickLiveGoal([future], TODAY)).toBeNull();
  });

  it('picks the live goal closing soonest', () => {
    const late = goal({ id: 'late', ...started, ends_on: '2026-03-01' });
    const soon = goal({ id: 'soon', ...started, ends_on: '2026-01-20' });
    expect(pickLiveGoal([late, soon], TODAY)?.id).toBe('soon');
  });

  it('counts the last day of a window as live', () => {
    const ending = goal({ id: 'ending', ...started, ends_on: TODAY });
    expect(pickLiveGoal([ending], TODAY)?.id).toBe('ending');
  });

  it('treats an open-ended goal as live once it has started', () => {
    const open = goal({ id: 'open', ...started, ends_on: null });
    expect(pickLiveGoal([open], TODAY)?.id).toBe('open');
  });

  it('never lets an open-ended goal win a soonest-closing race', () => {
    // The whole reason this was worth lifting out of the components: a null
    // `ends_on` compared with `localeCompare` would have thrown or sorted first.
    const open = goal({ id: 'open', ...started, ends_on: null });
    const dated = goal({ id: 'dated', ...started, ends_on: '2026-03-01' });
    expect(pickLiveGoal([open, dated], TODAY)?.id).toBe('dated');
    expect(pickLiveGoal([dated, open], TODAY)?.id).toBe('dated');
  });

  it('falls back to an open-ended goal when it is the only live one', () => {
    const open = goal({ id: 'open', ...started, ends_on: null });
    const done = goal({ id: 'done', ...started, ends_on: '2026-01-10' });
    expect(pickLiveGoal([done, open], TODAY)?.id).toBe('open');
  });

  it('returns null for a closed goal unless the past fallback is asked for', () => {
    const done = goal({ id: 'done', ...started, ends_on: '2026-01-10' });
    expect(pickLiveGoal([done], TODAY)).toBeNull();
    expect(pickLiveGoal([done], TODAY, { fallbackToPast: true })?.id).toBe('done');
  });

  it('falls back to the most recently closed goal, not the oldest', () => {
    const old = goal({ id: 'old', ...started, ends_on: '2026-01-05' });
    const recent = goal({ id: 'recent', ...started, ends_on: '2026-01-12' });
    expect(pickLiveGoal([old, recent], TODAY, { fallbackToPast: true })?.id).toBe('recent');
  });

  it('prefers a live goal over a closed one even with the fallback on', () => {
    const done = goal({ id: 'done', ...started, ends_on: '2026-01-10' });
    const live = goal({ id: 'live', ...started, ends_on: '2026-01-20' });
    expect(pickLiveGoal([done, live], TODAY, { fallbackToPast: true })?.id).toBe('live');
  });
});

describe('standingsFor — the daily_walk metric', () => {
  const walkGoal = goal({
    metric: 'daily_walk',
    kind: 'consistency',
    // The sentinel: the column requires a positive target and the bar is a
    // boolean. If it were ever read as a points bar, every scoring day counts.
    target: 1,
    required_days: 2,
  });

  it('scores off walk_cleared, not off totals', () => {
    const standings = build(
      [
        score({ local_date: '2026-01-02', total: 50, walk_cleared: true }),
        score({ local_date: '2026-01-03', total: 9_999, walk_cleared: false }),
      ],
      [],
      walkGoal,
    );
    // One cleared walk, despite the second day scoring two hundred times more.
    expect(standings[0]?.progress.progress).toBe(1);
  });

  it('keeps a scoreless participant on the roster as not cleared', () => {
    const standings = build(
      [
        score({ user_id: THEM, character_name: 'Them', local_date: null, total: null, status: null }),
        score({ local_date: '2026-01-02', walk_cleared: true }),
      ],
      [],
      walkGoal,
    );
    expect(standings).toHaveLength(2);
    expect(standings.find((s) => s.userId === THEM)?.progress.progress).toBe(0);
  });

  it('leaves a daily_score goal counting points exactly as before', () => {
    const standings = build([
      score({ local_date: '2026-01-02', total: 4_000, walk_cleared: true }),
      score({ local_date: '2026-01-03', total: 3_000, walk_cleared: true }),
    ]);
    expect(standings[0]?.progress.progress).toBe(7_000);
  });
});
