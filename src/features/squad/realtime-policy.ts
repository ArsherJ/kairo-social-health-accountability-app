/**
 * When to refetch the squad board.
 *
 * Realtime is not a delivery guarantee: backgrounding the app drops the socket
 * and any broadcasts during that window are gone, with nothing to replay them.
 * So the subscription is an optimisation over refetching rather than the source
 * of truth — every reconnect and every foreground forces a fetch, and the board
 * stays correct even if not one broadcast is ever delivered.
 *
 * Time is always an argument. No clock reads, which is what makes the burst and
 * throttle behaviour testable without faking timers.
 *
 * Zero imports so root Vitest can load this — it has no `@/` alias and cannot
 * parse React Native's Flow syntax.
 */

/** A burst of broadcasts inside this window becomes one refetch. */
export const COALESCE_WINDOW_MS = 400;

/** Foregrounding more often than this does not refetch again. */
export const FOREGROUND_THROTTLE_MS = 2_000;

export type RealtimePolicyInput =
  | { kind: 'broadcast'; at: number }
  | { kind: 'connected'; at: number }
  | { kind: 'disconnected'; at: number }
  | { kind: 'foreground'; at: number };

export type RealtimePolicyCommand =
  | { kind: 'none' }
  | { kind: 'refetch-now' }
  | { kind: 'refetch-after'; delayMs: number };

export type RealtimePolicyState = {
  /** A second `connected` can only follow a drop, so this is what makes a
   *  reconnect distinguishable from the first subscribe. */
  everConnected: boolean;
  /** When the scheduled refetch will run, or null if none is pending. */
  pendingUntil: number | null;
  /** When the most recent refetch was issued — its RUN time, not the moment
   *  it was scheduled, so the foreground throttle counts a pending refetch as
   *  already covering the user. */
  lastRefetchAt: number | null;
};

export const initialPolicyState: RealtimePolicyState = {
  everConnected: false,
  pendingUntil: null,
  lastRefetchAt: null,
};

/** Refetch immediately, cancelling anything coalesced — one request, not two. */
function refetchNow(
  state: RealtimePolicyState,
  at: number,
): [RealtimePolicyState, RealtimePolicyCommand] {
  return [
    { ...state, pendingUntil: null, lastRefetchAt: at },
    { kind: 'refetch-now' },
  ];
}

export function reduceRealtimePolicy(
  state: RealtimePolicyState,
  input: RealtimePolicyInput,
): [RealtimePolicyState, RealtimePolicyCommand] {
  switch (input.kind) {
    case 'broadcast': {
      // Already covered by a refetch that has not run yet.
      if (state.pendingUntil !== null && state.pendingUntil > input.at) {
        return [state, { kind: 'none' }];
      }
      const runsAt = input.at + COALESCE_WINDOW_MS;
      return [
        { ...state, pendingUntil: runsAt, lastRefetchAt: runsAt },
        { kind: 'refetch-after', delayMs: COALESCE_WINDOW_MS },
      ];
    }

    case 'connected': {
      if (!state.everConnected) {
        // The query fetched on mount moments ago; fetching again here would
        // double-fetch every time the board opens.
        return [{ ...state, everConnected: true }, { kind: 'none' }];
      }
      // A reconnect means the gap may have swallowed broadcasts, so this one
      // is deliberately not throttled.
      return refetchNow(state, input.at);
    }

    case 'disconnected':
      // Nothing to command. `everConnected` is left alone so the next connect
      // reads as a reconnect.
      return [state, { kind: 'none' }];

    case 'foreground': {
      if (
        state.lastRefetchAt !== null &&
        input.at - state.lastRefetchAt < FOREGROUND_THROTTLE_MS
      ) {
        return [state, { kind: 'none' }];
      }
      return refetchNow(state, input.at);
    }
  }
}
