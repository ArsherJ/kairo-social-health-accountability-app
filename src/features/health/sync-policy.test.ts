import { describe, expect, it } from 'vitest';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  COALESCE_WINDOW_MS,
  FOREGROUND_THROTTLE_MS,
  initialSyncPolicyState,
  reduceSyncPolicy,
  type SyncPolicyInput,
  type SyncPolicyState,
} from './sync-policy.ts';

/** Feed a sequence of inputs, returning the final state and the last command. */
function run(inputs: SyncPolicyInput[], from = initialSyncPolicyState) {
  let state: SyncPolicyState = from;
  let command = reduceSyncPolicy(state, inputs[0] as SyncPolicyInput)[1];

  for (const input of inputs) {
    [state, command] = reduceSyncPolicy(state, input);
  }
  return { state, command };
}

/** The state left behind by a completed sync at `at`. */
function afterSync(at: number): SyncPolicyState {
  const [started] = reduceSyncPolicy(initialSyncPolicyState, {
    kind: 'mount',
    at,
  });
  const [done] = reduceSyncPolicy(started, { kind: 'sync-succeeded', at });
  return done;
}

describe('triggers', () => {
  it('syncs on mount', () => {
    const [, command] = reduceSyncPolicy(initialSyncPolicyState, {
      kind: 'mount',
      at: 0,
    });
    expect(command).toEqual({ kind: 'sync-now' });
  });

  it('syncs the moment health permission is granted', () => {
    // The user just tapped "Connect Apple Health" and is looking at a screen
    // that says zero. Waiting for the next foreground would read as broken.
    const state = afterSync(1_000);
    const [, command] = reduceSyncPolicy(state, {
      kind: 'permission-granted',
      at: 1_100,
    });
    expect(command).toEqual({ kind: 'sync-now' });
  });

  it('coalesces a burst of observer events into one sync', () => {
    // HealthKit fires the observer several times for what a user did once.
    const { command, state } = run(
      [
        { kind: 'observer', at: 0 },
        { kind: 'observer', at: 100 },
        { kind: 'observer', at: 250 },
      ],
      afterSync(-100_000),
    );

    expect(command).toEqual({ kind: 'none' });
    expect(state.pendingUntil).toBe(0 + COALESCE_WINDOW_MS);
  });

  it('schedules the first observer event rather than syncing immediately', () => {
    const [, command] = reduceSyncPolicy(afterSync(-100_000), {
      kind: 'observer',
      at: 0,
    });
    expect(command).toEqual({ kind: 'sync-after', delayMs: COALESCE_WINDOW_MS });
  });

  it('runs the scheduled sync when the timer fires', () => {
    const [scheduled] = reduceSyncPolicy(afterSync(-100_000), {
      kind: 'observer',
      at: 0,
    });
    const [state, command] = reduceSyncPolicy(scheduled, {
      kind: 'timer',
      at: COALESCE_WINDOW_MS,
    });

    expect(command).toEqual({ kind: 'sync-now' });
    expect(state.pendingUntil).toBeNull();
  });

  it('ignores a timer with nothing scheduled', () => {
    const [, command] = reduceSyncPolicy(afterSync(0), { kind: 'timer', at: 50 });
    expect(command).toEqual({ kind: 'none' });
  });
});

describe('foreground throttle', () => {
  it('does not sync again immediately after one just ran', () => {
    const [, command] = reduceSyncPolicy(afterSync(1_000), {
      kind: 'foreground',
      at: 1_000 + FOREGROUND_THROTTLE_MS - 1,
    });
    expect(command).toEqual({ kind: 'none' });
  });

  it('syncs once the throttle has elapsed', () => {
    const [, command] = reduceSyncPolicy(afterSync(1_000), {
      kind: 'foreground',
      at: 1_000 + FOREGROUND_THROTTLE_MS,
    });
    expect(command).toEqual({ kind: 'sync-now' });
  });

  it('always syncs on the very first foreground', () => {
    const [, command] = reduceSyncPolicy(initialSyncPolicyState, {
      kind: 'foreground',
      at: 0,
    });
    expect(command).toEqual({ kind: 'sync-now' });
  });
});

describe('in-flight guard', () => {
  it('does not start a second sync while one is running', () => {
    const [inFlight] = reduceSyncPolicy(initialSyncPolicyState, {
      kind: 'mount',
      at: 0,
    });
    expect(inFlight.inFlight).toBe(true);

    const [, command] = reduceSyncPolicy(inFlight, {
      kind: 'foreground',
      at: 100_000,
    });
    expect(command).toEqual({ kind: 'none' });
  });

  it('picks up a change that arrived mid-flight once the sync finishes', () => {
    // Dropping it would leave the new data unsent until some later trigger,
    // which on a live leaderboard can be a long time.
    const [inFlight] = reduceSyncPolicy(initialSyncPolicyState, {
      kind: 'mount',
      at: 0,
    });
    const [missed] = reduceSyncPolicy(inFlight, { kind: 'observer', at: 50 });
    const [, command] = reduceSyncPolicy(missed, {
      kind: 'sync-succeeded',
      at: 200,
    });

    expect(command).toEqual({ kind: 'sync-after', delayMs: COALESCE_WINDOW_MS });
  });

  it('does nothing further when no change arrived mid-flight', () => {
    const [inFlight] = reduceSyncPolicy(initialSyncPolicyState, {
      kind: 'mount',
      at: 0,
    });
    const [, command] = reduceSyncPolicy(inFlight, {
      kind: 'sync-succeeded',
      at: 200,
    });
    expect(command).toEqual({ kind: 'none' });
  });
});

