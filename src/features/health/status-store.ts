import { create } from 'zustand';

/**
 * What the sync loop is currently doing, for anything that wants to show it.
 *
 * `useHealthSync` runs in the tab layout; the strip that reports it renders on
 * the character screen. The same split the permission-granted registry above it
 * solves, solved the same way the rest of the app does — zustand, like
 * `useDemoStore`.
 *
 * In-memory rather than persisted: `loadSyncState()` in `storage.ts` is still
 * the durable record, and this is a projection of it kept live for the current
 * session. On mount the hook seeds it from storage, so a relaunch shows the
 * real last-synced time rather than "waiting for your first sync".
 */
type SyncStatusState = {
  syncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
};

const initial: SyncStatusState = {
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
};

export const useSyncStatusStore = create<SyncStatusState>(() => initial);

export function setSyncStatus(next: Partial<SyncStatusState>): void {
  useSyncStatusStore.setState(next);
}

/** Signing out must not leave the next account reading this one's timestamps. */
export function resetSyncStatus(): void {
  useSyncStatusStore.setState(initial, true);
}

/**
 * Set by the mounted hook so the status strip can demand a sync.
 *
 * The same registry idiom as `notifyHealthPermissionGranted` — one event, no
 * context provider threaded between two distant subtrees.
 */
const retryListeners = new Set<() => void>();

export function onSyncRequested(listener: () => void): () => void {
  retryListeners.add(listener);
  return () => retryListeners.delete(listener);
}

/** Called by the retry control. A no-op if no hook is mounted. */
export function requestSync(): void {
  for (const listener of retryListeners) listener();
}
