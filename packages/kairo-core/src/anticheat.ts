/**
 * Anti-cheat is social, not punitive (spec §5, §20). A flag is shown to the
 * squad — it is never a ban and never reduces a score. The barkada polices
 * itself; our only job is to surface genuinely implausible data.
 *
 * The cost of a false positive is therefore high: accusing a real runner of
 * cheating in front of their friends is worse than missing a cheater. Every
 * suppression rule below exists to protect honest activity.
 */

/** More than this many steps inside the window is a candidate anomaly. */
export const VELOCITY_STEP_THRESHOLD = 1_500;
export const VELOCITY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Shortest believable stride. Real walking runs 0.6-0.8 m and running longer;
 * anything under this means the steps did not move a body through space.
 */
export const MIN_PLAUSIBLE_STRIDE_M = 0.4;

export const FLAG_CLEARS_AFTER_CLEAN_DAYS = 3;

export interface StepBurst {
  steps: number;
  /** Length of the window these steps arrived in. */
  windowMs: number;
  /** GPS-derived distance over the same window. Zero indoors. */
  distanceM: number;
  /** HealthKit recorded an active workout session overlapping the window. */
  hadWorkout: boolean;
  /** A wearable reported elevated heart rate over the window. */
  elevatedHeartRate: boolean;
}

export type SuppressionSignal = 'workout' | 'gps_distance' | 'heart_rate';

export interface BurstVerdict {
  flagged: boolean;
  reason?: 'implausible_step_velocity';
  /** Which corroborating signal cleared an otherwise-suspicious burst. */
  suppressedBy?: SuppressionSignal;
}

/**
 * A normal jog is roughly 1,600-1,800 steps per 10 minutes and must never
 * flag. Only step spikes with no supporting signal at all — no workout, no
 * heart rate, no distance consistent with the stride — surface the flag.
 */
export function evaluateStepBurst(burst: StepBurst): BurstVerdict {
  if (burst.windowMs <= 0) return { flagged: false };

  const ratePerWindow = burst.steps * (VELOCITY_WINDOW_MS / burst.windowMs);
  if (ratePerWindow <= VELOCITY_STEP_THRESHOLD) return { flagged: false };

  // Order matters only for reporting: an explicit workout is the strongest
  // signal, then GPS, then heart rate.
  if (burst.hadWorkout) return { flagged: false, suppressedBy: 'workout' };

  if (burst.distanceM >= burst.steps * MIN_PLAUSIBLE_STRIDE_M) {
    return { flagged: false, suppressedBy: 'gps_distance' };
  }

  if (burst.elevatedHeartRate) {
    return { flagged: false, suppressedBy: 'heart_rate' };
  }

  return { flagged: true, reason: 'implausible_step_velocity' };
}

/** Flags expire on their own once the user logs clean days (§5). */
export function shouldClearFlag(consecutiveCleanDays: number): boolean {
  return consecutiveCleanDays >= FLAG_CLEARS_AFTER_CLEAN_DAYS;
}
