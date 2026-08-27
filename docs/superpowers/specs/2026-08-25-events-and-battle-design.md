# Events and the Battle — design

**Date:** 2026-08-25
**Status:** Design approved. Sub-project 4 of 5.
**Parent:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md`
**Plan:** `docs/superpowers/plans/2026-08-25-events-and-battle.md`
**Proposes roadmap deviations:** **#45**, **#48**, **#49**

This is one subsystem of the character race pivot. The parent spec is
authoritative for everything cross-cutting. This document covers the Goal → Event
reshape and the Battle, and records the decisions taken while planning them —
including one refinement of the parent that resolves a genuine conflict between
two of its own sentences.

---

## 1. Thesis

> A Goal was something you had to hit. An Event is something your squad beats
> together, and the strong member carrying you is the point.

A squad Goal was N-of-M: everyone had to clear it, so a weak member was a
liability and inviting somebody was a risk. An Event pools every participant's
contribution into one bar. That reversal is the entire reason the mechanic
exists — cooperation means somebody can carry you, and being carried is a reason
to be in a squad at all.

**Battle only in Phase 1.** Adventure is the same engine with a different metric
and ships once the engine is proven live (parent §11). The *schema* carries both
kinds and both metrics from day one, so **the migration happens once rather than
twice**.

## 2. What this covers, and what it does not

**Covers.** The `goals` → `challenge_events` reshape and everything attached to
it; `event.ts` in `@kairo/core`; `create_event()` and `event_progress()`;
pooled grading in `finalize-days`; the Battle surface on the Squad tab; the
deletion of every goal surface.

**Does not cover, and the sibling that does:**

| Out of this subsystem | Where it lives |
|---|---|
| The consent column `event_progress()` reads | Plan 1 |
| The Today tab's disclosure change | Plan 3 |
| Adventure | Deferred, parent §11 |
| The digest that reports Event progress | Plan 5 |

**Depends on no other plan to build**, and the one place it reads plan 1's work
(`profiles.squad_data_consent_at`) degrades cleanly if plan 1 has not landed:
the per-member breakdown returns NULL for everyone and the pooled total still
works.

## 3. Governing decisions inherited from the parent

- **Reshape, do not drop** (parent §7.2). The table already carries `squad_id`,
  `created_by`, `title`, `description`, a widenable `metric` check, a window and
  window-ordering validation. Its RLS, its column-level grants, its XP rollup
  and — the expensive one — its **erasure triggers** all work.
- **`created_by` stays SET NULL on profile deletion**, so a shared Event
  survives its author; it confers only the title-edit grant, so nulling it means
  nobody inherits the rename right.
- **`profiles_collect_orphaned_goals` stays an AFTER DELETE trigger.** Moving it
  BEFORE reaches a completion, which updates `profiles`, which modifies the row
  being deleted, and Postgres aborts the statement.
- **Boss HP is snapshotted at creation** (parent §4.3), unlike a Challenge
  target. §4.4 below states the asymmetry in full because it is the thing most
  likely to be "fixed" wrongly.
- **Progress is a read-time projection** over `health_buckets`, storing no
  number of its own.
- **XP flows through `recalculate_user_xp`'s completions source**, never through
  `daily_scores.xp_awarded`, which a rescore replays and wipes.
- **Existing goal rows are closed out rather than converted** (parent §9) —
  per-member N-of-M does not cleanly become a pooled Event, and inventing a
  conversion is worse than a clean end. `goal_completions` XP **stays banked, so
  nobody's level drops.**

## 4. Decisions taken while planning

### 4.1 `closed_at`, because two of the parent's sentences conflict

Parent §9 says two things that cannot both hold under a table rename:

1. Live goal rows are **closed out**.
2. Banked goal XP **stays**, so nobody's level drops.

A completion's foreign key holds its goal row alive. That row's `kind` is
`cumulative` and its `metric` is `daily_score` — both of which the new checks
reject. Both obvious resolutions are bad:

- **Delete the goal rows** → the completion cascades away → somebody's level
  drops, violating (2).
- **`add constraint … not valid`** → a permanently unvalidated constraint that
  the next reader will try to `VALIDATE` and break.

**Decision: the table gains `closed_at timestamptz`**, every surviving legacy
row gets a timestamp, and the new checks are written

```sql
check (closed_at is not null or kind in ('battle','adventure'))
```

That is a real, *validated* constraint stating exactly the true thing: **a live
Event is a Battle or an Adventure; a closed row is whatever it used to be.**
Every read filters `closed_at is null`. The same column carries
`challenge_events_one_live_per_kind`, the partial unique index enforcing at most
one live Battle and one live Adventure per squad.

`closed_at is null` is therefore **not optional on any read**, and omitting it
renders a pre-pivot points goal as a Battle.

### 4.2 Pooled means every roster member is paid

When the pooled bar is met, **every participant on the frozen roster gets a
completion row — including one who contributed nothing.**

That is not an oversight. Paying only contributors rebuilds the per-member rule
the pivot removed, one layer down: the weak member would once again be visibly
carrying a liability tag. Pooled means the strong member carries, and being
carried has to be worth something or nobody invites anybody.

Two arithmetic consequences follow, and both are easy to get wrong:

- **`pooledDays()` takes each date once.** `event_progress()` repeats the pooled
  figure on every participant's row — it is a window function over the date — so
  summing it naively multiplies every day by the squad size and reports a
  six-person squad as six times fitter than it is.
- **`daysUnresolved` counts distinct *dates*, not rows.** Counting rows would
  report a six-person squad's first day as six finalized days and declare the
  window spent on day one.

### 4.3 The client computes the boss's HP and the server stores it verbatim

`create_event()` takes `p_target` and writes it unchanged. This is the one place
in Kairo where a client decides a number the server stores, and it is a
deliberate exception to §12's server-authoritative rule.

**Why.** Reimplementing the trailing median in plpgsql would be a second
implementation of the arithmetic needing a differential test — exactly what
deviation #18 declined to pay for goal progress, and for the same reason.

**Why it is safe enough.** The exposure is bounded to *a squad setting an easy
boss for itself*, which costs that squad its own XP and affects nobody else.
`eventCompletionXp` is capped and scales by the window, not by the target, so
there is no way to convert an easy boss into disproportionate XP.

### 4.4 Snapshotted here, derived there — the asymmetry, stated

`challenge.ts` derives its target fresh on every read, and that is correct
*there*: nothing stateful exists for a retroactive Apple revision to invalidate,
and the trailing median moving **is** the mechanic — you clear one and the next
is harder.

An Event is the opposite case and inherits §8's Goal invariant. A target that
moves mid-window silently re-grades every day already counted, which is
precisely why a Challenge had to be a sibling concept rather than a `GoalKind`
in the first place. **A boss whose HP rises because the squad got fitter
mid-fight is that bug wearing a hat.**

So: the number is computed once, written to `challenge_events.target`, and is a
constant thereafter — while **progress** stays a read-time projection, so
revisions still flow through. *The target is fixed; the progress is replayed.*

Both modules carry a comment saying this, because "why is this one derived and
that one stored" is the question the next reader will have.

### 4.5 An Event always has a deadline, and always has a squad

Two new constraints the Goal shape did not have:

**`events_need_end`.** A Goal could be open-ended, because "reach 500,000 points
however long it takes" is a coherent commitment. A boss with no deadline is a
slowly filling bar that can never be lost — nothing is at stake, and there is no
reason to push this week rather than next.

**`events_need_squad`.** A personal Battle is a Challenge, which already exists,
is already tuned to one person's own history, and is already on `/train`. Two
mechanics for one thing is how a surface ends up half-built.

Both are conditional on `closed_at` like the others, because legacy personal and
open-ended goals exist.

### 4.6 The pooled total is ungated; the per-member breakdown is not

`event_progress()` returns `pooled_value` unconditionally and `value` — an
individual's contribution — behind plan 1's reciprocal consent gate.

Pooling is the point of an Event, and **joining one is itself an act of
participation**: you cannot fight together without knowing how the fight is
going. But an individual's raw active calories are exactly the disclosure the
consent gate exists for, so the breakdown carries it.

**Known limit, recorded rather than pretended away: a two-person squad can
invert the pooled total.** Subtract your own contribution and you have your
partner's. There is no version of a pooled mechanic that avoids this, and it is
named in the privacy policy alongside the rest.

### 4.7 `goal_completed` survives as a notification trigger

`notification_log.kind` is free `text` with no check constraint, so historical
rows already say `goal_completed`, and a push sent minutes before the deploy can
be tapped minutes after it. Both values stay in the TypeScript union and both
route — `goal_completed` degrades to the character tab, since the goal routes are
gone. Only new sends use `event_completed`.

A historical value that matches no case is a tap that goes nowhere, which is
indistinguishable from push being broken.

## 5. Data model

### 5.1 The reshape

| Was | Becomes |
|---|---|
| `goals` | `challenge_events` (+ `closed_at`) |
| `goal_participants` | `event_participants` (`goal_id` → `event_id`) |
| `goal_completions` | `event_completions` (`goal_id` → `event_id`) |
| `kind in ('cumulative','consistency')` | `('battle','adventure')`, conditional on `closed_at` |
| `metric in ('daily_score','daily_walk')` | `('active_kcal','distance_m')`, conditional on `closed_at` |
| `required_days`, `required_members` + biconditionals | dropped — pooled events have neither |
| `can_see_goal(uuid, uuid)` | `can_see_event(uuid, uuid)` |
| `create_goal(…10 args…)` | `create_event(…8 args…)` |
| `abandon_goal(uuid)` | `abandon_event(uuid)` — **closes** rather than deletes |
| `goal_window_scores(uuid, uuid)` | `event_progress(uuid, uuid)` |

`alter table … rename` carries indexes, constraints, policies, triggers and
grants across. Their **names** keep the old spelling, so each is renamed
explicitly — a constraint reading `goals_*` on a table called
`challenge_events` is how the next reader concludes the rename was half-done.

**`create_goal` is dropped by exact argument list**, never `create or replace`.
It has ten parameters and `can_see_goal` has two, both of which differ from the
original migration — the live schema is read before the migration is written.
`create_event` has **no defaulted parameters at all**, deliberately: adding a
defaulted parameter to a function that already has defaults is the ambiguous
overload PostgREST cannot resolve, and this function is where that trap has
already sprung twice.

### 5.2 `event.ts` in `@kairo/core`

`evaluateEvent()` (pooled, final-days-only completion, clamped fraction, pace),
`bossHp()`, `trailingMedian()`, `eventCompletionXp()`, `eventWindowDays()`.
Pure, zero-dependency, `today` always an argument.

`goal.ts` and `goal.test.ts` are deleted once nothing imports them — removing
the export line from `index.ts` first is what makes `npm run typecheck`
enumerate the consumers.

### 5.3 Difficulty and the floor

`EVENT_DIFFICULTIES` is `skirmish 0.6`, `standard 0.85`, `raid 1.15` — the share
of the squad's normal pooled output the boss costs.

**`standard` is deliberately under 1.** A cooperative mechanic that most squads
lose is one most squads stop using, and a first Battle is where a squad learns
that pooling works at all. `raid` is where pushing is required.

`BOSS_HP_FLOOR_PER_MEMBER_DAY` is 150 kcal. Without a floor, a brand-new squad's
pooled median is 0, the boss has 0 HP, and it is defeated in the same second it
is created — which reads as the feature being broken rather than as a gift.

HP rounds to the nearest hundred: the number is printed on a card and read
aloud, and "4,317 HP" claims a precision a trailing median does not have.

The multipliers are **not shown on the creation screen**. They are the engine's,
and 0.85 on a screen invites a squad to reason about the formula instead of
about the fight.

## 6. Surfaces

**Gone.** `GoalCard`, `GoalBar`, `CreateGoalForm`, `SquadGoalPanel`,
`app/goal/[id].tsx`, `app/goal/new.tsx`, and the whole `src/features/goals/`
directory. `windowLine()`, `contribution()`'s metric-before-kind ordering,
`stillPossible()` and the walk-goal `target: 1` sentinel go with them.

**New.** `BattleCard`, `CreateEventForm`, `SquadEventPanel`, `app/event/[id].tsx`,
`app/event/new.tsx`.

**The Battle lives on the Squad tab, not on the character screen.** A squad's
shared fight belongs where the squad is; the character screen's subject is the
character.

**`SquadEventPanel` and `/event/new` have no disclosure gate.** An Event is a
squad's shared thing, and gating it on one member's scored-day count would hide
from a new member something the rest of the squad is already looking at.

The creation form asks for exactly three things — a name, a window, a difficulty
— and computes the fourth. It shows the computed HP before submitting, with
*"Set from your squad's last two weeks, so it moves as you do"*: the same
sentence `challenge-copy.ts` uses, for the same reason, and it is what makes a
snapshotted number legible rather than arbitrary. **Submit is disabled until the
history query resolves** — creating with a fallback of 0 applies the floor and
sets a permanently easy boss with nothing to notice.

## 7. Testing

- `event.ts` — pooling, window exclusion, final-days-only completion, clamped
  fraction, expiry, latch-after-expiry, pace, empty window, median behaviour,
  boss floor, XP scaling and cap. Pure, in Node.
- `event-copy.ts` and `progress.ts` (`pooledDays`) — pure, in Node.
  `pooledDays` has its own test precisely because the take-each-date-once rule
  is the easiest mistake to make against this RPC.
- `event-plan.ts` — pays the whole roster, pays nobody while short, ignores days
  outside the window, skips the already-paid, never completes off a provisional
  day.
- Schema suite (PGlite): the kind and metric checks against live and closed
  rows, one-live-per-kind, roster freezing, no client INSERT, `event_progress`
  pooling and its refusal for a non-member, the standing assertion that no
  `public` function body mentions `workout_sessions`, and that
  `recalculate_user_xp` still names every source.
- **Verified live before and after:** `select id, total_xp from profiles order
  by id` — no account's XP may fall.
- UI by hand, with two real accounts in one squad, so the bar can be watched
  moving from either side.

## 8. Migration posture

The migration renames three tables `finalize-days` reads and writes, so **it
ships with that function's redeploy**, and `smoke-sync.mjs` runs after. Applying
one without the other is exactly the August 2026 outage: health data kept
landing while nothing scored, and every test passed the whole time, because they
check the source and not the deployed artifact.

## 9. Proposed roadmap deviations

| # | Deviation |
|---|---|
| 45 | Goals removed at the surface; `goals` reshaped into `challenge_events`, with legacy rows closed out via `closed_at` rather than deleted or grandfathered (§4.1) |
| 48 | Events are **pooled**, reversing squad goals' per-member N-of-M; the whole roster is paid on completion |
| 49 | Event targets are **snapshotted at creation**, unlike Challenge targets — §8's invariant applies to Events and not to Challenges |

## 10. Open risks

- **Pooling can hide a disengaged member indefinitely.** That is the mechanic
  working, and it is also how a squad stops noticing somebody has stopped
  playing. The race is the counterweight — it is per-person and daily — which is
  part of why Battle ships after the Race rather than instead of it.
- **The two-person pooled inversion** (§4.6) has no technical mitigation.
- **`recalculate_user_xp` collides with plan 3.** Both rewrite it; the second to
  land must carry the first's sources forward or every affected account's level
  drops on the next write.
- **Fourteen sequential RPC calls on the creation screen** is the honest cost of
  not adding a second aggregating function to review. If it feels slow on device
  the fix is one `event_kcal_history()` RPC with the same consent gate, not
  caching.
- **Adventure is written into the schema and nowhere else.** A kind nothing can
  create is a kind nothing tests, and the first Adventure will find whatever
  `distance_m` assumptions went unexercised.
