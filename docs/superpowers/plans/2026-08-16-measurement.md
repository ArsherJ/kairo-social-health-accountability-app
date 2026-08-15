# Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the beta's activation funnel and retention answerable before user #1 arrives, since neither can be backfilled.

**Architecture:** Client telemetry keeps the existing house split — every decision lives in a zero-import pure module tested in Node, and `events.ts` stays thin I/O that never throws. Retention needs no new events at all: it is one SQL reporting function over `daily_scores`, which already carries a row per user per local date.

**Tech Stack:** TypeScript, Vitest (root config for `src/**`, package config for `kairo-core`), MMKV for durable client markers, Postgres via PGlite for schema tests.

**Spec:** `docs/superpowers/specs/2026-08-15-activation-and-measurement-design.md` — §4 in full, plus D39.

## Global Constraints

- **Telemetry never throws and never blocks a user action.** `track()`'s existing contract (`events.ts`) is not relaxed anywhere in this plan.
- **Root Vitest cannot resolve the `@/` alias and cannot parse React Native's Flow syntax.** Any module that must be unit-tested therefore imports **nothing** — this is why `sync-state.ts` and `ask-order.ts` look the way they do. Modules importing `@/lib/supabase.ts` or `react-native-mmkv` are I/O and are verified by hand.
- **`health_ask_completed` must never claim granted or denied.** HealthKit does not report read-permission denial; the payload carries the resulting `HealthPermissionState` only (spec §1.2, §4.2).
- **`app_events.type` is `check (char_length(type) between 1 and 64)`.** Every new event name must fit.
- **`app_events.user_id` references `auth.users`, not `profiles`** (migration `20260811130000`). Events may be written before a profile row exists.
- **`app_events` INSERT is a table-level grant, not column-scoped like `profiles`.** `app_events_insert_own` checks only `user_id = auth.uid()`, so Task 2 may write `occurred_at` explicitly. This was verified against `20260727120400_rls.sql:234`; do not re-derive it, and do not "fix" the flush by dropping the column.
- Imports use explicit `.ts` extensions.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Events this plan delivers

| Event | Call site | Task |
|---|---|---|
| `first_sync_seen` | first successful sync returning data | 4 |
| `onboarding_started` | first onboarding screen shown | 5 |
| `health_ask_completed` | HealthKit sheet returns | 5 |
| `profile_created` | `useCreateProfile` succeeds | 5 |
| `squad_created` / `squad_joined` | respective mutation succeeds | 5 |
| `goal_created` | `useCreateGoal` succeeds | 5 |
| `first_score_seen` | home screen first shows a non-zero day | 6 |

`disclosure_unlocked` is **deliberately not in this plan** — its call site is the disclosure gate, which Plan 2 builds. The vocabulary entry is added in Task 2 so Plan 2 only wires it.

---

### Task 1: The pre-auth telemetry buffer

`track()` returns `false` when `userId` is undefined, so events fired before sign-in are dropped. Plan 2 adds a screen *before* sign-in, which would make the one screen added to fix activation the one screen we cannot measure (spec §4.4).

This task is the pure half: a buffer with no imports, fully testable.

**Files:**
- Create: `src/features/telemetry/buffer.ts`
- Test: `src/features/telemetry/buffer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BufferedEvent = { type: string; payload: Record<string, unknown>; occurredAt: number }`
  - `const MAX_BUFFERED_EVENTS = 20`
  - `function bufferEvent(buffer: readonly BufferedEvent[], event: BufferedEvent): BufferedEvent[]`
  - `function drainBuffer(buffer: readonly BufferedEvent[]): { drained: BufferedEvent[]; next: BufferedEvent[] }`

- [ ] **Step 1: Write the failing test**

Create `src/features/telemetry/buffer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  MAX_BUFFERED_EVENTS,
  bufferEvent,
  drainBuffer,
  type BufferedEvent,
} from './buffer.ts';

function event(type: string, occurredAt: number): BufferedEvent {
  return { type, payload: {}, occurredAt };
}

describe('bufferEvent', () => {
  it('appends in order', () => {
    const one = bufferEvent([], event('a', 1));
    const two = bufferEvent(one, event('b', 2));

    expect(two.map((e) => e.type)).toEqual(['a', 'b']);
  });

  it('does not mutate the buffer it is given', () => {
    const initial: BufferedEvent[] = [event('a', 1)];
    bufferEvent(initial, event('b', 2));

    expect(initial).toHaveLength(1);
  });

  // The buffer exists for a handful of pre-auth screens. An unbounded one is a
  // memory leak for anyone who opens the app and never signs in.
  it('drops the oldest past the cap', () => {
    let buffer: BufferedEvent[] = [];
    for (let i = 0; i < MAX_BUFFERED_EVENTS + 5; i += 1) {
      buffer = bufferEvent(buffer, event(`e${i}`, i));
    }

    expect(buffer).toHaveLength(MAX_BUFFERED_EVENTS);
    expect(buffer[0]?.type).toBe('e5');
  });
});

describe('drainBuffer', () => {
  it('returns everything and empties the buffer', () => {
    const buffer = [event('a', 1), event('b', 2)];
    const { drained, next } = drainBuffer(buffer);

    expect(drained.map((e) => e.type)).toEqual(['a', 'b']);
    expect(next).toEqual([]);
  });

  it('is safe on an empty buffer', () => {
    expect(drainBuffer([])).toEqual({ drained: [], next: [] });
  });

  // The whole point of buffering: the row must record when the user was on the
  // screen, not when the flush happened after sign-in.
  it('preserves original timestamps', () => {
    const { drained } = drainBuffer([event('a', 1_000)]);

    expect(drained[0]?.occurredAt).toBe(1_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/telemetry/buffer.test.ts`

