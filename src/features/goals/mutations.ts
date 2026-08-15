import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { track } from '@/features/telemetry/events.ts';
import { goalKeys, type GoalRow } from './queries.ts';

/**
 * Turns a Postgres error into something a person can act on.
 *
 * Same reasoning as `squadErrorMessage`: the RPCs raise with specific SQLSTATEs,
 * and rendering their raw text would put `new row violates row-level security
 * policy` in front of someone who just wanted to set a target.
 */
function goalErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case '22023':
      // The window/required_days validation trigger, and the kind check.
      return 'Those dates and that number do not fit together. Check them and try again.';
    case '42501':
      return 'You need to be in that squad to set a goal for it.';
    case '23514':
      return 'That target is out of range. Pick a number above zero and an end date on or after the start.';
    default:
      return fallback;
  }
}

export interface NewGoal {
  title: string;
  /** Optional, up to 280 characters. The "why", where the title is the "what". */
  description?: string | null;
  kind: 'cumulative' | 'consistency';
  target: number;
  startsOn: string;
  /** Null for an open-ended goal. Rejected by the server for `consistency`. */
  endsOn: string | null;
  /** Consistency only: how many days must clear the bar. */
  requiredDays?: number | null;
  /** Null for a personal goal. */
  squadId?: string | null;
}

export function useCreateGoal(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (goal: NewGoal): Promise<GoalRow> => {
      const { data, error } = await supabase.rpc('create_goal', {
        p_title: goal.title.trim(),
        // Empty and absent are the same thing to the column, whose CHECK rejects
        // a blank string — so a description the user started and cleared must
        // arrive as null, not as ''.
        p_description: goal.description?.trim() || null,
        p_kind: goal.kind,
        p_target: goal.target,
        p_starts_on: goal.startsOn,
        p_ends_on: goal.endsOn,
        p_required_days: goal.kind === 'consistency' ? (goal.requiredDays ?? null) : null,
        p_squad_id: goal.squadId ?? null,
        // Omitted deliberately: the RPC defaults it to the whole roster, which is
        // what §8's "everyone must hit it" means. Sending a number here would be
        // the client deciding a rule the server owns.
      });
      if (error) {
        throw new Error(goalErrorMessage(error.code, 'Could not set that goal. Try again.'));
      }
      return data as GoalRow;
    },
    onSuccess: (goal) => {
      // Payload carries no target value — a goal target is the user's own
      // number and the funnel only needs to know a goal exists.
      void track(userId, 'goal_created', { kind: goal.kind, squad: goal.squad_id !== null });
      // Every goal key: a squad goal lands on the squad list and a personal one
      // on the home list, and the caller should not have to know which.
      void queryClient.invalidateQueries({ queryKey: goalKeys.all() });
    },
  });
}

/**
 * Leave a goal. Deletes it outright if nobody else is on it.
 *
 * Deliberately a separate, visible act from editing a target — which is not
 * possible at all, because moving a target mid-window would silently re-grade
 * every day already counted (§8).
 */
export function useAbandonGoal(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string): Promise<void> => {
      const { error } = await supabase.rpc('abandon_goal', { p_goal_id: goalId });
      if (error) {
        throw new Error(goalErrorMessage(error.code, 'Could not leave that goal. Try again.'));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.all() });
    },
  });
}
