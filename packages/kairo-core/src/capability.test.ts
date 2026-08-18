import { describe, expect, it } from 'vitest';
import {
  SLEEP_CAPABILITY_WINDOW_DAYS,
  earnableStats,
  hasSleepCapability,
  normalizationFactor,
} from './capability.ts';

describe('hasSleepCapability', () => {
  it('is false when no trusted sleep has ever arrived', () => {
    expect(hasSleepCapability([], '2026-08-18')).toBe(false);
  });

  it('is true when sleep arrived today', () => {
    expect(hasSleepCapability(['2026-08-18'], '2026-08-18')).toBe(true);
  });

  // The whole point of the window: one missed night must change nothing, or
  // the model punishes a flat battery.
  it('is true when the most recent night was a week ago', () => {
    expect(hasSleepCapability(['2026-08-11'], '2026-08-18')).toBe(true);
  });

  it('includes the fourteenth day and excludes the fifteenth', () => {
    expect(SLEEP_CAPABILITY_WINDOW_DAYS).toBe(14);
    expect(hasSleepCapability(['2026-08-05'], '2026-08-18')).toBe(true);
    expect(hasSleepCapability(['2026-08-04'], '2026-08-18')).toBe(false);
  });

  // Someone who abandons a wearable stops being a three-stat user, rather
  // than being divided by three forever with MND stuck at zero. That is the
  // failure mode profiles.has_wearable has, being deliberately sticky.
  it('is false once the wearable has been unused for a fortnight', () => {
    expect(hasSleepCapability(['2026-07-01', '2026-07-20'], '2026-08-18')).toBe(false);
  });

  it('ignores dates in the future', () => {
    expect(hasSleepCapability(['2026-09-01'], '2026-08-18')).toBe(false);
  });
});

describe('earnableStats', () => {
  it('counts three stats for a user with sleep capability', () => {
    expect(earnableStats(true)).toBe(3);
  });

  it('counts two stats for a phone-only user', () => {
    expect(earnableStats(false)).toBe(2);
  });
});

describe('normalizationFactor', () => {
  it('leaves a three-stat user unscaled', () => {
    expect(normalizationFactor(3, 3)).toBeCloseTo(1);
  });

  // Spec §2's parity arithmetic: (2 x 1,200) x 1.5 + 800 = 4,400, which is
  // exactly a wearable user's (3 x 1,200) x 1.0 + 800.
  it('scales a phone-only user up by half', () => {
    expect(normalizationFactor(2, 3)).toBeCloseTo(1.5);
  });

  it('closes the ceiling gap between the two', () => {
    const phoneOnly = 2 * 1_200 * normalizationFactor(2, 3) + 800;
    const wearable = 3 * 1_200 * normalizationFactor(3, 3) + 800;
    expect(phoneOnly).toBeCloseTo(wearable);
    expect(phoneOnly).toBeCloseTo(4_400);
  });

  it('never divides by zero', () => {
    expect(normalizationFactor(0, 3)).toBe(1);
    expect(normalizationFactor(-1, 3)).toBe(1);
  });
});
