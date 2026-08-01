/**
 * When to flush health data to the server.
 *
 * A sync is heavier than a leaderboard refetch — several HealthKit queries, a
 * request of up to 744 buckets, and a full rescore on the far end — so this is
 * deliberately more conservative than `src/features/squad/realtime-policy.ts`,
 * which it otherwise mirrors.
 *
 * Time is always an argument. No clock reads, which is what makes the coalesce,
 * throttle and backoff behaviour testable without faking timers.
 *
 * Zero imports so root Vitest can load this — it has no `@/` alias and cannot
 * parse React Native's Flow syntax.
 */

/** HealthKit fires the observer several times for what a user did once. */
export const COALESCE_WINDOW_MS = 1_500;

/** Foregrounding more often than this does not sync again. */
export const FOREGROUND_THROTTLE_MS = 30_000;

export const BACKOFF_BASE_MS = 5_000;

/** A long outage should still retry on a cadence that catches the recovery. */
export const BACKOFF_MAX_MS = 300_000;

export type SyncPolicyInput =
  | { kind: 'mount'; at: number }
  | { kind: 'foreground'; at: number }
  | { kind: 'observer'; at: number }
  | { kind: 'permission-granted'; at: number }
  | { kind: 'timer'; at: number }
  | { kind: 'sync-succeeded'; at: number }
  /**
   * `retryable` is false for a 4xx the server will reject identically next
   * time. Retrying a validation bug forever is a battery and quota leak, and
   * no amount of waiting fixes a malformed payload.
   */
  | { kind: 'sync-failed'; at: number; retryable: boolean };

export type SyncPolicyCommand =
  | { kind: 'none' }
  | { kind: 'sync-now' }
  | { kind: 'sync-after'; delayMs: number };

export type SyncPolicyState = {
  inFlight: boolean;
  /** When the scheduled sync will run, or null if none is pending. */
  pendingUntil: number | null;
  /** When the last sync was issued — throttles the next foreground. */
  lastSyncAt: number | null;
  /** Something changed while a sync was already running. */
  missedWhileInFlight: boolean;
  consecutiveFailures: number;
};

export const initialSyncPolicyState: SyncPolicyState = {
  inFlight: false,
  pendingUntil: null,
  lastSyncAt: null,
  missedWhileInFlight: false,
  consecutiveFailures: 0,
};

/** Exponential, capped. `failures` is 1 for the first failure. */
export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
}

function syncNow(
  state: SyncPolicyState,
  at: number,
): [SyncPolicyState, SyncPolicyCommand] {
  return [
    { ...state, inFlight: true, pendingUntil: null, lastSyncAt: at },
    { kind: 'sync-now' },
  ];
}

function syncAfter(
  state: SyncPolicyState,
  at: number,
  delayMs: number,
  /**
   * Whether the scheduled run should also satisfy the foreground throttle.
   *
   * True when a sync is genuinely imminent (a coalesced observer burst). False
   * for a failure backoff — nothing has succeeded, so a user opening the app is
   * a better signal than the timer and must not be told to wait for it.
   */
  throttles: boolean,
): [SyncPolicyState, SyncPolicyCommand] {
  const runsAt = at + delayMs;
  return [
    // `lastSyncAt` is the RUN time, not the moment it was scheduled, so a
    // foreground arriving in between counts as already covered.
    { ...state, pendingUntil: runsAt, lastSyncAt: throttles ? runsAt : state.lastSyncAt },
    { kind: 'sync-after', delayMs },
  ];
}

export function reduceSyncPolicy(
  state: SyncPolicyState,
  input: SyncPolicyInput,
): [SyncPolicyState, SyncPolicyCommand] {
  // A second concurrent sync would read the same window and race its own write.
  // The trigger is remembered rather than dropped: on a live board, waiting for
  // some later foreground to carry the change is a long time.
  if (
    state.inFlight &&
    input.kind !== 'sync-succeeded' &&
    input.kind !== 'sync-failed'
  ) {
    return [{ ...state, missedWhileInFlight: true }, { kind: 'none' }];
  }

  switch (input.kind) {
    case 'mount':
      return syncNow(state, input.at);

    // Deliberately unthrottled. The user just tapped "Connect Apple Health"
    // and is looking at a screen showing zero (§5).
    case 'permission-granted':
      return syncNow(state, input.at);

    case 'foreground': {
      if (
        state.lastSyncAt !== null &&
        input.at - state.lastSyncAt < FOREGROUND_THROTTLE_MS
      ) {
        return [state, { kind: 'none' }];
      }
      return syncNow(state, input.at);
    }

    case 'observer': {
      // Already covered by a sync that has not run yet.
      if (state.pendingUntil !== null && state.pendingUntil > input.at) {
        return [state, { kind: 'none' }];
      }
      return syncAfter(state, input.at, COALESCE_WINDOW_MS, true);
    }

    case 'timer': {
      if (state.pendingUntil === null) return [state, { kind: 'none' }];
      return syncNow(state, input.at);
    }

    case 'sync-succeeded': {
      const next = {
        ...state,
        inFlight: false,
        lastSyncAt: input.at,
        missedWhileInFlight: false,
        consecutiveFailures: 0,
      };
      if (!state.missedWhileInFlight) return [next, { kind: 'none' }];
      return syncAfter(next, input.at, COALESCE_WINDOW_MS, true);
    }

    case 'sync-failed': {
      if (!input.retryable) {
        // The payload is wrong, not the network. Stop, and let the next
        // genuine trigger try again with a freshly built request.
        return [
          { ...state, inFlight: false, pendingUntil: null },
          { kind: 'none' },
        ];
      }

      const failures = state.consecutiveFailures + 1;
      // The dirty dates are still queued in SyncState, so the retry re-reads
      // them from HealthKit rather than replaying a stale payload.
      return syncAfter(
        { ...state, inFlight: false, consecutiveFailures: failures },
        input.at,
        backoffMs(failures),
        false,
      );
    }
  }
}
