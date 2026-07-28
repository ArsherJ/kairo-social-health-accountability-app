import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';

/**
 * The owner-readable profile. `profiles` is deliberately not readable by
 * squadmates — the row carries height, weight and birth year — so this is only
 * ever the signed-in user's own row.
 */
export type Profile = {
  id: string;
  character_name: string;
  class: string;
  timezone: string;
  level: number;
  total_xp: number;
  has_wearable: boolean;
};

export function profileKey(userId: string | undefined) {
  return ['profile', userId ?? 'none'] as const;
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, character_name, class, timezone, level, total_xp, has_wearable')
        .eq('id', userId as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // null is meaningful: it is what "onboarding not finished" looks like.
      return (data as Profile | null) ?? null;
    },
  });
}
