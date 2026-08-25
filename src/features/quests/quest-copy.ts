import type { QuestDef, QuestMetric, QuestState } from '@kairo/core';

/**
 * How a quest is described to the person doing it.
 *
 * One module because three surfaces say it — the card, the progress line and
 * the composed accessible name — and the same argument `challenge-copy.ts` and
 * `program-copy.ts` both make: a target that reads three ways is worse than no
 * target.
 *
 * Named in the unit the user *produces*, never in points and never in stat
 * names. A quest is the smallest thing in the app and it is the first thing a
 * new account meets, so it has to be answerable without knowing anything about
 * Kairo's model.
 *
 * Pure and tested in Node — it imports only types, so root Vitest can load it.
 */

/** The verb each metric takes. Copy, so it lives here rather than in the core. */
const VERBS: Record<QuestMetric, string> = {
  steps: 'Walk',
  active_kcal: 'Burn',
  active_hours: 'Move in',
  distance_m: 'Cover',
  sleep_minutes: 'Sleep',
};

/** Minutes as a person says them. 420 is "7 hours", 450 is "7h 30m". */
function durationWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours}h ${rest}m`;
}

/** Metres as kilometres, trimmed. 5,000 is "5 km", 7,500 is "7.5 km". */
function distanceWords(metres: number): string {
  const km = metres / 1_000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

function targetWords(quest: QuestDef): string {
  switch (quest.metric) {
    case 'steps':
      return `${quest.target.toLocaleString()} steps`;
    case 'active_kcal':
      return `${quest.target.toLocaleString()} kcal`;
    case 'active_hours':
      return `${quest.target} ${quest.target === 1 ? 'hour' : 'hours'}`;
    case 'distance_m':
      return distanceWords(quest.target);
    case 'sleep_minutes':
      return durationWords(quest.target);
  }
}

export function questHeadline(quest: QuestDef): string {
  return `${VERBS[quest.metric]} ${targetWords(quest)}`;
}

/**
 * The line under the headline.
 *
 * Three states, not two. `null` is an unknown reading — a night with no
 * `daily_sleep` row, or one typed in by hand and therefore scored at nothing —
 * and saying "0 of 420 minutes" there would accuse someone of not sleeping when
 * the truth is that Kairo cannot see it. The same distinction `rawFor` in
 * `stat-detail.ts` draws, in a second place.
 */
export function questProgressLine(quest: QuestDef, state: QuestState): string {
  if (state.met) return 'Cleared';
  if (state.value === null) return 'No reading yet';

  switch (quest.metric) {
    case 'active_hours':
      return `${state.value} of ${quest.target}`;
    case 'distance_m':
      return `${distanceWords(state.value)} of ${distanceWords(quest.target)}`;
    case 'sleep_minutes':
      return `${durationWords(state.value)} of ${durationWords(quest.target)}`;
    default:
      return `${state.value.toLocaleString()} of ${quest.target.toLocaleString()}`;
  }
}

/**
 * The whole card as one utterance.
 *
 * A quest card draws a headline, a bar, a figure and an XP chip. Left as
 * separate accessibility elements, three quests are twelve stops — the
 * leaderboard's failure in miniature, which is why `row-label.ts` exists and
 * why this does too. Sentences rather than commas, because these are three
 * independent facts rather than one list.
 */
export function questLabel(quest: QuestDef, state: QuestState): string {
  return `${questHeadline(quest)}. ${questProgressLine(quest, state)}. ${quest.xp} XP.`;
}
