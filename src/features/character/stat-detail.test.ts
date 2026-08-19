import { describe, expect, it } from 'vitest';
import type { DayTotals } from '@kairo/core';
import { resolveStatDetail } from './stat-detail.ts';

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

  it('breaks a tie in CORE_STATS order', () => {
    const detail = resolveStatDetail({
      totals: totals({ steps: 500, activeKcal: 25 }),
      lane: null,
    });
    expect(detail.kind).toBe('gap');
    expect(detail.kind === 'gap' && detail.stat).toBe('AGI');
  });
});
