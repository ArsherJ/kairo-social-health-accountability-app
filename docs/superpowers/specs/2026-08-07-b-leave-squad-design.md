# B. Leave a squad

Status: approved 2026-08-07. Workstream B of `docs/mvp-completion-plan.md`.

## Goal

Let a member leave. Free users cap at one squad (`20260727120000_init_core.sql:212`),
so a wrong join is currently permanent — and §15 recruits into the beta with
stranger squads, which makes "I joined the wrong one" a support request nobody
can action.

Small workstream, one migration and one confirm dialog. It is on the critical
path because it is a trap for beta users, not because it is hard.

## What already exists — do not rebuild it

- **Leadership succession, complete and correct**, inside
  `handle_profile_deletion()` (`20260728160000_account_deletion.sql:58-101`):
  the longest-tenured remaining member inherits; if there is nobody, the squad
  is deleted. It joins `profiles` deliberately, so a bulk purge cannot name a
  successor whose profile is already gone.
- **`squads_handle_deletion`** sets the transaction-local `kairo.allow_purge`
  flag so deleting a squad may cascade into its append-only `sabotage_events`
  (`20260728160000_account_deletion.sql:110-125`).
- **`squad_members` cascades** from `squads` on delete
  (`20260727120000_init_core.sql:164`).

## The hole this must close

`squad_members_delete_self` (`20260727120400_rls.sql:145`) **already grants
`authenticated` a raw `DELETE` on their own membership row**, with the comment
"Leaving is allowed". Nothing runs succession on that path.

So a squad **leader** can leave right now, from any client, and
`squads.leader_id` is left pointing at someone who is no longer a member. The
column is `not null` and FKs to `profiles`, so the row stays valid and nothing
raises — the squad simply has a leader who is not in it. Nothing in the app
surfaces leadership yet, which is why this has gone unnoticed.

**Adding `leave_squad()` alongside that policy would leave two exit paths, one
of which skips succession.** The migration must revoke it. This is the same
class of mistake the deviations table exists to catch: two rules for who
inherits a squad, drifting apart.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Leader leaving | **Reuse account-deletion succession** | Plan decision #4. Two inheritance rules would drift. Blocking a leader from leaving until they hand over needs a transfer UI that MVP does not have. |
| How it is reused | **Extract into one function both callers invoke** | "Follow the same pattern" is two copies that agree today. `succeed_squad_leadership()` is two callers that cannot diverge. |
| Client mechanism | **`leave_squad()` RPC, not a client `DELETE`** | Succession and the membership delete must be one transaction, server-side. |
| The existing delete policy | **Dropped** | See above. The RPC becomes the only exit. |
| Last member out | **Squad is deleted** | Matches `handle_profile_deletion`. An empty squad has no leaderboard and nobody to inherit it. |
| Confirmation | **Required, and says what is lost** | Leaving forfeits the board's history and is not undoable — the invite code is regenerated per squad, so rejoining needs the code from someone still inside. |

---

## Migration — `supabase/migrations/20260807110100_leave_squad.sql`

Wrapped in `begin; ... commit;` and applied per `CLAUDE.md`'s remote-SQL
procedure (Docker unavailable, 5432 blocked): `remote-sql.sh -f`, then insert
the `supabase_migrations.schema_migrations` row by hand.

### 1. Extract succession

```sql
create or replace function public.succeed_squad_leadership(
  p_squad_id uuid,
  p_leaving  uuid
) returns void
language plpgsql
security definer
set search_path = ''
```

The body is the loop currently inlined at
`20260728160000_account_deletion.sql:72-97`, verbatim, for a single squad:
longest-tenured remaining member by `joined_at asc`, **joined to `profiles`**
(that join is load-bearing — see the comment there), `p_leaving` excluded. Null
successor → `delete from public.squads where id = p_squad_id`.

`revoke execute ... from public, anon, authenticated;` — it is called only by
other definer functions.

### 2. Rewrite `handle_profile_deletion` to call it

Same trigger, same `set_config('kairo.allow_purge', 'on', true)` at the top,
same `for v_squad in select id from public.squads where leader_id = old.id`
loop — but the body becomes one call to `succeed_squad_leadership(v_squad.id,
old.id)`. **Behaviour must be identical**; the existing account-deletion schema
tests are the proof, and they must pass unchanged.

### 3. `leave_squad()`

