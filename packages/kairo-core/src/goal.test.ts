import { describe, expect, it } from 'vitest';
import {
  MAX_GOAL_COMPLETION_XP,
  evaluateGoal,
  evaluateSquadGoal,
  goalCompletionXp,
  goalWindowDays,
  type Goal,
  type GoalDay,
} from './goal.ts';

/** A 30-day January window. Both bounds inclusive. */
const START = '2026-01-01';
const END = '2026-01-30';

function cumulative(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    kind: 'cumulative',
    target: 60_000,
    requiredDays: null,
    startsOn: START,
    endsOn: END,
    ...overrides,
  };
}

function consistency(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g2',
    kind: 'consistency',
    target: 2_500,
    requiredDays: 25,
    startsOn: START,
    endsOn: END,
    ...overrides,
  };
}

/** `count` consecutive final days of `total`, starting at `from`. */
function days(from: string, count: number, total: number): GoalDay[] {
  const out: GoalDay[] = [];
  const [y, m, d] = from.split('-').map(Number) as [number, number, number];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    out.push({
      localDate: date.toISOString().slice(0, 10),
      total,
      status: 'final',
    });
  }
  return out;
}

describe('goalWindowDays', () => {
  it('counts both bounds', () => {
    // 1 Jan through 30 Jan is 30 days, not 29. An off-by-one here would make
    // every consistency goal quietly harder than the user was told.
    expect(goalWindowDays(cumulative())).toBe(30);
  });

  it('is 1 for a single-day goal', () => {
    expect(goalWindowDays(cumulative({ startsOn: START, endsOn: START }))).toBe(1);
  });

  it('spans a month boundary correctly', () => {
    expect(
      goalWindowDays(cumulative({ startsOn: '2026-01-30', endsOn: '2026-02-02' })),
    ).toBe(4);
  });

  it('spans a leap day', () => {
    expect(
      goalWindowDays(cumulative({ startsOn: '2028-02-27', endsOn: '2028-03-01' })),
    ).toBe(4);
  });

  it('spans a year', () => {
    expect(
      goalWindowDays(cumulative({ startsOn: '2026-01-01', endsOn: '2026-12-31' })),
    ).toBe(365);
  });
});

describe('evaluateGoal — cumulative', () => {
  it('sums the window and reports progress against the target', () => {
    const result = evaluateGoal(cumulative(), days(START, 10, 2_000), '2026-01-10');
    expect(result.progress).toBe(20_000);
    expect(result.target).toBe(60_000);
    expect(result.met).toBe(false);
  });

  it('is met the moment the total reaches the target, before the window closes', () => {
    // A goal reached early is met. Waiting for the end date would be telling
    // someone who already did the work that they have not.
    const result = evaluateGoal(cumulative(), days(START, 30, 2_000), '2026-01-10');
    expect(result.progress).toBe(60_000);
    expect(result.met).toBe(true);
  });

  it('counts a total that overshoots, without capping progress', () => {
    const result = evaluateGoal(cumulative(), days(START, 30, 5_000), END);
    expect(result.progress).toBe(150_000);
    expect(result.met).toBe(true);
  });

  it('is not met on an empty window', () => {
    const result = evaluateGoal(cumulative(), [], START);
    expect(result.progress).toBe(0);
    expect(result.met).toBe(false);
  });
});

describe('evaluateGoal — consistency', () => {
  it('counts days that met the bar, not the points', () => {
    const result = evaluateGoal(consistency(), days(START, 10, 3_000), '2026-01-10');
    expect(result.progress).toBe(10);
    expect(result.target).toBe(25);
    expect(result.daysMet).toBe(10);
    expect(result.met).toBe(false);
  });

  it('treats the target as an inclusive floor', () => {
    // "2,500 a day" must be satisfied by exactly 2,500. A strict > would make
    // the number shown to the user a lie by one point.
    expect(evaluateGoal(consistency(), days(START, 25, 2_500), END).met).toBe(true);
    expect(evaluateGoal(consistency(), days(START, 25, 2_499), END).met).toBe(false);
  });

  it('is met on reaching requiredDays, not on filling the window', () => {
    const result = evaluateGoal(consistency(), days(START, 25, 3_000), '2026-01-25');
    expect(result.daysMet).toBe(25);
    expect(result.met).toBe(true);
  });

  it('ignores days below the bar entirely — they do not subtract', () => {
    const mixed = [...days(START, 25, 3_000), ...days('2026-01-26', 5, 0)];
    expect(evaluateGoal(consistency(), mixed, END).daysMet).toBe(25);
  });
});

