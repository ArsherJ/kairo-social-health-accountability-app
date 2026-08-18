import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { currentLocalDate } from '@kairo/core';
import { todayBucketsKey, todayVitalsKey } from '@/features/character/buckets.ts';
import { scoredDayCountKey, todayScoreKey } from '@/features/character/queries.ts';
import { profileKey } from '@/features/profile/queries.ts';
import { squadKeys } from '@/features/squad/queries.ts';
import { track } from '@/features/telemetry/events.ts';
import {
  hasReached,
  markReached,
  markUnreached,
} from '@/features/telemetry/milestone-store.ts';
import { KAIRO_OBSERVED_TYPES, subscribeToHealthChanges } from './background.ts';
import { onSyncRequested, resetSyncStatus, setSyncStatus } from './status-store.ts';
import { loadSyncState } from './storage.ts';
import { syncCarriedData } from './sync-state.ts';
import {
  initialSyncPolicyState,
  reduceSyncPolicy,
  type SyncPolicyInput,
  type SyncPolicyState,
} from './sync-policy.ts';
import { runHealthSync } from './sync.ts';

/**
 * Milestone bookkeeping has no error handling of its own (MMKV can throw), and
 * telemetry must never break the sync it is observing — so every call into
 * `milestone-store.ts` is guarded here rather than inside it, which a later
 * task also calls and which is out of this task's scope to restructure.
 *
 * Claims before the write lands, mirroring `useAppOpenTelemetry`
 * (`src/features/notifications/useNotifications.ts`). This MMKV marker is now
 * the *only* once-ever gate for `first_sync_seen` — `syncCarriedData` at the
 * call site says nothing about whether this is the account's first sync, on
 * purpose, so a release here genuinely gives the *next* sync a chance to
 * retry rather than a gate that already shut for good. A write that actually
 * landed but *reported* false risks firing twice instead — and every reader
 * of this event counts `distinct user_id`, so a duplicate changes no answer.
 * Releasing the claim on a false resolve is therefore the side to err on,
 * same as the `app_open` precedent.
 */
function markFirstSyncSeen(userId: string, days: number): void {
  try {
    if (hasReached(userId, 'first_sync_seen')) return;
    markReached(userId, 'first_sync_seen');
  } catch (error) {
    console.warn('[telemetry] first_sync_seen milestone', error);
    return;
  }

  // Fire-and-forget — the sync must never await telemetry — but the resolved
  // boolean still matters: `track` resolves `true` only when the row actually
  // landed, and a failed write must not count as a send.
  void track(userId, 'first_sync_seen', { days }).then((landed) => {
    if (landed) return;
    try {
      markUnreached(userId, 'first_sync_seen');
    } catch (error) {
      console.warn('[telemetry] first_sync_seen milestone release', error);
    }
  });
}

/**
 * Set by the mounted hook so the permission sheet can demand an immediate sync.
 *
 * A module-level registry rather than a prop or context: the sheet is rendered
 * on the character screen while the hook lives in the tab layout, and threading
 * a callback between them would put React plumbing in the way of one event.
 */
const permissionListeners = new Set<() => void>();

/** Called when the user finishes the HealthKit prompt. */
export function notifyHealthPermissionGranted(): void {
  for (const listener of permissionListeners) listener();
}

/**
 * Keeps the server's copy of the user's health data current.
 *
 * Every decision about *when* to sync lives in `sync-policy.ts`, which is
 * testable in plain Node. This hook is the I/O around it — the same split as
 * `useSquadRealtime.ts`.
 *
 * The observer subscription is a bare "something changed" signal; the payload
 * is never read, because the window is recomputed from scratch on every sync.
 */
