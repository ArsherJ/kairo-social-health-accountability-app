import { describe, expect, it } from 'vitest';
import {
  BASE_GOAL_COMPLETION_XP,
  MAX_GOAL_COMPLETION_XP,
  evaluateGoal,
  evaluateSquadGoal,
  goalCompletionXp,
  goalWindowDays,
  isGoalWindowClosed,
  type Goal,
  type GoalDay,
} from './goal.ts';

/** A 30-day January window. Both bounds inclusive. */
const START = '2026-01-01';
const END = '2026-01-30';

function cumulative(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    metric: 'daily_score',
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
    metric: 'daily_score',
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
      // The score-metric fixtures all describe days that did *not* clear the
      // walk, so every existing assertion below stays a statement about points.
      walkCleared: false,
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
    const today: GoalDay[] = [{ localDate: START, total: 2_000, walkCleared: false, status: 'provisional' }];
    expect(evaluateGoal(cumulative(), today, START).progress).toBe(2_000);
  });

  it('never lets a provisional day complete a goal', () => {
    // Completion pays XP and latches. A day that can still be revised downward
    // must not be able to trigger it.
    const today: GoalDay[] = [{ localDate: START, total: 99_000, walkCleared: false, status: 'provisional' }];
    const result = evaluateGoal(cumulative(), today, START);
    expect(result.progress).toBe(99_000);
    expect(result.met).toBe(false);
  });

  it('reports final-only progress separately, which is what completion reads', () => {
    const mixed: GoalDay[] = [
      { localDate: START, total: 30_000, walkCleared: false, status: 'final' },
      { localDate: '2026-01-02', total: 40_000, walkCleared: false, status: 'provisional' },
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
      { localDate: '2026-01-25', total: 3_000, walkCleared: false, status: 'provisional' },
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
    const week = goalCompletionXp(cumulative({ startsOn: START, endsOn: '2026-01-07' }), END);
    const month = goalCompletionXp(cumulative(), END);
    expect(month).toBeGreaterThan(week);
  });

  it('caps a year-long goal so it cannot dwarf a year of daily play', () => {
    const year = goalCompletionXp(
      cumulative({ startsOn: '2026-01-01', endsOn: '2026-12-31' }),
      '2026-12-31',
    );
    expect(year).toBe(MAX_GOAL_COMPLETION_XP);
  });

  it('never exceeds the cap, however absurd the window', () => {
    const decade = goalCompletionXp(
      cumulative({ startsOn: '2026-01-01', endsOn: '2036-01-01' }),
      '2036-01-01',
    );
    expect(decade).toBe(MAX_GOAL_COMPLETION_XP);
  });

  it('pays a whole number, because xp columns are integers', () => {
    for (const length of [1, 3, 17, 30, 100, 365]) {
      const goal = cumulative({ startsOn: START, endsOn: `2026-01-01` });
      const endsOn = new Date(Date.UTC(2026, 0, length)).toISOString().slice(0, 10);
      const xp = goalCompletionXp({ ...goal, endsOn }, endsOn);
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

// ---------------------------------------------------------------------------
// Open-ended goals — `endsOn: null`
// ---------------------------------------------------------------------------
//
// "Reach 500,000 points, however long it takes." Cumulative only, enforced in
// SQL by `goals_consistency_needs_end`: a consistency goal with no end can
// never become dead, so `stillPossible` would be a constant and the pace marker
// would have no denominator to sit on.

function openEnded(overrides: Partial<Goal> = {}): Goal {
  return { ...cumulative(), endsOn: null, ...overrides };
}

describe('goalWindowDays — open-ended', () => {
  it('is null when there is no end date', () => {
    expect(goalWindowDays(openEnded())).toBeNull();
  });

  it('still measures a finite window', () => {
    expect(goalWindowDays(cumulative())).toBe(30);
  });
});

describe('isGoalWindowClosed — open-ended', () => {
  it('never closes', () => {
    expect(isGoalWindowClosed(openEnded(), '2099-12-31')).toBe(false);
  });
});

describe('evaluateGoal — open-ended', () => {
  it('counts every day from the start with no upper bound', () => {
    const result = evaluateGoal(openEnded(), days(START, 40, 2_000), '2026-02-09');
    expect(result.progress).toBe(80_000);
    expect(result.finalProgress).toBe(80_000);
  });

  it('still excludes days before the start date', () => {
    const before = days('2025-12-28', 4, 1_000);
    const inside = days(START, 3, 2_000);
    const result = evaluateGoal(openEnded(), [...before, ...inside], '2026-01-03');
    expect(result.progress).toBe(6_000);
  });

  it('never expires', () => {
    expect(evaluateGoal(openEnded(), [], '2099-12-31').expired).toBe(false);
  });

  it('reports no days remaining — calendar time left is unbounded', () => {
    expect(evaluateGoal(openEnded(), days(START, 5, 1_000), '2026-01-05').daysRemaining)
      .toBeNull();
  });

  it('reports no pace — there is no schedule to be behind', () => {
    expect(evaluateGoal(openEnded(), days(START, 5, 10), '2026-01-05').onPace).toBeNull();
  });

  it('is always still possible while unmet', () => {
    const result = evaluateGoal(openEnded(), days(START, 5, 0), '2026-01-05');
    expect(result.met).toBe(false);
    expect(result.stillPossible).toBe(true);
  });

  it('counts unresolved days from elapsed time, not from a window length', () => {
    // Five days elapsed, three of them final: two are still unresolved.
    const scored = days(START, 3, 1_000);
    const provisional: GoalDay[] = [
      { localDate: '2026-01-04', total: 500, walkCleared: false, status: 'provisional' },
      { localDate: '2026-01-05', total: 500, walkCleared: false, status: 'provisional' },
    ];
    const result = evaluateGoal(openEnded(), [...scored, ...provisional], '2026-01-05');
    expect(result.daysUnresolved).toBe(2);
  });

  it('completes off final days only, same as a finite goal', () => {
    const goal = openEnded({ target: 3_000 });
    const provisional: GoalDay[] = [
      { localDate: START, total: 4_000, walkCleared: false, status: 'provisional' },
    ];
    expect(evaluateGoal(goal, provisional, START).met).toBe(false);
    expect(evaluateGoal(goal, days(START, 1, 4_000), START).met).toBe(true);
  });
});

describe('goalCompletionXp — open-ended', () => {
  it('pays a finite goal from its window, ignoring the completion date', () => {
    const goal = cumulative({ startsOn: START, endsOn: '2026-01-07' });
    expect(goalCompletionXp(goal, '2026-01-03')).toBe(goalCompletionXp(goal, END));
  });

  it('pays an open-ended goal from how long it actually ran', () => {
    const goal = openEnded();
    const week = cumulative({ startsOn: START, endsOn: '2026-01-07' });
    expect(goalCompletionXp(goal, '2026-01-07')).toBe(goalCompletionXp(week, '2026-01-07'));
  });

  it('pays the one-day base when an open-ended goal completes on day one', () => {
    expect(goalCompletionXp(openEnded(), START)).toBe(BASE_GOAL_COMPLETION_XP);
  });

  it('caps an open-ended goal like any other', () => {
    expect(goalCompletionXp(openEnded(), '2036-01-01')).toBe(MAX_GOAL_COMPLETION_XP);
  });

  it('never pays less than the base, even if the date arrives early', () => {
    // Defensive: a completion date before the start would give a negative span.
    expect(goalCompletionXp(openEnded(), '2025-12-01')).toBe(BASE_GOAL_COMPLETION_XP);
  });
});

// ---------------------------------------------------------------------------
// The Daily Walk as a metric — `metric: 'daily_walk'`
// ---------------------------------------------------------------------------
//
// The bar is a boolean already stored in `daily_scores.tiers`, so these goals
// are scored off `walkCleared` and never off `total`. `target` is a sentinel 1
// for the consistency kind, because the column requires a positive value and
// the bar is not a number.

function walkConsistency(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g3',
    metric: 'daily_walk',
    kind: 'consistency',
    // Ignored for a daily_walk consistency goal — the bar is "cleared the
    // walk", not a number. It is 1 because the database requires target > 0.
    target: 1,
    requiredDays: 25,
    startsOn: START,
    endsOn: END,
    ...overrides,
  };
}

/** `count` consecutive final days, each clearing the walk or not. */
function walkDays(from: string, count: number, cleared: boolean, total = 0): GoalDay[] {
  return days(from, count, total).map((day) => ({ ...day, walkCleared: cleared }));
}

describe('evaluateGoal — daily_walk, consistency', () => {
  it('counts a day that cleared the walk', () => {
    const result = evaluateGoal(walkConsistency(), walkDays(START, 1, true), '2026-01-03');
    expect(result.progress).toBe(1);
    expect(result.target).toBe(25);
  });

  it('ignores the score entirely', () => {
    // The whole point of the metric: a huge step count that fell short of the
    // baseline is not a cleared walk, and a modest day that reached it is.
    const result = evaluateGoal(
      walkConsistency(),
      [...walkDays(START, 1, false, 99_999), ...walkDays('2026-01-02', 1, true, 1)],
      '2026-01-03',
    );
    expect(result.progress).toBe(1);
  });

  it('never reads the sentinel target as a points bar', () => {
    // `target: 1` with the score metric would count every day scoring at least
    // one point. This is the assertion that catches a lost `metric` field.
    const result = evaluateGoal(walkConsistency(), walkDays(START, 10, false, 5_000), END);
    expect(result.progress).toBe(0);
    expect(result.met).toBe(false);
  });

  it('is met once enough days cleared it', () => {
    const result = evaluateGoal(walkConsistency(), walkDays(START, 25, true), '2026-01-25');
    expect(result.met).toBe(true);
    expect(result.daysMet).toBe(25);
  });

  it('treats a scoreless day as not cleared', () => {
    // A scoreless participant arrives as a null-extended row from the LEFT JOIN
    // in goal_window_scores. It must read as "did not clear", never as cleared.
    expect(evaluateGoal(walkConsistency(), walkDays(START, 1, false), '2026-01-03').progress)
      .toBe(0);
  });

  it('excludes a provisional cleared walk from completion', () => {
    const banked = walkDays(START, 24, true);
    const today: GoalDay[] = [
      { localDate: '2026-01-25', total: 0, walkCleared: true, status: 'provisional' },
    ];
    const result = evaluateGoal(walkConsistency(), [...banked, ...today], '2026-01-25');
    expect(result.progress).toBe(25);
    expect(result.met).toBe(false);
  });
});

describe('evaluateGoal — daily_walk, cumulative', () => {
  const walkTotal = walkConsistency({ kind: 'cumulative', target: 20, requiredDays: null });

  it('counts cleared walks toward the total', () => {
    const result = evaluateGoal(
      walkTotal,
      [
        ...walkDays(START, 1, true),
        ...walkDays('2026-01-02', 1, false),
        ...walkDays('2026-01-03', 1, true),
      ],
      '2026-01-04',
    );
    expect(result.progress).toBe(2);
    expect(result.target).toBe(20);
    expect(result.met).toBe(false);
  });

  it('dies once too few days remain to reach the total', () => {
    // A walk day contributes at most 1, unlike a points day which has no
    // ceiling — so a cumulative walk goal can go arithmetically dead before its
    // window closes, exactly as a consistency goal can. 5 banked, 25 days
    // final, 5 unresolved, 20 needed.
    const result = evaluateGoal(
      walkTotal,
      [...walkDays(START, 5, true), ...walkDays('2026-01-06', 20, false)],
      '2026-01-25',
    );
    expect(result.progress).toBe(5);
    expect(result.stillPossible).toBe(false);
  });

  it('is still possible when exactly enough days remain', () => {
    // 5 banked, 10 days final, 20 unresolved: 5 + 20 is exactly 25 ≥ 20.
    const result = evaluateGoal(
      walkTotal,
      [...walkDays(START, 5, true), ...walkDays('2026-01-06', 5, false)],
      '2026-01-10',
    );
    expect(result.stillPossible).toBe(true);
  });

  it('is always still possible when open-ended — there is always tomorrow', () => {
    const result = evaluateGoal(
      { ...walkTotal, endsOn: null },
      walkDays(START, 25, false),
      '2026-01-25',
    );
    expect(result.stillPossible).toBe(true);
  });
});

describe('evaluateGoal — daily_score is unchanged', () => {
  it('still sums totals for a cumulative goal', () => {
    const scored: GoalDay[] = [
      { localDate: START, total: 400, walkCleared: true, status: 'final' },
      { localDate: '2026-01-02', total: 300, walkCleared: false, status: 'final' },
    ];
    expect(evaluateGoal(cumulative({ target: 1_000 }), scored, '2026-01-03').progress)
      .toBe(700);
  });

  it('still ignores walkCleared for a consistency goal', () => {
    // A cleared walk that scored under the points bar contributes nothing.
    const scored: GoalDay[] = [
      { localDate: START, total: 100, walkCleared: true, status: 'final' },
    ];
    expect(evaluateGoal(consistency(), scored, '2026-01-02').progress).toBe(0);
  });

  it('still stays possible on a cumulative points goal with one day left', () => {
    // No per-day ceiling on points, so a single unresolved day keeps a points
    // goal alive however far behind it is. The walk cap must not leak here.
    const result = evaluateGoal(cumulative(), days(START, 29, 0), END);
    expect(result.daysUnresolved).toBe(1);
    expect(result.stillPossible).toBe(true);
  });
});
