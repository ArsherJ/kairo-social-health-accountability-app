import { describe, expect, it } from 'vitest';
import { evaluateGoal, type Goal, type GoalDay } from '../../../packages/kairo-core/src/goal.ts';
import {
  deadlineLine,
  fillFraction,
  goalTone,
  paceFraction,
  progressLine,
  shortDate,
  squadRequirementLine,
  statusLine,
  windowLine,
} from './goal-copy.ts';

const WINDOW_DAYS = 30;

function cumulative(): Goal {
  return {
    id: 'g',
    metric: 'daily_score',
    kind: 'cumulative',
    target: 60_000,
    requiredDays: null,
    startsOn: '2026-01-01',
    endsOn: '2026-01-30',
  };
}

function consistency(): Goal {
  return {
    id: 'g',
    metric: 'daily_score',
    kind: 'consistency',
    target: 2_500,
    requiredDays: 25,
    startsOn: '2026-01-01',
    endsOn: '2026-01-30',
  };
}

function days(from: string, count: number, total: number): GoalDay[] {
  const out: GoalDay[] = [];
  const [y, m, d] = from.split('-').map(Number) as [number, number, number];
  for (let i = 0; i < count; i++) {
    out.push({
      localDate: new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
      total,
      walkCleared: false,
      status: 'final',
    });
  }
  return out;
}

describe('progressLine', () => {
  it('names days for a consistency goal', () => {
    const p = evaluateGoal(consistency(), days('2026-01-01', 18, 3_000), '2026-01-18');
    expect(progressLine('consistency', 'daily_score', p)).toBe('18 of 25 days');
  });

  it('leaves a cumulative goal unitless, because the unit is points', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 21, 2_014), '2026-01-21');
    expect(progressLine('cumulative', 'daily_score', p)).toBe('42,294 of 60,000');
  });

  it('states the real number when the target was overshot', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 30, 5_000), '2026-01-30');
    expect(progressLine('cumulative', 'daily_score', p)).toBe('150,000 of 60,000');
  });
});

describe('statusLine', () => {
  it('says done, and nothing else, once met', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 30, 2_000), '2026-01-15');
    expect(statusLine(p)).toBe('Done.');
  });

  it('reports on pace with the days left', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 10, 2_000), '2026-01-10');
    expect(statusLine(p)).toBe('21 days left · on pace');
  });

  it('reports behind pace', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 10, 500), '2026-01-10');
    expect(statusLine(p)).toBe('21 days left · behind pace');
  });

  it('singularises the last day', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 1, 100), '2026-01-30');
    expect(statusLine(p)).toContain('Last day');
    expect(statusLine(p)).not.toContain('1 days');
  });

  it('does not congratulate a goal nobody has started', () => {
    // Day one, nothing logged. The required-so-far is zero too, so `onPace` is
    // trivially true and the line used to read "on pace" against 0 of 60,000.
    const p = evaluateGoal(cumulative(), [], '2026-01-01');
    expect(p.progress).toBe(0);
    expect(statusLine(p)).toContain('not started');
    expect(statusLine(p)).not.toContain('on pace');
  });

  it('still says behind rather than not started once the shortfall is real', () => {
    // Zero progress deep into the window is behind, and that is the more useful
    // thing to say — "not started" only replaces the unearned verdict.
    const p = evaluateGoal(cumulative(), days('2026-01-01', 10, 0), '2026-01-10');
    expect(p.progress).toBe(0);
    expect(statusLine(p)).toContain('behind pace');
  });

  it('says a consistency goal is out of reach rather than counting down at it', () => {
    // 25 of 30 days needed, 6 finalized at zero: dead. Telling someone they have
    // 24 days left would be true and useless.
    const p = evaluateGoal(consistency(), days('2026-01-01', 6, 0), '2026-01-06');
    expect(statusLine(p)).toBe('Out of reach for this window.');
  });

  it('says the window closed once it is behind us', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 1, 100), '2026-02-01');
    expect(statusLine(p)).toBe('Window closed.');
  });
});

describe('goalTone', () => {
  it('is done when met, whatever the pace says', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 30, 2_000), '2026-01-15');
    expect(goalTone(p)).toBe('done');
  });

  it('is ok while on pace', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 10, 2_000), '2026-01-10');
    expect(goalTone(p)).toBe('ok');
  });

  it('is behind when off pace, when out of reach, and when the window shuts', () => {
    expect(goalTone(evaluateGoal(cumulative(), days('2026-01-01', 10, 500), '2026-01-10'))).toBe('behind');
    expect(goalTone(evaluateGoal(consistency(), days('2026-01-01', 6, 0), '2026-01-06'))).toBe('behind');
    expect(goalTone(evaluateGoal(cumulative(), [], '2026-02-01'))).toBe('behind');
  });

  it('is ok before the window opens, not behind', () => {
    // A goal that opens already burnt-red is a goal nobody starts.
    expect(goalTone(evaluateGoal(cumulative(), [], '2025-12-01'))).toBe('ok');
  });
});

