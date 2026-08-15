import { describe, expect, it } from 'vitest';
import { kcalFrom, metresFrom, secondsFrom } from './workout-units.ts';

describe('metresFrom', () => {
  it('passes metres through', () => {
    expect(metresFrom({ unit: 'm', quantity: 5_000 })).toBe(5_000);
  });

  it('converts kilometres and miles', () => {
    expect(metresFrom({ unit: 'km', quantity: 5 })).toBe(5_000);
    expect(metresFrom({ unit: 'mi', quantity: 1 })).toBeCloseTo(1_609.344, 3);
  });

  it('returns null for an unrecognised unit rather than guessing', () => {
    // The whole point: a 5-mile run stored as 5,000 metres would silently
    // corrupt the pace the Run challenge is built on. Inert beats wrong.
    expect(metresFrom({ unit: 'furlong', quantity: 5 })).toBeNull();
  });

  it('returns null for a missing total', () => {
    // `totalDistance` is optional on WorkoutSample — a strength session has none.
    expect(metresFrom(undefined)).toBeNull();
  });

  it('rejects a negative or non-finite quantity', () => {
    expect(metresFrom({ unit: 'm', quantity: -1 })).toBeNull();
    expect(metresFrom({ unit: 'm', quantity: Number.NaN })).toBeNull();
    expect(metresFrom({ unit: 'm', quantity: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('kcalFrom', () => {
  it('passes kilocalories through, under either of Apple’s spellings', () => {
    expect(kcalFrom({ unit: 'kcal', quantity: 420 })).toBe(420);
    expect(kcalFrom({ unit: 'Cal', quantity: 420 })).toBe(420);
  });

  it('does not confuse the small calorie with the food calorie', () => {
    // `cal` is a thousandth of `Cal`. Folding them together would be a
    // factor-of-1000 error in the direction that makes every session look
    // superhuman — and the Strength challenge would chase it upward forever.
    expect(kcalFrom({ unit: 'cal', quantity: 420_000 })).toBeCloseTo(420, 6);
    expect(kcalFrom({ unit: 'cal', quantity: 420 })).not.toBe(420);
  });

  it('converts joules', () => {
    expect(kcalFrom({ unit: 'kJ', quantity: 1_000 })).toBeCloseTo(239.0057, 3);
  });

  it('returns null for an unrecognised unit', () => {
    expect(kcalFrom({ unit: 'BTU', quantity: 5 })).toBeNull();
  });
});

describe('secondsFrom', () => {
  it('passes seconds through and converts minutes and hours', () => {
    expect(secondsFrom({ unit: 's', quantity: 90 })).toBe(90);
    expect(secondsFrom({ unit: 'min', quantity: 45 })).toBe(2_700);
    expect(secondsFrom({ unit: 'hr', quantity: 1.5 })).toBe(5_400);
  });

  it('returns null for an unrecognised unit', () => {
    expect(secondsFrom({ unit: 'fortnight', quantity: 1 })).toBeNull();
  });
});
