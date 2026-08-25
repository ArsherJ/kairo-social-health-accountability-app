import { describe, expect, it } from 'vitest';
import {
  BASE_EVENT_COMPLETION_XP,
  EVENT_DIFFICULTIES,
  MAX_EVENT_COMPLETION_XP,
  bossHp,
  evaluateEvent,
  eventCompletionXp,
  trailingMedian,
  type EventDay,
  type KairoEvent,
} from './index.ts';

const battle: KairoEvent = {
  id: 'e1',
  kind: 'battle',
  metric: 'active_kcal',
  target: 3_000,
  startsOn: '2026-09-01',
  endsOn: '2026-09-07',
};

const day = (localDate: string, value: number, status: EventDay['status'] = 'final'): EventDay => ({
  localDate,
  value,
  status,
});

describe('trailingMedian', () => {
  it('takes the middle of an odd list', () => {
    expect(trailingMedian([100, 500, 300])).toBe(300);
  });

  it('averages the middle pair of an even list', () => {
    expect(trailingMedian([100, 200, 300, 400])).toBe(250);
  });

  it('is zero for no history, so the caller must apply a floor', () => {
    expect(trailingMedian([])).toBe(0);
  });

  it('is not dragged by one enormous day, which is why it is a median', () => {
    // A mean over [200, 200, 200, 9000] is 2,450 and would set a boss nobody
    // can beat off the back of a single marathon.
    expect(trailingMedian([200, 200, 200, 9_000])).toBe(200);
  });
});

describe('bossHp', () => {
  it("scales the squad's own recent output by the window and the difficulty", () => {
    const hp = bossHp({
      pooledMedianDaily: 1_000,
      windowDays: 7,
      members: 4,
      difficulty: 'standard',
    });
    expect(hp).toBe(Math.round((1_000 * 7 * EVENT_DIFFICULTIES.standard) / 100) * 100);
  });

  it('gives a brand-new squad with no history a real fight rather than a free win', () => {
    // A pooled median of 0 would otherwise mean 0 HP: created and defeated in
    // the same second, which reads as the feature being broken.
    const hp = bossHp({ pooledMedianDaily: 0, windowDays: 7, members: 3, difficulty: 'standard' });
    expect(hp).toBeGreaterThan(0);
  });

  it('rounds to a number a person can read', () => {
    const hp = bossHp({
      pooledMedianDaily: 1_234,
      windowDays: 5,
      members: 2,
      difficulty: 'raid',
    });
    expect(hp % 100).toBe(0);
  });

  it('makes a raid harder than a skirmish over the same squad and window', () => {
    const args = { pooledMedianDaily: 2_000, windowDays: 10, members: 5 } as const;
    expect(bossHp({ ...args, difficulty: 'raid' })).toBeGreaterThan(
      bossHp({ ...args, difficulty: 'skirmish' }),
    );
  });
});

describe('evaluateEvent', () => {
  it("pools every participant's day into one number", () => {
    // Pooled, not per-member: this is the reversal of squad goals' N-of-M, and
    // it is the point. The strong member carries.
    const result = evaluateEvent(
      battle,
      [day('2026-09-01', 900), day('2026-09-01', 400), day('2026-09-02', 700)],
      '2026-09-03',
    );
    expect(result.progress).toBe(2_000);
  });

  it('ignores days outside the window', () => {
    const result = evaluateEvent(
      battle,
      [day('2026-08-31', 5_000), day('2026-09-08', 5_000), day('2026-09-02', 100)],
      '2026-09-03',
    );
    expect(result.progress).toBe(100);
  });

  it('decides completion from FINAL days only', () => {
    // A provisional day cannot complete an event: completion pays XP and
    // latches one-way, so a day Apple may still revise downward must never
    // trigger it.
    const result = evaluateEvent(
      battle,
      [day('2026-09-01', 2_000, 'final'), day('2026-09-02', 1_500, 'provisional')],
      '2026-09-03',
    );
    expect(result.progress).toBe(3_500);
    expect(result.finalProgress).toBe(2_000);
    expect(result.met).toBe(false);
  });

  it('completes once final days reach the target, inclusively', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 3_000)], '2026-09-02');
    expect(result.met).toBe(true);
  });

  it('draws a fraction the bar can render, clamped past the target', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 9_000)], '2026-09-02');
    expect(result.fraction).toBe(1);
  });

  it('counts today as a day still to come', () => {
    const result = evaluateEvent(battle, [], '2026-09-05');
    expect(result.daysRemaining).toBe(3);
    expect(result.expired).toBe(false);
  });

  it('expires past the window', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 10)], '2026-09-08');
    expect(result.expired).toBe(true);
    expect(result.daysRemaining).toBe(0);
  });

  it('stays met after expiry, because completion latches', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 3_000)], '2026-09-30');
    expect(result.met).toBe(true);
    expect(result.expired).toBe(true);
  });

  it('reports pace against elapsed time, and nothing before the first day', () => {
    const behind = evaluateEvent(battle, [day('2026-09-01', 100)], '2026-09-04');
    expect(behind.onPace).toBe(false);
    const ahead = evaluateEvent(battle, [day('2026-09-01', 2_900)], '2026-09-02');
    expect(ahead.onPace).toBe(true);
  });

  it('counts unresolved DATES, not rows, so a big squad does not spend its window on day one', () => {
    // event_progress() returns one row per participant per date. Counting rows
    // would report a six-person squad's first day as six finalized days.
    const result = evaluateEvent(
      battle,
      [day('2026-09-01', 100), day('2026-09-01', 100), day('2026-09-01', 100)],
      '2026-09-02',
    );
    expect(result.daysUnresolved).toBe(6);
  });

  it('handles an empty window without dividing by zero', () => {
    const result = evaluateEvent(battle, [], '2026-08-25');
    expect(result.progress).toBe(0);
    expect(result.met).toBe(false);
    expect(Number.isFinite(result.fraction)).toBe(true);
  });
});

describe('eventCompletionXp', () => {
  it('pays more for a longer commitment, sub-linearly', () => {
    const week = eventCompletionXp({ ...battle, endsOn: '2026-09-07' }, '2026-09-07');
    const month = eventCompletionXp({ ...battle, endsOn: '2026-09-30' }, '2026-09-30');
    expect(month).toBeGreaterThan(week);
    expect(month).toBeLessThan(week * 4);
  });

  it('pays the base for a one-day event', () => {
    expect(eventCompletionXp({ ...battle, endsOn: '2026-09-01' }, '2026-09-01')).toBe(
      BASE_EVENT_COMPLETION_XP,
    );
  });

  it('caps, so an absurd window with a trivial target is not worth gaming', () => {
    expect(
      eventCompletionXp({ ...battle, startsOn: '2026-01-01', endsOn: '2036-01-01' }, '2026-01-02'),
    ).toBe(MAX_EVENT_COMPLETION_XP);
  });

  it('pays on the window it committed to, not on how early it landed', () => {
    const early = eventCompletionXp(battle, '2026-09-02');
    const late = eventCompletionXp(battle, '2026-09-07');
    expect(early).toBe(late);
  });
});
