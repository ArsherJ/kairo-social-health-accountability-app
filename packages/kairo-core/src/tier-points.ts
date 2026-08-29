import type { Tier } from './types.ts';

/**
 * What each tier is worth, and the anchors every stat's points curve is drawn
 * through.
 *
 * **Its own module, so two consumers can share one copy.** It lived in
 * `scoring.ts` until 2026-08-29, which was fine while points were a lookup on
 * this table. The taper made Mind's points a curve rather than a step, so
 * `mind.ts` needs the anchors too — and `scoring.ts` already imports `mind.ts`,
 * so the reverse import would be a cycle. Passing the table in as an argument
 * was the first attempt and was worse: it put the anchors in every caller's
 * hands, including callers outside this package, where a missing argument is a
 * runtime failure rather than a compile one.
 *
 * Re-tuned for three stats (deviation #41), and **derived rather than
 * invented**: `4 x 900 = 3 x 1,200` keeps the daily ceiling where it was.
 *
 * Not exported from the package barrel. `STAT_POINTS_MAX` is the one figure
 * that escapes, and `nextTierFor`'s `pointsGain` is the other way a caller
 * reads these numbers — both derived in `scoring.ts` so no surface can size a
 * bar against a band value this table no longer holds.
 */
export const TIER_POINTS: Record<Tier, number> = {
  none: 0,
  bronze: 250,
  silver: 650,
  gold: 1_200,
};
