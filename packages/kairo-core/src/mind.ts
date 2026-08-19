import type { Tier } from './types.ts';

/**
 * MND's tier bands, in hours of attributed sleep.
 *
 * Promoted from the REC bonus (roadmap deviation #41). The figures are a
 * public-health range, not a personal one: spec §2 chose fixed bands over a
 * rolling personal baseline because a leaderboard cannot explain why Gold
 * means something different for the person above you.
 */
export const MIND_THRESHOLD_HOURS = {
  bronze: 5,
  silver: 6,
  gold: 7,
} as const;

/**
 * Above this, the night flattens to Bronze — never to none.
 *
 * The retired `recBonusFor` already paid less above nine hours (200, against
 * 500 for a healthy night), so the shape is inherited rather than invented. What must
 * not be inherited is a zero: MND is a promoted *bonus*, and a stat that pays
 * nothing for a twelve-hour night punishes illness, jet lag and recovery — the
 * exact behaviours the stat exists to reward.
 */
export const MIND_OVERSLEEP_HOURS = 9;

export function mindTierFor(sleepMinutes: number): Tier {
  const hrs = sleepMinutes / 60;
  if (hrs > MIND_OVERSLEEP_HOURS) return 'bronze';
  if (hrs >= MIND_THRESHOLD_HOURS.gold) return 'gold';
  if (hrs >= MIND_THRESHOLD_HOURS.silver) return 'silver';
  if (hrs >= MIND_THRESHOLD_HOURS.bronze) return 'bronze';
  return 'none';
}