export function useHealthSync(
  userId: string | undefined,
  timeZone: string | undefined,
): void {
  const queryClient = useQueryClient();
  const state = useRef<SyncPolicyState>(initialSyncPolicyState);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId || !timeZone) return;

    state.current = initialSyncPolicyState;
    let cancelled = false;

    // Seed from the durable record before the first sync resolves, so a relaunch
    // reads "Synced 20 minutes ago" rather than claiming nothing has ever run.
    const stored = loadSyncState(userId);
    setSyncStatus({
      syncing: false,
      lastSyncedAt: stored.lastSyncedAt,
      firstSyncedAt: stored.firstSyncedAt,
      lastError: stored.lastError,
    });

    function clearTimer() {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }

    async function sync() {
      setSyncStatus({ syncing: true });

      const outcome = await runHealthSync(
        userId as string,
        timeZone as string,
        new Date(),
      );
      if (cancelled) return;

      // The once-ever gate is the MMKV milestone marker inside
      // markFirstSyncSeen, not anything read from sync state: runHealthSync
      // persists lastSyncedAt on every success, so a gate built from it could
      // only ever pass once per account, with no way to retry a sync whose
      // first_sync_seen write failed.
      if (syncCarriedData(outcome)) {
        markFirstSyncSeen(userId as string, outcome.syncedDates.length);
      }

      // Published from the state `runHealthSync` just persisted rather than
      // from `outcome`, so the strip and the durable record can never disagree
      // about when the last success actually was.
      const persisted = loadSyncState(userId as string);
      setSyncStatus({
        syncing: false,
        lastSyncedAt: persisted.lastSyncedAt,
        firstSyncedAt: persisted.firstSyncedAt,
        lastError: persisted.lastError,
      });

      if (outcome.ok) {
        const localDate = currentLocalDate(new Date(), timeZone as string);

        // The score, the level it rolls up into, and the board the user is
        // ranked on are all downstream of the buckets that just landed.
        void queryClient.invalidateQueries({
          queryKey: todayScoreKey(userId, localDate),
        });
        void queryClient.invalidateQueries({ queryKey: profileKey(userId) });
        void queryClient.invalidateQueries({ queryKey: squadKeys.allBoards() });

        // The raw figures are downstream too, and were the omission that made
        // the 9-11 Aug outage look like a *rendering* delay: the TODAY panel
        // reads `health_buckets` straight back off the server, so a sync that
        // wrote buckets left them on screen stale until the next cold launch —
        // which is exactly when the numbers appeared to "jump". Anything the
        // sync can move has to be listed here, or the screen disagrees with
        // the database and there is no way to tell which one is wrong.
        void queryClient.invalidateQueries({
          queryKey: todayBucketsKey(userId, localDate),
        });
        void queryClient.invalidateQueries({
          queryKey: todayVitalsKey(userId, localDate),
        });

        // The scored-day count moves with every sync too, and it drives two
        // claims rather than one figure: the disclosure stage, and — through
        // `everReceivedData` — whether `SyncStatus` says Apple Health is
        // sending nothing. Left stale it produces exactly the false accusation
        // `QUIET_GRACE_MS` was added to prevent, by the back door: connect at
        // 8am, first sync scores zero, walk all day, and at 2pm the cached
        // count is still the 8am zero while the grace window has elapsed.
        void queryClient.invalidateQueries({
          queryKey: scoredDayCountKey(userId),
        });
      }

      dispatch(
        outcome.ok
          ? { kind: 'sync-succeeded', at: Date.now() }
          : { kind: 'sync-failed', at: Date.now(), retryable: outcome.retryable },
      );
    }

    function dispatch(input: SyncPolicyInput) {
      const [next, command] = reduceSyncPolicy(state.current, input);
      state.current = next;

      if (command.kind === 'sync-now') {
        clearTimer();
        void sync();
      } else if (command.kind === 'sync-after') {
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          dispatch({ kind: 'timer', at: Date.now() });
        }, command.delayMs);
      }
    }

    dispatch({ kind: 'mount', at: Date.now() });

    const subscriptions = KAIRO_OBSERVED_TYPES.map((identifier) =>
      subscribeToHealthChanges(identifier, () => {
        dispatch({ kind: 'observer', at: Date.now() });
      }),
    );

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') dispatch({ kind: 'foreground', at: Date.now() });
    });

    const onPermissionGranted = () => {
      dispatch({ kind: 'permission-granted', at: Date.now() });
    };
    permissionListeners.add(onPermissionGranted);

    // Retry goes through the reducer like every other trigger, so `inFlight`
    // still serialises it and a tap during a running sync is remembered rather
    // than racing its own write.
    const unsubscribeRetry = onSyncRequested(() => {
      dispatch({ kind: 'manual', at: Date.now() });
    });

    return () => {
      cancelled = true;
      clearTimer();
      appState.remove();
      permissionListeners.delete(onPermissionGranted);
      unsubscribeRetry();
      resetSyncStatus();
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [userId, timeZone, queryClient]);
}
