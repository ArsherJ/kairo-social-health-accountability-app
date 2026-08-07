import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { currentLocalDate, type SabotageItem } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { squadKeys } from '@/features/squad/queries.ts';
import { sabotageKeys } from './queries.ts';

export type DeployResult = {
  ok: true;
  eventId: string;
  actorName: string;
  targetName: string;
  targetLocalDate: string;
  targetNewTotal: number;
  itemsRemaining: number;
};

/**
 * Throw an item at a squadmate.
 *
 * Every rule — self-target, membership, the target's day being finalized, the
 * daily cap, the same-item cooldown, inventory — is enforced by
 * `deploy-sabotage` and tested in `sabotage-plan.test.ts`. This hook decides
 * nothing; it carries the JWT and renders what the server says.
 */
export function useDeploySabotage(
  userId: string | undefined,
  squadId: string | undefined,
  timeZone: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      targetId,
      item = 'banana',
    }: {
      targetId: string;
      item?: SabotageItem;
    }): Promise<DeployResult> => {
      const { data, error } = await supabase.functions.invoke('deploy-sabotage', {
        body: { targetId, item },
      });

      if (error) {
        // supabase-js surfaces any non-2xx as a FunctionsHttpError whose `data`
        // is null and whose body is UNREAD. A refused deploy is a 409 carrying
        // { ok: false, reason, message }, and `message` is blockMessage() —
        // the server's own copy. Without opening the response here, every
        // rejection (cooldown, cap, locked day) would render as a generic
        // network failure, and re-mapping the reason codes client-side would
        // just drift from blockMessage().
        if (error instanceof FunctionsHttpError) {
          const body = (await error.context.json().catch(() => null)) as
            | { message?: string }
            | null;
          if (body?.message) throw new Error(body.message);
        }
        throw new Error('Could not throw that. Try again.');
      }

      return data as DeployResult;
    },

    onSuccess: async () => {
      const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
      // The target's total moved, a new event exists, and one item is spent.
      await queryClient.invalidateQueries({ queryKey: squadKeys.allBoards() });
      await queryClient.invalidateQueries({ queryKey: sabotageKeys.feed(squadId) });
      await queryClient.invalidateQueries({
        queryKey: sabotageKeys.items(userId, localDate),
      });
    },
  });
}
