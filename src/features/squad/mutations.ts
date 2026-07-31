import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
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
    mutationFn: async (name: string): Promise<Squad> => {
      const { data, error } = await supabase.rpc('create_squad', {
        p_name: name.trim(),
      });
      if (error) {
        throw new Error(
          squadErrorMessage(error.code, 'Could not create the squad. Try again.'),
        );
      }
      return data as Squad;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: squadKeys.mine(userId) }),
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: squadKeys.mine(userId) }),
  });
}
