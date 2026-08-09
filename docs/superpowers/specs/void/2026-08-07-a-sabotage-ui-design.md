> **VOID — 2026-08-09.** Sabotage was removed (spec v1.4 §1, roadmap deviation
> #17). Every file, table and function this document specifies has been deleted.
> Kept only as the record of what was built and why; do not implement any of it.

# A. Sabotage UI and the squad feed

Status: approved 2026-08-07. Workstream A of `docs/mvp-completion-plan.md`.

> §20.4: *"The sabotage mechanic is the soul of the product."*

## Goal

Make the Banana reachable and its consequences visible. Three surfaces:

1. **Deploy** — a 🍌 affordance on each squadmate's leaderboard row, one confirm
   step, and a remaining-count chip on your own row.
2. **The squad feed** — every hit in the squad, newest first, names and item
   only.
3. **Your own damage** — `sabotage_delta` surfaced on the character screen's
   TODAY card, so the four stat bars reconcile with the total.

The backend is complete. **This workstream is client work plus one read
projection.** Nothing about the deploy path changes.

## What already exists — do not rebuild it

- **`deploy-sabotage`** enforces every rule: self-target, squad membership,
  target-day finalization, the daily cap, the same-item cooldown, and inventory.
  It resolves the target's day in the **target's** timezone, inserts the
  append-only row, spends the ledger item, rescores, and writes `app_events`.
- **`planDeploy` / `validateDeploy` / `replaySabotageDelta`** are tested in
  `packages/kairo-core/src/sabotage.test.ts` and
  `supabase/functions/_shared/sabotage-plan.test.ts`.
- **`blockMessage(reason)`** in `sabotage-plan.ts:149` already turns every
  `DeployBlock` into human copy, and the function returns it as `message` on a
  409.
- **`daily_item_ledger_select_own`** (`20260727120400_rls.sql:193`) already lets
  a client read its own ledger row. No policy change.
- **`sabotage_events` is append-only** by trigger, for every role.
- **The board already updates after a hit.** `deploy-sabotage` rescores the
  target's day → `daily_scores` write → the `daily_scores_broadcast` trigger
  (`20260727120600_realtime.sql:38`) → `useSquadRealtime`.
- **`squad_leaderboard` returns every squad member**, scored or not — its
  `member_day` CTE is `from squad_members join profiles`, and `daily_scores`
  arrives by `left join` (`20260807100200_leaderboard_program_weighting.sql:165`).
  So the deploy sheet's target list needs no new query. (Comments in
  `Leaderboard.tsx:37` and `queries.ts:100` claim the opposite; see spec D.)

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Daily grant | **Raise `DAILY_ITEM_GRANT_FREE` to 2** | Plan decision #1. At 1 the grant binds before the §8 cap of 2, so the beta would test sabotage sentiment at one hit per person per day — too quiet to answer "fun or resentment?" |
| Where the grant constants live | **`packages/kairo-core/src/sabotage.ts`**, re-exported from `sabotage-plan.ts` | The client must render "2 bananas today" *before* the first deploy, because the ledger row is materialised lazily. Pure policy with no I/O belongs in core by the same rule as the tier tables. |
| Feed visibility | **Every event in the squad** | Plan decision #3. Full visibility is what makes sabotage social. Names and item only — never scores. |
| Deploy entry point | **Per-row 🍌 on `LeaderboardRow`** | Target and intent in one gesture. A single CTA plus a target-picker sheet is two steps; a long-press makes the mechanic §20.4 calls the soul of the product undiscoverable. |
| Rejection copy | **Render the server's `message`** | A second mapping of `DeployBlock` in the client would drift from `blockMessage()`. |
| Feed realtime | **Ride the existing `daily_scores` broadcast** | A hit always rescores the target, so the broadcast the board listens to already coincides with every feed change. A second trigger and topic for `sabotage_events` would buy nothing. |
| Score effect in the feed | **Not projected; rendered from core** | The Banana is a fixed `BANANA_SCORE_DELTA`. Projecting a score through `squad_feed` would widen §5's surface for a number the client already knows. |

---

## A0. Grant constants into `@kairo/core`

**Move** from `supabase/functions/_shared/sabotage-plan.ts:19-21,56-58` into
`packages/kairo-core/src/sabotage.ts`, beside `DEPLOY_CAP_FREE`:

