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
  kind: 'cumulative' | 'consistency';
  target: number;
  required_days: number | null;
  required_members: number | null;
  starts_on: string;
  ends_on: string;
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
