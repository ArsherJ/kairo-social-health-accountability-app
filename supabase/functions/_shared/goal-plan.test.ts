import { describe, expect, it } from 'vitest';
import type { GoalDay } from './core.ts';
import {
  daysForUser,
  planGoalCompletions,
  toGoal,
  type GoalRow,
} from './goal-plan.ts';

const USER = 'user-1';

function goalRow(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'g1',
    squad_id: null,
    title: 'Sixty thousand',
    description: null,
    kind: 'cumulative',
    target: 60_000,
    required_days: null,
    starts_on: '2026-01-01',
    ends_on: '2026-01-30',
    ...overrides,
  };
}

function finalDays(from: string, count: number, total: number): GoalDay[] {
  const out: GoalDay[] = [];
  const [y, m, d] = from.split('-').map(Number) as [number, number, number];
  for (let i = 0; i < count; i++) {
    out.push({
      localDate: new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
      total,
      status: 'final',
    });
  }
  return out;
}

function plan(input: {
  goals: GoalRow[];
  days: GoalDay[];
  localDate: string;
  alreadyCompleted?: string[];
}) {
  const byGoal = new Map<string, GoalDay[]>();
  for (const g of input.goals) byGoal.set(g.id, input.days);
  return planGoalCompletions({
    userId: USER,
    localDate: input.localDate,
    goals: input.goals,
    daysByGoal: byGoal,
    alreadyCompleted: new Set(input.alreadyCompleted ?? []),
  });
}

describe('toGoal', () => {
  it('maps a row onto the core shape', () => {
    expect(toGoal(goalRow())).toEqual({
      id: 'g1',
      kind: 'cumulative',
      target: 60_000,
      requiredDays: null,
      startsOn: '2026-01-01',
      endsOn: '2026-01-30',
    });
  });

  it('defaults an unrecognised kind to cumulative rather than throwing', () => {
    // The column has a CHECK, so this cannot arise from the database. It exists
    // so a future kind added in SQL before TypeScript degrades to a wrong
    // *number* rather than a 500 that stops the whole finalization run.
    expect(toGoal(goalRow({ kind: 'something-new' })).kind).toBe('cumulative');
  });
});