```ts
/** MVP grants items daily; there is no coin economy in the beta (§15). */
export const DAILY_ITEM_GRANT_FREE = 2;
export const DAILY_ITEM_GRANT_LEGENDARY = 3;

export function dailyGrantFor(isLegendary: boolean): number {
  return isLegendary ? DAILY_ITEM_GRANT_LEGENDARY : DAILY_ITEM_GRANT_FREE;
}
```

Export from `packages/kairo-core/src/index.ts`. Re-export all three from
`sabotage-plan.ts` so `deploy-sabotage/index.ts` needs no edit.

### The trap: raising the grant wakes up dead code

At `DAILY_ITEM_GRANT_FREE = 1` a free user could never hit the same person
twice in a day, so `SAME_ITEM_COOLDOWN_MS` (3h) was **unreachable**. At 2 it
fires. Hitting Ali twice inside three hours now returns `item_cooldown`, and
"You already hit them recently. Wait a few hours." becomes copy the beta
actually sees. It must be tested, not assumed.

Grant and cap now bind simultaneously (2 and 2). `planDeploy` checks structural
rules before inventory (`sabotage-plan.ts:126-130`), so at 2/2 the user always
sees `deploy_cap_reached` — "You have used all your deploys for today" — and
`no_items_remaining` becomes unreachable for free users. That is the more
informative message of the two, so the ordering is correct as it stands.

`MAX_HITS_PER_TARGET_PER_DAY = 3` stays unreachable. Leave it.

### Same-day ledger rows keep the old grant

`granted` is written into `daily_item_ledger` once, when
`deploy-sabotage/index.ts:125-131` materialises the row on first use. Anyone who
deploys before this ships keeps `granted = 1` for the rest of their local day.

**No top-up logic.** Making the function raise `granted` to today's value would
let a future grant *reduction* violate the
`daily_item_ledger_cannot_overdeploy` check constraint, and a ledger row that
changes after the fact is harder to reason about than one that does not. The
grant is fixed per user-day, and the fix for the live dev project is one
statement:

```bash
./supabase/scripts/remote-sql.sh \
  "update public.daily_item_ledger set granted = 2
     where granted = 1 and local_date >= current_date - 1;"
```

### Tests

`packages/kairo-core/src/sabotage.test.ts`:

- `dailyGrantFor(false) === 2`, `dailyGrantFor(true) === 3`.
- **The cooldown now rejects a second hit on the same target within 3h** — the
  path that grant=1 made unreachable.
- A second hit on the same target *after* 3h is allowed by the cooldown and
  rejected by the cap, with `deploy_cap_reached` as the reason.

---

## A1. `squad_feed()` — a new read projection

New migration `supabase/migrations/20260807110000_squad_feed.sql`.

§8 says "visible in squad feed", but `sabotage_events_select_involved`
(`20260727120400_rls.sql:177`) returns only rows where the caller is actor or
target. A squad-wide feed is impossible through PostgREST today.

```sql
create function public.squad_feed(
  p_squad_id uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  actor_id uuid,  actor_name text,
  target_id uuid, target_name text,
  item text,
  created_at timestamptz,
  actor_is_self boolean,
  target_is_self boolean
)
language plpgsql
stable
security definer
set search_path = ''
```

Modelled on `squad_leaderboard` exactly:

- `auth.uid()` null → raise `'authentication required'` using errcode `42501`.
- Caller not in `squad_members` for `p_squad_id` → raise
  `'not a member of this squad'` using errcode `42501`.
- Body joins `sabotage_events se` to `profiles` twice (actor, target), filtered
  `se.squad_id = p_squad_id`, ordered `se.created_at desc`.
- **Clamp the limit server-side**: `least(greatest(coalesce(p_limit, 50), 1), 200)`.
  A client-supplied bound on a `SECURITY DEFINER` function is an input, not a
  promise.
- `revoke execute ... from public, anon;` then `grant execute ... to authenticated;`
  — Postgres grants EXECUTE to PUBLIC by default, which on a `SECURITY DEFINER`
  function hands the projection to every role.
- `comment on function` stating the projection rule, as `squad_leaderboard` does.

**Projects names and the item only.** No `total`, no per-stat points, no
`outcome` jsonb, no `actor_local_date` / `target_local_date`, no health columns.
§5's privacy rule is a projection, not a convention — there must be no argument
that widens this.

### Applying it

Per `CLAUDE.md`: Docker is unavailable and port 5432 is blocked, so `supabase db
push` cannot run. Wrap the migration in `begin; ... commit;`, apply with
`./supabase/scripts/remote-sql.sh -f`, then insert its row into
`supabase_migrations.schema_migrations` by hand or the CLI will re-apply it.

