import { DAILY_STEP_BASELINE, previousDay } from '@kairo/core';

/**
 * The Daily Walk — 10,000 steps, every day, forever.
 *
 * Deliberately **not** a Challenge and **not** a `challenge_events` row.
 *
 * Not a Challenge because a Challenge's target moves with the user, and this
 * one must not: 10,000 is a public-health number, not a personal-progress one,
 * and scaling it as someone improves conflates the two. That conflation is the
 * specific error the solo-mode design names — the target that grows until it is
 * unreachable is how a health baseline turns into a treadmill.
 *
 * Not a `challenge_events` row because the Event shape cannot express "every
 * day, forever, resets daily": an Event needs a deadline (`events_need_end`)
 * and a squad (`events_need_squad`), and it accumulates toward one bar rather
 * than resetting. The Daily Walk is personal, endless, and starts again every
 * midnight — three properties the Event shape rules out on purpose.
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
 * The one sentence that says what the Daily Walk is.
 *
 * Pure and tested because the branches have real edges — the cold start where
 * there is no run to name yet, and the cleared day.
 *
 * It deliberately **never states today's step count or the gap to the
 * baseline**. The Living Mirror already sets today's steps at hero size in the
 * scene above, and the details sheet's Motion section names the run of days on
 * the row before this one. What nothing else says is that the target is fixed,
 * so that is this sentence's whole job.
 *
 * **It says "run", never "streak".** The personal Streak in the scene HUD reads
 * `streaks.current_streak`; the Daily Walk run reads `dailyWalkState().streak`.
 * They are different values and must never share a word — and this sentence now
 * lands on a screen whose header shows the other one.
 *
 * It was `walkLines()` and returned a headline too. The headline had exactly
 * one consumer, `DailyWalkCard`, which deviation #59 deletes.
 */
export function walkNote(state: DailyWalkState): string {
  // `DAILY_STEP_BASELINE.toLocaleString()`, never a literal: the baseline is
  // derived from AGI Gold, and a second number describing the old one is
  // exactly what the derivation exists to prevent.
  const baseline = DAILY_STEP_BASELINE.toLocaleString();

  if (state.streak === 0) {
    return `${baseline} steps. A daily baseline for health, not a target that grows with you. Clear it to start a run.`;
  }

  return state.met
    ? `Cleared today. ${baseline} steps — the same tomorrow, and every day after.`
    : `${baseline} steps a day. The baseline never grows, so the run of days is the part that does.`;
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