describe('fillFraction', () => {
  it('is the ratio of progress to target', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 15, 2_000), '2026-01-15');
    expect(fillFraction(p)).toBeCloseTo(0.5, 5);
  });

  it('clamps an overshoot at 1 so the bar never exceeds its track', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 30, 5_000), '2026-01-30');
    expect(fillFraction(p)).toBe(1);
  });

  it('is 0 rather than NaN when the target is somehow zero', () => {
    expect(fillFraction({ ...evaluateGoal(cumulative(), [], '2026-01-01'), target: 0 })).toBe(0);
  });
});

describe('paceFraction', () => {
  it('is the elapsed share of the window', () => {
    const p = evaluateGoal(cumulative(), [], '2026-01-16');
    // 2026-01-16 is the 16th day; 15 have elapsed.
    expect(paceFraction(p, WINDOW_DAYS)).toBeCloseTo(15 / 30, 5);
  });

  it('is null before the window opens — a tick at 0 says nothing', () => {
    expect(paceFraction(evaluateGoal(cumulative(), [], '2025-12-01'), WINDOW_DAYS)).toBeNull();
  });

  it('is null once the window closes', () => {
    expect(paceFraction(evaluateGoal(cumulative(), [], '2026-02-01'), WINDOW_DAYS)).toBeNull();
  });

  it('is null once met, because there is no longer a race', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 30, 2_000), '2026-01-10');
    expect(paceFraction(p, WINDOW_DAYS)).toBeNull();
  });

  it('is null on the first day, where elapsed is zero', () => {
    expect(paceFraction(evaluateGoal(cumulative(), [], '2026-01-01'), WINDOW_DAYS)).toBeNull();
  });
});

describe('shortDate', () => {
  it('omits the year inside the current one', () => {
    expect(shortDate('2026-01-31', '2026-08-10')).toBe('31 Jan');
  });

  it('states the year when it differs', () => {
    expect(shortDate('2027-03-04', '2026-08-10')).toBe('4 Mar 2027');
  });
});

describe('squadRequirementLine', () => {
  it('says everyone when the requirement is the whole roster', () => {
    expect(squadRequirementLine(2, 4, 4)).toBe('2 hit it · needs everyone');
  });

  it('names the fraction when it is not', () => {
    expect(squadRequirementLine(2, 3, 5)).toBe('2 hit it · needs 3 of 5');
  });

  it('treats a clamped requirement above the roster as everyone', () => {
    expect(squadRequirementLine(1, 9, 3)).toBe('1 hit it · needs everyone');
  });

  it('drops the roster framing on a squad of one', () => {
    // "0 hit it · needs everyone" on a solo squad reads as a crowd withholding
    // something from you, when the crowd is you.
    expect(squadRequirementLine(0, 1, 1)).toBe('Not hit yet');
    expect(squadRequirementLine(1, 1, 1)).toBe('You hit it');
  });
});

// ---------------------------------------------------------------------------
// Open-ended goals
// ---------------------------------------------------------------------------

function openEnded(): Goal {
  return { ...cumulative(), endsOn: null };
}

describe('deadlineLine', () => {
  it('names a future deadline', () => {
    expect(deadlineLine('2026-01-30', '2026-01-15')).toBe('by 30 Jan');
  });

  it('says a past window ended', () => {
    expect(deadlineLine('2026-01-10', '2026-01-15')).toBe('ended 10 Jan');
  });

  it('treats the last day as still ahead, not ended', () => {
    expect(deadlineLine('2026-01-15', '2026-01-15')).toBe('by 15 Jan');
  });

  it('says so when there is no deadline at all', () => {
    expect(deadlineLine(null, '2026-01-15')).toBe('no deadline');
  });
});

describe('windowLine', () => {
  const base = { startsOn: '2026-01-01', today: '2026-01-15' };

  it('states the span and its length', () => {
    expect(
      windowLine({ ...base, metric: 'daily_score', endsOn: '2026-01-30', windowDays: 30, dailyTarget: null }),
    ).toBe('1 Jan – 30 Jan · 30 days');
  });

  it('adds the daily bar for a consistency goal', () => {
    expect(
      windowLine({ ...base, metric: 'daily_score', endsOn: '2026-01-30', windowDays: 30, dailyTarget: 2_500 }),
    ).toBe('1 Jan – 30 Jan · 30 days · 2,500 a day');
  });

  it('states the start and no end date when open-ended', () => {
    expect(
      windowLine({ ...base, metric: 'daily_score', endsOn: null, windowDays: null, dailyTarget: null }),
    ).toBe('From 1 Jan · no end date');
  });
});

