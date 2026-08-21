import { describe, expect, it } from 'vitest';
import type { DayTotals } from '@kairo/core';
import { resolveStatDetail, workoutDaySignal } from './stat-detail.ts';

const totals = (over: Partial<DayTotals> = {}): DayTotals => ({
  steps: 0,
  distanceM: 0,
  activeKcal: 0,
  activeMinutes: 0,
  activeHours: 0,
  ...over,
});

describe('resolveStatDetail', () => {
  it('is unknown until the day’s totals have loaded', () => {
    expect(resolveStatDetail({ totals: undefined, lane: 'AGI' })).toEqual({
      kind: 'unknown',
    });
  });

  // The lane is the stat this user actually cares about, so it outranks
  // whichever stat happens to be closest.
  it('prefers the lane even when another stat is closer', () => {
    const detail = resolveStatDetail({
      totals: totals({ steps: 8_760, activeKcal: 199 }),
      lane: 'AGI',
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'AGI',
      lane: true,
      points: 550,
      gap: 1_240,
      topsOut: true,
      unit: 'steps',
    });
  });

  // A lane already at Gold has nothing left to ask for.
  it('falls through to the closest stat when the lane is maxed', () => {
    const detail = resolveStatDetail({
      totals: totals({ steps: 12_000, activeKcal: 380 }),
      lane: 'AGI',
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'STR',
      lane: false,
      points: 550,
      gap: 20,
      topsOut: true,
      unit: 'kcal',
    });
  });

  it('picks the closest stat when no lane is declared', () => {
    // AGI 500/1,000 is half-way; STR 45/50 is nearly there.
    const detail = resolveStatDetail({
      totals: totals({ steps: 500, activeKcal: 45 }),
      lane: null,
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'STR',
      lane: false,
      points: 250,
      gap: 5,
      topsOut: false,
      unit: 'kcal',
    });
  });

  // Gaps are in different units, so "smallest" cannot be compared raw across
  // stats — 20 kcal is not easier than 20 minutes of sleep. Compare by how far
  // through the band the user is instead.
  describe('Mind', () => {
    // The hole this closes: MND was skipped outright while it was a
    // transitional fifth stat, because DayTotals carries no sleep field. With
    // three stats that would have silently dropped a third of the model out of
    // the one line that tells someone what to do next.
    it('reports a real gap from the day’s sleep', () => {
      const detail = resolveStatDetail({
        totals: totals(),
        sleepMinutes: 5 * 60 + 30,
        lane: 'MND',
      });
      expect(detail).toEqual({
        kind: 'gap',
        stat: 'MND',
        lane: true,
        points: 400,
        gap: 30,
        topsOut: false,
        unit: 'minutes of sleep',
      });
    });

    it('says the unit in the singular when exactly one minute is left', () => {
      const detail = resolveStatDetail({
        totals: totals(),
        sleepMinutes: 5 * 60 + 59,
        lane: 'MND',
      });
      expect(detail).toMatchObject({
        kind: 'gap',
        stat: 'MND',
        gap: 1,
        unit: 'minute of sleep',
      });
    });

    // Unknown is not zero. A fabricated "0 minutes" would make Mind the
    // furthest-from-its-band stat on every phone-only day and win the line
    // over stats with real progress.
    it('is skipped entirely when no sleep row exists', () => {
      const detail = resolveStatDetail({
        totals: totals({ steps: 500 }),
        sleepMinutes: null,
        lane: null,
      });
      expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI' });
    });

    it('is skipped while the sleep query is still in flight', () => {
      const detail = resolveStatDetail({
        totals: totals({ steps: 500 }),
        lane: null,
      });
      expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI' });
    });

    // The landmine `nextTierFor` had to be fixed for: reading the linear band
    // table above nine hours called an eleven-hour night "already gold" while
    // the scorer awarded Bronze.
    it('asks for nothing after an eleven-hour night, rather than claiming gold', () => {
      const detail = resolveStatDetail({
        totals: totals({ steps: 10_000, activeKcal: 400 }),
        sleepMinutes: 11 * 60,
        lane: null,
      });
      expect(detail).toEqual({ kind: 'maxed' });
    });
  });

  it('compares progress through the band, not raw units', () => {
    // STR: 45 of 50 kcal for bronze — 90% there, 5 short.
    // AGI: 100 of 1,000 steps for bronze — 10% there, 900 short.
    const detail = resolveStatDetail({
      totals: totals({ steps: 100, activeKcal: 45 }),
      lane: null,
    });
    expect(detail).toMatchObject({ kind: 'gap', stat: 'STR', gap: 5 });
  });

  // Gold is the ceiling. Nothing may imply a tier above it.
  it('reports every stat maxed when all three reach gold', () => {
    expect(
      resolveStatDetail({
        totals: totals({ steps: 10_000, activeKcal: 400 }),
        sleepMinutes: 8 * 60,
        lane: null,
      }),
    ).toEqual({ kind: 'maxed' });
  });

  it('marks a gap into the top band as topping out', () => {
    // AGI silver is 5,000 and gold is 10,000, so 8,000 steps is one band short.
    const detail = resolveStatDetail({
      totals: totals({ steps: 8_000 }),
      lane: 'AGI',
    });
    expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI', topsOut: true });
  });

  it('does not mark a gap into a middle band as topping out', () => {
    // 2,000 steps is inside bronze, so the next band up is silver, not gold.
    const detail = resolveStatDetail({
      totals: totals({ steps: 2_000 }),
      lane: 'AGI',
    });
    expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI', topsOut: false });
  });

  // The bug: the line quoted the unshifted ladder while the scorer used the
  // shifted one, so a day spent moving was told to walk 2,500 steps it did
  // not need and then hit the band early. Early arrival reads as a broken
  // score, not as a gift.
  describe('the day\u2019s own threshold shift', () => {
    it('names the gap to the band the day will actually be judged against', () => {
      // Eight active hours earns the 25% cap: AGI Gold sits at 7,500, not
      // 10,000. Unshifted the same day would be told 3,000.
      const detail = resolveStatDetail({
        totals: totals({ steps: 7_000, activeHours: 8 }),
        lane: 'AGI',
      });
      expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI', gap: 500 });
    });

    it('asks for nothing once the shifted band is reached', () => {
      // 7,500 steps is Gold on a spread day and Silver on a sedentary one, so
      // this is also the assertion that the shift is read from the day rather
      // than assumed.
      expect(
        resolveStatDetail({
          totals: totals({ steps: 7_500, activeKcal: 400, activeHours: 8 }),
          sleepMinutes: 8 * 60,
          lane: null,
        }),
      ).toEqual({ kind: 'maxed' });
      expect(
        resolveStatDetail({
          totals: totals({ steps: 7_500, activeKcal: 400, activeHours: 0 }),
          sleepMinutes: 8 * 60,
          lane: null,
        }),
      ).toMatchObject({ kind: 'gap', stat: 'AGI', gap: 2_500 });
    });

    // STR inherited END's signal, and the home screen has no verified-workout
    // figure in scope — see the note on `verifiedWorkoutMinutes`. It is an
    // argument rather than a guess so the day it does, one call site changes.
    it("uses STR's own shift when the caller has the minutes", () => {
      const detail = resolveStatDetail({
        totals: totals({ activeKcal: 200 }),
        verifiedWorkoutMinutes: 60,
        lane: 'STR',
      });
      expect(detail).toMatchObject({ kind: 'gap', stat: 'STR', gap: 100 });
    });

    it('leaves a sedentary day on the bands the user has learned', () => {
      const detail = resolveStatDetail({
        totals: totals({ steps: 8_760, activeHours: 3 }),
        lane: 'AGI',
      });
      expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI', gap: 1_240 });
    });
  });

  // The defect: `verifiedWorkoutMinutes` was pinned at 0 on this screen, so a
  // day with a workout was told the unshifted kcal target. 60 verified minutes
  // put Gold at 300 and Silver at 150; the line went on saying 400 and 200.
  // The screen cannot know the minutes — `useWorkoutSessions` does not read
  // the trust columns and §5 has not been reopened — so it says no number.
  describe('a day that carries a workout', () => {
    // 250 kcal: unshifted the ladder says 150 more for Gold at 400. At the
    // 25% cap Gold is 300 and the true answer is 50 — and at 0 verified
    // minutes it is 150. Every reachable shift gives a *different* number
    // here, so a branch that quotes any of them cannot pass by coincidence.
    const workoutDayTotals = () => totals({ activeKcal: 250, steps: 10_000 });

    it('says nothing about Strength\u2019s kcal when a session exists', () => {
      const detail = resolveStatDetail({
        totals: workoutDayTotals(),
        sleepMinutes: 8 * 60,
        workoutDay: 'session',
        lane: 'STR',
      });
      expect(detail).toEqual({ kind: 'unquantified', stat: 'STR', lane: true });
    });

    // The negative control, and it carries as much weight as the case above:
    // a suppression that fires on every day is a different bug wearing the
    // same clothes. Identical inputs, one field changed.
    it('quotes the unshifted band unchanged when the day carries none', () => {
      const detail = resolveStatDetail({
        totals: workoutDayTotals(),
        sleepMinutes: 8 * 60,
        workoutDay: 'none',
        lane: 'STR',
      });
      expect(detail).toEqual({
        kind: 'gap',
        stat: 'STR',
        lane: true,
        points: 550,
        gap: 150,
        topsOut: true,
        unit: 'kcal',
      });
    });

    // In flight is not "no workout". Both silence STR, and they have to: the
    // first paint of the home screen has no sessions yet, and that is exactly
    // when a wrong number would be read.
    it('stays silent while the sessions query is still in flight', () => {
      expect(
        resolveStatDetail({
          totals: workoutDayTotals(),
          sleepMinutes: 8 * 60,
          workoutDay: 'unknown',
          lane: 'STR',
        }),
      ).toEqual({ kind: 'unquantified', stat: 'STR', lane: true });
    });

    // Silencing STR must not silence the screen. A stat with a real number
    // wins the line instead — including over the user's own lane, because a
    // figure that is right beats a lane marker on one that cannot be given.
    it('hands the line to a stat that still has a number', () => {
      const detail = resolveStatDetail({
        totals: totals({ steps: 8_000, activeKcal: 250 }),
        workoutDay: 'session',
        lane: 'STR',
      });
      expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI', gap: 2_000, lane: false });
    });

    // Suppression is decided *after* the ladder, not before it. A shift only
    // ever lowers a band, so 400 kcal is Gold however long the workout was —
    // and calling that day "unquantified" would imply work left to do.
    it('still reports every stat maxed when Strength is genuinely topped out', () => {
      expect(
        resolveStatDetail({
          totals: totals({ steps: 10_000, activeKcal: 400 }),
          sleepMinutes: 8 * 60,
          workoutDay: 'session',
          lane: 'STR',
        }),
      ).toEqual({ kind: 'maxed' });
    });

    // The day the trust columns are read, one call site passes the minutes and
    // this branch goes quiet on its own: a known shift is not an unknown one.
    it('quotes the shifted band once the caller has the minutes', () => {
      const detail = resolveStatDetail({
        totals: workoutDayTotals(),
        verifiedWorkoutMinutes: 60,
        workoutDay: 'session',
        lane: 'STR',
      });
      expect(detail).toMatchObject({ kind: 'gap', stat: 'STR', gap: 50 });
    });

    it('marks the lane only when Strength is the lane', () => {
      expect(
        resolveStatDetail({
          totals: workoutDayTotals(),
          sleepMinutes: 8 * 60,
          workoutDay: 'session',
          lane: 'AGI',
        }),
      ).toEqual({ kind: 'unquantified', stat: 'STR', lane: false });
    });
  });

  describe('workoutDaySignal', () => {
    const sessions = [{ localDate: '2026-08-19' }, { localDate: '2026-08-20' }];

    it('reads a session on the day being described', () => {
      expect(workoutDaySignal(sessions, '2026-08-20')).toBe('session');
    });

    // The window covers a fortnight of days; only today's decides today's
    // hint. A session on the 19th shifted the 19th's bands, not the 20th's.
    it('ignores sessions on other days', () => {
      expect(workoutDaySignal(sessions, '2026-08-18')).toBe('none');
    });

    it('is unknown before the query resolves', () => {
      expect(workoutDaySignal(undefined, '2026-08-20')).toBe('unknown');
    });

    // No timezone yet means no local date, and a date-less comparison would
    // match nothing and report 'none' — the confident answer this whole
    // change exists to stop.
    it('is unknown when the local date is not known yet', () => {
      expect(workoutDaySignal(sessions, undefined)).toBe('unknown');
    });

    it('is none when the query resolves empty', () => {
      expect(workoutDaySignal([], '2026-08-20')).toBe('none');
    });
  });

  it('breaks a tie in CORE_STATS order', () => {
    const detail = resolveStatDetail({
      totals: totals({ steps: 500, activeKcal: 25 }),
      lane: null,
    });
    expect(detail.kind).toBe('gap');
    expect(detail.kind === 'gap' && detail.stat).toBe('AGI');
  });
});
