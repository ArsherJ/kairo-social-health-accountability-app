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

import {
  MIND_OVERSLEEP_HOURS,
  MIND_THRESHOLD_HOURS,
  mindPoints,
} from './mind.ts';
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
 * Where a night starts buying Body anything: Mind's own top band.
 *
 * Derived rather than written as a 7, so the two cannot part. A night that has
 * not reached the hours the app already calls a full one has not earned a
 * discount on anything, and moving Mind's Gold band without moving this would
 * leave Body generous about nights Mind itself no longer rates.
 */
export const RESTED_SHIFT_FLOOR_HOURS = MIND_THRESHOLD_HOURS.gold;

/** Where the ramp reaches its peak. The eight hours everybody already means. */
export const RESTED_SHIFT_PEAK_HOURS = 8;

/**
 * The most a night can discount Body's bands — **half** the system cap.
 *
 * Half rather than the whole of it because Motion's spread shift spends the
 * full 25% on a signal that takes all day to earn, and one good night is not
 * that. It is also the number that keeps this legible: at the peak, Body's
 * Gold moves 400 kcal to 350, which is a sentence a person can check.
 */
export const MAX_RESTED_SHIFT = MAX_THRESHOLD_SHIFT / 2;

/**
 * What a rested night buys **Body**, as a threshold shift.
 *
 * This is "Mind boosts your own progress" (deviation #68), built the one way
 * the engine already has for *this signal makes that stat easier*. A stored
 * multiplier stacks with the squad program's read-time weight, which is
 * deviation #10's trap and the reason END and VIT became shifts in the first
 * place; a band that moves cannot stack with anything.
 *
 * **Body, and never Motion, and that is the whole decision.** Motion's shift
 * already reaches `MAX_THRESHOLD_SHIFT` at eight active hours, so an additive
 * rested shift there would be a no-op for exactly the players who sleep well
 * *and* move all day — invisible to its own best case. Body's shift was a hard
 * zero, so there is no cap collision, no interaction with the spread shift, and
 * no second reason to reason about `AGI` against `AGI_base`. The Daily Walk,
 * the ridge and the race are therefore untouched by construction rather than by
 * care.
 *
 * **One signal, one place.** Sleep scores Mind from its raw value and shifts
 * Body's bands. It must never shift *Mind's* own bands — that is the retired
 * `workoutShift` double-count in a new dress — and it must never touch Body's
 * raw value, where the strength credit already lives.
 *
 * Shape, in hours: nothing below `RESTED_SHIFT_FLOOR_HOURS`, a ramp to the peak
 * at eight, the peak held to `MIND_OVERSLEEP_HOURS`, and then **Mind's own
 * curve, scaled** — read from `mindPoints` rather than restated as a second
 * taper, so the two cannot disagree about a long night and neither the taper's
 * end nor its floor is written twice. A very long night therefore tapers rather
 * than cliffs, and floors above zero, for the reason `mind.ts` gives: HealthKit
 * sleep is noisy, and a cliff punishes measurement error as though it were
 * behaviour.
 *
 * **Wearable-gated by construction.** A phone-only account records no sleep, so
 * `null` arrives here and the answer is the same zero it always was. The
 * minutes handed in are the ones that already passed the trust gate
 * (`scoringSleepMinutes` on the server, `scoredSleepMinutes` on the client), so
 * a hand-typed night buys nothing here either.
 */
export function restedShift(sleepMinutes: number | null | undefined): number {
  if (sleepMinutes === null || sleepMinutes === undefined) return 0;
  if (!Number.isFinite(sleepMinutes) || sleepMinutes <= 0) return 0;

  const hrs = sleepMinutes / 60;
  if (hrs < RESTED_SHIFT_FLOOR_HOURS) return 0;
  if (hrs < RESTED_SHIFT_PEAK_HOURS) {
    return (
      MAX_RESTED_SHIFT *
      ((hrs - RESTED_SHIFT_FLOOR_HOURS) /
        (RESTED_SHIFT_PEAK_HOURS - RESTED_SHIFT_FLOOR_HOURS))
    );
  }
  if (hrs <= MIND_OVERSLEEP_HOURS) return MAX_RESTED_SHIFT;

  // Mind's decline, scaled to this shift's peak. `mindPoints` is flat at Gold
  // across the whole plateau, so the divisor is that plateau's value however it
  // is later spelled.
  const peak = mindPoints(MIND_OVERSLEEP_HOURS * 60);
  if (peak <= 0) return 0;
  return MAX_RESTED_SHIFT * (mindPoints(sleepMinutes) / peak);
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
 * **Motion takes the spread and Body takes the night, as of 2026-09-08.** The
 * table stays a full record anyway: a zero that someone decided is worth more
 * than an absence somebody has to interpret.
 *
 * **`sleepMinutes` is required and is deliberately not defaulted.** A default
 * would make "this account has no wearable" and "this caller forgot" the same
 * silent answer on the one path that decides how a day is scored — the trap
 * `planDay` already avoids with `earnableStats`. `null` is the honest reading
 * for a night that does not exist, and someone has to write it.
 */
export function statShifts(input: {
  activeHours: number;
  /** The night as the trust gate scored it, or null when there is none. */
  sleepMinutes: number | null;
}): Record<CoreStat, number> {
  return {
    AGI: spreadShift(input.activeHours),
    // **Body's shift is the night's, and only the night's.** It took no shift
    // at all between 2026-08-29 and 2026-09-08, and before that it took one
    // derived from verified workout minutes — which was the wrong direction on
    // the wrong stat: the only genuine strength signal Kairo collects was spent
    // making Body's bands *easier* instead of making Body's number *larger*, so
    // the app rewarded lifting by asking less of you, invisibly. Those minutes
    // are an earning route into STR now (`scoring.ts`), and a signal must not
    // do both — one that lowered the bands and raised the points would be a
    // direct double-count on a single stat.
    //
    // AGI's spread shift is untouched and is not the same arrangement: it is a
    // different signal, on a different stat, and it double-counts nothing.
    //
    // **Body's shift came back on 2026-09-08 as the night's, not the
    // workout's** (deviation #68). That is not the retired arrangement
    // returning: verified minutes still raise Body's *raw value* and touch its
    // bands nowhere, and sleep touches Body's raw value nowhere. Two signals,
    // two mechanisms, no overlap. Route verified minutes back through here as
    // well and the double-count returns exactly as it was.
    STR: restedShift(input.sleepMinutes),
    // The trust gate decides *whether* a night scores, never how easily — and
    // now that the night moves another stat's bands, this zero is the line that
    // keeps one signal doing one thing. A night that discounted its own ladder
    // would be the workout shift's double-count wearing sleep's clothes.
    MND: 0,
  };
}
