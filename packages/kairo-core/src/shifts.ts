/**
 * Threshold shifts — how VIT survives the three-stat model.
 *
 * END's half of this file is gone as of 2026-08-29: verified workout minutes
 * became an earning route into Body rather than a discount on Body's bands.
 * See `statShifts` below and `scoring.ts`.
 *
 * **Shifts, deliberately, and never point multipliers.** A stored multiplier
 * stacks with the squad program's read-time weight, which is exactly why
 * deviation #10 pulled the featured-stat rotation out of stored scoring: an
 * AGI week in a running squad scored 2.25x. A stored spread multiplier would
 * rebuild that trap at 3x. Making the *band* easier cannot stack, and it is
 * easier to say out loud — moving all day makes Gold arrive sooner, rather
 * than making Gold worth more.
 */

import type { CoreStat } from './types.ts';

/** No shift may exceed this, whatever the inputs. */
export const MAX_THRESHOLD_SHIFT = 0.25;

const SHIFT_STEP = 0.05;

/** VIT's old bronze band. Below it, spreading has earned nothing. */
export const SPREAD_SHIFT_FLOOR_HOURS = 3;

/** Five steps of 5% each, so the cap is reached at eight active hours. */
function capped(steps: number): number {
  return Math.min(MAX_THRESHOLD_SHIFT, Math.max(0, steps) * SHIFT_STEP);
}

/** VIT's signal: how much of the day carried movement. */
export function spreadShift(activeHours: number): number {
  return capped(Math.floor(activeHours) - SPREAD_SHIFT_FLOOR_HOURS);
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

/**
 * Every stat's shift for one day, in one table.
 *
 * The mapping lived inline in `computeDailyScore` until the character sheet's
 * guidance line started naming the band the day is actually judged against
 * (deviation #41, Phase 3). Two copies of it is the duplication that drifts in
 * silence: the screen would go on quoting a ladder the scorer stopped using and
 * no test would notice, which is precisely the bug this table was extracted to
 * close.
 *
 * `Record<CoreStat, number>` rather than a lookup with a fallback, so a fourth
 * stat cannot arrive without someone deciding what it inherits.
 *
 * **Only Motion shifts, as of 2026-08-29.** The table stays a full record
 * anyway: a zero that someone decided is worth more than an absence somebody
 * has to interpret.
 */
export function statShifts(input: { activeHours: number }): Record<CoreStat, number> {
  return {
    AGI: spreadShift(input.activeHours),
    // **Body takes no shift, as of 2026-08-29.** It used to take one derived
    // from verified workout minutes, and that was the wrong direction on the
    // wrong stat: the only genuine strength signal Kairo collects was spent
    // making Body's bands *easier* instead of making Body's number *larger*, so
    // the app rewarded lifting by asking less of you, invisibly. Those minutes
    // are an earning route into STR now (`scoring.ts`), and a signal must not
    // do both — one that lowered the bands and raised the points would be a
    // direct double-count on a single stat.
    //
    // AGI's spread shift is untouched and is not the same arrangement: it is a
    // different signal, on a different stat, and it double-counts nothing.
    STR: 0,
    // The trust gate decides *whether* a night scores, never how easily.
    MND: 0,
  };
}
