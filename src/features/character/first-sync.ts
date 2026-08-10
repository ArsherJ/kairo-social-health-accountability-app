import { CORE_STATS, type CoreStat } from '@kairo/core';

/**
 * The first-sync moment.
 *
 * The best thing in the whole funnel happens silently today: someone grants
 * HealthKit access and a day they already lived is instantly on the board. This
 * turns that into something they can see once.
 *
 * Pure so the wording is testable — the callout itself is one-shot, so a bug in
 * it is a bug nobody gets a second chance to notice.
 *
 * It used to name a tier ("8,200 steps → AGI Gold"). Bronze/Silver/Gold are
 * internal to scoring now, so it names the points instead — which is also the
 * better line for a first-time reader, who has no idea yet whether Gold is good.
 */

export function firstSyncHeadline(input: {
  steps: number;
  points: Record<CoreStat, number>;
}): string | null {
  const best = bestScoringStat(input.points);
  const steps = input.steps > 0 ? `${input.steps.toLocaleString()} steps` : null;

  if (best) {
    const earned = `+${best.points.toLocaleString()} ${best.stat}`;
    // A lifter's session is active calories, not steps. Leading with "0 steps"
    // would tell them their workout did not count.
    return steps === null
      ? `Today already counted: ${earned}.`
      : `Today already counted: ${steps} → ${earned}.`;
  }

  // Steps but nothing scored yet is still the moment worth showing — "your
  // activity is arriving" — so it gets its own line rather than being
  // suppressed.
  if (steps !== null) {
    return `Today already counted: ${steps}. Keep moving to start scoring.`;
  }

  // Nothing landed. A callout celebrating zero is the opposite of the moment.
  return null;
}

/**
 * The stat that earned the most today.
 *
 * Points alone decide it, with no separate tier lookup to disagree with them —
 * which removes the malformed-row case the tier version had to guard against
 * (points present, tier missing, and the callout printing "AGI undefined" at the
 * one moment that only happens once).
 */
function bestScoringStat(
  points: Record<CoreStat, number>,
): { stat: CoreStat; points: number } | null {
  let best: { stat: CoreStat; points: number } | null = null;

  for (const stat of CORE_STATS) {
    const value = points[stat];
    if (value > 0 && (best === null || value > best.points)) {
      best = { stat, points: value };
    }
  }

  return best;
}
