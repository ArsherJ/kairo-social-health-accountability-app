import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE } from '@kairo/core';
import { dailyWalkState, walkNote, type DailyWalkDay } from './daily-walk.ts';

/** Days cleared, newest last. Order is deliberately not what the code relies on. */
function cleared(...dates: string[]): DailyWalkDay[] {
  return dates.map((localDate) => ({ localDate, met: true }));
}

const TODAY = '2026-08-15';

describe('dailyWalkState — today', () => {
  it('reports the baseline it was drawn against', () => {
    const state = dailyWalkState({ todaySteps: 0, today: TODAY, days: [] });
    expect(state.baseline).toBe(DAILY_STEP_BASELINE);
  });

  it('is not met on a standing start', () => {
    const state = dailyWalkState({ todaySteps: 0, today: TODAY, days: [] });
    expect(state.met).toBe(false);
    expect(state.fraction).toBe(0);
    expect(state.remaining).toBe(DAILY_STEP_BASELINE);
  });

  it('is met exactly at the baseline, not one step past it', () => {
    // The same boundary tierFor uses: >= gold, not > gold. If these disagreed,
    // a day could show as cleared here and un-cleared in the streak tomorrow.
    expect(dailyWalkState({ todaySteps: 10_000, today: TODAY, days: [] }).met).toBe(true);
    expect(dailyWalkState({ todaySteps: 9_999, today: TODAY, days: [] }).met).toBe(false);
  });

  it('reports the fraction of the way there', () => {
    expect(dailyWalkState({ todaySteps: 2_500, today: TODAY, days: [] }).fraction).toBe(0.25);
  });

  it('clamps the fraction at 1 on a big day', () => {
    // The bar cannot overflow its track, and "250% of the baseline" is not a
    // thing the card says — the target does not grow, so beating it hard is
    // just a cleared day.
    const state = dailyWalkState({ todaySteps: 25_000, today: TODAY, days: [] });
    expect(state.fraction).toBe(1);
    expect(state.remaining).toBe(0);
  });

  it('treats a negative or absent step count as zero rather than throwing', () => {
    // `useTodayBuckets` can hand over undefined before the first sync lands.
    expect(dailyWalkState({ todaySteps: undefined, today: TODAY, days: [] }).todaySteps).toBe(0);
    expect(dailyWalkState({ todaySteps: -5, today: TODAY, days: [] }).fraction).toBe(0);
  });
});

describe('dailyWalkState — the streak', () => {
  it('is zero with no history and an unmet today', () => {
    expect(dailyWalkState({ todaySteps: 0, today: TODAY, days: [] }).streak).toBe(0);
  });

  it('counts today the moment it is met, before the day is final', () => {
    // Live steps decide today, not the stored row — `daily_scores` for today is
    // still being rescored, and a user who just crossed 10,000 must see it.
    const state = dailyWalkState({ todaySteps: 10_400, today: TODAY, days: [] });
    expect(state.streak).toBe(1);
  });

  it('counts back through consecutive cleared days', () => {
    const state = dailyWalkState({
      todaySteps: 11_000,
      today: TODAY,
      days: cleared('2026-08-12', '2026-08-13', '2026-08-14'),
    });
    expect(state.streak).toBe(4);
  });

  it('keeps yesterday’s streak alive while today is still unmet', () => {
    // The day is not over. A streak that read 0 at 9am every morning would be
    // punishing the user for the time of day.
    const state = dailyWalkState({
      todaySteps: 300,
      today: TODAY,
      days: cleared('2026-08-13', '2026-08-14'),
    });
    expect(state.streak).toBe(2);
  });

  it('stops at a gap, whether the day is absent or present-and-unmet', () => {
    // Absent: `daily_scores` has no row for a day with no activity at all.
    const absent = dailyWalkState({
      todaySteps: 11_000,
      today: TODAY,
      days: cleared('2026-08-12', '2026-08-14'),
    });
    expect(absent.streak).toBe(2);

    // Present but under the baseline: a scored day that did not clear the walk.
    const unmet = dailyWalkState({
      todaySteps: 11_000,
      today: TODAY,
      days: [
        { localDate: '2026-08-12', met: true },
        { localDate: '2026-08-13', met: false },
        { localDate: '2026-08-14', met: true },
      ],
    });
    expect(unmet.streak).toBe(2);
  });

  it('breaks to zero when yesterday was missed and today is not met yet', () => {
    const state = dailyWalkState({
      todaySteps: 100,
      today: TODAY,
      days: cleared('2026-08-10', '2026-08-11'),
    });
    expect(state.streak).toBe(0);
  });

  it('ignores days after today, so a stale window cannot inflate a streak', () => {
    const state = dailyWalkState({
      todaySteps: 0,
      today: TODAY,
      days: cleared('2026-08-14', '2026-08-16', '2026-08-17'),
    });
    expect(state.streak).toBe(1);
  });

  it('does not double-count a stored row for today', () => {
    // The window query can return today's own row. Today is decided by live
    // steps; the row must not add a second day to the count.
    const state = dailyWalkState({
      todaySteps: 12_000,
      today: TODAY,
      days: cleared('2026-08-14', TODAY),
    });
    expect(state.streak).toBe(2);
  });

  it('reads the same streak regardless of the order days arrive in', () => {
    const state = dailyWalkState({
      todaySteps: 10_000,
      today: TODAY,
      days: cleared('2026-08-14', '2026-08-12', '2026-08-13'),
    });
    expect(state.streak).toBe(4);
  });

  it('crosses a month boundary', () => {
    const state = dailyWalkState({
      todaySteps: 10_000,
      today: '2026-09-01',
      days: cleared('2026-08-30', '2026-08-31'),
    });
    expect(state.streak).toBe(3);
  });
});

describe('walkNote', () => {
  const state = (todaySteps: number, days: DailyWalkDay[] = []) =>
    dailyWalkState({ todaySteps, today: TODAY, days });

  it('invites a start when there is no run yet', () => {
    const note = walkNote(state(0));
    expect(note).toContain(DAILY_STEP_BASELINE.toLocaleString());
    expect(note).toContain('start a run');
  });

  // The personal Streak and the Daily Walk run are different values, and this
  // sentence lands on a screen whose header shows the other one.
  it('never says "streak"', () => {
    for (const s of [state(0), state(10_000), state(4_213, cleared('2026-08-14'))]) {
      expect(walkNote(s)).not.toMatch(/streak/i);
    }
  });

  it('confirms a cleared day rather than repeating the target', () => {
    expect(walkNote(state(11_000, cleared('2026-08-14')))).toContain('Cleared today');
  });

  it('says the baseline never grows on an unfinished day inside a run', () => {
    expect(walkNote(state(4_213, cleared('2026-08-14')))).toContain('never grows');
  });

  it('never states today\u2019s steps or the gap, which the scene above already says', () => {
    // The scene sets today's steps at hero size and the Motion section names
    // the run of days on the row before this one, so the only figure this copy
    // may name is the baseline. Stated as the rule itself rather than as a
    // substring search: "0" is inside "10,000".
    const cases = [
      state(0),
      state(4_213),
      state(9_999, cleared('2026-08-14')),
      state(10_000),
      state(12_345, cleared('2026-08-13', '2026-08-14')),
    ];

    for (const s of cases) {
      const figures = walkNote(s).match(/\d[\d,]*/g) ?? [];
      for (const figure of figures) {
        expect(figure).toBe(DAILY_STEP_BASELINE.toLocaleString());
      }
    }
  });
});
