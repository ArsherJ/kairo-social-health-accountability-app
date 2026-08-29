import { TIER_POINTS } from './tier-points.ts';
import type { Tier } from './types.ts';

/**
 * Where Mind's bands sit, in hours slept.
 *
 * Hours rather than minutes because these are the numbers a human argues about
 * — "seven hours" is the public-health figure, and a table written as 420 makes
 * every future argument go through arithmetic first. `scoring.ts` converts once,
 * for the gap line that has to speak in the stored unit.
 */
export const MIND_THRESHOLD_HOURS = {
  bronze: 5,
  silver: 6,
  gold: 7,
} as const;

/**
 * Where Gold stops holding and the taper begins.
 *
 * Nine hours is the top of the adult guideline, and the taper below is what
 * stops that guideline being enforced as a punishment.
 */
export const MIND_OVERSLEEP_HOURS = 9;

/**
 * Where the taper lands, and the floor beyond it.
 *
 * **The floor is Silver, and it is not negotiable downward.** Until 2026-08-29
 * anything past nine hours fell straight to Bronze, so 9h01m scored exactly as
 * 5h00m and an eleven-hour night scored below a five-hour one. That is
 * indefensible on its own, and it is worse than indefensible against the data:
 * HealthKit sleep is noisy — a watch left on the nightstand, `inBed` against
 * `asleep`, an afternoon nap merged into the night — so a cliff here punishes
 * *measurement error* as though it were behaviour, on the one stat whose whole
 * subject is recovery.
 *
 * The taper still says the true thing, which is that more sleep is not
 * indefinitely better. It just says it without taking a whole stat away for a
 * sample nobody chose.
 */
export const MIND_TAPER_END_HOURS = 10.5;

/**
 * Mind's points for a night, as a continuous curve.
 *
 * Drawn through `TIER_POINTS`, which lives in its own module precisely so this
 * one and `scoring.ts` read the same copy — two tables of 250/650/1200 is the
 * drift `STAT_POINTS_MAX` is derived to avoid.
 *
 * Shape, in hours: nothing below five, a rise through the bands to Gold at
 * seven, Gold held flat to nine, then a straight decline to the Silver anchor
 * at ten and a half, and Silver flat above that.
 *
 * **Mind takes no threshold shift**, unlike Motion. The trust gate decides
 * *whether* a night scores at all; nothing makes sleep easier to earn.
 */
export function mindPoints(sleepMinutes: number): number {
  if (!Number.isFinite(sleepMinutes) || sleepMinutes <= 0) return 0;

  const hrs = sleepMinutes / 60;
  const { bronze, silver, gold } = MIND_THRESHOLD_HOURS;

  if (hrs < bronze) return 0;
  if (hrs < silver) {
    return lerp(TIER_POINTS.bronze, TIER_POINTS.silver, (hrs - bronze) / (silver - bronze));
  }
  if (hrs < gold) {
    return lerp(TIER_POINTS.silver, TIER_POINTS.gold, (hrs - silver) / (gold - silver));
  }
  if (hrs <= MIND_OVERSLEEP_HOURS) return TIER_POINTS.gold;
  if (hrs >= MIND_TAPER_END_HOURS) return TIER_POINTS.silver;

  return lerp(
    TIER_POINTS.gold,
    TIER_POINTS.silver,
    (hrs - MIND_OVERSLEEP_HOURS) / (MIND_TAPER_END_HOURS - MIND_OVERSLEEP_HOURS),
  );
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}

/**
 * The tier a night lands in, **derived from its points rather than from a
 * second ladder of its own.**
 *
 * That derivation is the whole guard. The taper means Mind's points are no
 * longer a step function, so a threshold table read independently would report
 * a 9h30m night as Gold while the curve paid it 1,017 — two functions
 * disagreeing about one night, which is the failure `tierFor` and `nextTierFor`
 * are already arranged to make impossible for the other two stats.
 *
 * The visible consequence is that XP steps down once at nine hours where points
 * decline smoothly, because `TIER_XP` is banded and this pass did not change
 * that. Silver XP for a long night is the honest answer and a large improvement
 * on the Bronze it used to pay.
 */
export function mindTierFor(sleepMinutes: number): Tier {
  const points = mindPoints(sleepMinutes);
  if (points >= TIER_POINTS.gold) return 'gold';
  if (points >= TIER_POINTS.silver) return 'silver';
  if (points >= TIER_POINTS.bronze) return 'bronze';
  return 'none';
}
