import { describe, expect, it } from 'vitest';
import {
  COALESCE_WINDOW_MS,
  FOREGROUND_THROTTLE_MS,
  initialPolicyState,
  reduceRealtimePolicy,
  type RealtimePolicyInput,
  type RealtimePolicyState,
} from './realtime-policy.ts';

/** Feeds a sequence of inputs, returning every command in order. */
function run(inputs: readonly RealtimePolicyInput[]): {
  state: RealtimePolicyState;
  commands: string[];
} {
  let state = initialPolicyState;
  const commands: string[] = [];
  for (const input of inputs) {
    const [next, command] = reduceRealtimePolicy(state, input);
    state = next;
    commands.push(
      command.kind === 'refetch-after'
        ? `refetch-after:${command.delayMs}`
        : command.kind,
    );
  }
  return { state, commands };
}

describe('broadcasts', () => {
  it('schedules one refetch rather than fetching immediately', () => {
    const { commands } = run([{ kind: 'broadcast', at: 0 }]);
    expect(commands).toEqual([`refetch-after:${COALESCE_WINDOW_MS}`]);
  });

  it('collapses a burst into a single refetch', () => {
    // finalize-days rescores a whole squad at once, so six broadcasts can
    // land inside a few hundred milliseconds.
    const { commands } = run([
      { kind: 'broadcast', at: 0 },
      { kind: 'broadcast', at: 50 },
      { kind: 'broadcast', at: 120 },
      { kind: 'broadcast', at: 399 },
    ]);
    expect(commands).toEqual([`refetch-after:${COALESCE_WINDOW_MS}`, 'none', 'none', 'none']);
  });

  it('schedules again once the window has passed', () => {
    const { commands } = run([
      { kind: 'broadcast', at: 0 },
      { kind: 'broadcast', at: COALESCE_WINDOW_MS + 1 },
    ]);
    expect(commands).toEqual([
      `refetch-after:${COALESCE_WINDOW_MS}`,
      `refetch-after:${COALESCE_WINDOW_MS}`,
    ]);
  });

  it('does not swallow a broadcast arriving exactly at pendingUntil', () => {
    // The guard is a strict `>`. The hook's timer callback refetches without
    // clearing pendingUntil, so at the instant pendingUntil equals `at`, the
    // scheduled refetch has already run — this broadcast must schedule a
    // fresh one. Relaxing the guard to `!==null` would pass all other tests
    // here while swallowing every broadcast after the first, forever.
    const { commands } = run([
      { kind: 'broadcast', at: 0 },
      { kind: 'broadcast', at: COALESCE_WINDOW_MS },
    ]);
    expect(commands).toEqual([
      `refetch-after:${COALESCE_WINDOW_MS}`,
      `refetch-after:${COALESCE_WINDOW_MS}`,
    ]);
  });
});

describe('connection', () => {
  it('does not refetch on the first connect', () => {
    // The query has just fetched on mount; refetching here would double-fetch
    // every time the board opens.
    const { commands } = run([{ kind: 'connected', at: 0 }]);
    expect(commands).toEqual(['none']);
  });

  it('refetches on a reconnect, because events during the gap are lost', () => {
    const { commands } = run([
      { kind: 'connected', at: 0 },
      { kind: 'disconnected', at: 10 },
      { kind: 'connected', at: 20 },
    ]);
    expect(commands).toEqual(['none', 'none', 'refetch-now']);
  });

  it('commands nothing on a disconnect', () => {
    const { commands } = run([{ kind: 'disconnected', at: 0 }]);
    expect(commands).toEqual(['none']);
  });

  it('is not throttled — a reconnect always refetches', () => {
    const { commands } = run([
      { kind: 'connected', at: 0 },
      { kind: 'foreground', at: 10 },
      { kind: 'disconnected', at: 20 },
      { kind: 'connected', at: 30 },
    ]);
    expect(commands).toEqual(['none', 'refetch-now', 'none', 'refetch-now']);
  });
});

describe('foreground', () => {
  it('refetches, since the socket may have died silently', () => {
    const { commands } = run([{ kind: 'foreground', at: 0 }]);
    expect(commands).toEqual(['refetch-now']);
  });

  it('throttles a rapid second foreground', () => {
    const { commands } = run([
      { kind: 'foreground', at: 0 },
      { kind: 'foreground', at: FOREGROUND_THROTTLE_MS - 1 },
    ]);
    expect(commands).toEqual(['refetch-now', 'none']);
  });

  it('refetches again once the throttle window has passed', () => {
    const { commands } = run([
      { kind: 'foreground', at: 0 },
      { kind: 'foreground', at: FOREGROUND_THROTTLE_MS },
    ]);
    expect(commands).toEqual(['refetch-now', 'refetch-now']);
  });

  it('does not add a second request on top of a pending broadcast refetch', () => {
    // Scheduling records the moment the refetch will RUN, so a foreground
    // landing inside the window sees a refetch already coming and stands down.
    const { commands } = run([
      { kind: 'broadcast', at: 0 },
      { kind: 'foreground', at: 100 },
    ]);
    expect(commands).toEqual([`refetch-after:${COALESCE_WINDOW_MS}`, 'none']);
  });
});

describe('composition', () => {
  it('cancels a pending coalesced refetch when one fires immediately', () => {
    const { state, commands } = run([
      { kind: 'connected', at: 0 },
      { kind: 'broadcast', at: 10 },
      { kind: 'disconnected', at: 20 },
      { kind: 'connected', at: 30 },
    ]);
    expect(commands).toEqual([
      'none',
      `refetch-after:${COALESCE_WINDOW_MS}`,
      'none',
      'refetch-now',
    ]);
    // The consumer clears its timer on refetch-now; the state must agree, or a
    // later broadcast would be swallowed as "already pending".
    expect(state.pendingUntil).toBeNull();
  });

  it('produces one refetch for a reconnect followed by a foreground', () => {
    // The ordinary sequence when returning to the app.
    const { commands } = run([
      { kind: 'connected', at: 0 },
      { kind: 'disconnected', at: 10 },
      { kind: 'connected', at: 20 },
      { kind: 'foreground', at: 25 },
    ]);
    expect(commands).toEqual(['none', 'none', 'refetch-now', 'none']);
  });
});
