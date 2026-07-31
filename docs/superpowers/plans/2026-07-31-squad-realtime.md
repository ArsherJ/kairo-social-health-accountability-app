# Squad Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The squad leaderboard reorders itself when a squadmate's score changes, without the user pulling to refresh.

**Architecture:** The server half already exists and is live — a trigger on `daily_scores` broadcasts to a `squad:<id>` topic, gated by RLS on `realtime.messages`. This is client work only: a pure reducer that decides *when* to refetch, a thin hook that owns the channel and the `AppState` listener, and one line in `Leaderboard.tsx`. The broadcast payload is discarded; a refetch always goes through `squad_leaderboard`.

**Tech Stack:** Expo SDK 57 · React Native 0.86 · TanStack Query · `@supabase/supabase-js` 2.110.9 · Vitest

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-31-squad-realtime-design.md`. `§` references point to `Kairo_Master_Summary.md` v1.3.
- **Read `CLAUDE.md` first.** It documents the architecture, the environment constraints, and the invariants.
- **No new npm dependencies.**
- **This plan adds no migration.** The trigger and the RLS policy already exist and were verified live on 2026-07-31.
- **`realtime-policy.ts` must have zero imports.** Root Vitest has no `@/` alias and cannot parse React Native's Flow syntax, so any file with a `*.test.ts` beside it must import only relative paths and plain TypeScript. This has blocked a task before — take it literally.
- **Never read another user's `profiles` or `health_buckets` row**, and never read the broadcast payload. Everything about a squadmate comes through `squad_leaderboard`.
- Imports use explicit `.ts` / `.tsx` extensions. `@/*` maps to `./src/*`.
- Comments explain *why*, not *what*.
- Stage only the files a task names, by explicit path. Never `git add -A`.
- Theme tokens live in `src/theme.ts`. No new colours — this feature adds no UI.

---

## Context a fresh session does not have

### What is already live — do NOT rebuild it

Verified against project `zniopywbwenrzxezolwv` on 2026-07-31:

- `broadcast_score_change()` — `after insert or update` trigger on `daily_scores`, enabled (`pg_trigger.tgenabled = 'O'`). It calls `realtime.broadcast_changes` once per squad the scoring user belongs to, on topic `squad:<squad_id>`.
- `squad_members_receive_squad_broadcasts` — RLS policy on `realtime.messages`, gating those topics on `is_squad_member()`. **A client that subscribes without `private: true` receives nothing.**

### Realtime auth needs no code

`SupabaseClient`'s constructor calls `_listenForAuthEvents()`, which calls `realtime.setAuth(token)` on `INITIAL_SESSION`, `SIGNED_IN` and `TOKEN_REFRESHED`, and clears it on `SIGNED_OUT` (`node_modules/@supabase/supabase-js/src/SupabaseClient.ts`, lines 411 and 659–681). **Do not add a `setAuth()` call.** An earlier design draft had one; it is redundant.

### Realtime is not a delivery guarantee

Backgrounding the app drops the socket and events during that window are gone — nothing replays them. The subscription is an optimisation *over* refetching, never the source of truth. This is why every reconnect and every foreground forces a refetch, and why a dropped socket produces no error UI.

### Environment constraints

Port 5432 is blocked, Supabase's direct host is IPv6-only here, and Docker is unavailable. `supabase db push`, `psql` and `supabase start` all fail; none of that indicates a broken project. What works, all HTTPS: `./supabase/scripts/remote-sql.sh`, `supabase functions deploy`, and the PGlite harness (`npm run test:schema`).

### The PGlite harness cannot test this

`supabase/tests/harness.ts` stubs the `realtime` schema. It can prove the policy exists; it cannot prove a message is delivered. **Do not add a schema test asserting the broadcast "worked"** — it would be a test of the stub. Task 3's live check is the only verification that covers delivery, which is why it is required rather than optional.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `src/features/squad/realtime-policy.ts` | Pure: given an event, decide whether and when to refetch |
| `src/features/squad/realtime-policy.test.ts` | Node tests for the above |
| `src/features/squad/useSquadRealtime.ts` | Channel lifecycle, `AppState`, executes the policy's commands |

**Modified:** `src/features/squad/queries.ts` · `src/features/squad/Leaderboard.tsx` · `docs/roadmap.md`

---

## Task 1: The refetch policy

The decision of *when* to refetch is the only part of this feature that can be tested without a network, so it lives in its own zero-import module — the same shape as `src/features/auth/route.ts` and `src/features/health/permission-state.ts`.

Time is always an argument. No `Date.now()` inside this module, matching `kairo-core`'s discipline and for the same reason: it makes burst and throttle behaviour testable without faking timers.

**Files:**
- Create: `src/features/squad/realtime-policy.ts`
- Create: `src/features/squad/realtime-policy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all imported by Task 2:
  - `COALESCE_WINDOW_MS: 400`, `FOREGROUND_THROTTLE_MS: 2000`
  - `type RealtimePolicyInput = { kind: 'broadcast' | 'connected' | 'disconnected' | 'foreground'; at: number }`
  - `type RealtimePolicyCommand = { kind: 'none' } | { kind: 'refetch-now' } | { kind: 'refetch-after'; delayMs: number }`
  - `type RealtimePolicyState = { everConnected: boolean; pendingUntil: number | null; lastRefetchAt: number | null }`
  - `const initialPolicyState: RealtimePolicyState`
  - `function reduceRealtimePolicy(state: RealtimePolicyState, input: RealtimePolicyInput): [RealtimePolicyState, RealtimePolicyCommand]`

- [ ] **Step 1: Write the failing tests**

Create `src/features/squad/realtime-policy.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts src/features/squad/realtime-policy.test.ts
```

Expected: FAIL — cannot resolve `./realtime-policy.ts`.

- [ ] **Step 3: Write the module**

Create `src/features/squad/realtime-policy.ts` — **zero imports**:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts src/features/squad/realtime-policy.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/features/squad/realtime-policy.ts src/features/squad/realtime-policy.test.ts
git commit -m "Add the squad board refetch policy

Realtime drops events while the app is backgrounded and nothing replays
them, so a reconnect and a foreground both force a fetch and the
subscription is only an optimisation over refetching. Bursts from
finalize-days coalesce into one request."
```

---

## Task 2: The subscription

**Files:**
- Create: `src/features/squad/useSquadRealtime.ts`
- Modify: `src/features/squad/queries.ts`
- Modify: `src/features/squad/Leaderboard.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces; `supabase` from `@/lib/supabase.ts`; `squadKeys` from `./queries.ts`
- Produces: `useSquadRealtime(squadId: string | undefined): void` and `squadKeys.boardAll(squadId)`

- [ ] **Step 1: Add the prefix query key**

In `src/features/squad/queries.ts`, add `boardAll` to the existing `squadKeys` object, leaving `mine` and `board` unchanged:

```ts
export const squadKeys = {
  mine: (userId: string | undefined) => ['squad', 'mine', userId ?? 'none'] as const,
  board: (squadId: string | undefined, mode: LeaderboardMode) =>
    ['squad', 'board', squadId ?? 'none', mode] as const,
  /**
   * Prefix of every `board` key for this squad, both modes.
   *
   * A score change can move either board, and the user can toggle to the mode
   * that was not invalidated — so one broadcast refreshes both rather than
   * leaving a stale board one tap away.
   */
  boardAll: (squadId: string | undefined) =>
    ['squad', 'board', squadId ?? 'none'] as const,
};
```

- [ ] **Step 2: Write the hook**

Create `src/features/squad/useSquadRealtime.ts`:

```tsx
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { squadKeys } from './queries.ts';
import {
  initialPolicyState,
  reduceRealtimePolicy,
  type RealtimePolicyInput,
  type RealtimePolicyState,
} from './realtime-policy.ts';

