/**
 * The daily race — the social reading of the day (roadmap deviation #46).
 *
 * A Race is not an object. It is a *reading* of a day that already exists:
 * every squad races every day, there is no creation flow, and nothing here is
 * ever stored. That is what lets it inherit the replay property the whole
 * engine has — a retroactive Apple revision changes the standings the same way
 * it changes anything else, by being replayed.
 *
 * Pure, zero-dependency, no clock reads, no randomness, like everything else in
 * this package.
 */

import { DAILY_STEP_BASELINE } from './scoring.ts';

/**
 * Where the flag is.
 *
 * **Derived, never written as a literal**, and deliberately the same number as
 * the Daily Walk: crossing the line *is* clearing the walk. One number the app
 * teaches, read socially here and personally by the streak. A second
 * competitive bar at a different number would split attention between two step
 * targets, which is the opposite of the point.
 *
 * It is also the anti-cheat. Racing on raw steps loses the tier ladder's
 * normalization — a 40,000-step day and a 12,000-step day are both Gold, so
 * cheating buys little inside scoring, and nothing outside it. Capping the
 * race contribution here puts that resistance back: past the line, extra steps
 * buy nothing at all.
 *
 * Note this reads a *raw step count*, never a stored tier. That is what keeps
 * it clear of the `AGI` / `AGI_base` trap entirely: the spread shift lowers
 * AGI's whole ladder including Gold, so a finish line read out of
 * `daily_scores.tiers` would move with the user's active hours — exactly the
 * public-health failure `DAILY_STEP_BASELINE` exists to prevent. The race gets
 * its steps from the widened `squad_leaderboard()` projection instead.
 */
export const RACE_FINISH_LINE = DAILY_STEP_BASELINE;

export interface RacerInput {
  userId: string;
  characterName: string;
  /** Species id, or null for anyone predating the choice. */
  species: string | null;
  /** Raw steps for the day. Capping happens here, never at the call site. */
  steps: number;
  /** The weighted daily score. Used only to break a tie past the line. */
  total: number;
  isSelf: boolean;
  /** A previous day of the player's own, raced against in solo mode. */
  isGhost?: boolean;
}

export interface Racer extends RacerInput {
  rank: number;
  cappedSteps: number;
  /** 0–1, clamped. What the lane draws. */
  progress: number;
  finished: boolean;
}

export function cappedSteps(steps: number): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  return Math.min(Math.floor(steps), RACE_FINISH_LINE);
}

export function raceProgress(steps: number): number {
  return cappedSteps(steps) / RACE_FINISH_LINE;
}

/**
 * Rank by capped steps, then daily score, then user id.
 *
 * The second key matters more than it looks: once two people are past the line
 * they are tied on the primary key by construction, and that is the common case
 * for an active squad rather than an edge case. Falling through to the score
 * means the tie breaks on the thing the engine already considers a better day.
 *
 * The third key exists so the order is **stable across refetches**. Without it
 * two identical rows swap places on every poll and the board visibly twitches.
 */
export function rankRacers(racers: readonly RacerInput[]): Racer[] {
  return [...racers]
    .map((r) => {
      const capped = cappedSteps(r.steps);
      return {
        ...r,
        cappedSteps: capped,
        progress: capped / RACE_FINISH_LINE,
        finished: capped >= RACE_FINISH_LINE,
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        b.cappedSteps - a.cappedSteps ||
        b.total - a.total ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface GhostDay {
  /** The player's own local date, `YYYY-MM-DD`. */
  localDate: string;
  steps: number;
}

/**
 * A solo player's rivals: their own recent days.
 *
 * The source design's §20 warns against solo Race/Battle/Adventure modes, and
 * this is the narrow, deliberate exception. It exists so nobody ever meets an
 * empty Squad tab, and so the mechanic teaches itself before a friend arrives.
 *
 * Days that scored nothing are dropped rather than raced: a new account
 * otherwise lines up against three zeroes, which reads as the feature being
 * broken rather than as an easy win.
 *
 * `characterName` is the raw local date. Formatting it is the UI's job — this
 * module imports nothing and does no locale work.
 */
export function ghostRivals(days: readonly GhostDay[], count: number): RacerInput[] {
  return [...days]
    .filter((d) => d.steps > 0)
    .sort((a, b) => (a.localDate < b.localDate ? 1 : a.localDate > b.localDate ? -1 : 0))
    .slice(0, Math.max(0, count))
    .map((d) => ({
      userId: `ghost:${d.localDate}`,
      characterName: d.localDate,
      species: null,
      steps: d.steps,
      total: 0,
      isSelf: false,
      isGhost: true,
    }));
}
