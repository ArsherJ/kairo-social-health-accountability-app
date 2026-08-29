import type { CoreStat } from '@kairo/core';
// Relative, never `@/ui` — the barrel re-exports every component and the `@/`
// alias does not resolve under root Vitest. Exactly how `program-copy.ts`
// reaches this same module.
import { STAT_NAMES } from '../../ui/stat-names.ts';

/**
 * The bird's voice.
 *
 * Kairo stopped speaking as an app on 2026-08-27. A number on its own is a
 * dashboard; a number attached to a sentence about the character is a game that
 * happens to run on your real life, and that distinction is the redesign's
 * whole thesis.
 *
 * The house split, same as `race-label.ts`, `row-label.ts`, `quest-copy.ts` and
 * `program-copy.ts`: the decision lives in a zero-runtime-import module tested
 * in plain Node, and the component only performs it. Nothing here reads a
 * clock, a query or a store.
 *
 * Three rules, and each has a test that fails if it is broken:
 *
 * - **No score total, ever.** `daily_scores.total` still ranks the board and
 *   feeds XP; no ambient surface prints it (deviation #34). The bird speaks in
 *   raw units.
 * - **No engine key.** Stat words come from `STAT_NAMES` (deviation #51).
 * - **A missing figure yields a shorter sentence, never a fabricated one.** A
 *   null night reads "No reading yet" — the identical rule `finalize-days`
 *   grades by, and the difference between silence and an accusation.
 */

export interface HeroInput {
  characterName: string;
  /** 0–1 toward the day's flag. Clamped here. */
  progress: number;
  /**
   * The racer directly ahead, already resolved by the caller.
   *
   * Null when the reader is leading, when nobody else is on the track, or when
   * the squadmate ahead has not consented to share (deviation #47) — all three
   * are "there is no gap to name", and the sentence is shorter rather than
   * vaguer.
   */
  rival: { name: string; stepsAhead: number } | null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function heroSentence(input: HeroInput): string {
  const progress = clamp01(input.progress);
  const name = input.characterName;

  if (progress >= 1) return `${name} cleared the ridge. The day is done.`;

  const effort =
    progress === 0
      ? `${name} has not left the branch yet.`
      : progress < 0.35
        ? `${name} is stretching its wings.`
        : progress < 0.75
          ? `Enough to lift ${name} over the treeline.`
          : `${name} has the whole valley under it.`;

  if (input.rival === null) return effort;

  // Past the flag the gap stops meaning anything — `cappedSteps` stops at the
  // line, so extra steps buy nothing and naming a gap would imply they do. That
  // case is already returned above; this is the tie.
  if (input.rival.stepsAhead <= 0) {
    return `${effort} You are level with ${input.rival.name}.`;
  }

  // "Ramon's" — the possessive of the person, standing for their bird. The
  // rivals in this app are characters, and their owners are who you know.
  return `${effort} ${input.rival.name}'s is still ${input.rival.stepsAhead.toLocaleString()} ahead of you.`;
}

export interface SleepInput {
  characterName: string;
  /**
   * The night the *score* saw, never the raw `daily_sleep.minutes` column.
   *
   * A hand-typed night scores no Mind at all, so a raw read would have this
   * card congratulating someone on a night the engine ignored. Callers pass
   * `scoredSleepMinutes`, which is the rule `finalize-days` grades by.
   */
  sleepMinutes: number | null;
}

const HOUR_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
] as const;

const MINUTE_WORDS: Record<number, string> = {
  0: '',
  5: 'five',
  10: 'ten',
  15: 'fifteen',
  20: 'twenty',
  25: 'twenty-five',
  30: 'thirty',
  35: 'thirty-five',
  40: 'forty',
  45: 'forty-five',
  50: 'fifty',
  55: 'fifty-five',
};

/**
 * "Seven hours twenty", the way somebody says it out loud.
 *
 * Rounded to five minutes, because a bird does not report to the minute and
 * because HealthKit's sleep totals are not that precise anyway. Beyond twelve
 * hours the words run out and it falls back to digits — a fifteen-hour night is
 * a data artefact, and a sentence that reads oddly is the right amount of
 * attention to draw to one.
 */
function spokenDuration(minutes: number): string {
  const rounded = Math.round(minutes / 5) * 5;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours >= HOUR_WORDS.length) {
    return mins === 0 ? `${hours} hours` : `${hours}h ${mins}m`;
  }

  const hourWord = HOUR_WORDS[hours] ?? String(hours);
  const unit = hours === 1 ? 'hour' : 'hours';
  const minuteWord = MINUTE_WORDS[mins];

  return minuteWord ? `${hourWord} ${unit} ${minuteWord}` : `${hourWord} ${unit}`;
}

/** Below this the bird glides rather than flaps. Six hours, in minutes. */
const RESTED_MINUTES = 360;