/**
 * Keeps the squad board current.
 *
 * The trigger on `daily_scores` broadcasts to `squad:<id>`, and the RLS policy
 * on `realtime.messages` admits only squad members — which is why the channel
 * must be `private: true`. Subscribing without it receives nothing at all.
 *
 * Every decision about *when* to refetch lives in realtime-policy.ts, which is
 * testable in plain Node. This hook is the I/O around it.
 */
export function useSquadRealtime(squadId: string | undefined): void {
  const queryClient = useQueryClient();
  const state = useRef<RealtimePolicyState>(initialPolicyState);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!squadId) return;

    state.current = initialPolicyState;

    function clearTimer() {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }

    function refetch() {
      void queryClient.invalidateQueries({
        queryKey: squadKeys.boardAll(squadId),
      });
    }

    function dispatch(input: RealtimePolicyInput) {
      const [next, command] = reduceRealtimePolicy(state.current, input);
      state.current = next;

      if (command.kind === 'refetch-now') {
        clearTimer();
        refetch();
      } else if (command.kind === 'refetch-after') {
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          refetch();
        }, command.delayMs);
      }
    }

    const channel = supabase
      .channel(`squad:${squadId}`, { config: { private: true } })
      // The payload is deliberately not a parameter. broadcast_changes ships a
      // whole daily_scores row — per-stat points, sabotage_delta, xp_awarded —
      // which is more than squad_leaderboard exposes. Reading it would make the
      // privacy projection (§5) a convention rather than a structure. The
      // broadcast means only "something in this squad changed".
      .on('broadcast', { event: '*' }, () => {
        dispatch({ kind: 'broadcast', at: Date.now() });
      })
      .subscribe((status) => {
        // CHANNEL_ERROR, TIMED_OUT and CLOSED are all "we are not receiving",
        // and none of them is worth showing the user: the board still has
        // pull-to-refresh and the foreground refetch. A live-updating screen
        // that breaks when the socket drops would be worse than one that never
        // claimed to be live.
        dispatch({
          kind: status === 'SUBSCRIBED' ? 'connected' : 'disconnected',
          at: Date.now(),
        });
      });

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') dispatch({ kind: 'foreground', at: Date.now() });
    });

    return () => {
      clearTimer();
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [squadId, queryClient]);
}
```

- [ ] **Step 3: Call it from the board**

In `src/features/squad/Leaderboard.tsx`, add the import beside the existing `./queries.ts` import:

```tsx
import { useSquadRealtime } from './useSquadRealtime.ts';
```

and call it immediately after the existing `useSquadLeaderboard` line:

```tsx
  const board = useSquadLeaderboard(squad.id, mode);

  // Subscribed for as long as the board is mounted. Expo Router keeps tab
  // screens mounted, so the channel survives tab switches, which is both
  // correct and free.
  useSquadRealtime(squad.id);
