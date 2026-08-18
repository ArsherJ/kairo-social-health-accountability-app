/**
 * Threshold shifts — how END and VIT survive the three-stat model.
 *
 * **Shifts, deliberately, and never point multipliers.** A stored multiplier
 * stacks with the squad program's read-time weight, which is exactly why
 * deviation #10 pulled the featured-stat rotation out of stored scoring: an
 * AGI week in a running squad scored 2.25x. A stored spread multiplier would
 * rebuild that trap at 3x. Making the *band* easier cannot stack, and it is
 * easier to say out loud — moving all day makes Gold arrive sooner, rather
 * than making Gold worth more.
 */

/** No shift may exceed this, whatever the inputs. */
export const MAX_THRESHOLD_SHIFT = 0.25;

const SHIFT_STEP = 0.05;

/** VIT's old bronze band. Below it, spreading has earned nothing. */
export const SPREAD_SHIFT_FLOOR_HOURS = 3;

/** Twelve minutes per step puts the cap at sixty — END's old gold band. */
export const WORKOUT_SHIFT_MINUTES_PER_STEP = 12;

function capped(steps: number): number {
  return Math.min(MAX_THRESHOLD_SHIFT, Math.max(0, steps) * SHIFT_STEP);
}

/** VIT's signal: how much of the day carried movement. */
export function spreadShift(activeHours: number): number {
  return capped(Math.floor(activeHours) - SPREAD_SHIFT_FLOOR_HOURS);
}

/**
 * END's signal: how much verified exercise the day carried.
 *
 * "Verified" is the caller's problem — an unverified session contributes zero
 * minutes here, so a hand-typed workout shifts nothing. See `trust.ts`.
 */
export function workoutShift(verifiedMinutes: number): number {
  return capped(Math.floor(Math.max(0, verifiedMinutes) / WORKOUT_SHIFT_MINUTES_PER_STEP));
}

/**
 * Applies a shift to one tier band.
 *
 * Clamps at zero so a shift can only ever make a band easier — the invariant
 * lives here rather than at every call site.
 */
export function shiftedThreshold(threshold: number, shift: number): number {
  const applied = Math.min(MAX_THRESHOLD_SHIFT, Math.max(0, shift));
  return Math.round(threshold * (1 - applied));
}