export function sleepLine(input: SleepInput): { eyebrow: string; body: string } {
  if (input.sleepMinutes === null || !Number.isFinite(input.sleepMinutes)) {
    return {
      eyebrow: `${input.characterName} is waiting on last night`,
      body: 'No reading yet.',
    };
  }

  const rested = input.sleepMinutes >= RESTED_MINUTES;

  return {
    eyebrow: `${input.characterName} slept when you did`,
    body: `${spokenDuration(input.sleepMinutes)}. ${
      rested
        ? 'It has energy to burn all afternoon.'
        : 'It will be gliding more than flapping today.'
    }`,
  };
}

export interface LaneInput {
  characterName: string;
  /**
   * The observed dominant stat, or null while it is unknown.
   *
   * Null covers both "no lane has emerged" and "the query is in flight", which
   * are the same thing to a caller with nothing to draw — and naming a build
   * for someone who has done nothing cheapens the one visual §6 says must be
   * earned.
   */
  lane: CoreStat | null;
}

/** What each lane's last stretch of the day looks like, in the bird's terms. */
const LANE_NUDGE: Record<CoreStat, string> = {
  AGI: 'One more loop of the block',
  STR: 'One more set',
  MND: 'An early night',
};

export function laneLine(input: LaneInput): { eyebrow: string; body: string } | null {
  if (input.lane === null) return null;

  const word = STAT_NAMES[input.lane];

  return {
    eyebrow: `Your lane · ${word}`,
    body: `${LANE_NUDGE[input.lane]} and ${input.characterName}'s ${word} tops out for the day.`,
  };
}

export interface SpreadInput {
  /** Hours of the day that carried real movement. */
  activeHours: number;
  /**
   * Steps needed for Motion's top band **today**, after the spread shift.
   *
   * Passed in rather than derived: deriving it here would mean a second copy of
   * the ladder, and this module is deliberately import-free apart from the stat
   * words. The caller reads it from the same `statShifts` the scorer used, which
   * is the only way this sentence and the score can agree.
   */
  goldSteps: number;
  /** The same band with no shift applied, for the difference. */
  baseSteps: number;
}

/**
 * What spreading the day out actually bought — said as a consequence, in steps.
 *
 * **This is the app's best hidden mechanic finally said out loud.** Moving
 * across many hours lowers Motion's whole ladder by up to 25%. Nothing said so:
 * `scoring.ts`'s own comment noted that arriving early "reads as a bug in the
 * score rather than as a gift", and it was right — an unexplained difficulty
 * change is indistinguishable from a broken one.
 *
 * The form is the one every line added in this pass uses: **observation, then
 * consequence**, joined by an em dash. The fact first, because the reader
 * recognises their own day in it; then what it did.
 *
 * **It says "tops out sooner", never a target, and never "ridge".** Both of
 * those would collide with numbers already on screen and already meaning
 * something else. "Ridge" is the race's finish line — `RACE_FINISH_LINE`,
 * flat at the baseline for everyone, which is the whole point of it. The Daily
 * Walk on the same screen is that same flat figure and **deliberately unshifted**
 * (it reads `AGI_base` precisely so a spread day cannot move a public-health
 * number). Naming a shifted figure with either word would put two different
 * numbers behind one noun on one screen. The difference is the honest thing to
 * report anyway: the shift is a discount, so a discount is what it should say.
 *
 * **Null when nothing was earned**, never a sentence saying so. A line reading
 * "spreading your day earned you nothing" on a quiet morning is a reprimand on
 * the screen someone opens first.
 */
export function spreadLine(input: SpreadInput): string | null {
  const hours = Math.floor(input.activeHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;

  const saved = Math.round(input.baseSteps - input.goldSteps);
  if (!Number.isFinite(saved) || saved <= 0) return null;

  const hourWord =
    hours < HOUR_WORDS.length ? HOUR_WORDS[hours]!.toLowerCase() : String(hours);

  return `Movement in ${hourWord} ${hours === 1 ? 'hour' : 'hours'} so far — ${STAT_NAMES.AGI} tops out ${saved.toLocaleString()} steps sooner today.`;
}

/**
 * The line that explains the crest sky.
 *
 * A day can reach the ceiling and then keep going, and until 2026-08-29 the app
 * had **nothing whatever to say about that** — the score stops, the race caps at
 * the finish line, and both of those are correct (the cap is the anti-cheat).
 * What was missing was anywhere for the day itself to land. The sky is that
 * place, and this is the sentence that stops it reading as a rendering bug.
 *
 * **It names no figure, deliberately** — unlike every other line in this module,
 * which leads with one. There is no honest number here: the ceiling is a score
 * total, and a score total is the one thing no ambient surface prints
 * (deviation #34). Saying "you have done everything today's scoring can see"
 * in the bird's own terms is both true and the whole content of the state.
 *
 * The permanent record of the day goes to `RecordsCard` on You, where it keeps
 * its figure and its date. This is only the same-day half.
 */
export function ceilingLine(characterName: string): string {
  return `${characterName} has everything today can give it. Anything more is for you, not the ledger.`;
}
