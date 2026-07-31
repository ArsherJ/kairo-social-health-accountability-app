# Realtime on the squad leaderboard

Status: approved 2026-07-31. Closes the last outstanding Phase 4 bullet and
Phase 4 backend follow-up #8.

## Goal

The squad board updates itself. When a squadmate's score changes, the rows
reorder without the user pulling to refresh — §2's "1 hour left, you're in Nth
place" only lands if the board is actually current when glanced at.

## What already exists — do not rebuild it

The server half shipped with the initial schema and is **live and enabled** on
project `zniopywbwenrzxezolwv` (verified 2026-07-31):

- `broadcast_score_change()` — an `after insert or update` trigger on
  `daily_scores` that calls `realtime.broadcast_changes` once per squad the
  scoring user belongs to, on topic `squad:<squad_id>`.
- `squad_members_receive_squad_broadcasts` — an RLS policy on
  `realtime.messages` gating those topics on `is_squad_member()`. Clients must
  subscribe with `private: true` or receive nothing.

This spec adds **no migration**. It is client work.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| On-screen behaviour | **Silently reorder** | Nothing should compete with the scores for attention. No highlight animation, no "new scores" pill. |
| Broadcast payload | **Discarded** | See below — this is the load-bearing one. |
| Membership changes | **Out of scope** | The trigger covers `daily_scores` only. A new member appears on the next refetch, and in practice the moment they log any activity. Adding a `squad_members` trigger is a migration for a rare event. |
| Coalescing | **A pure module** | Delivery cannot be tested here; the decision of *when to refetch* can be. |
| Realtime auth | **Nothing to do** | supabase-js 2.110.9 already keeps it in sync. See "Verified during design". |

### The payload is discarded

`realtime.broadcast_changes` ships the whole new `daily_scores` record —
`agi_points`, `str_points`, `sabotage_delta`, `xp_awarded`, and the rest. That
is strictly **more** than `squad_leaderboard` returns.

So the broadcast is treated as a bare signal: *something in this squad changed*.
The handler takes no payload parameter at all, and the refetch goes through
`squad_leaderboard` like every other read. `squad_leaderboard` stays the only
path by which one member's data reaches another's screen, which is what makes
CLAUDE.md's "privacy is a projection, not a convention" structurally true rather
than a thing we remember to honour.

Patching the cache from the payload was considered and rejected. Beyond the
privacy question it does not actually work: one score change reorders the whole
board, so ranks would have to be re-derived client-side, duplicating SQL that
already exists; and the payload carries no `character_name` or `level`, so a
member not already on the board could not be rendered at all.

### Realtime is not a delivery guarantee

Backgrounding the app drops the socket and any events during that window are
gone. Nothing replays them. So the subscription is an **optimisation over**
refetching, never the source of truth: every reconnect and every foreground
forces a refetch, and the board remains correct even if not one broadcast is
ever delivered.

This is why a dropped socket produces no error UI. Realtime failing degrades to
the behaviour the screen had yesterday.

---

## Architecture

| Path | Responsibility |
|---|---|
| `src/features/squad/realtime-policy.ts` | **New, pure, zero imports.** Reducer deciding *when* to refetch |
| `src/features/squad/realtime-policy.test.ts` | **New.** Node tests |
| `src/features/squad/useSquadRealtime.ts` | **New.** Channel lifecycle, AppState, executes commands |
| `src/features/squad/queries.ts` | **Modified.** Add `squadKeys.boardAll(squadId)` |
| `src/features/squad/Leaderboard.tsx` | **Modified.** Call the hook |
| `docs/roadmap.md` | **Modified.** Close the Phase 4 bullet and follow-up #8 |

The split follows the repo's existing shape: `route.ts` and `permission-state.ts`
are already pure decision modules with Node tests beside thin consumers. Zero
imports in `realtime-policy.ts` is a hard requirement — root Vitest has no `@/`
alias and cannot parse React Native's Flow syntax.

### `realtime-policy.ts`

A reducer, `(state, input) → [nextState, command]`:

```ts
export type RealtimePolicyInput =
  | { kind: 'broadcast'; at: number }
  | { kind: 'connected'; at: number }
  | { kind: 'disconnected'; at: number }
  | { kind: 'foreground'; at: number };

export type RealtimePolicyCommand =
  | { kind: 'none' }
  | { kind: 'refetch-now' }
  | { kind: 'refetch-after'; delayMs: number };
```

Rules:

- **broadcast** → `refetch-after: COALESCE_WINDOW_MS`. If a refetch is already
  pending, `none`. `finalize-days` rescores a whole squad at once, so six
  broadcasts can land inside a few hundred milliseconds; this collapses them
  into one request.
- **connected** → `refetch-now`, **only on a genuine reconnect**. The first
  connect lands moments after the query's own initial fetch and must not
  double-fetch on every mount. Tracked with an `everConnected` flag.
