import { distanceLabel, paceLabel, type Challenge, type ChallengeArea } from '@kairo/core';

/**
 * How a Challenge is described to the person doing it.
 *
 * One module because three surfaces say it — the `/train` cards, the home
 * shelf's compact entry, and the accessible name composed from both — and a
 * challenge that reads as three different targets is worse than no challenge.
 * The same argument `program-copy.ts` makes.
 *
 * Targets are named in the units the user produces: a pace, a distance,
 * calories. Never in points — and here that is not only deviation #30, it is
 * that a challenge target *is* a pace, so points would be a translation away
 * from the thing itself. `paceLabel` and `distanceLabel` come from `@kairo/core`
 * so this and the push notification cannot round differently.
 */

export const AREA_NAMES: Record<ChallengeArea, string> = {
  run: 'Run',
  strength: 'Strength',
};

/** The target, said in one line. */
export function challengeHeadline(challenge: Challenge): string {
  if (challenge.area === 'run') {
    if (challenge.kind === 'establish') {
      return `Log one run of ${distanceLabel(challenge.minDistanceM)} or more`;
    }
    return `${distanceLabel(challenge.minDistanceM)} under ${paceLabel(
      challenge.paceSecPerKm,
    )}/km`;
  }

  if (challenge.kind === 'establish') return 'Log one strength session';
  return `${challenge.activeKcal.toLocaleString()} kcal in one session`;
}

/**
 * The line under the target.
 *
 * The `establish` cases carry the instruction rather than encouragement,
 * because the thing standing between the user and their first clear is a
 * *habit* they have not formed — starting a workout on the watch or phone so
 * Kairo can see it at all. Hiding the card until they do it was rejected: this
 * is a behaviour gap, not a capability gap. The "no wearable, no row, zero
 * penalty" rule applies to hardware nobody can conjure, which is a different
 * situation.
 */
export function challengeHint(challenge: Challenge): string {
  if (challenge.kind === 'establish') {
    return challenge.area === 'run'
      ? 'Start a run on your watch or phone before you set off — that’s how Kairo sees it. The first one just sets your baseline; it can’t be failed.'
      : 'Start a strength workout on your watch or phone before your set — that’s how Kairo sees it. Bodyweight counts: push-ups, pull-ups, squats.';
  }

  return 'Set from your own recent sessions, so it moves as you do — up when you push, back down after a quiet stretch.';
}

/**
 * One spoken sentence for the whole card.
 *
 * Composed rather than left to the reader's own traversal: a challenge card is
 * one element that means one thing, not six stops. The area is named first
 * because it is what tells the two cards apart.
 */
export function challengeLabel(challenge: Challenge, cleared: boolean): string {
  const state = cleared ? 'Cleared today.' : 'Not cleared yet.';
  return `${AREA_NAMES[challenge.area]} challenge. ${challengeHeadline(
    challenge,
  )}. ${state}`;
}
