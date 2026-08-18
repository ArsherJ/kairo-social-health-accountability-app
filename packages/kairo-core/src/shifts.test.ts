import { describe, expect, it } from 'vitest';
import {
  MAX_THRESHOLD_SHIFT,
  shiftedThreshold,
  spreadShift,
  workoutShift,
} from './shifts.ts';

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

describe('workoutShift', () => {
  it('gives nothing without verified minutes', () => {
    expect(workoutShift(0)).toBe(0);
    expect(workoutShift(11)).toBe(0);
  });

  it('gives five percent per twelve verified minutes', () => {
    expect(workoutShift(12)).toBeCloseTo(0.05);
    expect(workoutShift(36)).toBeCloseTo(0.15);
  });

  // Sixty minutes was END's old gold band. The cap lands there on purpose.
  it('caps at twenty-five percent, reached at sixty minutes', () => {
    expect(workoutShift(60)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
    expect(workoutShift(600)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
  });

  it('treats a negative reading as none', () => {
    expect(workoutShift(-30)).toBe(0);
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
