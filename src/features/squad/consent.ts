import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { squadKeys } from './queries.ts';

export const squadDataConsentKey = ['squad-data-consent'] as const;

/**
 * Whether this player has agreed to show squadmates their daily totals
 * (deviation #47).
 *
 * **`isSuccess` is exported alongside the boolean and callers MUST use it.**
 * While the query is in flight `consented` reads false, which is
 * indistinguishable from a real refusal — the same trap deviation #37 hit with
 * `profile.data?.species`. Gate the prompt on `isSuccess && !consented`, never
 * on `!consented` alone: a sheet that flashes over the form on every mount
 * reads as a bug, and a sheet shown to someone who already agreed reads as the
 * app having forgotten.
 *
 * Separate from `useProfile` deliberately. The gate is evaluated inside the
 * RPC, so consent landing has to invalidate the *board* as well as itself, and
 * a field on a profile query that half the app reads would make that
 * invalidation far wider than it needs to be.
 */
export function useSquadDataConsent(userId: string | undefined) {
  const query = useQuery({
    queryKey: [...squadDataConsentKey, userId ?? 'none'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('squad_data_consent_at')
        .eq('id', userId as string)
        .single();
      if (error) throw new Error(error.message);
      return data.squad_data_consent_at !== null;
    },
  });

  return { consented: query.data ?? false, isSuccess: query.isSuccess };
}

export function useGrantSquadDataConsent(userId: string | undefined) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not signed in.');
      const { error } = await supabase
        .from('profiles')
        // `squad_data_consent_at` is in the column-scoped UPDATE grant and
        // nothing else on this row is, so a wider update object would be
        // refused rather than silently ignored.
        .update({ squad_data_consent_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: squadDataConsentKey });
      // The board's *contents* change the moment consent lands, because the
      // gate is evaluated inside the RPC — every squadmate who already
      // consented becomes visible on the same fetch. Nothing else refetches
      // it, so without this the track stays empty until the next broadcast.
      void client.invalidateQueries({ queryKey: squadKeys.allBoards() });
    },
  });
}