Expected: FAIL — `Failed to resolve import "./buffer.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/telemetry/buffer.ts`:

```typescript
/**
 * Events fired before there is a user to attribute them to.
 *
 * `track()` needs a `userId` — `app_events.user_id` is the row's identity — so
 * anything recorded on the sign-in screen has nowhere to go until the session
 * exists. Dropping them would make the pre-auth pitch the one screen the
 * activation funnel cannot see, which is exactly the screen the funnel was
 * added to judge.
 *
 * **Zero imports**, so root Vitest can load it: that config has no `@/` alias
 * and cannot parse React Native's Flow syntax. Same constraint, and the same
 * reason, as `sync-state.ts` and `ask-order.ts`.
 */

export type BufferedEvent = {
  type: string;
  payload: Record<string, unknown>;
  /** Epoch ms at the moment the event happened, never at flush time. */
  occurredAt: number;
};

/**
 * Capped, because someone who opens the app and never signs in would otherwise
 * accumulate rows forever. Generous against the handful of pre-auth screens
 * that exist — reaching this cap means something is firing in a loop.
 */
export const MAX_BUFFERED_EVENTS = 20;

/** Append, oldest dropped first past the cap. Never mutates its argument. */
export function bufferEvent(
  buffer: readonly BufferedEvent[],
  event: BufferedEvent,
): BufferedEvent[] {
  const next = [...buffer, event];
  return next.slice(Math.max(0, next.length - MAX_BUFFERED_EVENTS));
}

/**
 * Take everything, leaving the buffer empty.
 *
 * Returns the next buffer rather than clearing in place so the caller decides
 * when the drain is committed — a flush whose writes fail should not be able to
 * lose events that were never sent.
 */
export function drainBuffer(buffer: readonly BufferedEvent[]): {
  drained: BufferedEvent[];
  next: BufferedEvent[];
} {
  return { drained: [...buffer], next: [] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/telemetry/buffer.test.ts`

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/telemetry/buffer.ts src/features/telemetry/buffer.test.ts
git commit -m "$(cat <<'EOF'
feat: a buffer for events fired before sign-in

track() needs a userId, so anything recorded on the sign-in screen has
nowhere to go. Plan 2 puts the pitch there — without this, the screen
added to fix activation is the one the funnel cannot see.

Zero imports so root Vitest can load it, the same constraint sync-state.ts
already records.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Event vocabulary, and `track()` learns to buffer

**Files:**
- Modify: `src/features/telemetry/events.ts`
- Modify: `app/_layout.tsx` (flush on session arrival)

**Interfaces:**
- Consumes: `bufferEvent`, `drainBuffer`, `BufferedEvent`, `MAX_BUFFERED_EVENTS` from Task 1.
- Produces:
  - `AppEventType` extended with `'onboarding_started' | 'health_ask_completed' | 'profile_created' | 'first_score_seen' | 'squad_created' | 'squad_joined' | 'goal_created' | 'disclosure_unlocked'`
  - `function flushTelemetryBuffer(userId: string): Promise<void>`
  - `track()` signature unchanged: `(userId: string | undefined, type: AppEventType, payload?: Record<string, unknown>) => Promise<boolean>`

There is no Node test for this task — `events.ts` imports `@/lib/supabase.ts`, which root Vitest cannot resolve. That is why Task 1 exists as a separate, tested module. Verification here is `npm run typecheck` plus the hand check in Step 4.

- [ ] **Step 1: Extend the vocabulary and add buffering**

In `src/features/telemetry/events.ts`, replace the `AppEventType` union with:

