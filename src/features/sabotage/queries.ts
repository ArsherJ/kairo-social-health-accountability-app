import { useQuery } from '@tanstack/react-query';
import { currentLocalDate } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { dailyItemsFrom, type DailyItems, type LedgerRow } from './items.ts';

/** One row of `squad_feed()`. Exactly its columns — names and item, nothing else. */
export type FeedEvent = {
  id: string;
  actor_id: string;
  actor_name: string;
  target_id: string;
  target_name: string;
  item: 'banana';
  created_at: string;
  actor_is_self: boolean;
  target_is_self: boolean;
};

export const sabotageKeys = {
  /**
   * Keyed by the actor's LOCAL date, not the device's calendar date. The
   * ledger's primary key is `(user_id, local_date)` and `deploy-sabotage`
   * derives that date from the profile timezone (§2), so a user abroad would
   * otherwise read and invalidate the wrong day's row.
   */
  items: (userId: string | undefined, localDate: string | undefined) =>
    ['sabotage', 'items', userId ?? 'none', localDate ?? 'none'] as const,
  feed: (squadId: string | undefined) =>
    ['sabotage', 'feed', squadId ?? 'none'] as const,
};

/** How many bananas the caller has left today. */
export function useDailyItems(
  userId: string | undefined,
  timeZone: string | undefined,
  isLegendary: boolean,
) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: sabotageKeys.items(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<DailyItems> => {
      const { data, error } = await supabase
        .from('daily_item_ledger')
        .select('granted, deployed')
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // maybeSingle() returns null before the first deploy of the day. That is
      // "granted, unspent" — see dailyItemsFrom.
      return dailyItemsFrom(data as LedgerRow | null, isLegendary);
    },
  });
}

/**
 * Every hit in the squad, newest first (§8).
 *
 * Through the `squad_feed` RPC rather than a table read: the
 * `sabotage_events_select_involved` policy returns only rows the caller is
 * party to, which hides exactly the hits between other people that make the
 * mechanic social.
 */
export function useSquadFeed(squadId: string | undefined) {
  return useQuery({
    queryKey: sabotageKeys.feed(squadId),
    enabled: Boolean(squadId),
    queryFn: async (): Promise<FeedEvent[]> => {
      const { data, error } = await supabase.rpc('squad_feed', {
        p_squad_id: squadId as string,
        p_limit: 50,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedEvent[];
    },
  });
}
