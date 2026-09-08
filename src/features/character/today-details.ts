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

/**
 * What a flagged day says to the player it was flagged on.
 *
 * **The accused hears it first.** The flag is a social signal — a chip on a
 * leaderboard row every squadmate can see — and until this line existed the
 * first anybody learned of it was through a friend's screen. This sentence
 * lands on their own day, in plain language, before that.
 *
 * It names no rule and no number. Two rules produce this one sentence — a step
 * burst nothing corroborates, and an hour over a plausibility ceiling — and
 * they mean the same thing to a person, which is the same reason
 * `daily_scores.flagged` is a boolean and not a reason column. Naming the
 * threshold would also publish the bar to the one reader with a motive to sit
 * just under it.
 *
 * **It names the consequence that is real, which is not the one the design
 * drafted.** That sentence ended "so they won't count towards the flock", and
 * the flock is exactly where a flagged day *does* still count:
 * `squad_leaderboard()` ranks on the weighted total and only projects the flag
 * for the chip, the Sky corridor re-ranks capped steps without reading it, and
 * XP, Mastery and the streak are all untouched — `trust.ts` states the rule
 * outright, a flag is a social signal and never a score reduction. The one
 * thing a flag now stops is `stat_records()`, so that is what this says. A
 * false claim on a player-facing surface is the worst kind and gets rewritten
 * rather than annotated, exactly as the HealthKit privacy line was.
 */
const FLAGGED_DAY_NOTE =
  "Some of today's hours don't look like walking, so today can't set a personal best — and your flock sees a flag on your row.";

export function todayDetails(input: {
  totals: DayTotals;
  verifiedStrengthMinutes: number;
  hasSleepSource: boolean;
  sleepMinutes: number | null;
  dailyWalkRun: number;
  dailyWalkNote: string;
  motionNote: string | null;
  /**
   * Why today's Body is easier than the published number, when it is —
   * `restedLine`'s sentence, or null.
   *
   * Null far more often than not: it needs a night, and a night needs a
   * wearable. That is deviation #68's stated cost rather than a gap, and it is
   * why nothing else on this sheet depends on it being there.
   *
   * **Deliberately not gated on `hasSleepSource` as well**, unlike the Mind
   * section below. The two answer different questions: that gate is about
   * *capability* — whether Mind can be earned at all — while this sentence
   * reports what the scorer actually did with the night, and the scorer reads
   * `sleepMinutes` and never the flag. Adding the flag here would let a stale
   * one silence a sentence about a shift that really applied.
   */
  bodyNote: string | null;
  quests: readonly TodayQuest[];
  selectedQuestIndex: number | null;
  /**
   * Display names of step sources this device's last read did not count.
   *
   * Owner-only — it is an observation about the player's own phone, reaches no
   * projection and no telemetry payload, and no other player can see it.
   */
  droppedStepSources: readonly string[];
  /**
   * `daily_scores.flagged` for today — the anti-cheat verdict on this day.
   *
   * Unlike `droppedStepSources`, which is an observation about the phone, this
   * one *is* visible to squadmates, as a chip on the leaderboard row. It is
   * read here so the player it accuses reads it first.
   */
  flagged: boolean;
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
        // Last of all, and the heaviest of the three: this is the only line
        // here with a consequence attached, and the only one anybody else can
        // see the effect of.
        ...(input.flagged ? [row('flagged', "Today's data", FLAGGED_DAY_NOTE)] : []),
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
        // Last, exactly as `motion-note` is: the figures first, then why the
        // bar they are measured against moved.
        ...(input.bodyNote ? [row('body-note', "Today's Body", input.bodyNote)] : []),
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
