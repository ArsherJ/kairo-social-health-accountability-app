import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { profileKey } from './queries.ts';

/**
 * Edits to the caller's own profile.
 *
 * The UPDATE grant on `profiles` is **column-scoped** — naming a column
 * outside it (level, total_xp, is_legendary, all of which are server-awarded)
 * is rejected outright rather than ignored. This type is that grant, written
 * down: widening it means widening the grant in a migration first.
 */
export type ProfileEdit = {
  height_cm?: number | null;
  weight_kg?: number | null;
  birth_year?: number | null;
  sex?: 'male' | 'female' | 'other' | null;
};

const INSUFFICIENT_PRIVILEGE = '42501';
const CHECK_VIOLATION = '23514';

const GENERIC_ERROR_COPY = "Couldn't save that. Check your connection and try again.";

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (edit: ProfileEdit): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      const { error } = await supabase.from('profiles').update(edit).eq('id', userId);

      if (error) {
        // Raw PostgrestError text never reaches the screen — it leaks column
        // and policy names — so it is logged and translated.
        console.warn('[updateProfile] update failed', error.code, error.message);

        if (error.code === CHECK_VIOLATION) {
          // body-metrics.ts mirrors every CHECK, so reaching here means the
          // two have drifted rather than that the user typed something odd.
          throw new Error('That value is outside the range we can store.');
        }
        if (error.code === INSUFFICIENT_PRIVILEGE) {
          throw new Error("You don't have permission to change that.");
        }
        throw new Error(GENERIC_ERROR_COPY);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
  });
}