```

Change nothing else in this file. In particular, do **not** add a connection indicator — silent degradation is the decision.

- [ ] **Step 4: Run the suite and typecheck**

```bash
npm test
npm run typecheck
```

Expected: all passing, 0 typecheck errors. No new schema test — see "The PGlite harness cannot test this" above.

- [ ] **Step 5: Commit**

```bash
git add src/features/squad/useSquadRealtime.ts src/features/squad/queries.ts src/features/squad/Leaderboard.tsx
git commit -m "Subscribe the squad board to score broadcasts

The payload is discarded and the refetch goes through squad_leaderboard,
so the privacy projection stays the only path squad data reaches the
client. A dropped socket is not surfaced: pull-to-refresh and the
foreground refetch already cover it."
```

---

## Task 3: Verify against the live project

This is the only step that proves delivery, since PGlite stubs the `realtime` schema. Do not skip it and do not substitute a unit test for it.

**Files:**
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing consumed later

- [ ] **Step 1: Run the app**

```bash
npm run ios
```

Open the Squad tab. Your account is in the seeded "Test Squad" (6 members, invite code `N2HDW2`).

- [ ] **Step 2: Change a squadmate's score from the shell and watch the board**

Leave the simulator on the Squad tab, **Today** mode, and do not touch it. Rival1 is normally the `sedentary` persona at ≈1,100, sitting mid-table. Re-seed today as `athlete` so its total jumps to ≈4,850 and it must move to first place:

```bash
set -a; . ./.env; set +a
SECRET=$(tr -d '\n' < supabase/.temp/seed-secret.txt)
# The rivals are all Asia/Manila, and a day is keyed by the member's OWN local
# date (§2). Using the shell's date would write to the wrong day whenever this
# machine's date differs from Manila's.
TODAY=$(TZ=Asia/Manila date +%Y-%m-%d)

curl -s -X POST \
  "https://zniopywbwenrzxezolwv.supabase.co/functions/v1/seed-health" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -H "x-seed-secret: $SECRET" \
  -d "{\"action\":\"seed-days\",\"userIds\":[\"bb072168-c01a-4c4f-8f05-07c49782a908\"],\"from\":\"$TODAY\",\"to\":\"$TODAY\",\"persona\":\"athlete\"}"
