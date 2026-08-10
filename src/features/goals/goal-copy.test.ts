import { describe, expect, it } from 'vitest';
import { evaluateGoal, type Goal, type GoalDay } from '../../../packages/kairo-core/src/goal.ts';
import {
  fillFraction,
  goalTone,
  paceFraction,
  progressLine,
  shortDate,
  squadRequirementLine,
  statusLine,
} from './goal-copy.ts';

const WINDOW_DAYS = 30;

function cumulative(): Goal {
  return {
    id: 'g',
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
      status: 'final',
    });
  }
  return out;
}

describe('progressLine', () => {
  it('names days for a consistency goal', () => {
    const p = evaluateGoal(consistency(), days('2026-01-01', 18, 3_000), '2026-01-18');
    expect(progressLine('consistency', p)).toBe('18 of 25 days');
  });

  it('leaves a cumulative goal unitless, because the unit is points', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 21, 2_014), '2026-01-21');
    expect(progressLine('cumulative', p)).toBe('42,294 of 60,000');
  });

  it('states the real number when the target was overshot', () => {
    const p = evaluateGoal(cumulative(), days('2026-01-01', 30, 5_000), '2026-01-30');
    expect(progressLine('cumulative', p)).toBe('150,000 of 60,000');
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
});
