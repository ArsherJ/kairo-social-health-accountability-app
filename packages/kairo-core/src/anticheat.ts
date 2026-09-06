import type { HourBucket } from './types.ts';

/**
 * Anti-cheat is social, not punitive (spec §5, §20). A flag is shown to the
 * squad — it is never a ban and never reduces a score. The squad polices
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

/**
 * The most a single hour can plausibly contain. Exercise minutes have had one
 * of these since the column was written (the `<= 60` clamp in `sync-plan.ts`);
 * these are the other three.
 *
 * They sit at real human maxima rather than at comfortable ones: 15,000 m is a
 * fast runner's hour, 1,200 kcal a hard cyclist's, 12,000 steps a sustained
 * run. That is what makes the next rule affordable.
 */
export const HOURLY_CEILINGS = {
  steps: 12_000,
  distanceM: 15_000,
  activeKcal: 1_200,
} as const;

/**
 * One hour as reported, in the raw units `health_buckets` stores.
 *
 * Derived from `HourBucket` rather than restated, so the ceilings cannot end up
 * measuring fields the stored bucket does not have. Exercise minutes are absent
 * on purpose, and they are the one exception to everything said below:
 * `parseBucket` **clamps** them to 60 and has since the column was written, so
 * that quantity is the one place a bucket is not stored as reported, and a
 * 90-minute hour becomes a 60-minute one silently rather than flagging. Left
 * alone deliberately — the column's own CHECK is 60, so a flag there would
 * need the constraint moved first, and a rounding artefact in HealthKit's
 * aggregation is what that clamp was written for.
 */
export type HourlyReading = Pick<HourBucket, 'steps' | 'distanceM' | 'activeKcal'>;

/**
 * Whether an hour holds more than a person could have produced.
 *
 * **This flags. It does not clamp and it does not reject**, and both
 * alternatives were considered and are wrong. Hourly buckets are the source of
 * truth every score replays from, so a clamp would write a number Apple never
 * reported into the one store that has to stay true, and a later change to
 * these constants could not recover the original. A clamp would also *reduce a
 * real day* whenever a ceiling is met honestly, which is the one thing
 * progress-is-still-progress forbids. Rejecting the payload is worse again: a
 * refused sync is indistinguishable from the outage that took scoring down for
 * two days in August 2026.
 *
 * What it buys is bounded and worth stating plainly: almost nothing consumes
 * these numbers uncapped — the race caps at the ridge, points cap per stat, XP
 * is banded, Mastery derives from capped points, quests are boolean. So the
 * ceilings buy the *claim* that the server bounds what an hour can contain, and
 * `stat_records()` skipping flagged days is what closes the outcome: a personal
 * best is the one uncapped payoff a forged hour could otherwise buy.
 *
 * One consumer is still uncapped and the flag does not stop it: a Battle pools
 * raw active calories against a stored target and pays XP, and a flagged day
 * still contributes. That closes when the Battle is retired, which is why the
 * design put the two in one phase.
 *
 * At a ceiling is plausible; over it is not.
 */
export function exceedsHourlyCeiling(hour: HourlyReading): boolean {
  return (
    hour.steps > HOURLY_CEILINGS.steps ||
    hour.distanceM > HOURLY_CEILINGS.distanceM ||
    hour.activeKcal > HOURLY_CEILINGS.activeKcal
  );
}

export interface StepBurst {
  steps: number;
  /** Length of the window these steps arrived in. */
  windowMs: number;
  /**
   * Distance walked or run over the same window. Zero indoors.
   *
   * **Not GPS.** On iPhone `DistanceWalkingRunning` is estimated by the motion
   * coprocessor from the same pedometer stream the steps come from; GPS only
   * refines it when a workout is recording outdoors. The suppression rule is
   * unchanged by that correction and must stay unchanged — see
   * `evaluateStepBurst`.
   */
  distanceM: number;
  /** HealthKit recorded an active workout session overlapping the window. */
  hadWorkout: boolean;
  /** A wearable reported elevated heart rate over the window. */
  elevatedHeartRate: boolean;
}

/**
 * `gps_distance` names the *reading* that cleared the burst, not where it came
 * from — see `StepBurst.distanceM`, which is pedometer-estimated on iPhone. The
 * value is left alone rather than renamed: it is reporting only, nothing stores
 * it, and the name is what the suppression tests already say.
 */
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
 *
 * **Distance alone clears a burst, deliberately.** Requiring a workout or a
 * heart rate beside it was proposed and rejected: it would make
 * `MIN_PLAUSIBLE_STRIDE_M` dead code, since an explicit workout already returns
 * early above and heart rate alone already clears below — and the bar is more
 * than 9,000 steps in an hour, which an hour of running at 160 spm reaches. The
 * phone-only runner with no logged workout and no wearable has the distance and
 * nothing else, and they are honest. The attack that rule aimed at — typed
 * steps beside a matching typed distance — is killed at the source instead:
 * `EXCLUDE_TYPED_IN` drops a fabricated distance sample before it is ever read.
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
