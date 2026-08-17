import type { DayStatus } from './compute.ts';

/**
 * Goals — the long-horizon commitment (spec §8, v1.4).
 *
 * A goal is a target over a window of days: either a running total to reach
 * (`cumulative`) or a per-day bar to clear on N of M days (`consistency`),
 * measured in one of two metrics (`GoalMetric` below).
 *
 * Both metrics stay inside §5's privacy projection, and that is a constraint
 * rather than a coincidence: `daily_score` reads `daily_scores.total`, the same
 * canonical number the leaderboard ranks on, and `daily_walk` reads the stored
 * AGI tier, which `squad_leaderboard()` already returns to squadmates. **There
 * is deliberately no goal metric that would reach raw steps or hourly
 * movement** — a distance goal would need one, which is why it is not here.
 *
 * **This is the only implementation of goal arithmetic.** The SQL side returns
 * rows — each participant's per-day score series for the window — and both the
 * client and `finalize-days` call the functions here. That is deviation #18, and
 * the reason is the differential-test tax: `finalizable_days()`/`isFinalizable()`
 * and `program_weighted_total()`/`weightedBoardTotal()` are each two
 * implementations of one rule kept honest by a test, and a third pair is not
 * worth the privacy nicety of aggregating in the database.
 *
 * Pure, like everything in this package: `today` is an argument, never a clock
 * read, so window boundaries are table-driven tests with no time mocking.
 */

export type GoalKind = 'cumulative' | 'consistency';

/**
 * What a goal is measured in.
 *
 * `daily_score` is the original: a goal's target is a number of points, which
 * the user typed. That was defensible while points were the app's vocabulary
 * and stopped being defensible when they left every other surface — a target
 * you cannot translate into behaviour makes the goal arbitrary and its failure
 * feel like the algorithm's fault.
 *
 * `daily_walk` measures the same days against the Daily Walk instead: 10,000
 * steps, the number already on the home shelf with a streak beside it. A user
 * can answer "is 25 out of 30 realistic for me" by looking at their own streak,
 * which is the question the score metric had no answer to.
 *
 * **It reaches no raw data.** The boolean comes from `daily_scores.tiers`,
 * which `squad_leaderboard()` already projects to squadmates. This file's
 * original note — "there is deliberately no goal metric that would reach raw
 * steps" — still holds; only the mechanism widened. Reading `health_buckets`
 * here would breach spec §5 while producing an identical screen.
 */
export type GoalMetric = 'daily_score' | 'daily_walk';

export interface Goal {
  id: string;
  /**
   * Mirrors `goals.metric`. Existing rows default to `'daily_score'`, so this
   * is additive for every goal already set.
   */
  metric: GoalMetric;
  kind: GoalKind;
  /**
   * Cumulative: the total to reach across the window.
   * Consistency: the per-day bar, cleared **inclusively** (`total >= target`).
   */
  target: number;
  /** Consistency only: how many days must clear the bar. Null for cumulative. */
  requiredDays: number | null;
  /** Inclusive. Both bounds count. */
  startsOn: string;
  /**
   * Inclusive, or **null for an open-ended goal** — "reach 500,000 points,
   * however long it takes".
   *
   * Cumulative only, and the database enforces that
   * (`goals_consistency_needs_end`). A consistency goal needs a finite window
   * to be gradeable at all: "clear the bar on 25 days" with no end can never
   * become unreachable, so `stillPossible` would be a constant true and there
   * would be no denominator for pace. An open-ended *total* has neither
   * problem — it accumulates monotonically and simply has no deadline.
   */
  endsOn: string | null;
}

/** One scored day, as `goal_window_scores()` projects it. */
export interface GoalDay {
  localDate: string;
  total: number;
  /**
   * Whether this day cleared the Daily Walk — `tiers->>'AGI' = 'gold'`, which
   * is exactly `DAILY_STEP_BASELINE` steps.
   *
   * False for a day with no score at all: `goal_window_scores` LEFT JOINs so a
   * participant with nothing yet still appears, and a null there must read as
   * "did not clear", never as cleared.
   */
  walkCleared: boolean;
  status: DayStatus;
}