```

The `Authorization` header is required by the Functions gateway and is separate from `x-seed-secret`; without it you get `UNAUTHORIZED_NO_AUTH_HEADER`. The key in `.env` is named `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY`.

**Expected:** within roughly half a second, and with no interaction, Rival1's row moves to rank 1 showing ≈4,850. That is trigger → RLS → subscription → policy → refetch, proven end to end.

If nothing happens, work down this list before changing any code:

1. `private: true` missing from the channel config — the RLS policy then admits nothing and the symptom is silence, not an error.
2. The topic string must be exactly `squad:<uuid>`, matching the trigger's `'squad:' || v_squad_id::text`.
3. Confirm the write actually landed: `./supabase/scripts/remote-sql.sh "select user_id, local_date, total from public.daily_scores where local_date = current_date"`.

- [ ] **Step 3: Restore Rival1's persona**

Leaving one rival as an athlete would quietly change what every later screenshot of this squad looks like.

```bash
set -a; . ./.env; set +a
SECRET=$(tr -d '\n' < supabase/.temp/seed-secret.txt)
# The rivals are all Asia/Manila, and a day is keyed by the member's OWN local
# date (§2). Using the shell's date would write to the wrong day whenever this
# machine's date differs from Manila's.
TODAY=$(TZ=Asia/Manila date +%Y-%m-%d)

curl -s -X POST \
  "https://zniopywbwenrzxezolwv.supabase.co/functions/v1/seed-health" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -H "x-seed-secret: $SECRET" \
  -d "{\"action\":\"seed-days\",\"userIds\":[\"bb072168-c01a-4c4f-8f05-07c49782a908\"],\"from\":\"$TODAY\",\"to\":\"$TODAY\",\"persona\":\"sedentary\"}"
```

The board should reorder back on its own — a second confirmation of the same path.

- [ ] **Step 4: Verify the backgrounding path**

Send the app to the background (Cmd+Shift+H on the simulator), wait about ten seconds, then reopen it. The board should refetch on foreground. This is the path that matters most in practice: it is what makes the board correct on the morning open even though every broadcast sent overnight was lost.

- [ ] **Step 5: Update the roadmap**

In `docs/roadmap.md`:

- In **Phase 4**, change the Realtime bullet from `⬜` to `✅` and say what shipped: broadcasts refresh the board through `squad_leaderboard`, with reconnect and foreground refetches covering the events Realtime drops.
- In the **Phase 4 backend follow-ups** table, amend row 8 to record that Realtime is wired, and state plainly what remains: membership changes still do not broadcast, so a new member appears on the next refetch rather than instantly.

Leave row 9 (leaving a squad) untouched.

- [ ] **Step 6: Commit**

```bash
git add docs/roadmap.md
git commit -m "Record Realtime as delivered on the squad board

Verified live: re-seeding a rival's day reorders the board with no
interaction. Membership changes still do not broadcast."
```

---

## Notes for whoever executes this

**Things that will look wrong and are not:**

- The first `SUBSCRIBED` deliberately does not refetch. The query has just fetched on mount, and refetching there would double-fetch every time the board opens.
- `disconnected` commands nothing. It exists so that every `subscribe` status maps to an input rather than some being silently dropped; the reconnect logic rides on `everConnected`.
- A foreground immediately after a broadcast commands `none`. Scheduling records the moment the refetch will *run*, so the throttle correctly counts a pending refetch as already covering the user.
- Your own row may show a total of 0. Nothing reads HealthKit yet — that is Phase 3.

**Do not:**

- Add npm dependencies.
- Add a `supabase.realtime.setAuth()` call. `SupabaseClient` already does it on `INITIAL_SESSION`, `SIGNED_IN` and `TOKEN_REFRESHED`.
- Read the broadcast payload, or add a query that reads another user's `daily_scores`, `profiles` or `health_buckets` row.
- Add a PGlite test for broadcast delivery. The harness stubs the `realtime` schema; such a test would assert the stub.
- Add connection-state UI. Silent degradation is the decision.
- Write a migration. The trigger and policy are already live.
