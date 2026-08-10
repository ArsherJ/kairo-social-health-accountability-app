// Relative imports, not `@/`: this module is exercised by vitest, whose config
// does not carry Metro's path alias. Every other pure module under test does the
// same — `goal-copy.ts`, `program-copy.ts`, `ask-order.ts`.
import {
  evaluateGoal,
  type Goal,
  type GoalDay,
  type GoalProgress,
} from '../../../packages/kairo-core/src/goal.ts';

/**
 * Turning a flat `goal_window_scores` read into per-participant standings.
 *
 * Split from `queries.ts` because that module imports the Supabase client, and
 * the grouping is the part worth testing: it is where a squad goal could quietly
 * credit one member's day to another, and where a participant with no scored day
 * could vanish from a roster whose whole point is who has and has not hit it.
 */

/** Exactly the columns the client selects from `goals`. */
export type GoalRow = {
  id: string;
  squad_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  kind: 'cumulative' | 'consistency';
  target: number;
  required_days: number | null;
  required_members: number | null;
  starts_on: string;
  /** Null for an open-ended goal. Cumulative only — the DB enforces that. */
  ends_on: string | null;
};

export type WindowScore = {
  user_id: string;
  character_name: string;
  /**
   * Null for a participant with no scored day inside the window — the RPC left-
   * joins so the roster is complete (see 20260810120000). Such a row means "on
   * the goal, nothing yet", and must not be counted as a day.
   */
  local_date: string | null;
  total: number | null;
  status: 'provisional' | 'final' | null;
};

export type Completion = { goal_id: string; user_id: string; xp_awarded: number };

/** One participant's standing on a goal. */
export type Standing = {
  userId: string;
  characterName: string;
  isSelf: boolean;
  progress: GoalProgress;
  /** True once the server has latched it. Distinct from `progress.met`. */
  completed: boolean;
};

/**
 * The goal worth showing on a summary card: the live one closing soonest.
 *
 * A window that has not opened yet is not "in flight" and would render a meter
 * with nothing in it. `fallbackToPast` returns the most recently closed goal
 * when there is no live one — the home card wants that (somebody who just
 * finished their first goal should see the finish, not an invitation to set
 * another), and the squad panel does not.
 *
 * **Open-ended goals sort last and never fall out of "live".** A null `ends_on`
 * has no deadline to compare, so it cannot win a soonest-closing race, but it is
 * always in flight once it has started. Lifted out of the two components that
 * each had a copy of this: they had already drifted (only one had the past
 * fallback), and null end dates are exactly the kind of change that would have
 * been made in one of them.
 */
export function pickLiveGoal(
  rows: readonly GoalRow[],
  today: string,
  options: { fallbackToPast?: boolean } = {},
): GoalRow | null {
  const started = rows.filter((r) => r.starts_on <= today);

  const live = started.filter((r) => r.ends_on === null || r.ends_on >= today);
  if (live.length > 0) {
    return [...live].sort((a, b) => {
      if (a.ends_on === null && b.ends_on === null) return 0;
      if (a.ends_on === null) return 1;
      if (b.ends_on === null) return -1;
      return a.ends_on.localeCompare(b.ends_on);
    })[0]!;
  }

  if (options.fallbackToPast) {
    // `ends_on` cannot be null here — a null one is always live above.
    const past = started.filter((r) => r.ends_on !== null && r.ends_on < today);
    if (past.length > 0) {
      return [...past].sort((a, b) => b.ends_on!.localeCompare(a.ends_on!))[0]!;
    }
  }

  return null;
}

export function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    kind: row.kind,
    target: row.target,
    requiredDays: row.required_days,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

/**
 * Group a flat window read into one standing per participant.
 *
 * Exported and pure so it can be tested without a database — the grouping is
 * where a squad goal could quietly credit one member's day to another, which is
 * the worst bug this file could have.
 */
export function standingsFor(input: {
  row: GoalRow;
  scores: readonly WindowScore[];
  completions: readonly Completion[];
  userId: string;
  today: string;
}): Standing[] {
  const goal = toGoal(input.row);
  const byUser = new Map<string, { name: string; days: GoalDay[] }>();

  for (const score of input.scores) {
    const entry = byUser.get(score.user_id) ?? { name: score.character_name, days: [] };
    // Registered as a participant either way; only a real day is counted. The
    // null-extended row is how a member who has not started still shows on a
    // squad goal at zero rather than vanishing from the roster.
    if (score.local_date !== null && score.status !== null) {
      entry.days.push({
        localDate: score.local_date,
        total: Number(score.total ?? 0),
        status: score.status,
      });
    }
    byUser.set(score.user_id, entry);
  }

  const completed = new Set(input.completions.map((c) => c.user_id));

  return [...byUser.entries()]
    .map(([userId, entry]) => ({
      userId,
      characterName: entry.name,
      isSelf: userId === input.userId,
      progress: evaluateGoal(goal, entry.days, input.today),
      completed: completed.has(userId),
    }))
    // Furthest along first, then by name for a stable order. Same rule as the
    // leaderboard, so the two lists never disagree about ties.
    .sort((a, b) =>
      b.progress.progress - a.progress.progress ||
      a.characterName.localeCompare(b.characterName),
    );
}