describe('planGoalCompletions', () => {
  it('completes a cumulative goal whose window total reached the target', () => {
    const result = plan({
      goals: [goalRow()],
      days: finalDays('2026-01-01', 30, 2_000),
      localDate: '2026-01-30',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.row).toEqual({
      goal_id: 'g1',
      user_id: USER,
      completed_on: '2026-01-30',
      xp_awarded: 164,
    });
    expect(result[0]!.title).toBe('Sixty thousand');
  });

  it('does not complete a goal still short of its target', () => {
    expect(
      plan({
        goals: [goalRow()],
        days: finalDays('2026-01-01', 10, 2_000),
        localDate: '2026-01-10',
      }),
    ).toEqual([]);
  });

  it('completes a consistency goal on the day the count is reached', () => {
    const result = plan({
      goals: [
        goalRow({ id: 'g2', kind: 'consistency', target: 2_500, required_days: 25 }),
      ],
      days: finalDays('2026-01-01', 25, 3_000),
      localDate: '2026-01-25',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.row.goal_id).toBe('g2');
  });

  it('skips a goal already latched', () => {
    // The insert carries `on conflict do nothing`, so this filter is the cheap
    // path — but skipping here is what keeps a settled goal from re-notifying
    // every night for the rest of its window.
    expect(
      plan({
        goals: [goalRow()],
        days: finalDays('2026-01-01', 30, 2_000),
        localDate: '2026-01-30',
        alreadyCompleted: ['g1'],
      }),
    ).toEqual([]);
  });

  it('ignores a goal whose window does not contain the finalized day', () => {
    // Not an optimisation. Evaluating it would stamp `completed_on` with a date
    // that never counted toward the goal, and could latch it on an unrelated day.
    const before = plan({
      goals: [goalRow()],
      days: finalDays('2026-01-01', 30, 2_000),
      localDate: '2025-12-31',
    });
    const after = plan({
      goals: [goalRow()],
      days: finalDays('2026-01-01', 30, 2_000),
      localDate: '2026-01-31',
    });
    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });

  it('completes on the first and last day of the window, which both count', () => {
    const oneDay = goalRow({ target: 1_000, starts_on: '2026-01-01', ends_on: '2026-01-01' });
    expect(
      plan({ goals: [oneDay], days: finalDays('2026-01-01', 1, 1_000), localDate: '2026-01-01' }),
    ).toHaveLength(1);
  });

  it('never completes from a provisional day', () => {
    // The one rule that matters most here: completion pays XP and latches
    // one-way, so a day Apple can still revise downward must not trigger it.
    const provisional: GoalDay[] = [
      { localDate: '2026-01-01', total: 99_000, status: 'provisional' },
    ];
    expect(
      plan({ goals: [goalRow()], days: provisional, localDate: '2026-01-01' }),
    ).toEqual([]);
  });

  it('completes several goals from one finalized day', () => {
    const result = plan({
      goals: [
        goalRow({ id: 'a', target: 10_000 }),
        goalRow({ id: 'b', target: 20_000 }),
        goalRow({ id: 'c', target: 90_000 }),
      ],
      days: finalDays('2026-01-01', 15, 2_000),
      localDate: '2026-01-15',
    });
    expect(result.map((c) => c.row.goal_id)).toEqual(['a', 'b']);
  });

  it('is idempotent — planning the same finalization twice gives the same rows', () => {
    const args = {
      goals: [goalRow()],
      days: finalDays('2026-01-01', 30, 2_000),
      localDate: '2026-01-30',
    };
    expect(plan(args)).toEqual(plan(args));
  });

  it('handles a goal with no scored days at all', () => {
    expect(
      plan({ goals: [goalRow()], days: [], localDate: '2026-01-15' }),
    ).toEqual([]);
  });

  it('pays the capped XP for a very long goal', () => {
    const result = plan({
      goals: [goalRow({ starts_on: '2026-01-01', ends_on: '2026-12-31', target: 1_000 })],
      days: finalDays('2026-01-01', 1, 1_000),
      localDate: '2026-01-01',
    });
    expect(result[0]!.row.xp_awarded).toBe(500);
  });
});

describe('daysForUser', () => {
  const rows = [
    { goal_id: 'g1', user_id: USER, local_date: '2026-01-01', total: 100, status: 'final' },
    { goal_id: 'g1', user_id: USER, local_date: '2026-01-02', total: 200, status: 'provisional' },
    { goal_id: 'g2', user_id: USER, local_date: '2026-01-01', total: 300, status: 'final' },
    { goal_id: 'g1', user_id: 'other', local_date: '2026-01-01', total: 999, status: 'final' },
  ];

  it('groups one user’s rows by goal', () => {
    const byGoal = daysForUser(rows, USER);
    expect([...byGoal.keys()].sort()).toEqual(['g1', 'g2']);
    expect(byGoal.get('g1')).toHaveLength(2);
    expect(byGoal.get('g2')).toHaveLength(1);
  });

  it('drops other participants — completion is per person', () => {
    // goal_window_scores returns the whole roster, because that is what the
    // squad panel renders. Letting another member's day count toward your
    // completion would be the worst possible bug in this file.
    const byGoal = daysForUser(rows, USER);
    expect(byGoal.get('g1')!.map((d) => d.total)).toEqual([100, 200]);
  });

  it('preserves status so provisional days stay excluded downstream', () => {
    const byGoal = daysForUser(rows, USER);
    expect(byGoal.get('g1')!.map((d) => d.status)).toEqual(['final', 'provisional']);
  });

  it('coerces a numeric total that arrived as a string', () => {
    // Postgres integers come back as numbers through supabase-js, but a bigint
    // or a numeric would arrive as a string and silently concatenate in a sum.
    const byGoal = daysForUser(
      [{ goal_id: 'g1', user_id: USER, local_date: '2026-01-01', total: '250' as unknown as number, status: 'final' }],
      USER,
    );
    expect(byGoal.get('g1')![0]!.total).toBe(250);
  });

  it('returns an empty map when the user has no rows', () => {
    expect(daysForUser(rows, 'nobody').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Open-ended goals — `ends_on: null`
// ---------------------------------------------------------------------------

describe('planGoalCompletions — open-ended goals', () => {
  const open = () => goalRow({ ends_on: null, target: 6_000 });

  it('never excludes a day for being past the end of the window', () => {
    // A year after the start. A finite goal would have skipped this day
    // outright; an open-ended one has no upper bound to fall outside of.
    const completions = planGoalCompletions({
      userId: USER,
      localDate: '2027-01-01',
      goals: [open()],
      daysByGoal: new Map([['g1', finalDays('2026-01-01', 3, 2_000)]]),
      alreadyCompleted: new Set(),
    });
    expect(completions).toHaveLength(1);
  });

  it('still excludes a day before the start date', () => {
    const completions = planGoalCompletions({
      userId: USER,
      localDate: '2025-12-31',
      goals: [open()],
      daysByGoal: new Map([['g1', finalDays('2026-01-01', 3, 2_000)]]),
      alreadyCompleted: new Set(),
    });
    expect(completions).toEqual([]);
  });

  it('pays XP scaled by how long the goal actually ran', () => {
    // Start 2026-01-01, completed 2026-01-07: a seven-day span, so the same
    // XP a seven-day window would have paid.
    const completions = planGoalCompletions({
      userId: USER,
      localDate: '2026-01-07',
      goals: [open()],
      daysByGoal: new Map([['g1', finalDays('2026-01-01', 4, 2_000)]]),
      alreadyCompleted: new Set(),
    });
    expect(completions[0]!.row.xp_awarded).toBe(Math.round(30 * Math.sqrt(7)));
  });

  it('does not complete on provisional days', () => {
    const provisional: GoalDay[] = [
      { localDate: '2026-01-01', total: 99_000, status: 'provisional' },
    ];
    const completions = planGoalCompletions({
      userId: USER,
      localDate: '2026-01-01',
      goals: [open()],
      daysByGoal: new Map([['g1', provisional]]),
      alreadyCompleted: new Set(),
    });
    expect(completions).toEqual([]);
  });
});
