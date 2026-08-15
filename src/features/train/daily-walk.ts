import { DAILY_STEP_BASELINE, previousDay } from '@kairo/core';

/**
 * The Daily Walk — 10,000 steps, every day, forever.
 *
 * Deliberately **not** a Challenge and **not** a `goals` row.
 *
 * Not a Challenge because a Challenge's target moves with the user, and this
 * one must not: 10,000 is a public-health number, not a personal-progress one,
 * and scaling it as someone improves conflates the two. That conflation is the
 * specific error the solo-mode design names — the target that grows until it is
 * unreachable is how a health baseline turns into a treadmill.
 *
 * Not a `goals` row because the Goal shape cannot express "every day, forever,
 * resets daily": open-ended goals are cumulative-only
 * (`goals_consistency_needs_end`) and accumulate rather than reset.
 *
 * The streak is here because the target cannot grow, so the run of days is the
 * only thing that *can*. A missed day breaks it and costs nothing else — there
 * is no penalty, ever.
 *
 * Pure and clock-free, like `@kairo/core`: `today` is an argument because the
 * caller knows the user's timezone (§2) and this module must not.
 */

/**
 * One day behind today, as `daily_scores` describes it.
 *
 * `met` is `tiers->>'AGI' = 'gold'`, which *is* "≥ 10,000 steps" — that is the
 * AGI Gold threshold, and `DAILY_STEP_BASELINE` is derived from it precisely so
 * the two cannot drift. `daily_scores` stores tiers and never raw steps, so
 * this is the only reading of a past day available without a new column and a
 * new sync.
 */
export interface DailyWalkDay {
  localDate: string;
  met: boolean;
}

export interface DailyWalkState {
  /** Today's live steps, floored at zero. */
  todaySteps: number;
  /** Always `DAILY_STEP_BASELINE`. Carried so the UI sizes against one number. */
  baseline: number;
  /** 0–1, clamped. The bar cannot overflow its track. */
  fraction: number;
  /** Steps still to go, floored at zero. */
  remaining: number;
  met: boolean;
  /** Consecutive days cleared, ending today if today is met, else yesterday. */
  streak: number;
}

export function dailyWalkState({
  todaySteps,
  today,
  days,
}: {
  /** Undefined before the first sync of the day lands. */
  todaySteps: number | undefined;
  today: string;
  /** The trailing window. Order is not relied on; today's own row is ignored. */
  days: readonly DailyWalkDay[];
}): DailyWalkState {
  const steps = Math.max(0, todaySteps ?? 0);
  const met = steps >= DAILY_STEP_BASELINE;

  return {
    todaySteps: steps,
    baseline: DAILY_STEP_BASELINE,
    fraction: Math.min(1, steps / DAILY_STEP_BASELINE),
    remaining: Math.max(0, DAILY_STEP_BASELINE - steps),
    met,
    streak: walkStreak({ today, met, days }),
  };
}

/**
 * The card's two lines: the run of days, and what the walk actually is.
 *
 * Pure and tested because the branches have real edges — the plural at one day,
 * and the cold start where there is no streak to name yet.
 *
 * It deliberately **never states today's step count or the gap to the
 * baseline**. The home hero already sets today's steps at 64pt, and
 * `detailCopy` on the same screen already says "1,588 more steps tops out your
 * Agility today" — which is the *same number*, because AGI Gold and
 * `DAILY_STEP_BASELINE` are the same threshold by construction. A third
 * rendering of one figure is what the "read what is already spoken" rule exists
 * to stop. What nothing else on that screen says is the run of days and the
 * fact that the target is fixed, so that is this card's whole job.
 */
export function walkLines(state: DailyWalkState): { headline: string; body: string } {
  const days = `${state.streak} ${state.streak === 1 ? 'day' : 'days'}`;

  if (state.streak === 0) {
    return {
      headline: '10,000 steps',
      body: 'A daily baseline for health, not a target that grows with you. Clear it to start a streak.',
    };
  }

  return {
    headline: `${days} in a row`,
    body: state.met
      ? 'Cleared today. 10,000 steps — the same tomorrow, and every day after.'
      : '10,000 steps a day. The baseline never grows, so the run of days is the part that does.',
  };
}

function walkStreak({
  today,
  met,
  days,
}: {
  today: string;
  met: boolean;
  days: readonly DailyWalkDay[];
}): number {
  // A set of cleared dates, so a gap is the same thing whether the day is
  // absent (no `daily_scores` row at all — a day with no activity) or present
  // and under the baseline. Both must break the streak, and only one of them
  // is visible as a row.
  //
  // Today's own row is dropped: today is decided by live steps above, because
  // `daily_scores` for today is still being rescored and a user who crossed
  // 10,000 five minutes ago has to see it. Keeping the row would also let it
  // be counted twice.
  const clearedBefore = new Set<string>();
  for (const day of days) {
    if (day.met && day.localDate < today) clearedBefore.add(day.localDate);
  }

  // Today counts only when it is actually met. When it is not, the run that
  // ended yesterday is still alive — the day is not over, and a streak that
  // read zero every morning would be punishing the user for the time of day.
  let streak = met ? 1 : 0;

  let cursor = previousDay(today);
  while (clearedBefore.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }

  return streak;
}
