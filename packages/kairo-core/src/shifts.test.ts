import { describe, expect, it } from 'vitest';
import {
  MAX_THRESHOLD_SHIFT,
  shiftedThreshold,
  spreadShift,
  statShifts,
} from './shifts.ts';
import { CORE_STATS } from './types.ts';

describe('spreadShift', () => {
  // VIT's old bronze band was 3 active hours. Below it, nothing is earned —
  // the shift is VIT's ladder expressed as generosity, so it starts where
  // VIT started.
  it('gives nothing at or below three active hours', () => {
    expect(spreadShift(0)).toBe(0);
    expect(spreadShift(3)).toBe(0);
  });

  it('gives five percent per active hour beyond three', () => {
    expect(spreadShift(4)).toBeCloseTo(0.05);
    expect(spreadShift(6)).toBeCloseTo(0.15);
  });

  it('caps at twenty-five percent', () => {
    expect(spreadShift(8)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
    expect(spreadShift(24)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
  });

  // Active hours are whole hours by construction (aggregateBuckets counts
  // buckets), but the function must not pay a partial hour if that ever changes.
  it('does not pay for a partial hour', () => {
    expect(spreadShift(4.9)).toBeCloseTo(0.05);
  });

  it('treats a negative reading as none rather than a negative shift', () => {
    expect(spreadShift(-5)).toBe(0);
  });
});

describe('shiftedThreshold', () => {
  // The headline example from spec §2: a fully spread day reaches AGI gold at
  // 7,500 steps instead of 10,000.
  it('lowers a band by the shift', () => {
    expect(shiftedThreshold(10_000, 0.25)).toBe(7_500);
    expect(shiftedThreshold(400, 0.25)).toBe(300);
  });

  it('returns the band unchanged when there is no shift', () => {
    expect(shiftedThreshold(10_000, 0)).toBe(10_000);
  });

  it('returns whole units, because thresholds are compared against raw counts', () => {
    expect(Number.isInteger(shiftedThreshold(1_000, 0.15))).toBe(true);
    expect(shiftedThreshold(1_000, 0.15)).toBe(850);
  });

  // A shift can only ever make a band easier. Guarding here rather than at
  // every call site keeps the invariant in one place.
  it('never raises a band, whatever it is handed', () => {
    expect(shiftedThreshold(10_000, -1)).toBe(10_000);
  });
});

describe('statShifts', () => {
  // One table, because the mapping had to be read in two places the moment the
  // character sheet's hint started naming the band the day is judged against.
  // Two copies of it is exactly the duplication that drifts silently: the
  // screen would keep quoting a ladder the scorer stopped reading and nothing
  // would fail.
  it('routes the spread to Motion', () => {
    expect(statShifts({ activeHours: 5 }).AGI).toBe(spreadShift(5));
  });

  // **Body takes no shift as of 2026-08-29, and this is the assertion that says
  // so.** It used to inherit END's verified workout minutes, which made the one
  // genuine strength signal Kairo collects lower Body's bands instead of raising
  // Body's number. Those minutes earn points now (`STRENGTH_MINUTE_KCAL_CREDIT`),
  // and reinstating a shift here as well would double-count one signal on one
  // stat — which is the whole reason the shift was retired rather than kept
  // alongside.
  it('gives Body no shift, however much verified work the day carried', () => {
    expect(statShifts({ activeHours: 0 }).STR).toBe(0);
    expect(statShifts({ activeHours: 24 }).STR).toBe(0);
  });

  // Not a formality: the trust gate decides *whether* a night scores, never how
  // easily, and handing MND a shift would make the hint quote a ladder the
  // scorer never reads.
  it('gives Mind no shift, however spread the day was', () => {
    expect(statShifts({ activeHours: 24 }).MND).toBe(0);
  });

  it('is total over CoreStat, so a new stat cannot arrive without a decision', () => {
    const shifts = statShifts({ activeHours: 0 });
    for (const stat of CORE_STATS) expect(shifts[stat]).toBe(0);
  });
});