- **disconnected** → `none`, but records the drop so the next `connected`
  counts as a reconnect.
- **foreground** → `refetch-now`, throttled to once per `FOREGROUND_THROTTLE_MS`
  so a quick app-switch does not spam.

Two rules make the commands compose rather than overlap:

- **Any `refetch-now` cancels a pending coalesced refetch.** Otherwise a
  reconnect or a foreground landing mid-window fires immediately and then again
  400ms later. The consumer clears its timer whenever it receives
  `refetch-now`; the reducer clears `pendingUntil` to match.
- **Every issued refetch, immediate or scheduled, updates `lastRefetchAt`**, and
  the foreground throttle reads that field. So a reconnect immediately followed
  by a foreground event — the ordinary sequence when returning to the app —
  produces one request, not two.

Constants: `COALESCE_WINDOW_MS = 400`, `FOREGROUND_THROTTLE_MS = 2_000`.

Time is always an argument. No clock reads, matching `kairo-core`'s discipline
and for the same reason — it is what makes the burst and throttle behaviour
testable without faking timers.

### `useSquadRealtime.ts`

```ts
export function useSquadRealtime(squadId: string | undefined): void
```

- Holds policy state in a ref; dispatches inputs and executes commands
  (`setTimeout` for `refetch-after`, clearing any pending timer on unmount).
- `refetch` means
  `queryClient.invalidateQueries({ queryKey: squadKeys.boardAll(squadId) })` —
  a prefix key, so both `'current'` and `'completed'` refresh. A score change
  can affect either, and the user can toggle to a stale mode otherwise.
- Channel:
  `supabase.channel('squad:' + squadId, { config: { private: true } })`,
  `.on('broadcast', { event: '*' }, () => dispatch('broadcast'))`,
  `.subscribe(status => ...)` mapping `SUBSCRIBED` → `connected` and
  `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` → `disconnected`.
- Cleanup: `supabase.removeChannel(channel)` plus timer clear, on unmount and
  on `squadId` change.
- An `AppState` listener dispatches `foreground` on `'active'`.

Called from `Leaderboard.tsx`, which only mounts when a squad exists, so the
subscription's lifetime is the board's. Expo Router keeps tab screens mounted,
so the channel survives tab switches — which is correct and costs nothing.

### Data flow

```
daily_scores INSERT/UPDATE
  → trigger → realtime.broadcast_changes → topic squad:<id>
  → RLS on realtime.messages admits squad members only
  → client handler (payload ignored) → policy → invalidate boardAll
  → squad_leaderboard refetch → rows reorder
```

---

## Testing

**Node** (`realtime-policy.test.ts`), covering:

- a burst of broadcasts produces exactly one scheduled refetch
- a broadcast after the pending refetch has fired schedules a new one
- the first `connected` produces no refetch; a `connected` after a
  `disconnected` produces `refetch-now`
- `foreground` refetches, and a second `foreground` inside the throttle window
  does not
- a `refetch-now` while a coalesced refetch is pending cancels the pending one
- a reconnect followed immediately by a foreground produces one refetch
- `disconnected` alone commands nothing

**No PGlite test.** `supabase/tests/harness.ts` stubs the `realtime` schema; it
can prove the policy exists but not that a message is delivered. Adding a test
that asserts the trigger "worked" against a stub would be a test of the stub.
This is the limit CLAUDE.md already documents, not a new gap.

**Live**, on the simulator, which is genuinely available here: open the board,
then seed a score change for a rival through the deployed `seed-health`
function. That writes `daily_scores`, which fires the trigger. If the board
reorders with no interaction, the whole path — trigger, RLS, subscription,
policy, refetch — is proven end to end. This is the only verification that
covers delivery, so it is required, not optional.

---

## Verified during design

Two things were checked rather than assumed:

1. **The trigger and policy are live.** `pg_trigger` shows
   `daily_scores_broadcast` enabled (`tgenabled = 'O'`), and
   `squad_members_receive_squad_broadcasts` exists on `realtime.messages`.

2. **No manual `setAuth` is required.** `SupabaseClient`'s constructor calls
   `_listenForAuthEvents()`, which calls `realtime.setAuth(token)` on
   `INITIAL_SESSION`, `SIGNED_IN` and `TOKEN_REFRESHED`, and clears it on
   `SIGNED_OUT` (`node_modules/@supabase/supabase-js/src/SupabaseClient.ts`,
   lines 411 and 659–681). An earlier draft of this design carried an explicit
   `setAuth()` call on foreground; it is unnecessary and has been removed.

## Out of scope

- **Membership broadcasts.** Joins and leaves do not fire.
- **A connection-state indicator.** Silent degradation is the decision.
- **Realtime anywhere else.** The Character screen's `useTodayScore` also has a
  broadcast available to it, since a user's own score change fires the trigger.
  Worth doing, but it is a different screen and belongs in its own change.
