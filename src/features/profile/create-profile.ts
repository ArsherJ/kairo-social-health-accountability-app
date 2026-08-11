import { useMutation, useQueryClient } from '@tanstack/react-query';
import { normalizeCharacterName } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { deviceTimeZone } from './device-timezone.ts';
import { profileKey } from './queries.ts';

// Postgres error codes worth distinguishing from a generic failure. Keyed by
// code, not by matching `error.message` text, because PostgREST's message
// wording isn't a contract and the raw text must never reach the UI (it can
// say things like `duplicate key value violates unique constraint
// "profiles_pkey"` or `permission denied for table profiles`).
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';

const GENERIC_ERROR_COPY = "Couldn't create your character. Check your connection and try again.";

export function useCreateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rawName: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      // level, total_xp and is_legendary are deliberately absent. The INSERT
      // grant is column-scoped, so naming them would be rejected outright —
      // they are server-awarded and take their column defaults here.
      const { error } = await supabase.from('profiles').insert({
        id: userId,
        character_name: normalizeCharacterName(rawName),
        timezone: deviceTimeZone(),
      });

      if (error) {
        // 23505 (unique violation on profiles_pkey) means the INSERT from an
        // earlier, successful attempt already landed the row — this happens
        // when the insert succeeds but the onSuccess invalidation refetch is
        // what fails (dropped connection between the two), leaving the name
        // screen looking untouched and Begin still enabled. The row
        // demonstrably exists, which is exactly the state a fresh success
        // would produce, so treat it as one: refresh the profile and let the
        // gate carry the user forward instead of surfacing a Postgres string.
        if (error.code === UNIQUE_VIOLATION) return;

        // Logged, never rendered — see the comment above on why raw
        // PostgrestError text can't reach the screen.
        console.warn('[createProfile] insert failed', error.code, error.message);

        if (error.code === INSUFFICIENT_PRIVILEGE) {
          throw new Error("You don't have permission to do that. Please try again later.");
        }
        throw new Error(GENERIC_ERROR_COPY);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
  });
}
