/**
 * Unit conversion for workout totals.
 *
 * **Why this exists.** `read.ts`'s header states the rule: units are always
 * explicit, because HealthKit hands back the user's *preferred* unit when none
 * is named, and on a US-locale device a distance arrives in miles and lands in
 * a column called `distance_m`. Every other read in that file pins its unit in
 * the query.
 *
 * `queryWorkoutSamples` gives no such option — `WorkoutQueryOptions` is
 * `{ filter, limit, ascending }` and nothing more. What it does give is the
 * unit *on the value*: every `Quantity` is `{ unit, quantity }`. So the unit is
 * knowable, and this module converts from whatever was reported rather than
 * assuming metres and kilocalories.
 *
 * **An unrecognised unit yields null, and null becomes zero at the call site.**
 * That makes the session non-qualifying for a Challenge rather than storing a
 * number in the wrong unit — a 5 km run recorded as "5" metres is inert, while
 * a 5 mile run recorded as 5,000 metres would quietly corrupt the pace the Run
 * challenge is built on. Silent and inert beats silent and wrong.
 *
 * Pure and free of HealthKit imports so root Vitest can exercise it — the same
 * constraint that keeps `read-types.ts` and `sync-state.ts` separate files.
 */

/** What `queryWorkoutSamples` reports for each total. */
export interface HealthQuantity {
  unit: string;
  quantity: number;
}

const METRES_PER: Record<string, number> = {
  m: 1,
  km: 1_000,
  mi: 1_609.344,
  ft: 0.3048,
  yd: 0.9144,
};

/**
 * `Cal` is the food calorie — the same thing as `kcal`, and how Apple writes
 * it in some locales. `cal` (lower case) is the *small* calorie, a thousandth
 * of that, and conflating the two is a factor-of-1000 error in the direction
 * that makes every strength session look superhuman.
 */
const KCAL_PER: Record<string, number> = {
  kcal: 1,
  Cal: 1,
  cal: 0.001,
  kJ: 0.239_005_736,
  J: 0.000_239_005_736,
};

const SECONDS_PER: Record<string, number> = {
  s: 1,
  sec: 1,
  min: 60,
  hr: 3_600,
};

function convert(
  quantity: HealthQuantity | undefined,
  table: Record<string, number>,
): number | null {
  if (!quantity) return null;
  if (!Number.isFinite(quantity.quantity) || quantity.quantity < 0) return null;

  // Exact match only. A fuzzy match — lower-casing, or a prefix test — would
  // fold `cal` into `Cal` and be wrong by three orders of magnitude.
  const factor = table[quantity.unit];
  if (factor === undefined) return null;

  return quantity.quantity * factor;
}

export function metresFrom(quantity: HealthQuantity | undefined): number | null {
  return convert(quantity, METRES_PER);
}

export function kcalFrom(quantity: HealthQuantity | undefined): number | null {
  return convert(quantity, KCAL_PER);
}

export function secondsFrom(quantity: HealthQuantity | undefined): number | null {
  return convert(quantity, SECONDS_PER);
}
