import type { QuestDef, QuestState } from '@kairo/core';
import { countWords, durationWords } from '../quests/quest-copy.ts';

/**
 * What each dashboard tile on Today says (deviation #72).
 *
 * Zero runtime imports beyond `quest-copy.ts` — reached by relative path, the
 * way `kairo-voice.ts` reaches `stat-names.ts` — so root Vitest can hold every
 * sentence here. `TodayBoard.tsx` draws these and decides nothing.
 *
 * Three rules, and each has a test:
 *
 * - **Raw units only.** A tile prints steps, calories and hours, never a score
 *   total (deviation #34) and never an engine key (deviation #51).
 * - **Unknown is never zero.** A night Kairo cannot see reads "No reading yet",
 *   not "0h 0m" — the rule `kairo-voice.ts` and `quest-copy.ts` already keep.
 * - **The ridge is spoken through the walk, never as a literal.** The Motion
 *   tile's caption is built from `DailyWalkState.remaining`, which is derived
 *   from `DAILY_STEP_BASELINE`; no figure appears in this file.
 */
export interface TileReading {
  eyebrow: string;
  /** Already formatted. */
  figure: string;
  unit?: string;
  caption: string | null;
  /** 0–1 toward the tile's own target, or null when there is no target. */
  fraction: number | null;
  /** The whole tile as one utterance. */
  label: string;
}

/** "Wednesday 10 September" from a `YYYY-MM-DD` local date. */
export function dateHeading(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export function motionReading(input: {
  steps: number;
  /** The Motion band's name — "Treeline". */
  locationName: string;
  /** From `dailyWalkState`. */
  walk: { remaining: number; fraction: number; met: boolean } | null;
}): TileReading {
  const figure = countWords(input.steps);
  const caption =
    input.walk === null
      ? null
      : input.walk.met
        ? 'Ridge reached · the Daily Walk is cleared'
        : `${countWords(input.walk.remaining)} to the ridge`;

  return {
    eyebrow: `Motion · ${input.locationName}`,
    figure,
    unit: 'steps',
    caption,
    fraction: input.walk === null ? null : input.walk.fraction,
    label: `Motion, ${figure} steps today${caption ? `. ${caption}` : ''}.`,
  };
}

export function bodyReading(input: {
  activeKcal: number;
  /** The day's Body quest, when one of the three is. */
  quest: { def: QuestDef; state: QuestState } | null;
  verifiedStrengthMinutes: number;
}): TileReading {
  const figure = countWords(input.activeKcal);
  const strength =
    input.verifiedStrengthMinutes > 0
      ? `${countWords(input.verifiedStrengthMinutes)} min verified strength`
      : null;

  let caption: string | null = strength;
  let fraction: number | null = null;
  if (input.quest !== null) {
    const { def, state } = input.quest;
    fraction = state.fraction;
    caption = state.met
      ? `Cleared ${countWords(def.target)} kcal`
      : `of ${countWords(def.target)} kcal today`;
    if (strength) caption = `${caption} · ${strength}`;
  }

  return {
    eyebrow: 'Body',
    figure,
    unit: 'kcal',
    caption,
    fraction,
    label: `Body, ${figure} active calories${caption ? `, ${caption}` : ''}.`,
  };
}

export function mindReading(input: {
  hasSleepSource: boolean;
  /** Last night as the trust gate scored it, or null. */
  sleepMinutes: number | null;
  quest: { def: QuestDef; state: QuestState } | null;
}): TileReading {
  if (!input.hasSleepSource) {
    return {
      eyebrow: 'Mind',
      figure: '—',
      caption: 'Needs a sleep source',
      fraction: null,
      label: 'Mind. No sleep source connected.',
    };
  }
  if (input.sleepMinutes === null) {
    return {
      eyebrow: 'Mind',
      figure: '—',
      caption: 'No reading yet',
      fraction: null,
      label: 'Mind. No sleep reading yet.',
    };
  }

  const figure = durationWords(input.sleepMinutes);
  const quest = input.quest;
  const caption = quest
    ? quest.state.met
      ? `Cleared ${durationWords(quest.def.target)}`
      : `of ${durationWords(quest.def.target)}`
    : 'Verified last night';

  return {
    eyebrow: 'Mind',
    figure,
    caption,
    fraction: quest ? quest.state.fraction : null,
    label: `Mind, slept ${figure}, ${caption}.`,
  };
}