describe('evaluateGoal — the window is a boundary, not a suggestion', () => {
  it('ignores a day before the start date', () => {
    const result = evaluateGoal(
      cumulative(),
      [...days('2025-12-31', 1, 50_000), ...days(START, 1, 1_000)],
      START,
    );
    expect(result.progress).toBe(1_000);
  });

  it('ignores a day after the end date', () => {
    const result = evaluateGoal(
      cumulative(),
      [...days(END, 1, 1_000), ...days('2026-01-31', 1, 50_000)],
      '2026-01-31',
    );
    expect(result.progress).toBe(1_000);
  });

  it('includes both bounds', () => {
    const result = evaluateGoal(
      cumulative(),
      [...days(START, 1, 1_000), ...days(END, 1, 1_000)],
      END,
    );
    expect(result.progress).toBe(2_000);
  });
});

describe('evaluateGoal — provisional days', () => {
  it('counts a provisional day toward displayed progress', () => {
    // The card must show today's contribution as it happens; a user who walked
    // this morning should not see a number that ignores it.
    const today: GoalDay[] = [{ localDate: START, total: 2_000, status: 'provisional' }];
    expect(evaluateGoal(cumulative(), today, START).progress).toBe(2_000);
  });

  it('never lets a provisional day complete a goal', () => {
    // Completion pays XP and latches. A day that can still be revised downward
    // must not be able to trigger it.
    const today: GoalDay[] = [{ localDate: START, total: 99_000, status: 'provisional' }];
    const result = evaluateGoal(cumulative(), today, START);
    expect(result.progress).toBe(99_000);
    expect(result.met).toBe(false);
  });

  it('reports final-only progress separately, which is what completion reads', () => {
    const mixed: GoalDay[] = [
      { localDate: START, total: 30_000, status: 'final' },
      { localDate: '2026-01-02', total: 40_000, status: 'provisional' },
    ];
    const result = evaluateGoal(cumulative(), mixed, '2026-01-02');
    expect(result.progress).toBe(70_000);
    expect(result.finalProgress).toBe(30_000);
    expect(result.met).toBe(false);
  });

  it('excludes a provisional day from a consistency count too', () => {
    // 24 days banked, today clearing the bar but not yet final. The card should
    // say 25 and the goal should not complete until tomorrow's finalization.
    const mixed: GoalDay[] = [
      ...days(START, 24, 3_000),
      { localDate: '2026-01-25', total: 3_000, status: 'provisional' },
    ];
    const result = evaluateGoal(consistency(), mixed, '2026-01-25');
    expect(result.progress).toBe(25);
    expect(result.daysMet).toBe(24);
    expect(result.met).toBe(false);
  });
});

describe('evaluateGoal — time left', () => {
  it('counts today as remaining, because today is still playable', () => {
    expect(evaluateGoal(cumulative(), [], START).daysRemaining).toBe(30);
    expect(evaluateGoal(cumulative(), [], END).daysRemaining).toBe(1);
  });

  it('is zero once the window has closed', () => {
    expect(evaluateGoal(cumulative(), [], '2026-01-31').daysRemaining).toBe(0);
    expect(evaluateGoal(cumulative(), [], '2027-01-01').daysRemaining).toBe(0);
  });

  it('is the full window before the goal starts', () => {
    expect(evaluateGoal(cumulative(), [], '2025-12-01').daysRemaining).toBe(30);
  });

  it('closes the window even when the goal was met', () => {
    const result = evaluateGoal(cumulative(), days(START, 30, 2_000), '2026-02-15');
    expect(result.met).toBe(true);
    expect(result.expired).toBe(true);
  });

  it('is not expired on the final day', () => {
    expect(evaluateGoal(cumulative(), [], END).expired).toBe(false);
  });
});

describe('evaluateGoal — pace', () => {
  it('is on pace when progress keeps up with elapsed days', () => {
    // 10 of 30 days gone, 20,000 of 60,000 done. Exactly on pace.
    const result = evaluateGoal(cumulative(), days(START, 10, 2_000), '2026-01-10');
    expect(result.onPace).toBe(true);
  });

  it('is behind when it does not', () => {
    const result = evaluateGoal(cumulative(), days(START, 10, 500), '2026-01-10');
    expect(result.onPace).toBe(false);
  });

  it('is on pace before the goal starts, rather than instantly behind', () => {
    // Zero progress on day zero is not failure, and a goal that opens already
    // burnt-red is a goal nobody starts.
    expect(evaluateGoal(cumulative(), [], '2025-12-01').onPace).toBe(true);
  });

  it('is on pace once met, whatever the arithmetic says', () => {
    const result = evaluateGoal(cumulative(), days(START, 30, 2_000), '2026-01-10');
    expect(result.met).toBe(true);
    expect(result.onPace).toBe(true);
  });

  it('is behind on a consistency goal that can no longer be reached', () => {
    // 25 of 30 days required, 5 days missed outright: mathematically dead.
    const missed = days(START, 6, 0);
    const result = evaluateGoal(consistency(), missed, '2026-01-06');
    expect(result.onPace).toBe(false);
    expect(result.stillPossible).toBe(false);
  });

  it('is still possible when exactly enough days remain', () => {
    const result = evaluateGoal(consistency(), days(START, 5, 0), '2026-01-06');
    expect(result.daysMet).toBe(0);
    expect(result.stillPossible).toBe(true);
  });
});

