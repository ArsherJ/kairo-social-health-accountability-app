import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SquadProgram } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { track } from '@/features/telemetry/events.ts';
import { normalizeInviteCode } from './invite-code.ts';
import { squadKeys, type Squad } from './queries.ts';

/**
 * Turns a Postgres error into something a person can act on.
 *
 * The RPCs raise with specific SQLSTATEs, and rendering their raw text would
 * put `new row violates row-level security policy` in front of someone who
 * just wanted to join their friends.
 */
function squadErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case '22023':
      return 'That code does not match any squad. Check the six characters and try again.';
    case '42501':
      return 'Finish setting up your character first.';
    case '23514':
      return 'That squad is full.';
    default:
      return fallback;
  }
}

export function useCreateSquad(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      program,
    }: {
      name: string;
      program: SquadProgram;
    }): Promise<Squad> => {
      // The program is fixed at creation — there is no UPDATE path, by design
      // (changing it would silently re-rank every day already on the board).
      const { data, error } = await supabase.rpc('create_squad', {
        p_name: name.trim(),
        p_program: program,
      });
      if (error) {
        throw new Error(
          squadErrorMessage(error.code, 'Could not create the squad. Try again.'),
        );
      }
      return data as Squad;
    },
    onSuccess: (squad) => {
      void track(userId, 'squad_created', { program: squad.program });
      return queryClient.invalidateQueries({ queryKey: squadKeys.mine(userId) });
    },
  });
}

/**
 * 42501 means something different on the way out than on the way in.
 *
 * Going in, it is "no profile yet". Coming out, leave_squad raises it for
 * "authentication required" and "not a member of this squad" — both of which
 * the user reads as *you are already not in this squad*, which is what a
 * second device or a squad deleted underneath them produces. Every other code
 * keeps the shared mapping.
 */
function leaveErrorMessage(code: string | undefined): string {
  if (code === '42501') return 'You are not in this squad anymore.';
  return squadErrorMessage(code, 'Could not leave the squad. Try again.');
}

export function useLeaveSquad(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ squadId }: { squadId: string }): Promise<void> => {
      // An RPC rather than a DELETE on squad_members: leadership succession
      // and the membership delete have to be one server-side transaction, and
      // the client has no write grant on that table at all.
      const { error } = await supabase.rpc('leave_squad', { p_squad_id: squadId });
      if (error) throw new Error(leaveErrorMessage(error.code));
    },
    onSuccess: async () => {
      // The board is gone, not stale — mine() flips to null and the screen
      // falls back to solo mode. allBoards() clears the board this user can no
      // longer read, so a rejoin does not flash the old rows.
      await queryClient.invalidateQueries({ queryKey: squadKeys.mine(userId) });
      await queryClient.invalidateQueries({ queryKey: squadKeys.allBoards() });
    },
  });
}

export function useJoinSquad(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawCode: string): Promise<Squad> => {
      // join_squad is idempotent — tapping an invite twice is a normal thing
      // to do and must not read as an error.
      const { data, error } = await supabase.rpc('join_squad', {
        p_invite_code: normalizeInviteCode(rawCode),
      });
      if (error) {
        throw new Error(
          squadErrorMessage(error.code, 'Could not join that squad. Try again.'),
        );
      }
      return data as Squad;
    },
    onSuccess: (squad) => {
      void track(userId, 'squad_joined', { program: squad.program });
      return queryClient.invalidateQueries({ queryKey: squadKeys.mine(userId) });
    },
  });
}
