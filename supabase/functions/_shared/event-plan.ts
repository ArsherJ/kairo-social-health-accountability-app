import {
  evaluateEvent,
  eventCompletionXp,
  pooledDays,
  type EventKind,
  type EventMetric,
  type EventProgressRow,
  type KairoEvent,
} from './core.ts';

/**
 * The decision half of the Event pass in `finalize-days`, kept free of I/O so
 * it can be tested in plain Node with no Deno, no Docker and no database.
 *
 * The handler reads the live events a user is on and the days inside each
 * window; this module decides which of them just completed. Nothing here
 * writes, and nothing here evaluates an event itself — `evaluateEvent()` in
 * `@kairo/core` is the single implementation of that arithmetic (deviation
 * #18), and `pooledDays()` there is the single implementation of the pooling.
 *
 * **The one behavioural difference from the goal pass it replaces:** a Goal
 * completed per person and an Event completes for the squad. When the pooled
 * bar is met, every participant on the frozen roster is paid — including one
 * who contributed nothing. That is the mechanic, not an oversight: pooled means
 * the strong member carries (deviation #48), and paying only contributors would
 * rebuild the per-member N-of-M rule the pivot removed.
 */

/** An event as the handler reads it back from `challenge_events`. */
export interface EventRow {
  id: string;
  squad_id: string | null;
  title: string;
  description: string | null;
  kind: string;
  metric: string;
  target: number;
  starts_on: string;
  ends_on: string;
}

/** The row `finalize-days` will insert when an event completes. */
export interface EventCompletionRow {
  event_id: string;
  user_id: string;
  completed_on: string;
  xp_awarded: number;
}

export interface EventCompletion {
  row: EventCompletionRow;
  /** Carried so the handler can build notification copy without re-reading. */
  title: string;
  kind: EventKind;
}

/**
 * Narrow the database strings.
 *
 * Anything unrecognised — including a value written by a migration newer than
 * this deployment — degrades to the shipped default rather than throwing. Same
 * defensive posture `goal-plan.ts`'s `toMetric` took, and for the same reason:
 * a throw here stops a whole finalization run, and a day failing to close is
 * worse than an event grading against the wrong metric for one hour.
 */
export function eventRowToEvent(row: EventRow): KairoEvent {
  const kind: EventKind = row.kind === 'adventure' ? 'adventure' : 'battle';
  const metric: EventMetric = row.metric === 'distance_m' ? 'distance_m' : 'active_kcal';
  return {
    id: row.id,
    kind,
    metric,
    target: row.target,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

/**
 * Which events completed on `localDate`, and who is paid for them.
 *
 * `alreadyCompleted` holds `"<eventId>:<userId>"` keys. It is the cheap filter,
 * not the guarantee: the insert carries `on conflict do nothing` and the
 * primary key is what makes a double-latch impossible under overlapping cron
 * runs.
 *
 * The `rows` are `event_progress()`'s raw output, one per participant per day,
 * and they go through `pooledDays()` rather than being summed here. Two rules
 * live in that function and both are easy to get wrong from this side: take
 * each date **once**, and grade off the **pooled** column, which the consent
 * gate never withholds.
 */
export function planEventCompletions(input: {
  localDate: string;
  events: readonly {
    row: EventRow;
    /** The frozen roster from `event_participants`. */
    roster: readonly string[];
    /** Every participant's day inside the window, from `event_progress()`. */
    rows: readonly EventProgressRow[];
  }[];
  alreadyCompleted: ReadonlySet<string>;
}): EventCompletion[] {
  const completions: EventCompletion[] = [];

  for (const entry of input.events) {
    const { row } = entry;

    // The finalized day must be inside the window. Lexicographic comparison is
    // correct for zero-padded ISO dates.
    if (input.localDate < row.starts_on) continue;
    if (input.localDate > row.ends_on) continue;

    const event = eventRowToEvent(row);

    // `met` reads final days only, which is the whole reason a provisional day
    // cannot pay XP. `localDate` is the day that just finalized, so it is also
    // the correct "today" for this evaluation.
    const result = evaluateEvent(event, pooledDays(entry.rows), input.localDate);
    if (!result.met) continue;

    // One figure for the whole roster: the reward is a property of the
    // commitment the squad made, not of who did the work inside it.
    const xp = eventCompletionXp(event, input.localDate);

    for (const userId of entry.roster) {
      if (input.alreadyCompleted.has(`${row.id}:${userId}`)) continue;
      completions.push({
        title: row.title,
        kind: event.kind,
        row: {
          event_id: row.id,
          user_id: userId,
          completed_on: input.localDate,
          xp_awarded: xp,
        },
      });
    }
  }

  return completions;
}
