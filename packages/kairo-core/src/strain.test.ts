import { describe, expect, it } from 'vitest';
import {
  MAX_STRAIN,
  computeStrain,
  maxHeartRateForAge,
  DEFAULT_MAX_HEART_RATE,
  DEFAULT_RESTING_HEART_RATE,
} from './strain.ts';

/** 24 hours of the same average bpm. `null` means no reading that hour. */
function flat(bpm: number | null): (number | null)[] {
  return Array.from({ length: 24 }, () => bpm);
}

describe('maxHeartRateForAge', () => {
  it('uses the standard 220-minus-age estimate', () => {
    expect(maxHeartRateForAge(30)).toBe(190);
    expect(maxHeartRateForAge(50)).toBe(170);
  });

  it('falls back for an unknown age rather than inventing one', () => {
    // Birth year is optional (§5's soft prompt), so "no age" is a normal state
    // and must not make strain unavailable.
    expect(maxHeartRateForAge(null)).toBe(DEFAULT_MAX_HEART_RATE);
    expect(maxHeartRateForAge(undefined)).toBe(DEFAULT_MAX_HEART_RATE);
  });

  it('clamps an implausible age instead of returning a useless ceiling', () => {
    // 220 - 200 = 20 bpm would make every waking hour maximal effort.
    expect(maxHeartRateForAge(200)).toBeGreaterThanOrEqual(120);
    expect(maxHeartRateForAge(-5)).toBeLessThanOrEqual(220);
  });
});

describe('computeStrain', () => {
  const resting = 60;
  const max = 190;

  it('is null when there is no heart-rate data at all', () => {
    // Distinct from zero. A phone-only user has no wearable, and reporting
    // "strain 0" would tell them they did nothing rather than that nothing was
    // measured — the same rule §5 applies to REC.
    expect(computeStrain({ hourlyAvgHr: flat(null), restingHr: resting, maxHr: max }))
      .toBeNull();
    expect(computeStrain({ hourlyAvgHr: [], restingHr: resting, maxHr: max }))
      .toBeNull();
  });

  it('is zero for a whole day spent at resting heart rate', () => {
    expect(computeStrain({ hourlyAvgHr: flat(resting), restingHr: resting, maxHr: max }))
      .toBe(0);
  });

  it('is zero when every hour reads below resting', () => {
    // Resting HR drifts, and a night below the stored figure is normal. A
    // negative reserve must floor at zero rather than subtracting strain.
    expect(computeStrain({ hourlyAvgHr: flat(40), restingHr: resting, maxHr: max }))
      .toBe(0);
  });

  it('approaches but never exceeds the ceiling at sustained maximum effort', () => {
    const strain = computeStrain({ hourlyAvgHr: flat(max), restingHr: resting, maxHr: max });
    expect(strain).toBeGreaterThan(20);
    expect(strain).toBeLessThanOrEqual(MAX_STRAIN);
  });

  it('never exceeds the ceiling even above the estimated maximum', () => {
    // 220 - age is an estimate; a fit user genuinely exceeds it. The reserve
    // fraction clamps at 1 so this saturates rather than overflowing.
    const strain = computeStrain({ hourlyAvgHr: flat(220), restingHr: resting, maxHr: max });
    expect(strain).toBeLessThanOrEqual(MAX_STRAIN);
  });

  it('rises with intensity', () => {
    const easy = computeStrain({ hourlyAvgHr: flat(90), restingHr: resting, maxHr: max })!;
    const hard = computeStrain({ hourlyAvgHr: flat(150), restingHr: resting, maxHr: max })!;
    expect(hard).toBeGreaterThan(easy);
  });

  it('rises with duration at the same intensity', () => {
    const one = [150, ...Array.from({ length: 23 }, () => resting)];
    const three = [150, 150, 150, ...Array.from({ length: 21 }, () => resting)];
    const short = computeStrain({ hourlyAvgHr: one, restingHr: resting, maxHr: max })!;
    const long = computeStrain({ hourlyAvgHr: three, restingHr: resting, maxHr: max })!;
    expect(long).toBeGreaterThan(short);
  });

  it('weights hard hours far above easy ones, rather than averaging them', () => {
    // The whole point of a strain score over "average heart rate": one hard
    // hour must outweigh several easy ones. A linear model would not.
    const oneHard = [170, ...Array.from({ length: 23 }, () => resting)];
    const fourEasy = [85, 85, 85, 85, ...Array.from({ length: 20 }, () => resting)];
    const hard = computeStrain({ hourlyAvgHr: oneHard, restingHr: resting, maxHr: max })!;
    const easy = computeStrain({ hourlyAvgHr: fourEasy, restingHr: resting, maxHr: max })!;
    expect(hard).toBeGreaterThan(easy);
  });

  it('ignores hours with no reading rather than treating them as rest', () => {
    // A watch taken off for the afternoon must not read as an afternoon of
    // rest — that would be inventing data. Absent hours simply contribute
    // nothing, which is also what a resting hour contributes.
    const withGaps = [150, null, null, 150, ...Array.from({ length: 20 }, () => null)];
    const withRest = [150, resting, resting, 150, ...Array.from({ length: 20 }, () => resting)];
    expect(computeStrain({ hourlyAvgHr: withGaps, restingHr: resting, maxHr: max }))
      .toBe(computeStrain({ hourlyAvgHr: withRest, restingHr: resting, maxHr: max }));
  });

  it('reports to one decimal, because 11 and 11.4 are different days', () => {
    const strain = computeStrain({ hourlyAvgHr: flat(120), restingHr: resting, maxHr: max })!;
    expect(strain).toBe(Math.round(strain * 10) / 10);
  });

  it('survives a resting rate at or above the maximum without dividing by zero', () => {
    // Bad data, not a bad user: a wearable reporting resting 190 against an
    // estimated max of 190 must not produce Infinity or NaN.
    const strain = computeStrain({ hourlyAvgHr: flat(150), restingHr: 190, maxHr: 190 });
    expect(strain).not.toBeNull();
    expect(Number.isFinite(strain!)).toBe(true);
  });

  it('falls back to a default resting rate when none is known', () => {
    const strain = computeStrain({ hourlyAvgHr: flat(150), restingHr: null, maxHr: max });
    expect(strain).toBe(
      computeStrain({ hourlyAvgHr: flat(150), restingHr: DEFAULT_RESTING_HEART_RATE, maxHr: max }),
    );
  });

  it('reads no clock and mutates nothing', () => {
    const hours = flat(120);
    const snapshot = [...hours];
    const first = computeStrain({ hourlyAvgHr: hours, restingHr: resting, maxHr: max });
    const second = computeStrain({ hourlyAvgHr: hours, restingHr: resting, maxHr: max });
    expect(first).toBe(second);
    expect(hours).toEqual(snapshot);
  });
});
