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
 */
const TIER_WORDS: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

export function firstSyncHeadline(input: {
  steps: number;
  points: Record<CoreStat, number>;
  tiers: Record<string, string>;
}): string | null {
  const best = bestTieredStat(input.points, input.tiers);
  const steps = input.steps > 0 ? `${input.steps.toLocaleString()} steps` : null;

  if (best) {
    const earned = `${best.stat} ${TIER_WORDS[best.tier]}`;
    // A lifter's session is active calories, not steps. Leading with "0 steps"
    // would tell them their workout did not count.
    return steps === null
      ? `Today already counted: ${earned}.`
      : `Today already counted: ${steps} → ${earned}.`;
  }

  // Steps but no tier yet is still the moment worth showing — "your activity is
  // arriving" — so it gets its own line rather than being suppressed.
  if (steps !== null) {
    return `Today already counted: ${steps}. Keep moving to earn your first tier.`;
  }

  // Nothing landed. A callout celebrating zero is the opposite of the moment.
  return null;
}

function bestTieredStat(
  points: Record<CoreStat, number>,
  tiers: Record<string, string>,
): { stat: CoreStat; tier: string } | null {
  let best: { stat: CoreStat; tier: string } | null = null;
  let bestPoints = 0;

  for (const stat of CORE_STATS) {
    const tier = tiers[stat];
    // A stat with points but no tier means the row is malformed; falling back
    // beats printing "AGI undefined" at the one moment that only happens once.
    if (tier === undefined || TIER_WORDS[tier] === undefined) continue;
    if (points[stat] > bestPoints) {
      bestPoints = points[stat];
      best = { stat, tier };
    }
  }

  return best;
}
