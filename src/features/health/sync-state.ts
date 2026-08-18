/**
 * What the client remembers between health syncs.
 *
 * Deliberately a set of *dates*, not a queue of payloads. HealthKit is the
 * source of truth and re-reading it is cheap, so a retry always sends current
 * numbers. A payload queue has the opposite property: a retry can POST a total
 * that a later, successful sync already superseded.
 *
 * Zero imports so root Vitest can load this — it has no `@/` alias and cannot
 * parse React Native's Flow syntax.
 */

/**
 * The longest run of days one sync can carry.
 *
 * The server caps a request at 750 buckets and every dirty day is sent whole,
 * all 24 hours including zeros, so that Apple revising an hour *downward* still
 * overwrites the stored bucket. 31 x 24 = 744 is the largest window that always
 * fits.
 */
export const MAX_DIRTY_DATES = 31;

export type SyncState = {
  /** Local dates (`YYYY-MM-DD`) awaiting a successful sync, sorted ascending. */
  dirtyDates: string[];
  lastSyncedAt: number | null;
  /**
   * The *first* sync this account ever completed, never overwritten.
   *
   * `lastSyncedAt` cannot answer "how long has Health been connected", and that
   * is the question `syncStatus`'s 'no-data' branch has to answer before it is
   * allowed to claim nothing is arriving. Someone who connects at 8am with 200
   * steps is not a broken install, and telling them to open Settings is the
   * same false accusation that state exists to remove, aimed the other way.
   *
   * Null on a state stored before this field existed. That fails toward
   * silence — the grace window never elapses, so 'no-data' never fires — which
   * is the right direction for a claim about something being wrong.
   */
  firstSyncedAt: number | null;
  /** Persisted for the Phase 7 profile screen. Nothing renders it yet. */
  lastError: string | null;
  lastErrorAt: number | null;
};

export const initialSyncState: SyncState = {
  dirtyDates: [],
  lastSyncedAt: null,
  firstSyncedAt: null,
  lastError: null,
  lastErrorAt: null,
};

/** Queue local dates for re-reading. Idempotent, and safe to call in a burst. */
export function markDirty(state: SyncState, dates: string[]): SyncState {
  const merged = [...new Set([...state.dirtyDates, ...dates])].sort();

  return {
    ...state,
    // Keep the newest. Older days are already final, and §19 credits their XP
    // on a later backfill anyway — whereas today's score is on a live board.
    dirtyDates: merged.slice(Math.max(0, merged.length - MAX_DIRTY_DATES)),
  };
}

/**
 * Clear only the dates the server confirmed.
 *
 * `sync-health` returns one entry per date it actually wrote, so a request that
 * partially succeeded leaves the rest dirty and the next flush retries them.
 * Clearing everything on any 200 would silently drop those days.
 */
export function markSynced(
  state: SyncState,
  dates: string[],
  at: number,
): SyncState {
  const confirmed = new Set(dates);

  return {
    dirtyDates: state.dirtyDates.filter((d) => !confirmed.has(d)),
    lastSyncedAt: at,
    // Claimed once and then left alone. `??` rather than a conditional so a
    // stored state predating this field adopts the current sync as its first,
    // which restarts the grace window rather than skipping it — the safe
    // direction for a timer that gates an accusation.
    firstSyncedAt: state.firstSyncedAt ?? at,
    lastError: null,
    lastErrorAt: null,
  };
}

/** Record a failure. The dirty dates stay dirty, which is the whole retry. */
export function markFailed(
  state: SyncState,
  at: number,
  message: string,
): SyncState {
  return { ...state, lastError: message, lastErrorAt: at };
}

/**
 * Whether this sync outcome actually carried data.
 *
 * A non-empty `syncedDates` is what separates activation from a granted
 * permission over an empty phone — the second is a real state (a new device, a
 * user who has never carried it) and calling it activation would inflate the
 * one number the funnel exists to report.
 *
 * Deliberately takes no `SyncState` and asks nothing about whether this is the
 * *first* sync: `runHealthSync` persists `lastSyncedAt` on every success, so a
 * once-per-account gate built from sync state can only ever pass once, ever —
 * and if that one sync's `first_sync_seen` write fails, there is no later sync
 * that can retry it. The once-ever-ness now lives entirely in the caller's
 * MMKV milestone marker, which a failed write can release; this function only
 * answers "did data move," on every sync, so a release has something to retry
 * against.
 *
 * Takes the outcome's shape structurally rather than importing `SyncOutcome`,
 * because this file has zero imports so root Vitest can load it.
 */
export function syncCarriedData(outcome: {
  ok: boolean;
  syncedDates: string[];
}): boolean {
  return outcome.ok && outcome.syncedDates.length > 0;
}
