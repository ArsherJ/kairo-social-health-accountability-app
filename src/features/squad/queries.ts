import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';

export type Squad = {
  id: string;
  name: string;
  invite_code: string;
  leader_id: string;
  max_members: number;
};

export type LeaderboardMode = 'current' | 'completed';

/** Exactly the columns squad_leaderboard() returns. */
export type LeaderboardRow = {
  rank: number;
  user_id: string;
  character_name: string;
  class: string;
  level: number;
  local_date: string;
  total: number;
  tiers: Record<string, string>;
  contributing_stats: number;
  has_rec: boolean;
  flagged: boolean;
  status: 'provisional' | 'final';
  current_streak: number;
  is_self: boolean;
};

export const squadKeys = {
  mine: (userId: string | undefined) => ['squad', 'mine', userId ?? 'none'] as const,
  board: (squadId: string | undefined, mode: LeaderboardMode) =>
    ['squad', 'board', squadId ?? 'none', mode] as const,
  /**
   * Prefix of every `board` key for this squad, both modes.
   *
   * A score change can move either board, and the user can toggle to the mode
   * that was not invalidated — so one broadcast refreshes both rather than
   * leaving a stale board one tap away.
   */
  boardAll: (squadId: string | undefined) =>
    ['squad', 'board', squadId ?? 'none'] as const,
};

/**
 * The caller's squad, or null.
 *
 * `squads` is filtered by the `squads_select_member` policy, so an unqualified
 * select already returns only squads the caller belongs to — the RLS policy is
 * the filter, and adding a client-side one would just duplicate it.
 *
 * MVP allows one squad per user (enforced by trigger), so `maybeSingle()` is
 * correct; null means "not in a squad", which is a normal state, not an error.
 */
export function useMySquad(userId: string | undefined) {
  return useQuery({
    queryKey: squadKeys.mine(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Squad | null> => {
      const { data, error } = await supabase
        .from('squads')
        .select('id, name, invite_code, leader_id, max_members')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Squad | null) ?? null;
    },
  });
}

export function useSquadLeaderboard(
  squadId: string | undefined,
  mode: LeaderboardMode,
) {
  return useQuery({
    queryKey: squadKeys.board(squadId, mode),
    enabled: Boolean(squadId),
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc('squad_leaderboard', {
        p_squad_id: squadId as string,
        p_local_date: null,
        p_mode: mode,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LeaderboardRow[];
    },
  });
}
