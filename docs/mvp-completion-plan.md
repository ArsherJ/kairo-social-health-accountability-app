# MVP completion plan

**Status:** approved 2026-08-07. All five decisions resolved; nothing built yet.

Each workstream now has an implementation spec, and where a spec contradicts
this document the spec wins — it was written against the code:

| Workstream | Spec |
|---|---|
| A. Sabotage UI + squad feed | `docs/superpowers/specs/2026-08-07-a-sabotage-ui-design.md` |
| B. Leave a squad | `docs/superpowers/specs/2026-08-07-b-leave-squad-design.md` |
| C. Notification engine + FCM | `docs/superpowers/specs/2026-08-07-c-notifications-design.md` |
| D. Polish, telemetry, defects | `docs/superpowers/specs/2026-08-07-d-polish-design.md` |

This document sequences and specifies the work between today and a
feature-complete MVP. It is subordinate to the two documents that hold the
decisions:

- `Kairo_Master_Summary.md` — the product spec. Every `§` below points here.
- `docs/roadmap.md` — phase status and the approved-deviations table.

Where this plan proposes something the spec does not say, it is called out as a
**decision** and listed in [Decisions](#decisions--resolved-2026-08-07).
Nothing in this file overrides the spec on its own.

**Three claims in this document turned out to be wrong about the code.** They
are corrected in place below and marked ⚠️; the reasoning that produced them is
left visible rather than deleted, because each was a plausible reading of the
schema that the schema does not support.

---

## What "MVP complete" means

§15's MVP list, against reality as of 2026-08-07:

| §15 MVP item | Status |
|---|---|
| Apple Sign In | ⬜ blocked on the Developer Program |
| HealthKit + background delivery | ✅ built; ⬜ background behaviour unverified (needs device) |
| Server-authoritative scoring | ✅ |
| Per-user local days + grace finalization | ✅ |
| Onboarding character-first + soft-prompt body metrics | ✅ |
| REC/sleep for wearable users | ✅ (`has_wearable` now server-observed) |
| Character creation, single Hunter, AI-placeholder art | 🟨 flow done; **art is still `View` primitives** |
| Squad creation + invite (≤6) | ✅ |
| Daily leaderboard, tiers + score only | ✅ |
| **1 sabotage item (Banana)** | 🟨 **backend done, no client at all** |
| **Push notifications** (sabotage + day end + conditional day start) | ⬜ **nothing built** |
| Solo mode | ✅ |
| Basic profile screen | ✅ |

Two items are genuinely missing, one is half-done, and everything else is either
finished or waiting on Apple. That is the whole remaining scope.

**Not MVP, despite appearing in `docs/roadmap.md` Phase 6:** the N-of-M squad
streak. §15 lists "Streak system + milestones (incl. N-of-M squad streak)" under
**V1**, not MVP. Personal streaks and the Streak Shield are already done. See
[Scope cuts](#scope-cuts--adopted-2026-08-07). Cut, per decision #5.

---

## Sequencing

```
A. Sabotage UI + squad feed     25–35h   ← nothing depends on it; everything is worse without it
B. Leave a squad                 8–12h   ← cheap, and a trap for beta users without it
C. Notification engine + FCM    15–20h   ← build now so the APNs key is config, not a feature
D. Polish, telemetry, defects   10–15h
                                ───────
                                58–82h   all unblocked today

E. Apple gate                            ← buy here. Everything past this is verification.
```

The ordering has one real constraint and one strategic reason.

**The constraint:** C depends on A. §14's highest-value notification is *"[Name]
hit you with a banana!"*, and there is no banana to be hit with until A ships.
Building the notification engine first would mean testing it against the two
weakest triggers in the table.

**The strategic reason:** today the Apple-blocked list mixes *building* with
*verifying*. Work A–D first and the purchase unlocks a short, well-defined
verification pass instead of a second construction phase. That matters because
one item in E — `AppleExerciseTime` on a phone-only device — can still invalidate
scoring, and you want to hit it with everything else already standing.

---

## A. Sabotage UI + squad feed

> §20.4: *"The sabotage mechanic is the soul of the product."*

The backend is complete and verified: `deploy-sabotage` enforces caps, cooldown,
squad membership, self-target and target-day finalization; `sabotage_events` is
append-only; `daily_item_ledger` tracks the grant; `replaySabotageDelta` and
`planDeploy` are tested in `kairo-core`. **This workstream is entirely client
plus one read projection.** No change to the deploy path.

### A0. Move the grant constants into `@kairo/core`

`DAILY_ITEM_GRANT_FREE = 1` and `DAILY_ITEM_GRANT_LEGENDARY` live in
`supabase/functions/_shared/sabotage-plan.ts`, which the app cannot import. The
client needs the number to render "1 banana today" *before* the first deploy,
because the ledger row is materialised lazily and does not exist until then.

Move both constants to `packages/kairo-core/src/sabotage.ts`, beside
`DEPLOY_CAP_FREE`, and re-export from `sabotage-plan.ts`. Pure policy with no
I/O — it belongs in core by the same rule as the tier tables, and this avoids a
third place where the number 1 lives.

**Note the interaction, which is not obvious:** at a grant of 1/day against a
deploy cap of 2/day, **the grant binds and the cap is unreachable** — free users
would get exactly one banana per day, and the cap would only start mattering at
V1 when rewarded ads and coins can add items.

Resolved by [decision #1](#decisions--resolved-2026-08-07): the grant goes to 2,
so the two bind together and the §8 cap is the real constraint. Read the
consequence recorded there before implementing — the change makes a
previously-unreachable rejection path live.

### A1. `squad_feed()` — a new read projection

§8: *"Visible in squad feed."* The existing policy
`sabotage_events_select_involved` returns only rows where the caller is actor or
target, so a squad-wide feed is impossible through PostgREST today.

New migration, `SECURITY DEFINER`, on the `squad_leaderboard()` pattern:

```
squad_feed(p_squad_id uuid, p_limit int default 50)
  returns table (
    id uuid,
    actor_id uuid, actor_name text,
    target_id uuid, target_name text,
    item text,
    created_at timestamptz,
    actor_is_self boolean,
    target_is_self boolean
  )
```

- Raises `42501` when the caller is not a member of `p_squad_id`, matching
  `squad_leaderboard`'s existing guard.
- Ordered `created_at desc`, capped by `p_limit`.
- **Projects names and the item only.** No scores, no per-stat points, no
  `outcome` jsonb, no health data. §5's privacy rule is a projection, not a
  convention — the same discipline that keeps `squad_leaderboard` honest.
- The score effect is not projected because it does not need to be: the Banana
  is a fixed −500 (`BANANA_SCORE_DELTA`), so the client renders it from core.

Schema tests, in `supabase/tests/schema.test.ts`: member sees squadmates' events;
non-member gets `42501`; the returned column list carries no health columns; the
limit is honoured; ordering is newest-first.

### A2. Client — deploy

- `useDailyItems(userId, localDate)` reads `daily_item_ledger` for the caller's
  own row (policy `daily_item_ledger_select_own` already permits this). **A
  missing row means "granted, unspent"**, not "none" — render
  `DAILY_ITEM_GRANT_FREE - 0`. Getting this backwards shows every new user zero
  bananas until they somehow deploy one.
- A deploy sheet over the squad screen: squadmates from the board, self excluded,
  one confirm step. The target list comes from `squad_leaderboard` rows, which
  the screen already has — no new query.

  ⚠️ **Correction.** This is right, but not for the reason the codebase gives.
  `Leaderboard.tsx:37` and `queries.ts:100` both claim the RPC returns only
  members who have *scored*, and the 2026-08-01 spec records that as "the
  locked-slot trap". It has never been true: every version since
  `20260727120500` joins `squad_members → profiles` and reaches `daily_scores`
  by `left join`, so an unmoved member appears with `total = 0`. The comments
  are corrected in workstream D.
- `useDeploySabotage()` invokes the `deploy-sabotage` Edge Function with the user
  JWT. **Render the server's `message` field on rejection rather than re-mapping
  the codes** — `blockMessage()` already turns every `DeployRejection` into
  human copy, and a second mapping in the client would drift from it.
- On success, invalidate `squadKeys.allBoards()` and the feed key.

### A3. Client — the receiving end

Being hit has to be visible in-app even before push exists (push is workstream
C, and is best-effort anyway):

- **Feed** on the squad screen, from `squad_feed()`. Copy follows §14's voice:
  *"[Name] hit [Name] with a banana 🍌"*, with "you" substituted via
  `actor_is_self` / `target_is_self`.
- **Own row**, on the board: `daily_scores.sabotage_delta` is already selected by
  `useTodayScore` and rendered nowhere. Surface it on the character screen's
  TODAY card the same way the consistency bonus is surfaced — otherwise the four
  stat bars silently fail to reconcile with the total, which is the exact bug
  Phase 1 follow-up #8 closed for the consistency line.

### A4. Realtime

`deploy-sabotage` rescores the target's day, which writes `daily_scores`, which
the existing trigger broadcasts — so **the board already updates without
changes**. The *feed* does not: it reads `sabotage_events`, which nothing
broadcasts. Invalidate the feed key on the same broadcast the board listens to
(`useSquadRealtime`), which is a one-line change and avoids a second trigger and
topic.

### A5. Tests

Per the repo's posture — TDD where a bug corrupts real leaderboards, hand
verification for UI:

- `squad_feed()` — schema tests, as above.
- Feed copy (the self-substitution and pluralisation) — a pure module with unit
  tests, on the `program-copy.ts` precedent.
- The deploy sheet, the feed rendering and the sabotage line on the TODAY card —
  hand-verified on the simulator.

---

## B. Leave a squad

Free users cap at one squad, so a wrong join is currently permanent. With
stranger squads in the beta that is a support request you cannot action.

`squad_members_delete_self` already permits the delete, so the policy half is
done. The undecided half is what happens when the **leader** leaves.

⚠️ **Correction.** That policy is not a head start, it is the bug. It grants
`authenticated` a raw `DELETE` on their own membership row with no succession
whatsoever, so a leader can leave **today** and strand `squads.leader_id`
pointing at a non-member — `leader_id` is `not null` and FKs to `profiles`, so
nothing raises and the squad simply has a leader who is not in it. Adding
`leave_squad()` beside it would leave two exit paths, one of which skips
succession. The migration must revoke the policy.

**Proposal:** reuse the succession the account-deletion path already implements
(`20260728160000_account_deletion.sql`) rather than inventing a second rule. Two
rules for who inherits a squad is exactly the kind of drift the deviations table
exists to prevent.

- New `leave_squad()` RPC rather than a client-side `DELETE`, so succession and
  the membership delete happen in one transaction server-side.
- Last member leaving deletes the squad. Its `sabotage_events` are cascade-deleted
  by the existing FK — note this is one of the few paths that legitimately
  removes append-only rows, and it must go through the `kairo.allow_purge`
  transaction flag the deletion triggers already set.
- Client: a confirm step (leaving forfeits the board's history and is not
  undoable), and **reset the `pane` state in `app/(tabs)/squad.tsx`** — it holds
  `'choose' | 'create' | 'join'` in local state written on the assumption that a
  board never disappears underneath it.

Schema tests: ordinary member leaves; leader leaves and succession picks the
documented next member; last member leaves and the squad is gone; a non-member
calling it is rejected.

---

## C. Notification engine + FCM

**MVP scope is three triggers, not §14's eight.** §15 says "Push notifications
(sabotage + day end + conditional day start)". Building the other five is V1
work and should not be in the critical path:

| §14 trigger | MVP? |
|---|---|
| Sabotaged | ✅ — "the emotional core", always sends |
| Day ending soon / Day ends | ✅ |
| Day starts (only if app not yet opened) | ✅ |
| Podium drop, overtake digest, weekly recap, streak at risk | ⬜ V1 |

### C1. `packages/kairo-core/src/notifications.ts` — the budget engine

Pure, no I/O, no clock reads, no randomness — same contract as scoring, and the
reason §14's rules are testable without a device or a push certificate:

```
planNotifications(input: {
  candidates: readonly Candidate[];   // what the server would like to send
  sentToday: number;
  localNow: LocalTime;                // caller supplies; never read from a clock
  quietHours: { from: 22, to: 7 };
}): Candidate[]
```

Encodes §14's rules: max 3/day configurable; nothing between 22:00 and 07:00
except sabotage; sabotage always sends regardless of budget. The podium/digest
collapse ships as V1 but the shape should anticipate it, the way
`SabotageItem` anticipates the V1 items.

### C2. Schema

- `device_tokens (user_id, token, platform, updated_at)` — owner-writable,
  unique on token so a device changing hands re-points cleanly.
- `notification_log (user_id, local_date, trigger, sent_at)` — what `sentToday`
  counts. It is also the only way to answer "did the budget suppress anything?"
  during the beta.

### C3. Delivery

- **Sabotage push fires from `deploy-sabotage`**, inline, right after the event
  lands. It is real-time by definition and bypasses the budget.
- ~~**Day-boundary pushes ride the existing `finalize-days` hourly cron.** That
  function already resolves each user's local day and grace window, which is
  exactly the computation "11 PM local" and "midnight local" need. Adding a
  second scheduler that re-derives local days would duplicate `finalizable_days()`.~~

  ⚠️ **Correction — this is the wrong computation.** `finalizable_days()`
  selects days whose local midnight passed **more than two hours ago**
  (`20260728140000_finalizable_days.sql:26`). Riding it would fire "Day ends" at
  02:00 local: two hours late, with §14's own copy ("Provisional: You finished
  [rank]. Finalizes in ~2h.") already false, and deep inside quiet hours. It has
  no notion of 23:00 local at all.

  What the triggers need is *which users are at local hour H right now* — a new
  `users_at_local_hour()`, so there is no duplication to avoid. Spec C puts it
  behind a separate `dispatch-notifications` function on the same hourly cron:
  `finalize-days` runs on a 500-day cap inside a 55s timeout, and a push failure
  must never abort a finalization.
- Client: register the FCM token; ask for the notification permission **only
  after the first squad or sabotage event**, per §5's explicit rule that "every
  ask has a visible why" — not during onboarding.

### C4. What the APNs key actually blocks

Everything above is buildable and testable now. The Developer Program gates only
the APNs auth key that lets FCM reach iOS. When it lands: add the key to
Firebase, drop `GoogleService-Info.plist` into the build, rebuild. No code.

**Spec conflict, resolved (decision #2)** — §14 sets quiet hours at 22:00–07:00
with only sabotage exempt, but schedules "Day ending soon" at 23:00 and "Day
ends" at 00:00. As written, the quiet-hours rule suppresses the two
notifications that drive the evening push.

The day-boundary pair is exempt alongside sabotage. Expressed as a set of exempt
triggers rather than a sabotage special case — three exempt triggers written as
one rule plus two exceptions is a rule that will be misread. Quiet-hours
exemption and budget exemption stay separate lists: the two rules are
independent in §14, and collapsing them would make the day-boundary pair
budget-exempt as a side effect. See
[Decisions](#decisions--resolved-2026-08-07).

---

## D. Polish, telemetry, defects

- **Hunter placeholder art.** §15 says "AI-placeholder static art"; it is still
  plain `View` primitives. `HunterSilhouette` already varies by evolution stage
  and dominant stat, so this is asset generation plus swapping the primitives —
  the component's interface does not change.
- **Telemetry for silent failures** (Phase 1 follow-up #1, Phase 3 follow-up #4).
  The timezone reconcile and `HealthPermissionSheet.ask()` both swallow errors
  permanently. `app_events` and `src/features/telemetry/events.ts` now exist, so
  this is three `track()` calls, not a system.
- **Defects found during the 2026-08-07 UI verification:**
  1. The create-squad name field inherits the join field's `letterSpacing: 8`
     after Join → Back → Create, truncating the placeholder. Native view
     recycling: `JoinSquadForm` sets the property, `CreateSquadForm` omits it, so
     the recycled view keeps the stale value. Fix by setting `letterSpacing: 0`
     explicitly. Pre-existing (`fc9f1f5`), not introduced by the scope addition.
  2. `programNote()`'s gym accuracy warning renders below the fold at the moment
     Gym is selected, so someone who taps Gym then Create never sees it — which
     defeats the honest-capability rule it exists to serve. Move it above the
     picker.
- **Verify the slot-unlock reveal** (Phase 7 follow-up #5). Previously
  impossible because the only test squad was 6/6; Takbo Manila now has four
  spare seats, so this is finally testable.
- **Correct the stale roadmap line.** Phase 3 still reads *"Still owed: deploy
  `sync-health` and rescore or reseed the live dev `daily_scores` rows"* — both
  were done on 2026-08-07.

---

## E. The Apple gate

Buy the Developer Program here. Everything past it is verification, not
construction:

1. Enable the **HealthKit capability** on the App ID.
2. Build the EAS dev client onto a physical iPhone.
3. **Verify `AppleExerciseTime` is populated phone-only.** Do this first — see
   the warning below.
4. Verify background delivery survives termination (`withHealthKitBackgroundObservers`
   is written but its behaviour has never been observed).
5. Swap anonymous sign-in for Sign in with Apple, and **disable anonymous
   sign-ins on the Supabase project** (deviation #7).
6. APNs auth key → Firebase → push works end to end.
7. Privacy nutrition labels, privacy policy, ToS. §15 lists the last two under
   V1, but external TestFlight testers need them too — they have a lead time, so
   start them during D.
8. Undeploy `seed-health` before external testers join.

> **Do step 3 before beta recruitment.** `AppleExerciseTime` is Apple-derived and
> absent from HealthKit's writeable list, so the simulator provably cannot answer
> it. If it turns out Watch-only in the wild, END is permanently zero for most
> beta users, `contributing_stats` caps at 3, the 800-point four-stat consistency
> bonus becomes unreachable, and `MAX_DAILY_SCORE_PHONE_ONLY = 4_400` is
> arithmetically wrong. That is a `kairo-core` scoring decision, not an ingest
> fix, and it is far cheaper before squads have history than after.

---

## Decisions — resolved 2026-08-07

All five went the way the recommendation argued. Kept in full rather than
collapsed to a verdict: the reasoning is what a future reader needs when one of
them stops being true.

| # | Decision | Resolution | Where it lands |
|---|---|---|---|
| 1 | **Is 1 banana/day enough?** `DAILY_ITEM_GRANT_FREE = 1` binds before `DEPLOY_CAP_FREE = 2`, so the beta would test sabotage sentiment at one hit per user per day — too quiet, in a 6-person squad, to answer "fun or resentment?" either way. | ✅ **Raise the grant to 2**, so the §8 cap is the real constraint. One constant. | Spec A0. Add to the deviations table — it changes a committed value. |
| 2 | **Quiet hours vs the day-boundary pushes.** §14 forbids 22:00–07:00 except sabotage, then schedules two notifications inside it, suppressing the evening urgency loop. | ✅ **The day-boundary pair is exempt alongside sabotage** — the core loop, not discretionary. Expressed as an exempt-trigger set, not a special case. | Spec C1. Add to the deviations table — it departs from §14's literal wording. |
| 3 | **Does the feed show hits between other people?** §8 says "squad feed" without saying whose events. | ✅ **Full squad visibility.** The drama is the product. Names and item only, never scores. | Spec A1. No deviation entry — this is what §8 says. |
| 4 | **Leader leaving.** Reuse account-deletion succession, or block a leader from leaving until they hand over? | ✅ **Reuse succession** — and extract it into one function both callers invoke, rather than two copies that agree today. | Spec B. No deviation entry. |
| 5 | **N-of-M squad streak** — cut to V1? | ✅ **Cut.** Removes a table, a trigger and finalization work from the critical path. | Add to the deviations table — `docs/roadmap.md` Phase 6 still has it open, and §15 puts it in V1. |

### Consequence of #1 that is not obvious

At `DAILY_ITEM_GRANT_FREE = 1` a free user could never hit the same person twice
in a day, so **`SAME_ITEM_COOLDOWN_MS` (3h) was unreachable dead code**. At 2 it
fires, and "You already hit them recently. Wait a few hours." becomes copy the
beta will see. It needs a test rather than an assumption — spec A0.

Grant and cap now bind simultaneously (2 and 2). `planDeploy` checks structural
rules before inventory, so a free user at 2/2 always sees `deploy_cap_reached`
and `no_items_remaining` becomes unreachable for them. That is the more
informative of the two messages, so the existing ordering is correct as it
stands.

---

## Scope cuts — adopted 2026-08-07

Both are the spec's own position, and adopting them removes work rather than
adding it:

- **N-of-M squad streak → V1** (§15). Personal streaks and Streak Shield stay.
- **Five of §14's eight notification triggers → V1** (§15). MVP ships sabotage,
  day end, and conditional day start.

---

## Test posture

Unchanged from `docs/roadmap.md` — strict TDD where a bug corrupts real
leaderboards, hand verification for UI:

| Component | How |
|---|---|
| `notifications.ts` budget engine | TDD in `kairo-core`, Node |
| `squad_feed()`, `leave_squad()` | PGlite schema tests, non-owner `authenticated` role |
| Feed copy, grant arithmetic | Pure modules, unit tested |
| Deploy sheet, feed UI, art, sabotage line on TODAY | Hand-verified on the simulator |
| Push delivery | Physical device, after E |

Two things the PGlite harness cannot prove and that must be checked against the
live project instead: that a sabotage insert's broadcast actually reaches a
subscribed client, and that `leave_squad()`'s succession behaves the same on the
hosted `auth` schema as on the stub.
