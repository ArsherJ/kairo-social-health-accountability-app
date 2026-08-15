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
 * It has carried three vocabularies. It named a tier first ("8,200 steps → AGI
 * Gold"), until Bronze/Silver/Gold went internal to scoring (deviation #23). It
 * named points next ("8,412 steps → +900 AGI"), until the points spec retired
 * that figure everywhere outside Goals (deviation #30) — which mattered most
 * here, because this line is shown exactly once and only ever to someone who
 * has never seen the app before, the reader the whole change was made for. It
 * now names the steps and the stat they moved, and nothing a first-time reader
 * would have to be taught.
 *
 * `statNames` is injected for the same reason `row-label.ts` injects it: the
 * full words live in `@/ui/StatIcon.tsx`, which imports React Native, and this
 * module has to stay parseable by Node's test runner. "AGI" is also not a word
 * anyone knows on their first sync.
 */

export function firstSyncHeadline(input: {
  steps: number;
  points: Record<CoreStat, number>;
  statNames: Record<CoreStat, string>;
}): string | null {
  const best = bestScoringStat(input.points);
  const steps = input.steps > 0 ? `${input.steps.toLocaleString()} steps` : null;

  if (best) {
    const moved = `your ${input.statNames[best]} went up`;
    // A lifter's session is active calories, not steps. Leading with "0 steps"
    // would tell them their workout did not count.
    return steps === null
      ? `Today already counted: ${moved}.`
      : `Today already counted: ${steps}, and ${moved}.`;
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
 * Points decide it internally — that is what they are for — and the caller
 * never sees the figure, only which stat won. There is no separate tier lookup
 * to disagree with them either, which removes the malformed-row case the tier
 * version had to guard against (points present, tier missing, and the callout
 * printing "AGI undefined" at the one moment that only happens once).
 */
function bestScoringStat(points: Record<CoreStat, number>): CoreStat | null {
  let best: { stat: CoreStat; points: number } | null = null;

  for (const stat of CORE_STATS) {
    const value = points[stat];
    if (value > 0 && (best === null || value > best.points)) {
      best = { stat, points: value };
    }
  }

  return best?.stat ?? null;
}
