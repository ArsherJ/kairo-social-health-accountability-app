import { describe, expect, it } from 'vitest';
import {
  FLAG_CLEARS_AFTER_CLEAN_DAYS,
  VELOCITY_STEP_THRESHOLD,
  VELOCITY_WINDOW_MS,
  evaluateStepBurst,
  shouldClearFlag,
} from './anticheat.ts';
import type { StepBurst } from './anticheat.ts';

const TEN_MINUTES = 10 * 60 * 1000;

function burst(overrides: Partial<StepBurst> = {}): StepBurst {
  return {
    steps: 0,
    windowMs: TEN_MINUTES,
    distanceM: 0,
    hadWorkout: false,
    elevatedHeartRate: false,
    ...overrides,
  };
}

describe('velocity threshold', () => {
  it('matches the spec: more than 1,500 steps in 10 minutes', () => {
    expect(VELOCITY_STEP_THRESHOLD).toBe(1_500);
    expect(VELOCITY_WINDOW_MS).toBe(TEN_MINUTES);
  });

  it('ignores ordinary walking', () => {
    expect(evaluateStepBurst(burst({ steps: 900 })).flagged).toBe(false);
  });

  it('ignores a burst exactly at the threshold', () => {
    expect(evaluateStepBurst(burst({ steps: 1_500 })).flagged).toBe(false);
  });

  it('flags an implausible burst with no supporting signal', () => {
    const result = evaluateStepBurst(burst({ steps: 3_000 }));
    expect(result.flagged).toBe(true);
    expect(result.reason).toBe('implausible_step_velocity');
  });

  it('normalises rate across windows longer than ten minutes', () => {
    // 2,400 steps across 30 minutes is 800 per 10 min — a brisk walk.
    expect(
      evaluateStepBurst(burst({ steps: 2_400, windowMs: 30 * 60 * 1000 })).flagged,
    ).toBe(false);
  });

  it('still catches a spike buried in a longer window', () => {
    // 6,000 steps across 30 minutes is 2,000 per 10 min.
    expect(
      evaluateStepBurst(burst({ steps: 6_000, windowMs: 30 * 60 * 1000 })).flagged,
    ).toBe(true);
  });

  it('treats a zero-length window as no evidence', () => {
    expect(evaluateStepBurst(burst({ steps: 5_000, windowMs: 0 })).flagged).toBe(
      false,
    );
  });
});

describe('workout cross-check (spec §5)', () => {
  it('never flags a normal outdoor jog', () => {
    // ~1,700 steps in 10 minutes with GPS distance to match.
    const jog = burst({ steps: 1_700, distanceM: 1_300, hadWorkout: true });
    const result = evaluateStepBurst(jog);
    expect(result.flagged).toBe(false);
    expect(result.suppressedBy).toBe('workout');
  });

  it('never flags a jog even when the watch logged no workout', () => {
    const jog = burst({ steps: 1_700, distanceM: 1_300 });
    const result = evaluateStepBurst(jog);
    expect(result.flagged).toBe(false);
    expect(result.suppressedBy).toBe('gps_distance');
  });

  it('never flags an indoor treadmill run, which has no GPS distance', () => {
    const treadmill = burst({ steps: 1_900, distanceM: 0, hadWorkout: true });
    expect(evaluateStepBurst(treadmill).flagged).toBe(false);
  });

  it('never flags a burst backed by elevated heart rate', () => {
    const wearable = burst({ steps: 2_200, elevatedHeartRate: true });
    const result = evaluateStepBurst(wearable);
    expect(result.flagged).toBe(false);
    expect(result.suppressedBy).toBe('heart_rate');
  });

  it('flags a shaken phone: many steps, no distance, no workout, no heart rate', () => {
    expect(evaluateStepBurst(burst({ steps: 4_000 })).flagged).toBe(true);
  });

  it('flags steps whose distance is too short to be real strides', () => {
    // 4,000 steps but only 50 m of travel — physically impossible.
    expect(evaluateStepBurst(burst({ steps: 4_000, distanceM: 50 })).flagged).toBe(
      true,
    );
  });
});

describe('flag lifecycle', () => {
  it('clears after three clean days', () => {
    expect(FLAG_CLEARS_AFTER_CLEAN_DAYS).toBe(3);
    expect(shouldClearFlag(0)).toBe(false);
    expect(shouldClearFlag(2)).toBe(false);
    expect(shouldClearFlag(3)).toBe(true);
    expect(shouldClearFlag(10)).toBe(true);
  });
});
