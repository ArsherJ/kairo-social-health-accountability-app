import { describe, expect, it } from 'vitest';
import {
  SHIELD_MINIMUM_STREAK,
  SHIELD_RECHARGE_DAYS,
  STREAK_MILESTONES,
  advanceStreak,
  type StreakState,
} from './streak.ts';

function state(overrides: Partial<StreakState> = {}): StreakState {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastScoredDate: null,
    shieldAvailableOn: null,
    ...overrides,
  };
}

/** Run a sequence of scored/missed days and return the final state. */
function play(initial: StreakState, days: Array<[string, boolean]>): StreakState {
  return days.reduce(
    (acc, [localDate, scored]) => advanceStreak(acc, { localDate, scored }).next,
    initial,
  );
}

describe('building a streak', () => {
  it('starts at 1 on the first scored day', () => {
    const result = advanceStreak(state(), { localDate: '2026-07-20', scored: true });
    expect(result.next.currentStreak).toBe(1);
    expect(result.next.lastScoredDate).toBe('2026-07-20');
  });

  it('extends across consecutive days', () => {
    const final = play(state(), [
      ['2026-07-20', true],
      ['2026-07-21', true],
      ['2026-07-22', true],
    ]);
    expect(final.currentStreak).toBe(3);
  });

  it('tracks the longest streak separately', () => {
    const final = play(state(), [
      ['2026-07-20', true],
      ['2026-07-21', true],
      ['2026-07-22', true],
      ['2026-07-23', false], // breaks (streak too short to shield)
      ['2026-07-24', true],
    ]);
    expect(final.currentStreak).toBe(1);
    expect(final.longestStreak).toBe(3);
  });

  it('restarts at 1 after a gap rather than resuming', () => {
    const final = play(state({ currentStreak: 4, longestStreak: 4, lastScoredDate: '2026-07-20' }), [
      ['2026-07-25', true],
    ]);
    expect(final.currentStreak).toBe(1);
  });

  it('crosses a month boundary', () => {
    const final = play(state(), [
      ['2026-07-31', true],
      ['2026-08-01', true],
    ]);
    expect(final.currentStreak).toBe(2);
  });
});

describe('idempotency', () => {
  it('does not advance twice for the same day', () => {
    const day = { localDate: '2026-07-21', scored: true };
    const once = advanceStreak(
      state({ currentStreak: 1, longestStreak: 1, lastScoredDate: '2026-07-20' }),
      day,
    );
    expect(once.next.currentStreak).toBe(2);

    const twice = advanceStreak(once.next, day);
    expect(twice.unchanged).toBe(true);
    expect(twice.next.currentStreak).toBe(2);
  });

  it('does not consume a second Shield on a retry', () => {
    const before = state({
      currentStreak: 7,
      longestStreak: 7,
      lastScoredDate: '2026-07-26',
    });
    const first = advanceStreak(before, { localDate: '2026-07-27', scored: false });
    expect(first.shieldUsed).toBe(true);

    const retry = advanceStreak(first.next, { localDate: '2026-07-27', scored: false });
    expect(retry.shieldUsed).toBe(false);
    expect(retry.unchanged).toBe(true);
    expect(retry.next.shieldAvailableOn).toBe(first.next.shieldAvailableOn);
  });

  it('reports no change when a missed day follows an already-zero streak', () => {
    const result = advanceStreak(state(), { localDate: '2026-07-27', scored: false });
    expect(result.unchanged).toBe(true);
    expect(result.next.currentStreak).toBe(0);
  });
});

describe('the Streak Shield', () => {
  it('requires an established streak', () => {
    expect(SHIELD_MINIMUM_STREAK).toBe(5);
  });

  it('does not catch a short streak', () => {
    const result = advanceStreak(
      state({ currentStreak: 4, longestStreak: 4, lastScoredDate: '2026-07-26' }),
      { localDate: '2026-07-27', scored: false },
    );
    expect(result.shieldUsed).toBe(false);
    expect(result.next.currentStreak).toBe(0);
  });

  it('catches a miss on a five-day streak', () => {
    const result = advanceStreak(
      state({ currentStreak: 5, longestStreak: 5, lastScoredDate: '2026-07-26' }),
      { localDate: '2026-07-27', scored: false },
    );
    expect(result.shieldUsed).toBe(true);
    expect(result.next.currentStreak).toBe(5);
  });

  it('keeps the chain intact so the next day continues rather than restarting', () => {
    const final = play(
      state({ currentStreak: 9, longestStreak: 9, lastScoredDate: '2026-07-25' }),
      [
        ['2026-07-26', false], // shielded
        ['2026-07-27', true],
      ],
    );
    expect(final.currentStreak).toBe(10);
  });

  it('recharges after thirty days', () => {
    expect(SHIELD_RECHARGE_DAYS).toBe(30);
    const result = advanceStreak(
      state({ currentStreak: 6, longestStreak: 6, lastScoredDate: '2026-07-26' }),
      { localDate: '2026-07-27', scored: false },
    );
    expect(result.next.shieldAvailableOn).toBe('2026-08-26');
  });

  it('cannot save two misses inside the recharge window', () => {
    const final = play(
      state({ currentStreak: 8, longestStreak: 8, lastScoredDate: '2026-07-25' }),
      [
        ['2026-07-26', false], // shielded
        ['2026-07-27', true],
        ['2026-07-28', false], // shield still recharging -> breaks
      ],
    );
    expect(final.currentStreak).toBe(0);
  });

  it('works again once the recharge window has passed', () => {
    const result = advanceStreak(
      state({
        currentStreak: 12,
        longestStreak: 12,
        lastScoredDate: '2026-08-26',
        shieldAvailableOn: '2026-08-26',
      }),
      { localDate: '2026-08-27', scored: false },
    );
    expect(result.shieldUsed).toBe(true);
    expect(result.next.currentStreak).toBe(12);
  });
});

describe('milestones', () => {
  it('matches the spec', () => {
    expect(STREAK_MILESTONES).toEqual([3, 7, 14, 30, 100]);
  });

  it('fires exactly on the milestone day', () => {
    const reached: number[] = [];
    let current = state();
    for (let day = 1; day <= 31; day++) {
      const localDate = `2026-07-${String(day).padStart(2, '0')}`;
      const result = advanceStreak(current, { localDate, scored: true });
      if (result.milestoneReached !== null) reached.push(result.milestoneReached);
      current = result.next;
    }
    expect(reached).toEqual([3, 7, 14, 30]);
  });

  it('does not fire on a shielded day', () => {
    // Reaching day 7 via a Shield would award the milestone for a day the user
    // did not actually move.
    const result = advanceStreak(
      state({ currentStreak: 7, longestStreak: 7, lastScoredDate: '2026-07-26' }),
      { localDate: '2026-07-27', scored: false },
    );
    expect(result.milestoneReached).toBeNull();
  });
});
