import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { standingsFor, type Completion, type GoalRow, type WindowScore } from './standings.ts';

// Re-exported so callers have one import for the feature's shapes; the
// definitions and the grouping live in `standings.ts`, which is pure and tested.
export {
  pickLiveGoal,
  standingsFor,
  toGoal,
  type Completion,
  type GoalRow,
  type Standing,
  type WindowScore,
} from './standings.ts';

/**
 * Goal reads.
 *
 * Progress is **not** fetched — it is computed here, from the day rows
 * `goal_window_scores()` returns, by the same `evaluateGoal()` the server uses
 * (deviation #18). One implementation of the arithmetic, so the number on the
 * card can never disagree with the one that paid the XP.
 */

export const goalKeys = {
  mine: (userId: string | undefined) => ['goals', 'mine', userId ?? 'none'] as const,
  squad: (squadId: string | undefined) => ['goals', 'squad', squadId ?? 'none'] as const,
  detail: (goalId: string | undefined) => ['goals', 'detail', goalId ?? 'none'] as const,
  /** Prefix of every goal key — one broadcast refreshes all of them. */
  all: () => ['goals'] as const,
};

const GOAL_COLUMNS =
  'id, squad_id, created_by, title, description, kind, metric, target, required_days, required_members, starts_on, ends_on';

/**
 * The caller's own personal goals, newest window first.
 *
 * Personal only: a squad goal belongs on the squad screen, where the rest of the
 * squad is. Filtering on `squad_id is null` rather than in the component keeps
 * the two surfaces from both rendering the same row.
 */
export function useMyGoals(userId: string | undefined) {
  return useQuery({
    queryKey: goalKeys.mine(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<GoalRow[]> => {
      const { data, error } = await supabase
        .from('goals')
        .select(GOAL_COLUMNS)
        .is('squad_id', null)
        // `nullsFirst: false` is explicit, not decorative: an open-ended goal has a
        // null `ends_on`, and it belongs at the end of a list sorted by which
        // deadline arrives first. Postgres already defaults ASC to NULLS LAST —
        // saying so stops that being load-bearing trivia.
        .order('ends_on', { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as GoalRow[];
    },
  });
}

export function useSquadGoals(squadId: string | undefined) {
  return useQuery({
    queryKey: goalKeys.squad(squadId),
    enabled: Boolean(squadId),
    queryFn: async (): Promise<GoalRow[]> => {
      const { data, error } = await supabase
        .from('goals')
        .select(GOAL_COLUMNS)
        .eq('squad_id', squadId!)
        // `nullsFirst: false` is explicit, not decorative: an open-ended goal has a
        // null `ends_on`, and it belongs at the end of a list sorted by which
        // deadline arrives first. Postgres already defaults ASC to NULLS LAST —
        // saying so stops that being load-bearing trivia.
        .order('ends_on', { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as GoalRow[];
    },
  });
}

/**
 * Everything needed to render one goal: the row, every participant's standing,
 * and the squad rollup if it is a squad goal.
 *
 * `today` is passed in rather than read here so the whole thing stays a pure
 * function of its inputs — the same rule `kairo-core` follows, for the same
 * reason: a component that reads the clock cannot be reasoned about.
 */
export function useGoalDetail(
  goalId: string | undefined,
  userId: string | undefined,
  today: string | undefined,
) {
  return useQuery({
    queryKey: goalKeys.detail(goalId),
    enabled: Boolean(goalId && userId && today),
    queryFn: async () => {
      const [goalResult, scoreResult, doneResult] = await Promise.all([
        supabase.from('goals').select(GOAL_COLUMNS).eq('id', goalId!).maybeSingle(),
        supabase.rpc('goal_window_scores', { p_goal_id: goalId! }),
        supabase.from('goal_completions').select('goal_id, user_id, xp_awarded').eq('goal_id', goalId!),
      ]);

      if (goalResult.error) throw new Error(goalResult.error.message);
      if (scoreResult.error) throw new Error(scoreResult.error.message);
      if (doneResult.error) throw new Error(doneResult.error.message);
      if (!goalResult.data) throw new Error('That goal no longer exists.');

      const row = goalResult.data as GoalRow;
      return {
        row,
        standings: standingsFor({
          row,
          scores: (scoreResult.data ?? []) as WindowScore[],
          completions: (doneResult.data ?? []) as Completion[],
          userId: userId!,
          today: today!,
        }),
      };
    },
  });
}