```sql
create function public.leave_squad(p_squad_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
```

In order:

1. `v_user := (select auth.uid())`; null → raise `42501`.
2. Not a member of `p_squad_id` → raise `'not a member of this squad'` using
   errcode `42501`. Same message and SQLSTATE as `squad_leaderboard`, so
   `squadErrorMessage()` in `src/features/squad/mutations.ts:14` needs no new
   case.
3. `delete from public.squad_members where squad_id = p_squad_id and user_id = v_user;`
4. `if leader_id = v_user then perform public.succeed_squad_leadership(p_squad_id, v_user); end if;`

**Delete the membership first, then run succession.** Succession picks from the
remaining members, and if the leaver's row were still present they could inherit
their own squad. `handle_profile_deletion` gets away with the opposite order
only because it passes `old.id` as an explicit exclusion — passing
`p_leaving` here as well makes the order safe either way, which is the point of
sharing one function.

`revoke execute ... from public, anon;` then `grant execute ... to authenticated;`.

### 4. Close the raw-delete path

```sql
drop policy squad_members_delete_self on public.squad_members;
revoke delete on public.squad_members from anon, authenticated;
```

`revoke insert, update` is already in place at `20260727120400_rls.sql:149`;
after this the client has **no** write grant on `squad_members` at all, and
membership changes exclusively through `create_squad`, `join_squad` and
`leave_squad`. That matches the server-authoritative posture the rest of the
schema holds.

---

## Client

### `src/features/squad/mutations.ts`

```ts
export function useLeaveSquad(userId: string | undefined): UseMutationResult<
  void, Error, { squadId: string }
>;
```

Calls `supabase.rpc('leave_squad', { p_squad_id: squadId })`, maps errors
through the existing `squadErrorMessage()`. `onSuccess` invalidates
`squadKeys.mine(userId)`, `squadKeys.allBoards()`, and — once workstream A
lands — `sabotageKeys.feed(squadId)`.

### `Leaderboard.tsx`

A "Leave squad" action at the foot of the board, below the locked slots.
Deliberately low in the scroll and styled as a quiet destructive text button,
not a header icon: it is rare and irreversible.

Confirm via `Alert.alert`, with copy that names the consequence:

> **Leave {squad.name}?**
> You lose your place on this board and your history with this squad. You will
> need the invite code to come back.
> *(If leader:)* Leadership passes to the longest-standing member.

### `app/(tabs)/squad.tsx`

`pane` is local state (`squad.tsx:20`) holding `'choose' | 'create' | 'join'`,
written on the assumption that a board never disappears underneath it. It does
not reset when the squad query flips to `null`.

The concrete failure: a user opens Create, backs out (`pane` is now `'choose'`),
joins by code, later leaves — fine. But a user who opened Create, joined via a
deep link without backing out, and then leaves lands on the create form with no
board and no obvious way back. **Reset `pane` to `'choose'` on leave success.**

The structurally cleaner fix is to derive `pane` from the squad query rather
than hold it, but that is a rework of the screen's state model and is not what
this workstream is for.

---

## Tests

`supabase/tests/schema.test.ts`, under the non-owner `authenticated` role:

1. An ordinary member leaves; their `squad_members` row is gone and the squad
   survives with its leader unchanged.
2. **A leader leaves; the longest-tenured remaining member becomes
   `leader_id`** — assert against `joined_at` ordering, not insertion order.
3. The last member leaves; the squad row is gone, and its `sabotage_events` went
   with it via cascade under `kairo.allow_purge`.
4. A non-member calling `leave_squad` gets `42501` and changes nothing.
5. An unauthenticated caller gets `42501`.
6. **A direct `delete from squad_members` as `authenticated` now fails** — the
   regression test for the policy drop.
7. The existing account-deletion tests still pass against the refactored
   `handle_profile_deletion`.

**What PGlite cannot prove:** that `succeed_squad_leadership` behaves the same
on the hosted `auth` schema as on the stub. Verify on the live project — leave a
real test squad as leader and read back `leader_id`.

## What this deliberately does not do

- **No leadership transfer UI.** §7 mentions manual transfer; MVP gets automatic
  succession only. A transfer screen is V1.
- **No re-join grace period.** Leaving is immediate and the invite code is the
  only way back in.
- **No `pane` state-model rework.** One reset line, scoped to this change.
