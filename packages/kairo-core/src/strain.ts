/**
 * Cardiovascular strain from hourly average heart rate.
 *
 * **Display only.** Strain is never written to `daily_scores`, never ranks
 * anybody, and never enters a goal. §12's server-authoritative rule is about
 * the numbers that decide standings; this is a read of the user's own data,
 * shown on their own screen, so it stays a client-side projection and score
 * replay is untouched by it.
 *
 * HealthKit has no strain metric — it is a derived score, and every product
 * that ships one derives it differently. This one is built from what Kairo
 * already reads: `HKQuantityTypeIdentifierHeartRate` as an hourly
 * `discreteAverage`, which the anti-cheat path was already querying and
 * throwing away down to a single "was this hour elevated" boolean.
 *
 * The model, in one line: **time spent high in your heart-rate reserve, weighted
 * so hard hours dominate, saturating toward a ceiling.**
 *
 *   reserve fraction  f = (hr - resting) / (max - resting), clamped to 0…1
 *   hourly load       w = f³
 *   strain            S = MAX_STRAIN · (1 - e^(-k · Σw))
 *
 * Why each piece:
 *
 * - **Heart-rate reserve** rather than raw bpm, because 140 bpm is a hard effort
 *   for one person and a jog for another. Reserve normalises against the two
 *   figures that actually differ between people.
 * - **Cubed**, because the alternative is an average, and an average says a
 *   twelve-hour desk day and a one-hour interval session are the same day. The
 *   exponent is what makes one hard hour outweigh four easy ones — which is the
 *   only reason to compute a strain score instead of showing average bpm.
 * - **Saturating**, so the scale has a top. A linear sum would put an ultra
 *   runner at 60 and everyone else in the bottom fifth of a scale nobody can
 *   read. `MAX_STRAIN` is 21 to match the 0–21 convention users arriving from
 *   Whoop already have an intuition for.
 *
 * Pure, zero-dependency, no clock read — like everything else in this package.
 * Hourly granularity is coarse (it is what `HKStatisticsCollectionQuery` gives
 * for the same reason the buckets are hourly), so this is an honest estimate
 * rather than a lab measurement, and the copy around it should not overclaim.
 */

/** The top of the scale. 0–21, the convention a wearable user already knows. */
export const MAX_STRAIN = 21;

/**
 * Saturation rate. Tuned so a genuinely hard hour moves the number visibly
 * while a full day at maximum still lands just under the ceiling — a score that
 * pins at 21 on any hard day stops distinguishing hard days from each other.
 */
const SATURATION = 0.55;

/** Used when `profiles.birth_year` is unset. §5 never requires it. */
export const DEFAULT_MAX_HEART_RATE = 190;

/**
 * Used when no resting rate has been observed. 60 is a common adult resting
 * rate; erring low makes the estimate conservative rather than flattering.
 */
export const DEFAULT_RESTING_HEART_RATE = 60;

/** Guards against an implausible age producing a ceiling below working effort. */
const MIN_MAX_HEART_RATE = 120;
const MAX_MAX_HEART_RATE = 220;

/**
 * The standard 220-minus-age estimate.
 *
 * Crude, and known to be — it is the figure every consumer wearable uses, and
 * the alternative is a lab test. Clamped at both ends so bad input degrades to a
 * usable ceiling instead of making every waking hour read as maximal effort.
 */
export function maxHeartRateForAge(age: number | null | undefined): number {
  if (age === null || age === undefined || !Number.isFinite(age)) {
    return DEFAULT_MAX_HEART_RATE;
  }
  const estimated = 220 - age;
  return Math.min(MAX_MAX_HEART_RATE, Math.max(MIN_MAX_HEART_RATE, estimated));
}

export function computeStrain(input: {
  /**
   * Average bpm per hour of the local day. `null` for an hour with no reading —
   * a watch on the charger, not an hour of rest.
   */
  hourlyAvgHr: readonly (number | null)[];
  /** Observed resting rate, or null to fall back. */
  restingHr: number | null | undefined;
  /** From `maxHeartRateForAge`. */
  maxHr: number;
}): number | null {
  const resting = input.restingHr ?? DEFAULT_RESTING_HEART_RATE;

  // A reserve of zero or less is bad data — a wearable reporting a resting rate
  // at or above the estimated maximum. Falling back to a nominal span keeps the
  // arithmetic finite rather than returning Infinity or NaN, which would reach
  // the screen as "strain ∞".
  const reserve = input.maxHr - resting > 0 ? input.maxHr - resting : MIN_MAX_HEART_RATE - 60;

  let load = 0;
  let measured = false;

  for (const bpm of input.hourlyAvgHr) {
    if (bpm === null || bpm === undefined || !Number.isFinite(bpm)) continue;
    measured = true;

    // Clamped at both ends. Below resting is a drifted baseline, not negative
    // effort; above maximum is a fit user beating an estimate, not effort the
    // scale has no room for.
    const fraction = Math.min(1, Math.max(0, (bpm - resting) / reserve));
    load += fraction ** 3;
  }

  // Never measured is not the same as never moved. Returning null is what lets
  // the UI omit the row entirely for a phone-only user, the way §5 omits REC.
  if (!measured) return null;

  const strain = MAX_STRAIN * (1 - Math.exp(-SATURATION * load));
  // One decimal: 11 and 11.4 are different days, and a whole number would hide
  // the difference between a moderate day and a hard one.
  return Math.round(strain * 10) / 10;
}
