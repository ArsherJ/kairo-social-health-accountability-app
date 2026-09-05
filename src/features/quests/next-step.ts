import type { QuestMetric } from '@kairo/core';
import { countWords } from './quest-copy.ts';
import type { TodayQuest } from './queries.ts';

/**
 * Which of today's three quests Today puts a sentence behind.
 *
 * **It changes nothing about the quest set.** `todayQuests()` still resolves
 * exactly three entries from account + local date + tier + `has_sleep_source`,
 * `finalize-days` still grades the same three, and completion XP still latches.
 * This module only ranks what is already there — the whole surface of the
 * Living Mirror's "one gentle next step" (deviation #59).
 *
 * Pure and tested in Node: it imports only types, so root Vitest can load it.
 */

export type QuestCategory = 'motion' | 'body' | 'mind';
export type NextStepSelection =
  | { kind: 'quest'; index: number; category: 'motion' | 'body'; entry: TodayQuest }
  | { kind: 'rest' };

/**
 * `active_hours` is Motion because the engine treats it as an AGI threshold
 * shift, not a stat of its own. `active_kcal` is the only Body metric a quest
 * can carry; verified strength minutes raise Body's raw value but are not a
 * quest metric.
 */
export function questCategory(metric: QuestMetric): QuestCategory {
  if (metric === 'sleep_minutes') return 'mind';
  if (metric === 'active_kcal') return 'body';
  return 'motion';
}

function nearest(entries: readonly { entry: TodayQuest; index: number }[]) {
  return [...entries].sort((a, b) =>
    b.entry.state.fraction - a.entry.state.fraction || a.index - b.index
  )[0];
}

/**
 * One nearest rule across Motion and Body together — deliberately not a
 * Motion-first rule with a fallback. Preferring the nearest *Motion* quest
 * before considering anything else meant a Body quest at 95% lost to a Motion
 * quest at 80%, so the one visible prompt routinely named a further target than
 * the one the player was about to clear. "One gentle next step" is only honest
 * if it is the nearest one.
 *
 * The Strength Challenge override is the single exception and it wins outright,
 * because opting in is an explicit statement about what the player is training.
 * "Attainable" means `!met` and nothing more: every incomplete quest is
 * reachable until midnight, and a pace or time-of-day heuristic would be the
 * fabricated time estimate the design forbids.
 *
 * A Mind quest is never selected. Sleep is an observation about a night that is
 * already over — it belongs in details, never as a daytime action.
 */
export function selectNextStep(input: {
  quests: readonly TodayQuest[];
  strengthChallengeOptedIn: boolean;
}): NextStepSelection {
  const actionable = input.quests
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.state.met && questCategory(entry.quest.metric) !== 'mind');

  const body = input.strengthChallengeOptedIn
    ? nearest(actionable.filter(({ entry }) => questCategory(entry.quest.metric) === 'body'))
    : undefined;
  const chosen = body ?? nearest(actionable);
  if (!chosen) return { kind: 'rest' };
  return {
    kind: 'quest',
    index: chosen.index,
    category: questCategory(chosen.entry.quest.metric) as 'motion' | 'body',
    entry: chosen.entry,
  };
}

function remaining(selection: Extract<NextStepSelection, { kind: 'quest' }>): number {
  return Math.max(0, selection.entry.quest.target - (selection.entry.state.value ?? 0));
}

/**
 * The one visible prompt, in the unit the player produces.
 *
 * Never an XP figure, never a tier name, never an engine key — the same three
 * rules `kairo-voice.ts` carries, and a test pins each. Counted figures go
 * through `countWords`, because active energy is a float from HealthKit and
 * printed the raw one as "395.66 active kcal". The `sleep_minutes`
 * branch is unreachable through `selectNextStep` (Mind is filtered) and returns
 * the rest sentence rather than throwing, because an exhaustive switch that can
 * crash a screen is worse than one that says something calm.
 */
export function nextStepSentence(selection: NextStepSelection, characterName: string): string {
  if (selection.kind === 'rest') {
    return `You have done what can be changed today. ${characterName} can rest with you.`;
  }
  const left = remaining(selection);
  switch (selection.entry.quest.metric) {
    case 'steps':
      return `${characterName} is ready for ${countWords(left)} more steps with you.`;
    case 'distance_m':
      return `${characterName} has ${Number((left / 1_000).toFixed(1))} km left on today's path.`;
    case 'active_hours':
      return `${characterName} is ready for ${left} more active ${left === 1 ? 'hour' : 'hours'}, whenever you are.`;
    case 'active_kcal':
      return `${characterName} noticed today's effort. ${countWords(left)} active kcal would clear this step.`;
    case 'sleep_minutes':
      return `You have done what can be changed today. ${characterName} can rest with you.`;
  }
}