describe('evaluateSquadGoal — everyone must hit it', () => {
  const squadGoal = consistency({ requiredDays: 5 });

  function member(id: string, met: boolean) {
    return { userId: id, result: evaluateGoal(squadGoal, days(START, met ? 5 : 1, 3_000), END) };
  }

  it('succeeds when enough members hit their own copy', () => {
    const result = evaluateSquadGoal(
      [member('a', true), member('b', true), member('c', false)],
      2,
    );
    expect(result.membersMet).toBe(2);
    expect(result.requiredMembers).toBe(2);
    expect(result.met).toBe(true);
  });

  it('fails one member short', () => {
    const result = evaluateSquadGoal([member('a', true), member('b', false)], 2);
    expect(result.membersMet).toBe(1);
    expect(result.met).toBe(false);
  });

  it('requires every member when requiredMembers equals the roster', () => {
    const roster = [member('a', true), member('b', true), member('c', true)];
    expect(evaluateSquadGoal(roster, 3).met).toBe(true);
    roster[2] = member('c', false);
    expect(evaluateSquadGoal(roster, 3).met).toBe(false);
  });

  it('is not met on an empty roster, however low the requirement', () => {
    // A goal nobody is on has not been achieved. `0 >= 0` would say otherwise.
    expect(evaluateSquadGoal([], 0).met).toBe(false);
  });

  it('clamps a requirement above the roster size rather than becoming unwinnable', () => {
    // The roster is frozen at creation, so this should not arise — but a
    // requirement of 5 on 3 members must not silently mean "never".
    const result = evaluateSquadGoal([member('a', true), member('b', true)], 5);
    expect(result.requiredMembers).toBe(2);
    expect(result.met).toBe(true);
  });
});

describe('goalCompletionXp', () => {
  it('pays more for a longer commitment', () => {
    const week = goalCompletionXp(cumulative({ startsOn: START, endsOn: '2026-01-07' }));
    const month = goalCompletionXp(cumulative());
    expect(month).toBeGreaterThan(week);
  });

  it('caps a year-long goal so it cannot dwarf a year of daily play', () => {
    const year = goalCompletionXp(
      cumulative({ startsOn: '2026-01-01', endsOn: '2026-12-31' }),
    );
    expect(year).toBe(MAX_GOAL_COMPLETION_XP);
  });

  it('never exceeds the cap, however absurd the window', () => {
    const decade = goalCompletionXp(
      cumulative({ startsOn: '2026-01-01', endsOn: '2036-01-01' }),
    );
    expect(decade).toBe(MAX_GOAL_COMPLETION_XP);
  });

  it('pays a whole number, because xp columns are integers', () => {
    for (const length of [1, 3, 17, 30, 100, 365]) {
      const goal = cumulative({ startsOn: START, endsOn: `2026-01-01` });
      const xp = goalCompletionXp({
        ...goal,
        endsOn: new Date(Date.UTC(2026, 0, length)).toISOString().slice(0, 10),
      });
      expect(Number.isInteger(xp)).toBe(true);
      expect(xp).toBeGreaterThan(0);
    }
  });
});

describe('purity', () => {
  it('reads no clock — the same inputs always give the same answer', () => {
    const goal = cumulative();
    const window = days(START, 12, 2_100);
    expect(evaluateGoal(goal, window, '2026-01-12')).toEqual(
      evaluateGoal(goal, window, '2026-01-12'),
    );
  });

  it('does not mutate the day array or the goal', () => {
    const goal = cumulative();
    const window = days(START, 5, 2_000);
    const goalSnapshot = JSON.parse(JSON.stringify(goal));
    const windowSnapshot = JSON.parse(JSON.stringify(window));
    evaluateGoal(goal, window, END);
    expect(goal).toEqual(goalSnapshot);
    expect(window).toEqual(windowSnapshot);
  });

  it('does not depend on the order days arrive in', () => {
    const goal = cumulative();
    const window = days(START, 10, 2_000);
    const shuffled = [...window].reverse();
    expect(evaluateGoal(goal, shuffled, END).progress).toBe(
      evaluateGoal(goal, window, END).progress,
    );
  });
});
