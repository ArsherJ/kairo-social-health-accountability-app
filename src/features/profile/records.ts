import { useQuery } from '@tanstack/react-query';
import type { CoreStat } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

/**
 * A personal best on one stat, in the unit that stat is measured in.
 *
 * **Raw units, never points** — the same rule every ambient surface follows
 * (deviation #34). A record is a thing you did, so it is reported as the thing
 * you did.
 */
export interface StatRecord {
  stat: CoreStat;
  value: number;
  localDate: string;
}

export const statRecordsKey = (userId: string | undefined) => ['stat-records', userId];

/**
 * Your best day on each stat.
 *
 * **Derived server-side on every read** (`stat_records()`), never stored, for
 * the reason Event progress is a projection: scores replay from stored buckets,
 * so a retroactive Apple revision has to be able to move a record the same way
 * it moves a score. A stored best would go stale with nothing to notice.
 *
 * The RPC takes **no argument** — the only records reachable are the caller's.
 * That is a deliberate property of the function rather than of this hook, so a
 * future caller cannot get it wrong either.
 *
 * **A stat with no qualifying day is absent from the result, not zero.** "No
 * record yet" and "a record of zero" are different claims and only one of them
 * is ever true; a zero would have this surface congratulating somebody on a
 * best night they have never had.
 */
export function useStatRecords(userId: string | undefined) {
  return useQuery({
    queryKey: statRecordsKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<StatRecord[]> => {
      const { data, error } = await supabase.rpc('stat_records');
      if (error) throw error;
      return (data ?? []).map((row: { stat: string; value: number; local_date: string }) => ({
        stat: row.stat as CoreStat,
        value: Number(row.value),
        localDate: row.local_date,
      }));
    },
  });
}
