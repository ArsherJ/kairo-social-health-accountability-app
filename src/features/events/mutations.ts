import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { track } from '@/features/telemetry/events.ts';
import type { EventDifficulty } from '@kairo/core';
import { eventKeys, type EventRow } from './queries.ts';

/**
 * Turns a Postgres error into something a person can act on.
 *
 * Same reasoning as `squadErrorMessage`: the RPCs raise with specific SQLSTATEs,
 * and rendering their raw text would put `duplicate key value violates unique
 * constraint "challenge_events_one_live_per_kind"` in front of somebody who just
 * wanted to start a fight.
 */
function eventErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case '22023':
      // A missing squad or a missing end date — both raised by create_event
      // itself, because both are structural rather than typo-shaped.
      return 'That battle needs a squad and an end date. Check them and try again.';
    case '42501':
      return 'You need to be in that squad to start a battle for it.';
    case '23505':
      // challenge_events_one_live_per_kind. The squad already has a Battle
      // running, and the constraint name is not a sentence anybody should read.
      return 'Your squad already has a battle going. Finish it before starting another.';
    case '23514':
      return 'Those numbers are out of range. Pick an end date on or after the start.';
    default:
      return fallback;
  }
}

export interface NewEvent {
  title: string;
  /** Optional, up to 280 characters. The "why", where the title is the "what". */
  description?: string | null;
  kind: 'battle' | 'adventure';
  metric: 'active_kcal' | 'distance_m';
  /**
   * Boss HP, from `bossHp()`. **Snapshotted here and never recomputed**
   * (deviation #49) — the deliberate asymmetry with a Challenge, whose target is
   * derived on every read. A boss whose HP rose because the squad got fitter
   * mid-fight would silently re-grade every day already counted.
   */
  target: number;
  startsOn: string;
  /** Never null. `events_need_end` rejects one. */
  endsOn: string;
  squadId: string;
  /**
   * Which of `bossHp()`'s three settings produced `target`.
   *
   * Carried for telemetry alone — it is not a column, because the target is
   * snapshotted and the difficulty that produced it is not a thing the fight
   * consults again (deviation #49). It answers whether squads reach for a
   * fight they can win.
   */
  difficulty: EventDifficulty;
}

export function useCreateEvent(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: NewEvent): Promise<EventRow> => {
      // All eight parameters, in order, with no omissions: `create_event` has
      // **no defaults**, deliberately, so a missing argument is a loud error
      // rather than the ambiguous overload PostgREST cannot resolve.
      const { data, error } = await supabase.rpc('create_event', {
        p_title: event.title.trim(),
        // Empty and absent are the same thing to the column, whose CHECK rejects
        // a blank string — so a description started and cleared must arrive as
        // null, not as ''.
        p_description: event.description?.trim() || null,
        p_kind: event.kind,
        p_metric: event.metric,
        p_target: event.target,
        p_starts_on: event.startsOn,
        p_ends_on: event.endsOn,
        p_squad_id: event.squadId,
      });
      if (error) {
        throw new Error(eventErrorMessage(error.code, 'Could not start that battle. Try again.'));
      }
      return data as EventRow;
    },
    onSuccess: (event, variables) => {
      // Payload carries no target: the boss's HP is derived from the squad's own
      // history and is the squad's own number — the rule `goal_created` already
      // followed. The difficulty is the part that answers a question.
      void track(userId, 'event_created', {
        kind: event.kind,
        difficulty: variables.difficulty,
      });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all() });
    },
  });
}

/**
 * Leave an Event. **Closes** it rather than deleting it once nobody is left.
 *
 * Closed, not deleted, so a completion already paid keeps its row and its XP —
 * and `closed_at` is what both the kind/metric checks and the one-live-per-kind
 * index key off, so closing frees the slot for the next fight.
 *
 * Deliberately a separate, visible act from editing a target — which is not
 * possible at all, because moving a boss's HP mid-window would silently
 * re-grade every day already counted (§8).
 */
export function useAbandonEvent(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string): Promise<void> => {
      const { error } = await supabase.rpc('abandon_event', { p_event_id: eventId });
      if (error) {
        throw new Error(eventErrorMessage(error.code, 'Could not leave that battle. Try again.'));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.all() });
    },
  });
}