export interface GoalProgress {
  /**
   * What the user sees. Includes today's provisional day, because a card that
   * ignored this morning's walk would be wrong on the screen it matters on.
   *
   * Cumulative: points. Consistency: days cleared.
   */
  progress: number;
  /**
   * The same number counting **final days only** — what completion is decided
   * from. Kept separate rather than chosen by a flag so both are always
   * available to a caller that needs to explain the difference.
   */
  finalProgress: number;
  /** Cumulative: `target`. Consistency: `requiredDays`. */
  target: number;
  /** Days cleared, final only. Zero for a cumulative goal. */
  daysMet: number;
  /**
   * Today included when it is still inside the window. Zero once past it, and
   * **null when the goal is open-ended** — calendar time left is unbounded, and
   * a zero there would render as "last day" on every card that shows it.
   */
  daysRemaining: number | null;
  /**
   * Days in the window with no final score yet — the days that can *still*
   * contribute. Distinct from `daysRemaining`, which is calendar time left: a
   * day already finalized at zero is behind you even if it is today.
   *
   * For an open-ended goal this counts elapsed days that have not finalized,
   * which is the only reading that stays meaningful without a window length.
   */
  daysUnresolved: number;
  /** True once the end date is behind us. Always false when open-ended. */
  expired: boolean;
  /** Whether the remaining days can still get there. */
  stillPossible: boolean;
  /**
   * Progress is keeping up with elapsed time. True whenever `met`, and **null
   * when open-ended**: there is no schedule, so there is nothing to be behind.
   * The pace marker on `Meter` reads this — a number here would put a tick at a
   * position that means nothing.
   */
  onPace: boolean | null;
  /**
   * **Final days only.** A provisional day can never complete a goal: completion
   * pays XP and latches one-way, so a day Apple may still revise downward must
   * not be able to trigger it.
   */
  met: boolean;
}

/** Inclusive length of a goal's window, in days. Null when open-ended. */
export function goalWindowDays(goal: Goal): number | null {
  if (goal.endsOn === null) return null;
  return daysBetween(goal.startsOn, goal.endsOn) + 1;
}

/** Whole days from `from` to `to`. Date-only, so DST cannot shift the count. */
function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

/**
 * A date-only string as a UTC instant.
 *
 * UTC deliberately, not local: these are calendar dates already resolved in the
 * user's timezone upstream (§2), so re-interpreting them in any zone would be
 * the one thing that could move a window boundary by a day.
 */
