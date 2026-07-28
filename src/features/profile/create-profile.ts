import { useMutation, useQueryClient } from '@tanstack/react-query';
import { normalizeCharacterName } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { deviceTimeZone } from './device-timezone.ts';
import { profileKey } from './queries.ts';

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

      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
  });
}
