import { evaluateGoal, goalCompletionXp, type Goal, type GoalDay } from './core.ts';

/**
 * The decision half of the goal pass in `finalize-days`, kept free of I/O so it
 * can be tested in plain Node with no Deno, no Docker and no database.
 *
 * The handler reads the goals a user is on and the days inside each window; this
 * module decides which of them just completed. Nothing here writes, and nothing
 * here evaluates a goal itself — `evaluateGoal()` in `@kairo/core` is the single
 * implementation of that arithmetic (deviation #18).
 */

/** A goal the user is on, as the handler reads it back from `goals`. */
export interface GoalRow {
  id: string;
  squad_id: string | null;
  title: string;
  kind: string;
  target: number;
  description: string | null;
  required_days: number | null;
  starts_on: string;
  /** Null for an open-ended goal — cumulative only, enforced by CHECK. */
  ends_on: string | null;
}

/** The row `finalize-days` will insert when a goal completes. */
export interface GoalCompletionRow {
  goal_id: string;
  user_id: string;
  completed_on: string;
  xp_awarded: number;
}

export interface GoalCompletion {
  row: GoalCompletionRow;
  /** Carried so the handler can build notification copy without re-reading. */
  title: string;
}

export function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    kind: row.kind === 'consistency' ? 'consistency' : 'cumulative',
    target: row.target,
    requiredDays: row.required_days,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

/**
 * Which of this user's goals just completed on `localDate`.
 *
 * Only goals whose window contains the finalized day are considered. A day
 * outside the window cannot change that goal's standing, so evaluating it would
 * be work that can only produce a wrong answer — and, worse, could latch a goal
 * on an unrelated day and stamp `completed_on` with a date that never counted.
 *
 * Goals already in `alreadyCompleted` are skipped. The insert also carries
 * `on conflict do nothing`, so this is the cheap filter rather than the
 * guarantee: the database is what makes a double-latch impossible under
 * overlapping cron runs.
 */
export function planGoalCompletions(input: {
  userId: string;
  localDate: string;
  goals: readonly GoalRow[];
  /** Per goal id, the participant's scored days inside that goal's window. */
  daysByGoal: ReadonlyMap<string, readonly GoalDay[]>;
  alreadyCompleted: ReadonlySet<string>;
}): GoalCompletion[] {
  const completions: GoalCompletion[] = [];

  for (const row of input.goals) {
    if (input.alreadyCompleted.has(row.id)) continue;

    // The finalized day must be inside the window. Lexicographic comparison is
    // correct for zero-padded ISO dates. An open-ended goal has no upper bound,
    // so only the start date can exclude a day from it.
    if (input.localDate < row.starts_on) continue;
    if (row.ends_on !== null && input.localDate > row.ends_on) continue;

    const goal = toGoal(row);
    const days = input.daysByGoal.get(row.id) ?? [];

    // `met` reads final days only, which is the whole reason a provisional day
    // cannot pay XP. `localDate` is the day that just finalized, so it is also
    // the correct "today" for this evaluation.
    const result = evaluateGoal(goal, days, input.localDate);
    if (!result.met) continue;

    completions.push({
      title: row.title,
      row: {
        goal_id: row.id,
        user_id: input.userId,
        completed_on: input.localDate,
        // `localDate` is both the day that finalized and the day the goal
        // completed, which is exactly the span an open-ended goal is paid on.
        xp_awarded: goalCompletionXp(goal, input.localDate),
      },
    });
  }

  return completions;
}

/**
 * Group a flat `goal_window_scores`-shaped read into the per-goal day lists
 * `planGoalCompletions` wants, keeping only one participant's rows.
 *
 * The RPC returns every participant on a squad goal, because that is what the
 * squad panel renders. Completion is per person, so the handler filters to the
 * user whose day just finalized.
 */
export function daysForUser(
  rows: readonly { goal_id: string; user_id: string; local_date: string; total: number; status: string }[],
  userId: string,
): Map<string, GoalDay[]> {
  const byGoal = new Map<string, GoalDay[]>();

  for (const row of rows) {
    if (row.user_id !== userId) continue;
    const list = byGoal.get(row.goal_id) ?? [];
    list.push({
      localDate: row.local_date,
      total: Number(row.total),
      status: row.status === 'final' ? 'final' : 'provisional',
    });
    byGoal.set(row.goal_id, list);
  }

  return byGoal;
}
