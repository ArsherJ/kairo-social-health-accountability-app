import { describe, expect, it } from 'vitest';
import {
  MAX_RESTED_SHIFT,
  MAX_THRESHOLD_SHIFT,
  RESTED_SHIFT_FLOOR_HOURS,
  RESTED_SHIFT_PEAK_HOURS,
  restedShift,
  shiftedThreshold,
  spreadShift,
  statShifts,
} from './shifts.ts';
import { MIND_OVERSLEEP_HOURS, MIND_TAPER_END_HOURS, mindPoints } from './mind.ts';
import { TIER_POINTS } from './tier-points.ts';
import { CORE_STATS } from './types.ts';

const hours = (h: number) => h * 60;

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

describe('restedShift', () => {
  // Wearable-gated by construction: a phone-only account has no sleep row, so
  // the shift is the same zero it was before this existed. Nothing about the
  // day is judged differently, and no sentence is earned.
  it('gives nothing when there is no night to read', () => {
    expect(restedShift(null)).toBe(0);
    expect(restedShift(undefined)).toBe(0);
    expect(restedShift(0)).toBe(0);
    expect(restedShift(Number.NaN)).toBe(0);
  });

  // Seven hours is where Mind's own top band starts. Below it a night has not
  // yet earned Mind's gold, so it has not earned anything for Body either.
  it('gives nothing below the rested floor', () => {
    expect(restedShift(hours(5))).toBe(0);
    expect(restedShift(hours(6.9))).toBe(0);
    expect(restedShift(hours(RESTED_SHIFT_FLOOR_HOURS))).toBe(0);
  });

  it('ramps to half the maximum shift at eight hours', () => {
    expect(MAX_RESTED_SHIFT).toBeCloseTo(MAX_THRESHOLD_SHIFT / 2);
    expect(restedShift(hours(7.5))).toBeCloseTo(MAX_RESTED_SHIFT / 2);
    expect(restedShift(hours(RESTED_SHIFT_PEAK_HOURS))).toBeCloseTo(MAX_RESTED_SHIFT);
  });

  // Mind holds Gold flat from seven to nine, and so does this.
  it('holds the peak to the oversleep point', () => {
    expect(restedShift(hours(8.5))).toBeCloseTo(MAX_RESTED_SHIFT);
    expect(restedShift(hours(MIND_OVERSLEEP_HOURS))).toBeCloseTo(MAX_RESTED_SHIFT);
  });

  // The taper is Mind's own curve scaled, not a second table of its own — so
  // moving `MIND_TAPER_END_HOURS` or the Silver anchor moves both together.
  it('tapers past the oversleep point exactly as the Mind score does', () => {
    const peak = mindPoints(hours(MIND_OVERSLEEP_HOURS));
    for (const h of [9.5, 9.75, 10, 10.5, 12]) {
      expect(restedShift(hours(h))).toBeCloseTo(
        MAX_RESTED_SHIFT * (mindPoints(hours(h)) / peak),
      );
    }
  });

  // The whole reason the taper exists rather than a cliff: HealthKit sleep is
  // noisy, so a very long night must not score below a short one.
  it('tapers rather than cliffs, and floors where Mind floors', () => {
    expect(restedShift(hours(9.01))).toBeLessThan(MAX_RESTED_SHIFT);
    expect(restedShift(hours(9.01))).toBeGreaterThan(restedShift(hours(10)));
    const floor = MAX_RESTED_SHIFT * (TIER_POINTS.silver / TIER_POINTS.gold);
    expect(restedShift(hours(MIND_TAPER_END_HOURS))).toBeCloseTo(floor);
    expect(restedShift(hours(24))).toBeCloseTo(floor);
    // And still worth more than a six-hour night, which is worth nothing.
    expect(restedShift(hours(24))).toBeGreaterThan(restedShift(hours(6)));
  });

  it('never exceeds half the cap, whatever it is handed', () => {
    for (let m = 0; m <= 1_440; m += 7) {
      expect(restedShift(m)).toBeLessThanOrEqual(MAX_RESTED_SHIFT + 1e-9);
      expect(restedShift(m)).toBeGreaterThanOrEqual(0);
    }
    expect(restedShift(-600)).toBe(0);
  });
});

describe('statShifts', () => {
  // One table, because the mapping had to be read in two places the moment the
  // character sheet's hint started naming the band the day is judged against.
  // Two copies of it is exactly the duplication that drifts silently: the
  // screen would keep quoting a ladder the scorer stopped reading and nothing
  // would fail.
  it('routes the spread to Motion', () => {
    expect(statShifts({ activeHours: 5, sleepMinutes: null }).AGI).toBe(spreadShift(5));
  });

  // **Motion is untouched by the night, and that is deviation #68's whole
  // decision.** Motion's shift already reaches the cap at eight active hours,
  // so a rested shift added there would be a no-op for exactly the players who
  // sleep well and move all day — invisible to its own best case. Body's shift
  // was a hard zero, so it collides with nothing.
  it('gives Motion the same shift however the night went', () => {
    expect(statShifts({ activeHours: 5, sleepMinutes: hours(8) }).AGI).toBe(spreadShift(5));
    expect(statShifts({ activeHours: 0, sleepMinutes: hours(8) }).AGI).toBe(0);
  });

  // **Body's shift is the night's, and only the night's, as of 2026-09-08.**
  // It took END's verified workout minutes until 2026-08-29, and reinstating
  // *that* would double-count one signal on one stat — those minutes raise
  // Body's raw value now (`STRENGTH_MINUTE_KCAL_CREDIT`). Sleep is a different
  // signal that touches Body's raw value nowhere, which is what makes it safe.
  it('routes the night to Body', () => {
    expect(statShifts({ activeHours: 0, sleepMinutes: hours(8) }).STR).toBeCloseTo(
      MAX_RESTED_SHIFT,
    );
    expect(statShifts({ activeHours: 24, sleepMinutes: null }).STR).toBe(0);
  });

  // Not a formality: the trust gate decides *whether* a night scores, never how
  // easily. A night that shifted its own bands is the retired workout shift's
  // double-count in a new dress.
  it('gives Mind no shift, however spread the day or long the night', () => {
    expect(statShifts({ activeHours: 24, sleepMinutes: hours(8) }).MND).toBe(0);
    expect(statShifts({ activeHours: 0, sleepMinutes: hours(12) }).MND).toBe(0);
  });

  it('is total over CoreStat, so a new stat cannot arrive without a decision', () => {
    const shifts = statShifts({ activeHours: 0, sleepMinutes: null });
    for (const stat of CORE_STATS) expect(shifts[stat]).toBe(0);
  });
});
