import { addDays, previousDay } from './day.ts';

/**
 * Personal streaks and the Streak Shield (spec §19).
 *
 * A streak survives on any score above zero — the bar is deliberately low so
 * streaks feel maintainable rather than like a second job.
 *
 * The Shield exists because a broken streak is the single biggest churn event
 * in streak-based apps. Most apps do nothing and the user feels they failed;
 * Kairo silently catches the first miss so the user wakes to relief instead of
 * loss, and opens the app to see it.
 */

/** Days of streak required before a Shield will catch a miss. */
export const SHIELD_MINIMUM_STREAK = 5;

/** A used Shield recharges after this many days. */
export const SHIELD_RECHARGE_DAYS = 30;

/** Milestones that earn a reward. MVP grants badges only — no coin economy yet. */
export const STREAK_MILESTONES: readonly number[] = [3, 7, 14, 30, 100];

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  /** Last local date that counted toward the streak. */
  lastScoredDate: string | null;
  /** Date the next Shield becomes available. Null means one is banked now. */
  shieldAvailableOn: string | null;
}

export interface StreakTransition {
  next: StreakState;
  /** True when a Shield was consumed to save this streak. */
  shieldUsed: boolean;
  /** Set when this day's streak length hits a milestone for the first time. */
  milestoneReached: number | null;
  /** True when the input was already accounted for and nothing changed. */
  unchanged: boolean;
}

function shieldIsReady(state: StreakState, localDate: string): boolean {
  return state.shieldAvailableOn === null || state.shieldAvailableOn <= localDate;
}

/**
 * Fold one finalized day into a user's streak.
 *
 * Idempotent: the finalizer cron may retry, so re-applying the same day must not
 * advance the streak twice or consume a second Shield.
 */
export function advanceStreak(
  state: StreakState,
  day: { localDate: string; scored: boolean },
): StreakTransition {
  const unchangedResult: StreakTransition = {
    next: state,
    shieldUsed: false,
    milestoneReached: null,
    unchanged: true,
  };

  // Already folded in — either it scored, or a Shield already covered it.
  if (state.lastScoredDate === day.localDate) return unchangedResult;

  if (day.scored) {
    const continues = state.lastScoredDate === previousDay(day.localDate);
    const currentStreak = continues ? state.currentStreak + 1 : 1;

    return {
      next: {
        currentStreak,
        longestStreak: Math.max(state.longestStreak, currentStreak),
        lastScoredDate: day.localDate,
        shieldAvailableOn: state.shieldAvailableOn,
      },
      shieldUsed: false,
      milestoneReached: STREAK_MILESTONES.includes(currentStreak) ? currentStreak : null,
      unchanged: false,
    };
  }

  // A miss. Only an established streak is worth spending a Shield on — catching
  // a 1-day streak would teach the user nothing and waste the charge.
  const eligible =
    state.currentStreak >= SHIELD_MINIMUM_STREAK && shieldIsReady(state, day.localDate);

  if (eligible) {
    return {
      next: {
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        // Advancing this keeps the chain intact, so tomorrow continues rather
        // than restarting at 1.
        lastScoredDate: day.localDate,
        shieldAvailableOn: addDays(day.localDate, SHIELD_RECHARGE_DAYS),
      },
      shieldUsed: true,
      milestoneReached: null,
      unchanged: false,
    };
  }

  if (state.currentStreak === 0) return unchangedResult;

  return {
    next: {
      currentStreak: 0,
      longestStreak: state.longestStreak,
      // Deliberately NOT advanced: the day did not score, so the next scored
      // day correctly starts a fresh streak at 1.
      lastScoredDate: state.lastScoredDate,
      shieldAvailableOn: state.shieldAvailableOn,
    },
    shieldUsed: false,
    milestoneReached: null,
    unchanged: false,
  };
}
