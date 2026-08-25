import { useQuery } from '@tanstack/react-query';
import {
  evaluateEvent,
  pooledDays,
  trailingMedian,
  type EventProgressRow,
  type KairoEvent,
} from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

/**
 * Event reads.
 *
 * Progress is **not** fetched — it is computed here, from the day rows
 * `event_progress()` returns, by the same `evaluateEvent()` the server pays XP
 * from (deviation #18). One implementation of the arithmetic, so the number on
 * the card can never disagree with the notification that announced it.
 */

export const eventKeys = {
  squad: (squadId: string | undefined) => ['events', 'squad', squadId ?? 'none'] as const,
  detail: (eventId: string | undefined) => ['events', 'detail', eventId ?? 'none'] as const,
  history: (squadId: string | undefined) => ['events', 'history', squadId ?? 'none'] as const,
  /** Prefix of every event key — one broadcast refreshes all of them. */
  all: () => ['events'] as const,
};

const EVENT_COLUMNS =
  'id, squad_id, created_by, title, description, kind, metric, target, starts_on, ends_on';

/** An Event row as the client reads it back. */
export interface EventRow {
  id: string;
  squad_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  kind: string;
  metric: string;
  target: number;
  starts_on: string;
  /** Never null on a live Event — `events_need_end` rejects one. */
  ends_on: string;
}

/**
 * The database row narrowed to the shape `@kairo/core` evaluates.
 *
 * Both strings are widened by a CHECK rather than by a type, and a row written
 * by a migration newer than this build would carry a value this one does not
 * know — so each degrades to the shipped default rather than throwing, exactly
 * as `eventRowToEvent` does on the server.
 */
export function toEvent(row: EventRow): KairoEvent {
  return {
    id: row.id,
    kind: row.kind === 'adventure' ? 'adventure' : 'battle',
    metric: row.metric === 'distance_m' ? 'distance_m' : 'active_kcal',
    target: row.target,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

/**
 * The squad's live Events. **`closed_at is null` is not optional** — the table
 * still holds every pre-pivot Goal row, kept so banked XP does not vanish, and
 * omitting the filter renders one of them as a Battle with a points target.
 *
 * Personal Events do not exist: `events_need_squad` rejects them, because a
 * personal Battle is a Challenge and two mechanics for one thing is how a
 * surface ends up half-built.
 */
export function useSquadEvents(squadId: string | undefined) {
  return useQuery({
    queryKey: eventKeys.squad(squadId),
    enabled: Boolean(squadId),
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase
        .from('challenge_events')
        .select(EVENT_COLUMNS)
        .eq('squad_id', squadId!)
        .is('closed_at', null)
        .order('ends_on', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as EventRow[];
    },
  });
}

/**
 * One Event, with its pooled standing and the per-member breakdown.
 *
 * `today` is passed in rather than read here so the whole thing stays a pure
 * function of its inputs — the same rule `kairo-core` follows, for the same
 * reason: a component that reads the clock cannot be reasoned about.
 *
 * `pooledDays()` is what turns the RPC's per-participant rows into the squad's
 * day list, and it lives in `@kairo/core` precisely so this and `finalize-days`
 * cannot disagree about the two rules inside it: take each date once, and read
 * the pooled column rather than the consent-gated one.
 */
export function useEventDetail(eventId: string | undefined, today: string | undefined) {
  return useQuery({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId && today),
    queryFn: async () => {
      const [eventResult, progressResult] = await Promise.all([
        supabase.from('challenge_events').select(EVENT_COLUMNS).eq('id', eventId!).maybeSingle(),
        supabase.rpc('event_progress', { p_event_id: eventId! }),
      ]);
      if (eventResult.error) throw new Error(eventResult.error.message);
      if (progressResult.error) throw new Error(progressResult.error.message);
      if (!eventResult.data) throw new Error('That event is no longer here.');

      const row = eventResult.data as EventRow;
      const event = toEvent(row);
      const rows = (progressResult.data ?? []) as EventProgressRow[];

      return {
        row,
        event,
        rows,
        progress: evaluateEvent(event, pooledDays(rows), today!),
      };
    },
  });
}

/** One member's share of the fight, for the detail screen's roster. */
export interface MemberShare {
  userId: string;
  characterName: string;
  species: string | null;
  /** Null when the consent gate withheld it — not the same as zero. */
  contributed: number | null;
}

/**
 * Fold `event_progress()`'s rows into one line per participant.
 *
 * Null is carried through rather than coalesced to 0: "has not shared" and "has
 * done nothing" are different facts, and printing the second for the first
 * accuses somebody of a quiet week they may not have had.
 */
export function memberShares(rows: readonly EventProgressRow[]): MemberShare[] {
  const byUser = new Map<string, MemberShare>();
  for (const row of rows) {
    const seen = byUser.get(row.user_id);
    const value = row.value === null ? null : Number(row.value);
    if (seen === undefined) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        characterName: row.character_name,
        species: row.species,
        contributed: value,
      });
      continue;
    }
    if (value !== null) seen.contributed = (seen.contributed ?? 0) + value;
  }
  return [...byUser.values()];
}

/**
 * The squad's pooled daily active calories over the trailing 14 days, as the
 * median that sets boss HP.
 *
 * Read on the **creation screen only**, and this is the one place a client
 * computes a number the server then stores. Reimplementing the median in
 * plpgsql would be a second implementation of the arithmetic needing a
 * differential test, which is exactly what deviation #18 declined to pay for
 * goals. The exposure is bounded: a client can set an easy boss for its own
 * squad, which costs that squad its own XP and nothing else.
 *
 * It reads `squad_leaderboard()` rather than `health_buckets` — the board
 * already projects each member's daily `active_kcal` behind the consent gate,
 * and reaching into buckets here would be a second privacy surface for a figure
 * the app already has. A member who has not consented contributes null, which
 * reads as 0, so a squad where nobody has consented gets the floor rather than
 * an error. That is the honest failure: an easier boss, not a broken one.
 *
 * Fourteen sequential RPC calls is a lot for one screen, and it is acceptable
 * **only because this runs on the creation screen and nowhere else**. If it
 * feels slow on device the fix is a single `event_kcal_history()` RPC with the
 * same consent gate — not caching this one.
 */
export function useSquadKcalHistory(squadId: string | undefined, days = 14) {
  return useQuery({
    queryKey: eventKeys.history(squadId),
    enabled: Boolean(squadId),
    queryFn: async (): Promise<number> => {
      const dailyTotals: number[] = [];
      for (let i = 1; i <= days; i += 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - i);
        const localDate = date.toISOString().slice(0, 10);
        const { data, error } = await supabase.rpc('squad_leaderboard', {
          p_squad_id: squadId!,
          p_local_date: localDate,
        });
        if (error) throw new Error(error.message);
        dailyTotals.push(
          ((data ?? []) as { active_kcal: number | string | null }[]).reduce(
            (n, r) => n + Number(r.active_kcal ?? 0),
            0,
          ),
        );
      }
      // One figure per date, summed across members first, then the median of
      // those. A median per member added together would describe a squad
      // nobody has ever been in.
      return trailingMedian(dailyTotals);
    },
  });
}
