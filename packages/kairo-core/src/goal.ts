import type { DayStatus } from './compute.ts';

/**
 * Goals — the long-horizon commitment (spec §8, v1.4).
 *
 * A goal is a target over a window of days: either a running total to reach
 * (`cumulative`) or a per-day bar to clear on N of M days (`consistency`). It is
 * scored off `daily_scores.total`, the same canonical number the leaderboard
 * ranks on, which is what keeps it inside §5's privacy projection — there is
 * deliberately no goal metric that would reach raw steps.
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

export interface Goal {
  id: string;
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
  endsOn: string;
}

/** One scored day, as `goal_window_scores()` projects it. */
export interface GoalDay {
  localDate: string;
  total: number;
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
  /** Today included when it is still inside the window. Zero once past it. */
  daysRemaining: number;
  /**
   * Days in the window with no final score yet — the days that can *still*
   * contribute. Distinct from `daysRemaining`, which is calendar time left: a
   * day already finalized at zero is behind you even if it is today.
   */
  daysUnresolved: number;
  /** True once the end date is behind us. */
  expired: boolean;
  /** Whether the remaining days can still get there. */
  stillPossible: boolean;
  /** Progress is keeping up with elapsed time. True whenever `met`. */
  onPace: boolean;
  /**
   * **Final days only.** A provisional day can never complete a goal: completion
   * pays XP and latches one-way, so a day Apple may still revise downward must
   * not be able to trigger it.
   */
  met: boolean;
}

/** Inclusive length of a goal's window, in days. */
export function goalWindowDays(goal: Goal): number {
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
  return localDate >= goal.startsOn && localDate <= goal.endsOn;
}

/** Cumulative sums points; consistency counts days that cleared the bar. */
function contribution(goal: Goal, day: GoalDay): number {
  if (goal.kind === 'cumulative') return day.total;
  return day.total >= goal.target ? 1 : 0;
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
  const expired = today > goal.endsOn;

  // Today counts as remaining — it is still playable. Before the goal starts the
  // whole window is ahead, which is why this clamps at both ends rather than
  // trusting the subtraction.
  const daysRemaining = expired
    ? 0
    : today < goal.startsOn
      ? windowDays
      : daysBetween(today, goal.endsOn) + 1;

  // Counted from *unresolved* days, not calendar days left. A day that has
  // already finalized at zero is spent, and today is one of those the moment it
  // finalizes — so `daysRemaining` would over-count it by one and report a dead
  // goal as reachable on the day it died.
  const daysUnresolved = Math.max(0, windowDays - finalDays);

  // Consistency is the only kind that can become arithmetically dead before the
  // window closes: a missed day is gone. A cumulative goal stays theoretically
  // reachable as long as an unresolved day remains, since there is no per-day
  // ceiling.
  const stillPossible = met
    ? true
    : goal.kind === 'consistency'
      ? finalProgress + daysUnresolved >= target
      : daysUnresolved > 0;

  const elapsed = windowDays - daysRemaining;
  const onPace =
    met || elapsed <= 0 ? true : progress / elapsed >= target / windowDays;

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
 */
export function goalCompletionXp(goal: Goal): number {
  const scaled = BASE_GOAL_COMPLETION_XP * Math.sqrt(goalWindowDays(goal));
  return Math.min(MAX_GOAL_COMPLETION_XP, Math.round(scaled));
}

/** Days a goal window still has left, for callers that only need the number. */
export function isGoalWindowClosed(goal: Goal, today: string): boolean {
  return today > goal.endsOn;
}