function utcOf(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function withinWindow(goal: Goal, localDate: string): boolean {
  // Lexicographic comparison is correct and cheap for zero-padded ISO dates.
  if (localDate < goal.startsOn) return false;
  return goal.endsOn === null || localDate <= goal.endsOn;
}

/** Cumulative sums points; consistency counts days that cleared the bar. */
function contribution(goal: Goal, day: GoalDay): number {
  // Checked before `kind`: for a walk goal both kinds count cleared days, and
  // only `requirement()` below distinguishes them. Checking `kind` first would
  // read the sentinel `target: 1` as a points bar and count every scoring day.
  if (goal.metric === 'daily_walk') return day.walkCleared ? 1 : 0;
  if (goal.kind === 'cumulative') return day.total;
  return day.total >= goal.target ? 1 : 0;
}

/**
 * Whether a day's contribution is capped at 1.
 *
 * True for every walk goal and for any consistency goal, which is what makes
 * `stillPossible` decidable before the window closes: with a ceiling, the best
 * case is one per unresolved day. A *points* cumulative goal has no ceiling — a
 * single day can carry any total — so it stays reachable while any day is
 * unresolved, and must not be measured by this rule.
 */
function contributionIsCapped(goal: Goal): boolean {
  return goal.metric === 'daily_walk' || goal.kind === 'consistency';
}

/** What `progress` is measured against. */
function requirement(goal: Goal): number {
  return goal.kind === 'cumulative' ? goal.target : (goal.requiredDays ?? 0);
}

export function evaluateGoal(
  goal: Goal,
  days: readonly GoalDay[],
  today: string,
): GoalProgress {
  let progress = 0;
  let finalProgress = 0;
  let finalDays = 0;

  for (const day of days) {
    if (!withinWindow(goal, day.localDate)) continue;
    const value = contribution(goal, day);
    progress += value;
    if (day.status === 'final') {
      finalProgress += value;
      finalDays += 1;
    }
  }

  const target = requirement(goal);
  const met = target > 0 && finalProgress >= target;

  const windowDays = goalWindowDays(goal);
  const expired = goal.endsOn !== null && today > goal.endsOn;

  // Today counts as remaining — it is still playable. Before the goal starts the
  // whole window is ahead, which is why this clamps at both ends rather than
  // trusting the subtraction. Open-ended goals have no answer at all, so they
  // say so rather than reporting a zero that reads as "last day".
  const daysRemaining =
    goal.endsOn === null || windowDays === null
      ? null
      : expired
        ? 0
        : today < goal.startsOn
          ? windowDays
          : daysBetween(today, goal.endsOn) + 1;

  // Counted from *unresolved* days, not calendar days left. A day that has
  // already finalized at zero is spent, and today is one of those the moment it
  // finalizes — so `daysRemaining` would over-count it by one and report a dead
  // goal as reachable on the day it died.
  //
  // With no window to subtract from, an open-ended goal counts against elapsed
  // days instead: the same quantity, measured from the only bound it has.
  const elapsedDays =
    windowDays ??
    (today < goal.startsOn ? 0 : daysBetween(goal.startsOn, today) + 1);
  const daysUnresolved = Math.max(0, elapsedDays - finalDays);

  // A goal can become arithmetically dead before its window closes only when a
  // day's contribution has a ceiling: a missed day is then gone for good. That
  // is every consistency goal *and* every walk goal, since a walk day is worth
  // at most one whichever kind it is. A points cumulative goal has no ceiling,
  // so it stays theoretically reachable while any day is unresolved — and an
  // open-ended one always has tomorrow, so it can never die.
  const stillPossible = met
    ? true
    : goal.endsOn === null
      ? true
      : contributionIsCapped(goal)
        ? finalProgress + daysUnresolved >= target
        : daysUnresolved > 0;

  // Pace needs a schedule. An open-ended goal has none, so it reports null
  // rather than a number the pace marker would render at a meaningless spot.
  let onPace: boolean | null;
  if (windowDays === null || daysRemaining === null) {
    onPace = null;
  } else {
    const elapsed = windowDays - daysRemaining;
    onPace = met || elapsed <= 0 ? true : progress / elapsed >= target / windowDays;
  }

  return {
    progress,
    finalProgress,
    target,
    daysMet: goal.kind === 'consistency' ? finalProgress : 0,
    daysRemaining,
    daysUnresolved,
    expired,
    stillPossible,
    onPace,
    met,
  };
}

export interface SquadGoalStanding {
  membersMet: number;
  /** Clamped to the roster size. */
  requiredMembers: number;
  met: boolean;
}

/**
 * Roll up a squad goal: **everyone must hit it** (§8), as N-of-M.
 *
 * The roster is frozen when the goal is created, not read live from membership —
 * "everyone must hit it" is meaningless if the denominator moves when somebody
 * joins or leaves halfway through. This function is handed that frozen roster.
 */
export function evaluateSquadGoal(
  participants: readonly { userId: string; result: GoalProgress }[],
  requiredMembers: number,
): SquadGoalStanding {
  const membersMet = participants.filter((p) => p.result.met).length;

  // Clamped rather than trusted. A requirement above the roster would be
  // permanently unwinnable, which is a worse failure than a rounded-down rule.
  const required = Math.min(Math.max(requiredMembers, 1), participants.length);

  return {
    membersMet,
    requiredMembers: required,
    // `participants.length > 0` is load-bearing: an empty roster with a
    // requirement of zero would otherwise satisfy `0 >= 0` and report a goal
    // nobody was on as achieved.
    met: participants.length > 0 && membersMet >= required,
  };
}

/** XP for a one-day goal. Longer windows scale from here, sub-linearly. */
export const BASE_GOAL_COMPLETION_XP = 30;

/**
 * The ceiling on a single goal's XP.
 *
 * `MAX_REALISTIC_DAILY_XP` is 200, so a heavy year of daily play is on the order
 * of 70,000 XP. 500 keeps the largest possible goal worth about two and a half
 * strong days — a real reward that cannot substitute for showing up.
 */
export const MAX_GOAL_COMPLETION_XP = 500;

/**
 * XP for completing a goal, scaled by how long it ran.
 *
 * Square-root scaling, so a 30-day goal pays more than a 7-day one without a
 * year-long goal paying fifty times a week-long one. Capped regardless: the
 * cheapest possible exploit is a goal with an absurd window and a trivial
 * target, and the cap is what makes that not worth doing.
 *
 * Where that lands: 1 day 30 · 7 days 79 · 30 days 164 · 100 days 300 · a year
 * and beyond 500. The cap binds from about 278 days, which is deliberate — it
 * means "a year" and "a decade" are worth the same, so nobody games the window.
 *
 * `completedOn` is what an **open-ended** goal scales by, since it has no window
 * to measure. Its span is start → completion, so a target that took a year pays
 * like a year-long window and one hit on day two pays like a two-day one. A
 * finite goal ignores the argument entirely: its reward is a property of the
 * commitment made, not of how early it happened to land.
 */
export function goalCompletionXp(goal: Goal, completedOn: string): number {
  const windowDays = goalWindowDays(goal);
  // `max(1, …)` guards the one impossible-but-cheap case: a completion date
  // before the start would otherwise take the square root of a negative span.
  const span =
    windowDays ?? Math.max(1, daysBetween(goal.startsOn, completedOn) + 1);
  const scaled = BASE_GOAL_COMPLETION_XP * Math.sqrt(span);
  return Math.min(MAX_GOAL_COMPLETION_XP, Math.round(scaled));
}

/** Whether the window is behind us. An open-ended goal never closes. */
export function isGoalWindowClosed(goal: Goal, today: string): boolean {
  return goal.endsOn !== null && today > goal.endsOn;
}
