import { supabase } from '@/lib/supabase.ts';
import { toBuckets } from './hourly-buckets.ts';
import { healthSource } from './health-source.ts';
import { loadSyncState, saveSyncState } from './storage.ts';
import { markFailed, markSynced } from './sync-state.ts';
import { resolveSyncWindow } from './sync-window.ts';

/**
 * One health sync, end to end: read the window, post it, record what landed.
 *
 * The client never sends a score. `sync-health` re-reads the whole day from
 * stored buckets and rescores through `@kairo/core`, which is what keeps §12's
 * server-authoritative rule true and makes every retry safe.
 */

export interface SyncOutcome {
  ok: boolean;
  /** False for a payload the server will reject identically next time. */
  retryable: boolean;
  /** Local dates the server confirmed it wrote. */
  syncedDates: string[];
  error?: string;
}

interface SyncResponseDay {
  localDate: string;
  total: number;
  frozen: boolean;
}

/**
 * A 4xx other than 429 means the request itself is wrong, and no amount of
 * waiting fixes it. Anything else — offline, 5xx, a timeout with no response —
 * is worth retrying.
 */
function isRetryable(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status >= 500 || status === 429;
}

export async function runHealthSync(
  userId: string,
  timeZone: string,
  now: Date,
): Promise<SyncOutcome> {
  const state = loadSyncState(userId);
  const window = resolveSyncWindow(state, now, timeZone);

  let buckets;
  let sleep;
  let restingHeartRate;
  let sessions;
  try {
    const read = await healthSource.readWindow(window, timeZone);
    buckets = toBuckets(read.readings, window.dates, timeZone);
    sleep = read.sleep;
    restingHeartRate = read.restingHeartRate;
    // Dates over the wire, not `Date` objects: this body is JSON-serialised and
    // the planner validates both ends as ISO strings.
    sessions = read.sessions.map((session) => ({
      ...session,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt.toISOString(),
    }));
  } catch (cause) {
    // A HealthKit read can fail transiently while the device is locked
    // (protected data unavailable). Nothing was sent, so nothing to reconcile.
    const message = cause instanceof Error ? cause.message : 'health read failed';
    saveSyncState(userId, markFailed(state, now.getTime(), message));
    return { ok: false, retryable: true, syncedDates: [], error: message };
  }

  const { data, error } = await supabase.functions.invoke<{
    days: SyncResponseDay[];
  }>('sync-health', {
    // The device timezone, not a pinned one: `sync-health` writes it through to
    // `profiles.timezone`, which is what `finalize-days` and the notification
    // budget read. The payload doubles as the travel signal.
    body: { timezone: timeZone, buckets, sleep, restingHeartRate, sessions },
  });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    const message = error.message ?? 'sync failed';
    saveSyncState(userId, markFailed(state, now.getTime(), message));
    return {
      ok: false,
      retryable: isRetryable(status),
      syncedDates: [],
      error: message,
    };
  }

  // Only the dates the server confirmed are cleared. A partial write leaves the
  // rest dirty so the next flush retries exactly them.
  const syncedDates = (data?.days ?? []).map((d) => d.localDate);
  saveSyncState(userId, markSynced(state, syncedDates, now.getTime()));

  return { ok: true, retryable: true, syncedDates };
}