```typescript
export type AppEventType =
  | 'first_sync_seen'
  | 'squad_program_selected'
  // Read by dispatch-notifications, not only by analysis: §14's "Day starts"
  // fires mid-morning *only if the app has not been opened yet*, and this row
  // is the entire signal behind that condition.
  | 'app_open'
  // The two failures that used to leave no trace anywhere. Both are silent by
  // construction rather than by oversight — the app looks fine while the thing
  // it depends on is not working — so the event row is the only evidence a
  // beta report can be checked against.
  | 'timezone_sync_failed'
  | 'health_permission_failed'
  // The activation funnel. Added 2026-08-16; before it, the beta could measure
  // retention (SQL over daily_scores) but not activation, so the six-week test
  // the outside review asked for could not be run at all.
  | 'onboarding_started'
  // Payload carries the resulting HealthPermissionState and **never** a
  // granted/denied verdict: HealthKit does not report read-permission denial,
  // and an event asserting otherwise would be believed.
  | 'health_ask_completed'
  | 'profile_created'
  | 'first_score_seen'
  | 'squad_created'
  | 'squad_joined'
  | 'goal_created'
  | 'disclosure_unlocked';
```

Add the import at the top of the file:

```typescript
import { bufferEvent, drainBuffer, type BufferedEvent } from './buffer.ts';
```

Then replace the early return in `track()` and add the flush below it:

```typescript
/**
 * Events recorded before a session exists. Module state rather than MMKV: this
 * spans one launch of the app, and an event that did not survive a cold start
 * belongs to a session that never signed in.
 */
let pending: BufferedEvent[] = [];

export async function track(
  userId: string | undefined,
  type: AppEventType,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  // Held rather than dropped, and flushed by flushTelemetryBuffer once the
  // session arrives. `false` still means "no row landed", which is what
  // callers that dedupe are asking about.
  if (!userId) {
    pending = bufferEvent(pending, { type, payload, occurredAt: Date.now() });
    return false;
  }

  // `await`ed rather than `.then()`-chained because PostgREST's builder is a
  // thenable, not a Promise — chaining it yields `PromiseLike<boolean>`, which
  // has no `.catch`, and callers would inherit that sharp edge.
  const { error } = await supabase
    .from('app_events')
    .insert({ user_id: userId, type, payload });

  if (error) {
    console.warn('[telemetry]', type, error.code, error.message);
    return false;
  }
  return true;
}

/**
 * Attribute everything buffered before sign-in to the session that just began.
 *
 * `occurred_at` is written explicitly from the buffered timestamp rather than
 * taking the column default, or every pre-auth event would land stamped with
 * the moment the user finished authenticating — which is precisely the interval
 * the pitch screen is being measured on.
 *
 * The buffer is drained **before** the write. A failed flush loses the events
 * rather than retrying: they are one screen's worth of context, and a retry
 * loop against a backend that is refusing writes is worse than the gap.
 */
export async function flushTelemetryBuffer(userId: string): Promise<void> {
  const { drained, next } = drainBuffer(pending);
  pending = next;
  if (drained.length === 0) return;

  const { error } = await supabase.from('app_events').insert(
    drained.map((event) => ({
      user_id: userId,
      type: event.type,
      payload: event.payload,
      occurred_at: new Date(event.occurredAt).toISOString(),
    })),
  );

  if (error) console.warn('[telemetry] flush', error.code, error.message);
}
```

- [ ] **Step 2: Flush when the session arrives**

In `app/_layout.tsx`, find where the session is read for `resolveRoute` (around line 111). Add the import:

```typescript
import { flushTelemetryBuffer } from '@/features/telemetry/events.ts';
```

and, inside the component, an effect keyed on the user id:

```typescript
  // Pre-auth events have no user to hang from until now. Fire-and-forget, and
  // guarded on the id so it runs once per sign-in rather than once per render.
  useEffect(() => {
    if (!userId) return;
    void flushTelemetryBuffer(userId);
  }, [userId]);
```

If `userId` is not already in scope in that component, derive it from the same session object `resolveRoute` is fed — do not add a second session query.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS, all three checks.

- [ ] **Step 4: Verify by hand against the live project**

Build and run the app on the simulator, sign in, then confirm the row landed:

```bash
./supabase/scripts/remote-sql.sh "select type, occurred_at from app_events order by occurred_at desc limit 5"
```

Expected: recent rows. Nothing pre-auth fires yet (that is Plan 2), so this confirms `track()` is unbroken rather than confirming the buffer path.

- [ ] **Step 5: Commit**

```bash
git add src/features/telemetry/events.ts app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat: the activation funnel's vocabulary, and a flush for pre-auth events

Adds the eight event types the funnel needs and teaches track() to hold
events fired without a session, flushed on sign-in with the original
timestamp — otherwise every pre-auth event lands stamped with the moment
authentication finished, which is the exact interval being measured.

disclosure_unlocked is declared here and fired by Plan 2, so that plan
only wires a call site.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: A durable once-ever marker

`first_sync_seen` and `first_score_seen` are once-in-a-lifetime events. `useAppOpenTelemetry`'s module-level marker is deliberately per-session and will not do: a cold start would fire them again every launch.

**Files:**
- Create: `src/features/telemetry/milestones.ts`
- Create: `src/features/telemetry/milestone-store.ts`
- Test: `src/features/telemetry/milestones.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Milestone = 'first_sync_seen' | 'first_score_seen'`
  - `function shouldFire(reached: readonly Milestone[], milestone: Milestone): boolean` (in `milestones.ts`, zero imports)
  - `function hasReached(userId: string, milestone: Milestone): boolean` and `function markReached(userId: string, milestone: Milestone): void` (in `milestone-store.ts`, MMKV I/O, no Node test)

- [ ] **Step 1: Write the failing test**

Create `src/features/telemetry/milestones.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { shouldFire, type Milestone } from './milestones.ts';