describe('failure backoff', () => {
  function failTimes(count: number) {
    let state = initialSyncPolicyState;
    let command = reduceSyncPolicy(state, { kind: 'mount', at: 0 })[1];

    for (let i = 0; i < count; i += 1) {
      [state] = reduceSyncPolicy(state, { kind: 'mount', at: i * 1_000_000 });
      [state, command] = reduceSyncPolicy(state, {
        kind: 'sync-failed',
        at: i * 1_000_000 + 10,
        retryable: true,
      });
    }
    return { state, command };
  }

  it('retries after the base delay on the first failure', () => {
    expect(failTimes(1).command).toEqual({
      kind: 'sync-after',
      delayMs: BACKOFF_BASE_MS,
    });
  });

  it('doubles the delay on each consecutive failure', () => {
    expect(failTimes(2).command).toEqual({
      kind: 'sync-after',
      delayMs: BACKOFF_BASE_MS * 2,
    });
    expect(failTimes(3).command).toEqual({
      kind: 'sync-after',
      delayMs: BACKOFF_BASE_MS * 4,
    });
  });

  it('caps the delay so a long outage still retries on a sane cadence', () => {
    const { command } = failTimes(20);
    expect(command).toEqual({ kind: 'sync-after', delayMs: BACKOFF_MAX_MS });
  });

  it('resets the backoff after a success', () => {
    const { state } = failTimes(3);
    const [recovered] = reduceSyncPolicy(state, {
      kind: 'sync-succeeded',
      at: 9_000_000,
    });
    expect(recovered.consecutiveFailures).toBe(0);

    const [failedAgain, command] = reduceSyncPolicy(
      reduceSyncPolicy(recovered, { kind: 'mount', at: 9_100_000 })[0],
      { kind: 'sync-failed', at: 9_100_010, retryable: true },
    );
    expect(failedAgain.consecutiveFailures).toBe(1);
    expect(command).toEqual({ kind: 'sync-after', delayMs: BACKOFF_BASE_MS });
  });

  it('clears the in-flight flag so a retry is possible', () => {
    expect(failTimes(1).state.inFlight).toBe(false);
  });

  it('lets a foreground during the backoff try immediately', () => {
    // The user opening the app is a better signal than a timer — they may have
    // just reconnected. Making them wait out a 15-minute backoff in front of a
    // stale score is the wrong trade.
    const { state } = failTimes(5);
    // Five failures is an 80s backoff, so the retry is not due yet. One minute
    // after the last attempt is past the 30s throttle but well inside it.
    expect(state.pendingUntil).toBe(4_000_010 + BACKOFF_BASE_MS * 16);

    const [, command] = reduceSyncPolicy(state, {
      kind: 'foreground',
      at: 4_000_010 + 60_000,
    });
    expect(command).toEqual({ kind: 'sync-now' });
  });

  it('never retries a failure the server will reject identically', () => {
    // A 400 is a payload bug. Retrying it on a backoff loop burns battery and
    // Edge Function quota forever and fixes nothing.
    const [inFlight] = reduceSyncPolicy(initialSyncPolicyState, {
      kind: 'mount',
      at: 0,
    });
    const [state, command] = reduceSyncPolicy(inFlight, {
      kind: 'sync-failed',
      at: 100,
      retryable: false,
    });

    expect(command).toEqual({ kind: 'none' });
    expect(state.pendingUntil).toBeNull();
    expect(state.inFlight).toBe(false);
  });

  it('still allows a later trigger after a non-retryable failure', () => {
    const [inFlight] = reduceSyncPolicy(initialSyncPolicyState, {
      kind: 'mount',
      at: 0,
    });
    const [stopped] = reduceSyncPolicy(inFlight, {
      kind: 'sync-failed',
      at: 100,
      retryable: false,
    });
    const [, command] = reduceSyncPolicy(stopped, {
      kind: 'foreground',
      at: 100 + FOREGROUND_THROTTLE_MS,
    });
    expect(command).toEqual({ kind: 'sync-now' });
  });
});

describe('purity', () => {
  it('does not mutate the state it is given', () => {
    const before = { ...initialSyncPolicyState };
    reduceSyncPolicy(before, { kind: 'mount', at: 0 });
    expect(before).toEqual(initialSyncPolicyState);
  });
});
