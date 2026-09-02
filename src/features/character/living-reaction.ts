import type { CoreStat } from '@kairo/core';
import { locationName, type LivingReaction, type MotionLocation, type ReactionKind } from './living-mirror.ts';

/**
 * What KAIRO reacts to, and which one it shows.
 *
 * Pure and tested in Node — no clock, no storage, no query. The hook beside
 * this file performs; this decides.
 *
 * Every candidate carries a stable **occurrence id**, which is what makes a
 * reaction one-shot without a table: the id is date-keyed (or sample-keyed, for
 * a workout), so yesterday's unshown occurrence simply fails to match today's
 * candidate and nothing has to be pruned.
 */

// Distinct values throughout: relying on a stable sort to separate two equal
// priorities makes the order an implementation detail of `Array.prototype.sort`.
const PRIORITY = { level: 50, record: 40, daily_walk: 35, workout: 30, motion_location: 20 } as const;

export const REACTION_KINDS = [
  'level', 'record', 'daily_walk', 'workout', 'motion_location',
] as const satisfies readonly ReactionKind[];

export interface ReactionCandidateInput {
  localDate: string;
  characterName: string;
  previousLevel: number | null;
  currentLevel: number;
  motionLocation: MotionLocation;
  dailyWalkMet: boolean;
  recordStatsToday: readonly CoreStat[];
  verifiedWorkoutOccurrence: string | null;
  /**
   * `STAT_NAMES`, injected as data for the reason `row-label.ts` injects it:
   * the words live in a UI module and this one has to stay loadable by root
   * Vitest. An engine key must never reach a sentence (deviation #51).
   */
  statNames: Record<CoreStat, string>;
}

export function reactionCandidates(input: ReactionCandidateInput): LivingReaction[] {
  const items: LivingReaction[] = [];
  // `previousLevel === null` is a first observation, not a level-up. Without
  // this an account's very first opening would celebrate the level it already
  // had, which is the app congratulating somebody for installing it.
  if (input.previousLevel !== null && input.currentLevel > input.previousLevel) {
    items.push({
      kind: 'level', priority: PRIORITY.level,
      occurrence: `level:${input.previousLevel}->${input.currentLevel}`,
      pose: 'race_victory', animation: 'level_up',
      sentence: `${input.characterName} noticed the change. Level ${input.currentLevel} suits you.`,
    });
  }
  if (input.recordStatsToday.length > 0) {
    const names = input.recordStatsToday.map((stat) => input.statNames[stat]).join(' and ');
    items.push({
      kind: 'record', priority: PRIORITY.record,
      occurrence: `record:${input.localDate}:${[...input.recordStatsToday].sort().join('+')}`,
      pose: 'race_victory', animation: 'victory',
      sentence: `${input.characterName} is celebrating a new ${names} best.`,
    });
  }
  // The Ridge arrival belongs here and nowhere else: `dailyWalkMet` and
  // `location === 'ridge'` are the same comparison against the same constant,
  // so a location candidate for the top band would be a second reaction for one
  // arrival, firing after the walk had already been celebrated. The sentence is
  // the one `heroSentence` used to carry.
  if (input.dailyWalkMet) {
    items.push({
      kind: 'daily_walk', priority: PRIORITY.daily_walk,
      occurrence: `walk:${input.localDate}`, pose: 'race_victory', animation: 'victory',
      sentence: `${input.characterName} cleared the ridge. The Daily Walk is done.`,
    });
  }
  if (input.verifiedWorkoutOccurrence) {
    items.push({
      kind: 'workout', priority: PRIORITY.workout,
      occurrence: input.verifiedWorkoutOccurrence, pose: 'workout', animation: 'excited',
      sentence: `${input.characterName} carries today's strength work proudly.`,
    });
  }
  if (input.motionLocation !== 'branch' && input.motionLocation !== 'ridge') {
    items.push({
      kind: 'motion_location', priority: PRIORITY.motion_location,
      occurrence: `motion:${input.localDate}:${input.motionLocation}`,
      pose: input.motionLocation === 'climb' ? 'run' : 'walk',
      animation: 'happy',
      // `locationName`, never the raw enum value — the label the player reads
      // is capitalised and there is exactly one function that decides it.
      sentence: `${input.characterName} reached the ${locationName(input.motionLocation)}.`,
    });
  }
  return items.sort((a, b) => b.priority - a.priority);
}

/**
 * One reaction per opening, and **only that one is consumed.**
 *
 * Returning every unseen candidate as consumed would mean a level-up
 * permanently swallowed the Daily Walk clear and a personal best set the same
 * afternoon. One reaction per opening is the rule; destroying the others is a
 * separate rule nobody asked for. Occurrence ids are date-keyed, so yesterday's
 * unshown occurrence fails to match today's candidate and nothing needs pruning.
 */
export function selectLivingReaction(
  candidates: readonly LivingReaction[],
  seen: Partial<Record<ReactionKind, string>>,
): { reaction: LivingReaction | null; consumed: LivingReaction[] } {
  const unseen = candidates.filter((candidate) => seen[candidate.kind] !== candidate.occurrence);
  const reaction = unseen[0] ?? null;
  return { reaction, consumed: reaction ? [reaction] : [] };
}
