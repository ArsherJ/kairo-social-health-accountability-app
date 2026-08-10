import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { goalKeys } from '@/features/goals/queries.ts';
import { squadKeys } from './queries.ts';
import {
  initialPolicyState,
  reduceRealtimePolicy,
  type RealtimePolicyInput,
  type RealtimePolicyState,
} from './realtime-policy.ts';
import { squadTopic } from './squad-topic.ts';

/**
 * Keeps the squad board current.
 *
 * The trigger on `daily_scores` broadcasts to `squad:<id>`, and the RLS policy
 * on `realtime.messages` admits only squad members — which is why the channel
 * must be `private: true`. Subscribing without it receives nothing at all.
 *
 * Every decision about *when* to refetch lives in realtime-policy.ts, which is
 * testable in plain Node. This hook is the I/O around it.
 */
export function useSquadRealtime(squadId: string | undefined): void {
  const queryClient = useQueryClient();
  const state = useRef<RealtimePolicyState>(initialPolicyState);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!squadId) return;

    state.current = initialPolicyState;

    function clearTimer() {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }

    function refetch() {
      void queryClient.invalidateQueries({
        queryKey: squadKeys.boardAll(squadId),
      });
      // Membership changes do not broadcast (Phase 4 follow-up #8), so the
      // member count has no signal of its own. Riding along here means the
      // locked slots — and the unlock reveal — land on the next foreground
      // rather than waiting for a manual pull.
      void queryClient.invalidateQueries({
        queryKey: squadKeys.members(squadId),
      });
      // Goal progress is a projection over daily_scores, so the broadcast that
      // moves the board moves every goal too — no second trigger or topic, the
      // same reasoning the sabotage feed used to ride this on.
      void queryClient.invalidateQueries({ queryKey: goalKeys.all() });
    }

    function dispatch(input: RealtimePolicyInput) {
      const [next, command] = reduceRealtimePolicy(state.current, input);
      state.current = next;

      if (command.kind === 'refetch-now') {
        clearTimer();
        refetch();
      } else if (command.kind === 'refetch-after') {
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          refetch();
        }, command.delayMs);
      }
    }

    const channel = supabase
      .channel(squadTopic(squadId), { config: { private: true } })
      // The payload is deliberately not a parameter. broadcast_changes ships a
      // whole daily_scores row — per-stat points, tiers, xp_awarded —
      // which is more than squad_leaderboard exposes. Reading it would make the
      // privacy projection (§5) a convention rather than a structure. The
      // broadcast means only "something in this squad changed".
      .on('broadcast', { event: '*' }, () => {
        dispatch({ kind: 'broadcast', at: Date.now() });
      })
      .subscribe((status) => {
        // CHANNEL_ERROR, TIMED_OUT and CLOSED are all "we are not receiving",
        // and none of them is worth showing the user: the board still has
        // pull-to-refresh and the foreground refetch. A live-updating screen
        // that breaks when the socket drops would be worse than one that never
        // claimed to be live.
        dispatch({
          kind: status === 'SUBSCRIBED' ? 'connected' : 'disconnected',
          at: Date.now(),
        });
      });

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') dispatch({ kind: 'foreground', at: Date.now() });
    });

    return () => {
      clearTimer();
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [squadId, queryClient]);
}