describe('statusLine — open-ended', () => {
  it('offers no countdown and no pace verdict', () => {
    const progress = evaluateGoal(openEnded(), days('2026-01-01', 5, 1_000), '2026-01-05');
    expect(statusLine(progress)).toBe('No deadline · keep going');
  });

  it('still says Done once met', () => {
    const progress = evaluateGoal(openEnded(), days('2026-01-01', 40, 2_000), '2026-02-09');
    expect(progress.met).toBe(true);
    expect(statusLine(progress)).toBe('Done.');
  });
});

describe('goalTone — open-ended', () => {
  it('reads as fine rather than behind when there is no pace', () => {
    // A null `onPace` is the absence of a verdict, not a failing one. Treating
    // it as behind would paint every open-ended goal in the damage colour.
    const progress = evaluateGoal(openEnded(), days('2026-01-01', 5, 1), '2026-01-05');
    expect(progress.onPace).toBeNull();
    expect(goalTone(progress)).toBe('ok');
  });
});

describe('paceFraction — open-ended', () => {
  it('marks nothing, because there is nowhere the fill ought to be', () => {
    const progress = evaluateGoal(openEnded(), days('2026-01-01', 5, 1_000), '2026-01-05');
    expect(paceFraction(progress, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The Daily Walk metric
// ---------------------------------------------------------------------------
//
// Only two strings move. A consistency goal already counted days and says so
// whichever metric it uses; a cumulative walk goal is the one that needs a
// noun, because "12 of 20" alone reads as points. The window line drops its
// daily bar, which for a walk goal is the sentinel `target: 1` and would
// otherwise render as "· 1 a day".

function walkGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    metric: 'daily_walk',
    kind: 'consistency',
    target: 1,
    requiredDays: 25,
    startsOn: '2026-01-01',
    endsOn: '2026-01-30',
    ...overrides,
  };
}

function walkDays(from: string, count: number, cleared: boolean): GoalDay[] {
  return days(from, count, 0).map((day) => ({ ...day, walkCleared: cleared }));
}

describe('progressLine — daily_walk', () => {
  it('counts days for a consistency walk goal, as it always did', () => {
    const p = evaluateGoal(walkGoal(), walkDays('2026-01-01', 8, true), '2026-01-08');
    expect(progressLine('consistency', 'daily_walk', p)).toBe('8 of 25 days');
  });

  it('names walks for a cumulative walk goal, which would otherwise read as points', () => {
    const goal = walkGoal({ kind: 'cumulative', target: 20, requiredDays: null });
    const p = evaluateGoal(goal, walkDays('2026-01-01', 12, true), '2026-01-12');
    expect(progressLine('cumulative', 'daily_walk', p)).toBe('12 of 20 walks');
  });

  it('says walk, singular, for a target of one', () => {
    const goal = walkGoal({ kind: 'cumulative', target: 1, requiredDays: null });
    const p = evaluateGoal(goal, walkDays('2026-01-01', 1, true), '2026-01-01');
    expect(progressLine('cumulative', 'daily_walk', p)).toBe('1 of 1 walk');
  });

  it('never says points for a walk goal', () => {
    const goal = walkGoal({ kind: 'cumulative', target: 20, requiredDays: null });
    const p = evaluateGoal(goal, walkDays('2026-01-01', 3, true), '2026-01-03');
    for (const kind of ['cumulative', 'consistency'] as const) {
      expect(progressLine(kind, 'daily_walk', p)).not.toMatch(/point/i);
    }
  });
});

describe('windowLine — daily_walk', () => {
  const base = { startsOn: '2026-01-01', today: '2026-01-15' };

  it('drops the daily bar, which is a sentinel and not a number', () => {
    expect(
      windowLine({
        ...base,
        metric: 'daily_walk',
        endsOn: '2026-01-30',
        windowDays: 30,
        dailyTarget: 1,
      }),
    ).toBe('1 Jan – 30 Jan · 30 days');
  });

  it('still states the span for an open-ended walk goal', () => {
    expect(
      windowLine({
        ...base,
        metric: 'daily_walk',
        endsOn: null,
        windowDays: null,
        dailyTarget: 1,
      }),
    ).toBe('From 1 Jan · no end date');
  });
});
