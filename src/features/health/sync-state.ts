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
  /** Persisted for the Phase 7 profile screen. Nothing renders it yet. */
  lastError: string | null;
  lastErrorAt: number | null;
};

export const initialSyncState: SyncState = {
  dirtyDates: [],
  lastSyncedAt: null,
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
