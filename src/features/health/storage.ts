import { createMMKV } from 'react-native-mmkv';
import { initialSyncState, type SyncState } from './sync-state.ts';

/**
 * Where the health sync state lives between launches.
 *
 * MMKV rather than SecureStore: reads are synchronous over JSI, and an
 * observer-driven wake-up has a short budget in which an async storage
 * round-trip before the first HealthKit query is pure waste. It also holds no
 * health values — only dates, timestamps and an error string — so it needs no
 * encryption. `src/lib/secure-storage.ts` is Keychain-backed because it holds
 * refresh tokens; this is not that.
 */
const storage = createMMKV({ id: 'kairo.health' });

/**
 * Keyed per user. Signing out and in as someone else must not inherit the
 * previous account's dirty dates — those are local dates in *their* timezone.
 */
function stateKey(userId: string): string {
  return `sync-state.v1.${userId}`;
}

function isSyncState(value: unknown): value is SyncState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v['dirtyDates']) &&
    v['dirtyDates'].every((d) => typeof d === 'string')
  );
}

/**
 * Never throws. Anything unreadable falls back to the initial state, which
 * costs one wider-than-necessary sync and never a wrong score.
 */
export function loadSyncState(userId: string): SyncState {
  const raw = storage.getString(stateKey(userId));
  if (raw === undefined) return initialSyncState;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSyncState(parsed)) return initialSyncState;
    return { ...initialSyncState, ...parsed };
  } catch {
    return initialSyncState;
  }
}

export function saveSyncState(userId: string, state: SyncState): void {
  storage.set(stateKey(userId), JSON.stringify(state));
}

/** Called on sign-out. */
export function clearSyncState(userId: string): void {
  storage.remove(stateKey(userId));
}