describe('shouldFire', () => {
  it('fires a milestone that has not been reached', () => {
    expect(shouldFire([], 'first_sync_seen')).toBe(true);
  });

  it('does not fire one already reached', () => {
    expect(shouldFire(['first_sync_seen'], 'first_sync_seen')).toBe(false);
  });

  it('treats milestones independently', () => {
    const reached: Milestone[] = ['first_sync_seen'];

    expect(shouldFire(reached, 'first_score_seen')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/telemetry/milestones.test.ts`

Expected: FAIL — `Failed to resolve import "./milestones.ts"`.

- [ ] **Step 3: Write both modules**

Create `src/features/telemetry/milestones.ts`:

```typescript
/**
 * Events that may fire exactly once in an account's life.
 *
 * Split from the MMKV store beside it so the rule is testable in Node: root
 * Vitest cannot load `react-native-mmkv`. The same split `sync-state.ts` and
 * `storage.ts` already use.
 */

export type Milestone = 'first_sync_seen' | 'first_score_seen';

export function shouldFire(
  reached: readonly Milestone[],
  milestone: Milestone,
): boolean {
  return !reached.includes(milestone);
}
```

Create `src/features/telemetry/milestone-store.ts`:

```typescript
import { createMMKV } from 'react-native-mmkv';
import type { Milestone } from './milestones.ts';

/**
 * Which once-ever events this account has already recorded.
 *
 * MMKV rather than module state: `useAppOpenTelemetry`'s marker is per-session
 * on purpose, and reusing that shape here would re-fire `first_sync_seen` on
 * every cold start — turning the single most important activation event into a
 * launch counter.
 *
 * Its own storage id rather than sharing `kairo.health`: clearing sync state
 * must not reset the funnel, and the two have different lifetimes.
 */
const storage = createMMKV({ id: 'kairo.telemetry' });

/** Keyed per user, so signing in as someone else starts their funnel fresh. */
function key(userId: string, milestone: Milestone): string {
  return `milestone.v1.${userId}.${milestone}`;
}

export function hasReached(userId: string, milestone: Milestone): boolean {
  return storage.getBoolean(key(userId, milestone)) === true;
}

export function markReached(userId: string, milestone: Milestone): void {
  storage.set(key(userId, milestone), true);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/telemetry/milestones.test.ts`

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/telemetry/milestones.ts src/features/telemetry/milestone-store.ts src/features/telemetry/milestones.test.ts
git commit -m "$(cat <<'EOF'
feat: a durable marker for once-ever funnel events

useAppOpenTelemetry's marker is per-session by design; reusing that shape
for first_sync_seen would re-fire it on every cold start and turn the most
important activation event into a launch counter.

Rule and storage split so the rule is testable in Node.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Fire `first_sync_seen`

It is declared in `AppEventType` and called from nowhere (spec §1.3). This is the activation moment the whole funnel converges on.

**Files:**
- Modify: `src/features/health/sync-state.ts`
- Modify: `src/features/health/sync-state.test.ts`
- Modify: `src/features/health/useHealthSync.ts`

**Interfaces:**
- Consumes: `hasReached`, `markReached` (Task 3); `track` (Task 2); `SyncOutcome` from `sync.ts` (`{ ok: boolean; retryable: boolean; syncedDates: string[]; error?: string }`).
- Produces: `function isFirstDataSync(state: SyncState, outcome: { ok: boolean; syncedDates: string[] }): boolean` in `sync-state.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/features/health/sync-state.test.ts`:

```typescript
describe('isFirstDataSync', () => {
  const fresh: SyncState = { ...initialSyncState };
  const synced: SyncState = { ...initialSyncState, lastSyncedAt: 1_000 };

  it('is true for the first successful sync that wrote a day', () => {
    expect(isFirstDataSync(fresh, { ok: true, syncedDates: ['2026-08-16'] })).toBe(true);
  });

  // A user who grants permission with no data on the device syncs successfully
  // and writes nothing. That is not activation — it is an empty phone.
  it('is false when the sync wrote no days', () => {
    expect(isFirstDataSync(fresh, { ok: true, syncedDates: [] })).toBe(false);
  });

  it('is false for a failed sync', () => {
    expect(isFirstDataSync(fresh, { ok: false, syncedDates: [] })).toBe(false);
  });

  it('is false once a sync has already succeeded', () => {
    expect(isFirstDataSync(synced, { ok: true, syncedDates: ['2026-08-16'] })).toBe(false);
  });
});
```

Add `isFirstDataSync` to the existing import from `./sync-state.ts` at the top of that file, and `initialSyncState` / `type SyncState` if not already imported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/health/sync-state.test.ts`

Expected: FAIL — `isFirstDataSync is not a function`.

- [ ] **Step 3: Implement it**

Append to `src/features/health/sync-state.ts`:

```typescript
/**
 * Whether this outcome is the account's first sync that actually carried data.
 *
 * `lastSyncedAt === null` is the durable "never succeeded" marker, and a
 * non-empty `syncedDates` is what separates activation from a granted
 * permission over an empty phone — the second is a real state (a new device, a
 * user who has never carried it) and calling it activation would inflate the
 * one number the funnel exists to report.
 *
 * Takes the outcome's shape structurally rather than importing `SyncOutcome`,
 * because this file has zero imports so root Vitest can load it.
 */
export function isFirstDataSync(
  state: SyncState,
  outcome: { ok: boolean; syncedDates: string[] },
): boolean {
  return state.lastSyncedAt === null && outcome.ok && outcome.syncedDates.length > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/health/sync-state.test.ts`

Expected: PASS, including the four new cases.

- [ ] **Step 5: Wire the call site**

In `src/features/health/useHealthSync.ts`, add the imports:

```typescript
import { track } from '@/features/telemetry/events.ts';
import { hasReached, markReached } from '@/features/telemetry/milestone-store.ts';
import { isFirstDataSync } from './sync-state.ts';
```

Find where `runHealthSync` resolves and its outcome is handled. **Read the state before the sync runs** — `runHealthSync` calls `saveSyncState` internally, so a read afterwards already has `lastSyncedAt` set and `isFirstDataSync` would always be false:

```typescript
      // Read *before* runHealthSync, which persists lastSyncedAt on success —
      // reading after would make isFirstDataSync unconditionally false, and the
      // event would never fire at all.
      const before = loadSyncState(userId);
      const outcome = await runHealthSync(userId, timeZone, new Date());

      if (
        isFirstDataSync(before, outcome) &&
        !hasReached(userId, 'first_sync_seen')
      ) {
        markReached(userId, 'first_sync_seen');
        void track(userId, 'first_sync_seen', { days: outcome.syncedDates.length });
      }
```

`loadSyncState` is already imported in this file.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/health/sync-state.ts src/features/health/sync-state.test.ts src/features/health/useHealthSync.ts
git commit -m "$(cat <<'EOF'
feat: fire first_sync_seen, which was declared and called nowhere

The most important activation event in the vocabulary was dead code, in a
file whose own header says the dataset is impossible to backfill.

A successful sync that wrote no days is not activation — it is an empty
phone — so the rule tests syncedDates, not just ok. State is read before
runHealthSync because that call persists lastSyncedAt on success.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The funnel's call sites

Six events at five existing call sites. None is unit-testable in Node — every file imports the Supabase client — so this task is verified by typecheck plus a live query.

**Files:**
- Modify: `src/features/profile/create-profile.ts`
- Modify: `src/features/squad/mutations.ts`
- Modify: `src/features/goals/mutations.ts`
- Modify: `src/features/health/HealthPermissionSheet.tsx`
- Modify: `app/(onboard)/character.tsx`

**Interfaces:**
- Consumes: `track` and the event names from Task 2.
- Produces: no new exports.

- [ ] **Step 1: `profile_created`**

In `src/features/profile/create-profile.ts`, import `track` and extend `onSuccess`:

```typescript
    onSuccess: () => {
      void track(userId, 'profile_created');
      return queryClient.invalidateQueries({ queryKey: profileKey(userId) });
    },
```

Do **not** fire it on the `23505` early return. That path means an earlier attempt's INSERT already landed, so the event was already recorded — firing again would double-count the funnel's narrowest step.

- [ ] **Step 2: `squad_created` and `squad_joined`**

In `src/features/squad/mutations.ts`, import `track` and replace `useCreateSquad`'s `onSuccess` (currently a one-line arrow returning the invalidation) with:

```typescript
    onSuccess: (squad) => {
      void track(userId, 'squad_created', { program: squad.program });
      return queryClient.invalidateQueries({ queryKey: squadKeys.mine(userId) });
    },
```

Do the same for `useJoinSquad`, whose `mutationFn` also resolves to a `Squad`:

```typescript
    onSuccess: (squad) => {
      void track(userId, 'squad_joined', { program: squad.program });
      return queryClient.invalidateQueries({ queryKey: squadKeys.mine(userId) });
    },
```

If `useJoinSquad`'s existing `onSuccess` invalidates a different or additional key, keep exactly what is there and add only the `track` line above it — the invalidation set is not this task's business.

`squad_program_selected` already fires in `CreateSquadForm` and stays. The two are not duplicates: the form event records an intention, and this one records a squad that exists. A user who picks a program and then hits an error produces the first and not the second, which is the drop-off worth seeing.

- [ ] **Step 3: `goal_created`**

In `src/features/goals/mutations.ts`, add to `useCreateGoal`'s `onSuccess`:

```typescript
      void track(userId, 'goal_created', { kind: goal.kind, squad: goal.squadId !== null });
```

Payload carries no target value — a goal target is the user's own number and the funnel only needs to know a goal exists.

- [ ] **Step 4: `health_ask_completed`**

In `src/features/health/HealthPermissionSheet.tsx`, find where the HealthKit request resolves and fire:

```typescript
      // No granted/denied: HealthKit does not report read-permission denial, so
      // an event claiming either would be believed and wrong. The resulting
      // state is what is actually knowable.
      void track(userId, 'health_ask_completed', { state });
```

where `state` is the `HealthPermissionState` the request resolved to. If the sheet does not currently have `userId` in scope, pass it as a prop from the caller in `src/features/permissions/PermissionAsks.tsx` rather than adding a session query inside the sheet.

- [ ] **Step 5: `onboarding_started`**

In `app/(onboard)/character.tsx`, fire once on mount:

```typescript
  // The first onboarding screen today. Plan 2 inserts /connect ahead of it and
  // moves this call there — the event names the start of onboarding, not this
  // particular screen.
  useEffect(() => {
    void track(userId, 'onboarding_started');
  }, [userId]);
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 7: Verify against the live project**

Run the app on the simulator through onboarding, then:

```bash
./supabase/scripts/remote-sql.sh "select type, payload, occurred_at from app_events order by occurred_at desc limit 10"
```

Expected: `onboarding_started`, `health_ask_completed` and `profile_created` rows in that order, with `health_ask_completed`'s payload carrying a `state` of `asked` or `unavailable` and **no** granted/denied field.

- [ ] **Step 8: Commit**

```bash
git add src/features/profile/create-profile.ts src/features/squad/mutations.ts src/features/goals/mutations.ts src/features/health/HealthPermissionSheet.tsx "app/(onboard)/character.tsx"
git commit -m "$(cat <<'EOF'
feat: wire the activation funnel's call sites

profile_created, squad_created, squad_joined, goal_created,
health_ask_completed and onboarding_started.

profile_created deliberately does not fire on the 23505 path: that means an
earlier INSERT already landed, so the event was already recorded, and the
funnel's narrowest step is the worst place to double-count.

health_ask_completed carries the resulting permission state and no verdict —
HealthKit does not report read-permission denial.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fire `first_score_seen`

The moment the loop first pays out visibly. Distinct from `first_sync_seen`: data can land while the user is not looking, and this event is about the user seeing it.

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `hasReached`, `markReached` (Task 3); `track` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Wire it**

In `app/(tabs)/index.tsx`, add the imports and an effect that fires when a non-zero day is on screen:

```typescript
  // Distinct from first_sync_seen: data can land overnight while nobody is
  // looking. This is the first time the loop visibly paid out, which is the
  // moment activation is actually about.
  //
  // Guarded on total > 0 so a day that synced as zeros — a rest day, a phone
  // left at home — does not count as having seen progress.
  useEffect(() => {
    if (!userId) return;
    if (!today || today.total <= 0) return;
    if (hasReached(userId, 'first_score_seen')) return;

    markReached(userId, 'first_score_seen');
    void track(userId, 'first_score_seen');
  }, [userId, today]);
```

Use whatever the screen already calls the day's score object in place of `today` — do **not** add a second `useTodayScore` call.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Verify against the live project**

With a simulator account that has synced non-zero data, open the home tab, then:

```bash
./supabase/scripts/remote-sql.sh "select type, count(*) from app_events where type = 'first_score_seen' group by type"
```

Expected: exactly one row. Force-quit and relaunch the app, re-run the query, and confirm it is **still** one — that is the durable marker doing its job.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "$(cat <<'EOF'
feat: fire first_score_seen when the loop first visibly pays out

Distinct from first_sync_seen — data can land overnight while nobody is
looking. Guarded on a non-zero total so a rest day does not count as
having seen progress.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Retention, as SQL

Spec §4.3: retention needs no new events, because `daily_scores` already carries a row per user per local date. This is the cheap half of the review's kill signal.

**Files:**
- Create: `supabase/migrations/20260816120000_retention_reporting.sql`
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: `public.profiles (id, created_at)`, `public.daily_scores (user_id, local_date)`.
- Produces: `public.kairo_retention(p_day integer)` returning `table (cohort_date date, cohort_size bigint, retained bigint)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260816120000_retention_reporting.sql`:

```sql
-- Retention reporting (design 2026-08-15 §4.3).
--
-- The outside review's kill signal — "under 25% engaged by day 21" — needs no
-- new telemetry at all: daily_scores already holds a row per user per local
-- date, so activity retention is a query. Only *activation* needed events.
--
-- Nth-day retention, not "any activity up to day N": a user is retained on day
-- N if they have a scored day exactly N days after the day their profile was
-- created. That is the stricter reading and the one a kill signal should use.
--
-- Cohort day is profiles.created_at, not auth.users.created_at: a user who
-- signs in and never names a character has not started the loop, so counting
-- them as a cohort member would report the onboarding drop-off as churn.

begin;

create or replace function public.kairo_retention(p_day integer)
returns table (
  cohort_date date,
  cohort_size bigint,
  retained bigint
)
language sql
stable
set search_path = ''
as $$
  with cohort as (
    select id, (created_at at time zone 'UTC')::date as joined_on
    from public.profiles
  )
  select
    c.joined_on as cohort_date,
    count(*) as cohort_size,
    count(*) filter (
      where exists (
        select 1
        from public.daily_scores d
        where d.user_id = c.id
          and d.local_date = c.joined_on + p_day
      )
    ) as retained
  from cohort c
  group by c.joined_on
  order by c.joined_on;
$$;

comment on function public.kairo_retention(integer) is
  'Nth-day activity retention by signup cohort. A user counts as retained on day N when a daily_scores row exists for their cohort date + N. Cohort day is profiles.created_at, so a user who never finished onboarding is not counted as churn. Analytics only — EXECUTE is revoked from anon and authenticated.';

-- Creating a function grants EXECUTE to PUBLIC by default. This reads every
-- user's activity, so it must never be reachable from a client session.
revoke all on function public.kairo_retention(integer) from public;
revoke all on function public.kairo_retention(integer) from anon, authenticated;

commit;
```

- [ ] **Step 2: Write the failing schema test**

Append to `supabase/tests/schema.test.ts`, following the file's existing harness idiom:

```typescript
describe('kairo_retention', () => {
  it('counts a user as retained when they scored exactly N days after joining', async () => {
    const user = await createProfile(db, { createdAt: '2026-08-01T00:00:00Z' });
    await insertDailyScore(db, { userId: user, localDate: '2026-08-08', total: 3_000 });

    const d7 = await db.query<{ cohort_size: string; retained: string }>(
      `select cohort_size, retained from public.kairo_retention(7)
       where cohort_date = '2026-08-01'`,
    );

    expect(d7.rows[0]?.cohort_size).toBe('1');
    expect(d7.rows[0]?.retained).toBe('1');
  });

  it('does not count activity on a different day as day-N retention', async () => {
    const user = await createProfile(db, { createdAt: '2026-08-01T00:00:00Z' });
    await insertDailyScore(db, { userId: user, localDate: '2026-08-05', total: 3_000 });

    const d7 = await db.query<{ cohort_size: string; retained: string }>(
      `select cohort_size, retained from public.kairo_retention(7)
       where cohort_date = '2026-08-01'`,
    );

    expect(d7.rows[0]?.cohort_size).toBe('1');
    expect(d7.rows[0]?.retained).toBe('0');
  });

  // The function reads every user's activity. A client session reaching it
  // would be a projection leak of exactly the kind squad_leaderboard() exists
  // to prevent.
  it('is not executable by the authenticated role', async () => {
    await expect(
      asAuthenticated(db, () => db.query('select * from public.kairo_retention(7)')),
    ).rejects.toThrow(/permission denied/i);
  });
});
```

Use the file's own existing helpers for creating a profile, inserting a daily score, and running as the non-owner `authenticated` role. If a helper for `created_at` control does not exist, insert the profile row directly with an explicit `created_at` rather than adding a helper parameter used once.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "kairo_retention"`

Expected: FAIL — `function public.kairo_retention(integer) does not exist`, because the harness applies migrations from disk and the assertions have not been satisfied yet.

- [ ] **Step 4: Run the test to verify it passes**

The migration written in Step 1 is picked up by the harness automatically.

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "kairo_retention"`

Expected: PASS — 3 tests.

- [ ] **Step 5: Apply the migration to the live project**

This machine cannot reach Postgres directly, so `supabase db push` will not work. Apply over HTTPS and record it by hand, or the CLI will try to re-apply it later:

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260816120000_retention_reporting.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260816120000')"
```

Then confirm it answers:

```bash
./supabase/scripts/remote-sql.sh "select * from public.kairo_retention(1)"
```

Expected: rows, or an empty result if no profile is old enough. **No Edge Function redeploy is needed** — this migration adds a function and touches no table any Edge Function writes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260816120000_retention_reporting.sql supabase/tests/schema.test.ts
git commit -m "$(cat <<'EOF'
feat: retention as a query, not a feature

daily_scores already holds a row per user per local date, so the review's
"under 25% by day 21" kill signal needs no new telemetry — only activation
did.

Cohort day is profiles.created_at rather than auth.users.created_at: a user
who signs in and never names a character has not started the loop, and
counting them would report onboarding drop-off as churn.

EXECUTE is revoked explicitly — creating a function grants it to PUBLIC by
default, and this one reads every user's activity.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The measurement runbook

Documentation is part of the change, not a follow-up (CLAUDE.md). This is also what makes the funnel usable by someone who did not build it.

**Files:**
- Create: `docs/beta-measurement.md`
- Modify: `CLAUDE.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Write the runbook**

Create `docs/beta-measurement.md`. It opens by linking to `docs/superpowers/specs/2026-08-15-activation-and-measurement-design.md` and stating that every query below is run through `./supabase/scripts/remote-sql.sh`, never from a client.

Then these five sections, with exactly this SQL.

**The activation funnel.** One row per step, so each step's drop-off is visible:

```sql
with steps(step, type) as (
  values
    (1, 'onboarding_started'),
    (2, 'health_ask_completed'),
    (3, 'profile_created'),
    (4, 'first_sync_seen'),
    (5, 'first_score_seen')
)
select
  s.step,
  s.type,
  count(distinct e.user_id) as users
from steps s
left join public.app_events e on e.type = s.type
group by s.step, s.type
order by s.step;
```

Squad activation is separate, because it is optional rather than a funnel step:

```sql
select type, count(distinct user_id) as users
from public.app_events
where type in ('squad_created', 'squad_joined')
group by type;
```

**Retention**, and the kill signal:

```sql
select 1 as day, * from public.kairo_retention(1)
union all select 7, * from public.kairo_retention(7)
union all select 21, * from public.kairo_retention(21)
union all select 42, * from public.kairo_retention(42)
order by day, cohort_date;
```

State it plainly in the document: **under 25% retained at day 21 means the loop is the problem, not the feature set.** That is the review's own threshold and the reason this release exists.

**Recovery after a missed day** — users who scored, went at least one day without, then came back:

```sql
with gaps as (
  select
    user_id,
    local_date,
    local_date - lag(local_date) over (
      partition by user_id order by local_date
    ) as gap
  from public.daily_scores
)
select
  count(distinct user_id) filter (where gap > 1) as recovered_users,
  count(distinct user_id) as active_users
from gaps;
```

**Squad survival** — whether a squad is still more than one person after three weeks:

```sql
select
  s.id,
  s.name,
  s.program,
  count(m.user_id) as members,
  min(m.joined_at)::date as formed_on
from public.squads s
join public.squad_members m on m.squad_id = s.id
group by s.id, s.name, s.program
having min(m.joined_at) < now() - interval '21 days'
order by members desc;
```

**What is not measurable, and why.** Two things, stated so they are not re-filed as gaps:

- **Whether a user declined HealthKit.** Apple does not report read-permission denial, so `health_ask_completed` records the resulting state and no verdict. A user who declined and a user who granted with an empty phone are indistinguishable from the app's side; `first_sync_seen` firing or not is the closest available proxy.
- **Anything before the app's first launch.** Install-to-open is App Store Connect's number, not ours.

- [ ] **Step 2: Record the deviation**

Add a row to `docs/roadmap.md`'s approved-deviations table for the activation funnel and `kairo_retention`, and add the "End-to-end QA findings"-style disposition note that this plan closes the review's §1.3 gap.

- [ ] **Step 3: Update CLAUDE.md**

Add a short paragraph in the architecture section stating: telemetry decisions live in zero-import modules (`buffer.ts`, `milestones.ts`) because root Vitest cannot load `@/` or MMKV; `first_sync_seen` and `first_score_seen` are once-ever and gated on MMKV markers, **not** the per-session marker `useAppOpenTelemetry` uses; and `kairo_retention` is analytics with EXECUTE revoked, so it is run through `remote-sql.sh` and never from a client.

- [ ] **Step 4: Verify the whole suite and typecheck**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/beta-measurement.md docs/roadmap.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: the beta measurement runbook

The funnel and retention queries, the kill signal stated in full, and the
two things that are structurally unmeasurable — whether a user declined
HealthKit, and anything before first launch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test` and `npm run typecheck` pass.
- A full onboarding run on the simulator produces, in order: `onboarding_started`, `health_ask_completed`, `profile_created`, `first_sync_seen`, `first_score_seen`.
- Relaunching the app does **not** produce a second `first_sync_seen` or `first_score_seen`.
- `public.kairo_retention(21)` answers on the live project and is refused to the `authenticated` role.
- `docs/beta-measurement.md` exists and its queries run as written.

## Deliberately not in this plan

- `disclosure_unlocked`'s call site — Plan 2 builds the gate. The vocabulary entry is here so Plan 2 only wires it.
- Moving `onboarding_started` to `/connect` — Plan 2 creates that screen and moves the call with it.
- Any UI change. This plan is measurement only; a reviewer should be able to approve it without an opinion about the product.
