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

  // The weekly meta is the reason to change behaviour this week, so it outranks
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
      points: 400,
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
      points: 400,
      gap: 20,
      topsOut: true,
      unit: 'kcal',
    });
  });

  it('picks the closest stat when no lane is declared', () => {
    // AGI 500/1,000 and STR 25/50 are both half-way; END at 9 of 10 minutes is
    // nearly there.
    const detail = resolveStatDetail({
      totals: totals({ steps: 500, activeKcal: 25, activeMinutes: 9 }),
      lane: null,
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'END',
      lane: false,
      points: 200,
      gap: 1,
      topsOut: false,
      unit: 'active minute',
    });
  });

  // Gaps are in different units, so "smallest" cannot be compared raw across
  // stats — 1 active hour is not easier than 20 kcal. Compare by how far
  // through the band the user is instead.
  it('compares progress through the band, not raw units', () => {
    // VIT: 2 of 3 active hours for bronze — 67% there, 1 hour short.
    // AGI: 100 of 1,000 steps for bronze — 10% there, 900 short.
    const detail = resolveStatDetail({
      totals: totals({ steps: 100, activeHours: 2 }),
      lane: null,
    });
    expect(detail).toEqual({
      kind: 'gap',
      stat: 'VIT',
      lane: false,
      points: 200,
      gap: 1,
      topsOut: false,
      unit: 'active hour',
    });
  });

  // VIT's bands are 3/6/9 active hours, so a gap of exactly one is the common
  // case here, not the edge — "1 more active hours" is the sentence a user is
  // most likely to be shown.
  it('says the unit in the singular when exactly one is left', () => {
    const detail = resolveStatDetail({
      totals: totals({ activeHours: 5 }),
      lane: 'VIT',
    });
    expect(detail).toMatchObject({ kind: 'gap', stat: 'VIT', gap: 1, unit: 'active hour' });
  });

  it('keeps the plural for every other gap', () => {
    const detail = resolveStatDetail({
      totals: totals({ activeHours: 4 }),
      lane: 'VIT',
    });
    expect(detail).toMatchObject({ kind: 'gap', stat: 'VIT', gap: 2, unit: 'active hours' });
  });

  // Gold is the ceiling. Nothing may imply a tier above it.
  it('reports every stat maxed when all four reach gold', () => {
    expect(
      resolveStatDetail({
        totals: totals({
          steps: 10_000,
          activeKcal: 400,
          activeMinutes: 60,
          activeHours: 9,
        }),
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
