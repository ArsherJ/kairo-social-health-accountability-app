import { useQuery } from '@tanstack/react-query';
import type { SquadProgram } from '@kairo/core';
import {
  DEMO_LEADERBOARD,
  DEMO_LEADERBOARD_COMPLETED,
  DEMO_MEMBER_COUNT,
  DEMO_SQUAD,
} from '@/features/demo/fixtures.ts';
import { demoResult, useDemoOn } from '@/features/demo/useDemo.ts';
import type { SpeciesId } from '@/features/character/species.ts';
import { supabase } from '@/lib/supabase.ts';
import { normalizeInviteCode } from './invite-code.ts';

export type Squad = {
  id: string;
  name: string;
  invite_code: string;
  leader_id: string;
  max_members: number;
  /** Fixed at creation. Weights the board at read time; stored scores never. */
  program: SquadProgram;
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
  /**
   * Bronze/silver/gold per stat. Still returned by the RPC and still what the
   * scorer records — no longer rendered anywhere. See `ratings`.
   */
  tiers: Record<string, string>;
  /**
   * Lifetime points per stat, from the `profiles` rollups. `ratingForStatPoints`
   * in @kairo/core turns each into the ability number the row shows; the curve
   * is never reimplemented in SQL.
   */
  ratings: Record<string, number>;
  contributing_stats: number;
  has_rec: boolean;
  flagged: boolean;
  status: 'provisional' | 'final';
  current_streak: number;
  is_self: boolean;
  /**
   * Which animal the squadmate chose, or null for anyone predating the choice.
   * Cosmetic — it is in this projection because it reveals nothing (§5), not
   * because it is needed for ranking.
   */
  species: SpeciesId | null;
  /**
   * The squad's program, repeated on every row. `total` above is already
   * weighted by it (deviation #11) — the row carries the program so the UI can
   * explain *why* the number differs from the unweighted one on the character
   * screen.
   */
  program: SquadProgram;
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
  /**
   * Every board, every squad. A health sync moves the caller's own row, and
   * the sync does not know which squad they are looking at.
   */
  allBoards: () => ['squad', 'board'] as const,
  /**
   * How many people are *in* the squad, which is not how many are on the
   * board. Separate from `board` because it answers a different question and
   * changes for a different reason — someone joining, not someone scoring.
   */
  members: (squadId: string | undefined) =>
    ['squad', 'members', squadId ?? 'none'] as const,
  /** Keyed by the *normalized* code, so `ab1-2cd` and `AB12CD` share a cache entry. */
  preview: (code: string) => ['squad', 'preview', code] as const,
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
  const demo = useDemoOn();

  const query = useQuery({
    queryKey: squadKeys.mine(userId),
    enabled: !demo && Boolean(userId),
    queryFn: async (): Promise<Squad | null> => {
      const { data, error } = await supabase
        .from('squads')
        .select('id, name, invite_code, leader_id, max_members, program')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Squad | null) ?? null;
    },
  });

  return demo ? demoResult<Squad | null>(DEMO_SQUAD) : query;
}

/**
 * How many people belong to the squad — the number the locked slots are
 * derived from (§7).
 *
 * This used to say `leaderboard.length` was unusable because `squad_leaderboard`
 * returns only members who have *scored*. **It never did.** `member_day` joins
 * `squad_members → profiles` and reaches `daily_scores` by `left join` — the
 * original (`20260727120500_rpc.sql`), the completed-mode rewrite
 * (`20260729100000`) and the current program-weighted one
 * (`20260807100200_leaderboard_program_weighting.sql:191`) all do. A member who
 * has not moved today comes back with `total = 0`, not absent.
 *
 * The count is therefore redundant for slot maths and is kept only because
 * unpicking it from `Leaderboard`'s data flow is a refactor rather than a fix.
 * V1 cleanup.
 *
 * `squad_members_select_visible` already lets a member see their own squad's
 * rows, so a bare `count` needs no policy change and exposes no identity.
 */
export function useSquadMemberCount(squadId: string | undefined) {
  // Overridden along with the board, though the plan did not list it: the
  // standing hero reads `{kind:'unknown'}` while this is undefined, so a demo
  // board with a real member count would render three rows under no rank at
  // all — and `resolveSlots` would derive the empty seats from it too.
  const demo = useDemoOn();

  const query = useQuery({
    queryKey: squadKeys.members(squadId),
    enabled: !demo && Boolean(squadId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('squad_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('squad_id', squadId as string);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  return demo ? demoResult<number>(DEMO_MEMBER_COUNT) : query;
}

export function useSquadLeaderboard(
  squadId: string | undefined,
  mode: LeaderboardMode,
) {
  const demo = useDemoOn();

  const query = useQuery({
    queryKey: squadKeys.board(squadId, mode),
    enabled: !demo && Boolean(squadId),
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

  // Each mode gets its own day. They used to share one array, which made the
  // Today/Yesterday toggle a no-op under demo — so the control that proves
  // `mode` reaches `squad_leaderboard()` could not be checked by hand, which is
  // the only way UI is checked here.
  if (demo) {
    return demoResult<LeaderboardRow[]>(
      mode === 'completed' ? DEMO_LEADERBOARD_COMPLETED : DEMO_LEADERBOARD,
    );
  }
  return query;
}

/**
 * What an invite code points at, before committing to it.
 *
 * The program is a game rule — an AGI ×1.5 board rewards a different kind of
 * day than the one you may be having — so consenting to it is part of joining,
 * not something to discover afterwards. `squads` is member-only readable, so
 * this goes through the `preview_squad` SECURITY DEFINER RPC; holding a valid
 * six-character code is the authorisation.
 *
 * `null` means the code matches no squad. That is a normal answer to a typo,
 * not an error state.
 */
export type SquadPreview = {
  name: string;
  program: SquadProgram;
  member_count: number;
  max_members: number;
  is_full: boolean;
  already_member: boolean;
};

export function useSquadPreview(rawCode: string, enabled: boolean) {
  const code = normalizeInviteCode(rawCode);
  return useQuery({
    queryKey: squadKeys.preview(code),
    enabled,
    queryFn: async (): Promise<SquadPreview | null> => {
      const { data, error } = await supabase.rpc('preview_squad', {
        p_invite_code: code,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as SquadPreview[];
      return rows[0] ?? null;
    },
  });
}
