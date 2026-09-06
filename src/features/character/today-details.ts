import type { DayTotals } from '@kairo/core';
import type { TodayQuest } from '../quests/queries.ts';
// Relative, not `@/`: root Vitest defines no alias, so a **value** import
// through it is a load failure for `today-details.test.ts`. (`import type` is
// erased and would be fine — that is why the line above may keep its shape.)
// Same arrangement `kairo-voice.ts` uses to reach `stat-names.ts`.
import { countWords, distanceWords, durationWords, questHeadline, questProgressLine } from '../quests/quest-copy.ts';

/**
 * Today's complete day, on demand.
 *
 * Everything the Living Mirror's scene deliberately does not print — the raw
 * figures, the Daily Walk run and its explanation, every quest state, and the
 * verified sleep and strength readings — lives here, behind one **See today's
 * details** tap. The scene stays one picture, one figure and one sentence.
 *
 * Pure: no query, no rendering, no clock. `TodayDetailsSheet` draws what this
 * returns and decides nothing.
 *
 * Three rules, each with a test behind it. **Raw units only** — no score total,
 * no tier name, no XP figure, no engine key (deviations #23, #34, #51).
 * **Unknown is never zero** — a Mind section with no capability or no reading
 * is *absent*, not a row saying `0h`. And the **personal Streak and the Daily
 * Walk run never share a word**: the scene HUD reads `streaks.current_streak`,
 * this reads `dailyWalkState().streak`, and they are different values.
 */

export interface TodayDetailRow { id: string; label: string; value: string; accessibilityLabel: string }
export interface TodayDetailSection { id: 'motion' | 'body' | 'mind' | 'quests'; title: string; rows: TodayDetailRow[] }

const row = (id: string, label: string, value: string): TodayDetailRow => ({
  id, label, value, accessibilityLabel: `${label}, ${value}`,
});

/**
 * What to say about step sources Kairo did not count.
 *
 * **States a fact and never accuses.** The exclusion is inert by design: the
 * Philippine market runs cheap bands that write to HealthKit under their own
 * identifiers, and wording this as suspicion would accuse the target market of
 * cheating for owning the hardware it owns. "Aren't counted yet" is also true
 * in the direction that matters — the allowlist grows by reading this line.
 *
 * Silence is the wrong alternative, not the safe one: a number too low for the
 * day somebody had, with no reason given, is indistinguishable from the app
 * being broken. That is the argument used to *accept* third-party sleep, and it
 * binds harder when Kairo is the thing dropping the data.
 */
function droppedSourcesNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const last = names[names.length - 1]!;
  const list =
    names.length === 1 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
  return `Steps from ${list} aren't counted yet.`;
}

export function todayDetails(input: {
  totals: DayTotals;
  verifiedStrengthMinutes: number;
  hasSleepSource: boolean;
  sleepMinutes: number | null;
  dailyWalkRun: number;
  dailyWalkNote: string;
  motionNote: string | null;
  quests: readonly TodayQuest[];
  selectedQuestIndex: number | null;
  /**
   * Display names of step sources this device's last read did not count.
   *
   * Owner-only — it is an observation about the player's own phone, reaches no
   * projection and no telemetry payload, and no other player can see it.
   */
  droppedStepSources: readonly string[];
}): TodayDetailSection[] {
  const dropped = droppedSourcesNote(input.droppedStepSources);
  const sections: TodayDetailSection[] = [
    {
      id: 'motion', title: 'Motion', rows: [
        row('steps', 'Steps', `${countWords(input.totals.steps)} steps`),
        row('distance', 'Distance', distanceWords(input.totals.distanceM)),
        row('walk-run', 'Daily Walk run', `${input.dailyWalkRun} ${input.dailyWalkRun === 1 ? 'day' : 'days'}`),
        // The one surviving explanation of what the Daily Walk is. Supplied by
        // the caller from `walkNote()` rather than rewritten here.
        row('walk-note', 'Daily Walk', input.dailyWalkNote),
        ...(input.motionNote ? [row('motion-note', "Today's Motion", input.motionNote)] : []),
        // Last, like `motion-note`: somebody opens this sheet *because* the
        // steps figure looks wrong, and they read the section to find out why.
        ...(dropped ? [row('dropped-sources', 'Not counted', dropped)] : []),
      ],
    },
    {
      id: 'body', title: 'Body', rows: [
        row('energy', 'Active energy', `${countWords(input.totals.activeKcal)} kcal`),
        // Absent at zero rather than a "0 min" row: no session today and a
        // session Kairo could not verify are different claims, and neither is
        // "you did nothing".
        ...(input.verifiedStrengthMinutes > 0
          ? [row('strength', 'Verified strength session', `${Math.round(input.verifiedStrengthMinutes)} min`)]
          : []),
      ],
    },
  ];
  // Both halves, and neither is redundant: without `has_sleep_source` the
  // account cannot earn Mind at all, and with it a night can still be unread.
  // Unknown is never rendered as zero.
  if (input.hasSleepSource && input.sleepMinutes !== null) {
    sections.push({ id: 'mind', title: 'Mind', rows: [row('sleep', 'Verified sleep', durationWords(input.sleepMinutes))] });
  }
  sections.push({
    id: 'quests', title: 'More for today',
    rows: input.quests.map((entry, index) => row(
      `quest-${index}`,
      index === input.selectedQuestIndex ? 'Current step' : questHeadline(entry.quest),
      `${index === input.selectedQuestIndex ? `${questHeadline(entry.quest)} · ` : ''}${questProgressLine(entry.quest, entry.state)}`,
    )),
  });
  return sections;
}