### Tests — `supabase/tests/schema.test.ts`, under the `authenticated` role

1. A member sees events between two **other** squadmates (decision #3).
2. A non-member calling it gets `42501`.
3. An unauthenticated caller gets `42501`.
4. **The returned column list contains no health or score column** — assert the
   key set, so a future `select *` widening fails the test rather than the
   review.
5. `p_limit` is honoured, and a `p_limit` of 10000 returns at most 200.
6. Ordering is `created_at desc`.
7. `actor_is_self` / `target_is_self` are true only for the caller.
8. Events from a squad the caller is not in never appear, even when the caller
   is the target of one. (A user can only be in one squad at MVP, but the
   function is keyed by squad and must behave that way.)

---

## A2. Client — deploy

New feature directory `src/features/sabotage/`.

### `queries.ts`

```ts
export const sabotageKeys = {
  items: (userId: string | undefined, localDate: string | undefined) =>
    ['sabotage', 'items', userId ?? 'none', localDate ?? 'none'] as const,
  feed: (squadId: string | undefined) =>
    ['sabotage', 'feed', squadId ?? 'none'] as const,
};

export function useDailyItems(
  userId: string | undefined,
  timeZone: string | undefined,
  isLegendary: boolean,
): UseQueryResult<DailyItems>;

export function useSquadFeed(squadId: string | undefined):
  UseQueryResult<FeedEvent[]>;
```

**`useDailyItems` keys on the actor's local date**, derived
`currentLocalDate(new Date(), profile.timezone)` exactly as
`useTodayScore` does (`character/queries.ts:42`). The ledger's primary key is
`(user_id, local_date)` and `deploy-sabotage` writes `actor_local_date` from the
profile timezone — using the device's calendar date would read the wrong row for
anyone abroad, which is the whole population §2 exists for.

**A missing row means "granted, unspent", not "none".**

```ts
return {
  granted: row?.granted ?? dailyGrantFor(isLegendary),
  deployed: row?.deployed ?? 0,
};
// remaining = granted - deployed
```

Getting this backwards shows every new user zero bananas until they somehow
deploy one — and they cannot, because the affordance would be disabled.

`isLegendary` comes from the profile. **`useProfile` must add `is_legendary` to
its select list** (`profile/queries.ts:46-49` and the `Profile` type); the
column exists on `profiles` (`20260727120000_init_core.sql:66`) and `profiles`
is owner-readable, so no policy or grant change. Everyone is free at MVP; this
exists so the Legendary path is not a special case invented later.

### `mutations.ts`

```ts
export function useDeploySabotage(squadId: string | undefined): UseMutationResult<
  DeployResult, Error, { targetId: string }
>;
```

Invokes the Edge Function with the user JWT:

```ts
const { data, error } = await supabase.functions.invoke('deploy-sabotage', {
  body: { targetId, item: 'banana' },
});
```

### The trap: `functions.invoke` does not parse a 409 body

A rejected deploy returns HTTP 409 with `{ ok: false, reason, message }`
(`deploy-sabotage/index.ts:159`). `supabase-js` surfaces any non-2xx as a
`FunctionsHttpError` whose `data` is `null` and whose **body is unread**. The
decision above — render the server's `message` rather than re-mapping codes —
only works if the hook opens the response:

```ts
if (error) {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (body?.message) throw new Error(body.message);
  }
  throw new Error('Could not throw that. Try again.');
}
```

Skip this and every rejection — cooldown, cap, finalized day — renders as a
generic network failure, which is precisely the drift the decision was meant to
prevent.

`onSuccess` invalidates, in this order:

- `squadKeys.allBoards()` — the target's total moved.
- `sabotageKeys.feed(squadId)` — a new event exists.
- `sabotageKeys.items(userId, localDate)` — one item is spent.

### `DeploySheet.tsx`

A modal over the squad screen. Given a target already chosen by the tapped row:

- Target's `character_name`, the item, and the cost said plainly:
  **"−500 points off their day."** Rendered from `BANANA_SCORE_DELTA`, not a
  literal.
- Remaining count after this throw.
- One confirm button and a cancel. No second step.
- Pending state disables confirm; error state renders the thrown message inline
  and leaves the sheet open so the user can read it and dismiss deliberately.

### `LeaderboardRow.tsx` changes

- **Squadmate rows** (`!row.is_self`): a 🍌 pressable at the trailing edge, with
  `accessibilityRole="button"` and an `accessibilityLabel` of
  "Throw a banana at {character_name}" — the emoji alone announces as
  "banana", which says nothing about what tapping it does. Disabled with
  reduced opacity when `remaining === 0`.
- **Own row**: a `🍌 {remaining}` chip in the meta line, beside the existing
  boost chip.
- The row takes two new props (`remaining: number`, `onDeploy?: (row) => void`).
  It stays presentational; `Leaderboard.tsx` owns the sheet state.

**The affordance stays active while viewing "Yesterday."** A deploy lands on the
target's *current* day regardless of which board mode is on screen — the server
resolves it from the target's timezone (`sabotage-plan.ts:106`), not from
anything the client sends. Disabling the button in completed mode would imply
you could sabotage the past.

---

## A3. Client — the receiving end

Being hit must be visible in-app before push exists. Push is workstream C, and
is best-effort even after it lands.

### `feed-copy.ts` — a pure module, on the `program-copy.ts` precedent

```ts
export function feedLine(e: {
  actorName: string;
  targetName: string;
  actorIsSelf: boolean;
  targetIsSelf: boolean;
  item: SabotageItem;
}): string;
```

§14's voice, with "you" substituted:

| Case | Line |
|---|---|
| you → them | `You hit Ali with a banana 🍌` |
| them → you | `Jomar hit you with a banana 🍌` |
| other → other | `Jomar hit Ali with a banana 🍌` |

Self→self is impossible — `validateDeploy` rejects it (`sabotage.ts:107`) — so
the module asserts rather than renders a fourth case.

Also `feedTime(createdAt, now)`: `just now` / `12m` / `3h` / a date past 24h.
`now` is a parameter, never a clock read, so it is testable.

### `SquadFeed.tsx`

Renders on the squad screen below the board and the locked slots. Headed
**RECENT HITS**. Empty state: *"No hits yet today. Somebody has to start."*
Loading state renders nothing rather than a spinner — the feed is secondary to
the board and a second spinner on one screen reads as breakage.

A failed feed fetch renders an inline error line, not an empty state. The
repo has stranded a user once by reading an error as absence; this is the same
shape of bug.

### The TODAY card

`app/(tabs)/index.tsx:100-107` renders the consistency and REC bonus so the four
stat bars visibly reconcile with the total. `sabotage_delta` is already selected
by `useTodayScore` (`character/queries.ts:52`) and rendered nowhere — the same
reconciliation failure, in the other direction:

```tsx
{(today?.sabotage_delta ?? 0) < 0 && (
  <Text style={styles.penalty}>
    −{Math.abs(today.sabotage_delta).toLocaleString()} from sabotage
  </Text>
)}
```

Styled with `colors.danger`, on its own line beneath the bonus line. This is the
exact bug Phase 1 follow-up #8 closed for the consistency line.

---

## A4. Realtime

One change, inside the existing `refetch()` in `useSquadRealtime.ts:41-52`:

```ts
void queryClient.invalidateQueries({ queryKey: sabotageKeys.feed(squadId) });
```

A hit always rescores the target, which writes `daily_scores`, which fires the
broadcast this hook already listens to. So the feed's signal is the board's
signal, and no trigger on `sabotage_events` is needed.

The payload stays unread, for the reason documented at `useSquadRealtime.ts:72`:
`broadcast_changes` ships a whole `daily_scores` row, which is more than the
projection exposes. The broadcast means only "something in this squad changed".

---

## Tests

| Component | How |
|---|---|
| `dailyGrantFor`, cooldown reachability | TDD in `kairo-core`, Node |
| `squad_feed()` | PGlite schema tests, non-owner `authenticated` role |
| `feedLine`, `feedTime` | Pure module, unit tested |
| `useDailyItems` missing-row default | Unit test on the mapping function, extracted from the hook |
| Deploy sheet, 🍌 affordance, feed rendering, TODAY penalty line | Hand-verified on the simulator |

**What the PGlite harness cannot prove:** that a sabotage-induced `daily_scores`
write actually reaches a subscribed client as a broadcast. Verify against the
live project — two simulators, one squad, one throw.

## What this deliberately does not do

- **No change to `deploy-sabotage`.** Every rule is already enforced and tested.
- **No optimistic update on the board.** The server is authoritative and the
  rescore is a round trip; a predicted total that gets corrected 300ms later
  would undermine the number the whole product rests on.
- **No V1 items.** `SabotageItem` stays `'banana'`.
- **No push notification.** Workstream C.
- **No per-event score in the feed.** Decision above.
