# The Today Tab — design

**Date:** 2026-08-25
**Status:** Design approved. Sub-project 3 of 5.
**Parent:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md`
**Plan:** `docs/superpowers/plans/2026-08-25-the-today-tab.md`
**Depends on:** sub-project 1, The Race
**Proposes roadmap deviation:** **#50**

This is one subsystem of the character race pivot. The parent spec is
authoritative for everything cross-cutting. This document covers the fourth tab,
quests and the narrowed disclosure gate, and records the decisions taken while
planning them — quests in particular are one paragraph in the parent (§5.3) and
a whole subsystem in practice.

---

## 1. Thesis

> The present moment gets a tab, and a brand-new account can see all of it on
> day one.

The character screen's subject is *the character*. Everything below its hero —
the day's steps, the Daily Walk, the Challenge door — was a different subject
sharing a scroll, and that scroll had no room left for anything new. Splitting
them makes room for quests without making the home screen longer than a thumb,
and it puts the loop where a tab bar can point at it.

## 2. What this covers, and what it does not

**Covers.** The fourth orbit disc and `app/(tabs)/today.tsx`; the quest
subsystem end to end (catalogue, tier, daily pick, progress, completion, XP);
the race summary card; the narrowed disclosure gate.

**Does not cover, and the sibling that does:**

| Out of this subsystem | Where it lives |
|---|---|
| `race.ts`, `rankRacers`, the widened projection, the consent gate | Plan 1 |
| The full-screen track on the Squad tab | Plan 1 |
| Stat vocabulary anywhere on this tab | Plan 2 |
| `GoalCard`'s disclosure gate, and `GoalCard` itself | Plan 4 — see §4.6 |
| The digest that routes here | Plan 5 |

**Depends on plan 1** for exactly two things, both in the race card:
`rankRacers` / `RACE_FINISH_LINE` from `@kairo/core`, and `LeaderboardRow.steps`
being present and nullable. Everything else in this subsystem is independent of
it.

## 3. Governing decisions inherited from the parent

- **Four tabs — Character · Today · Squad · Profile** (parent §2).
- **Three quests a day, reset at local midnight**, from a hand-authored set at
  three difficulty tiers, auto-assigned from the account's trailing scored days
  with a manual override in Profile (parent §5.3).
- **The Daily Walk stays flat at 10,000 and moves to this tab.** It is a
  public-health number and never scales with the user. It is also now the race's
  finish line (parent §4.1).
- **`/train`'s Challenges keep their name and their behaviour** (parent §5.3),
  both areas still opt-in and off by default.
- **Quests are outside the disclosure gate** (parent §4.4). The mechanism, the
  threshold constant, `useScoredDayCount`'s `total > 0` filter and the retention
  measurement all stay exactly as they are. §4.6 below narrows the parent's
  reading: the **gated surface list does not shrink either** — `TrainEntry` and
  `/train` stay in the gate, and quests are simply built outside it.
- **No coins ship in Phase 1.** A currency with no sink is a countdown to
  disappointment, and an earn rate set before there is anything to buy is an
  economy you cannot rebalance once real money touches it. Quest completion pays
  XP.

## 4. Decisions taken while planning

### 4.1 A quest is derived, never stored

The parent says three a day, reset at midnight. It does not say how, and the
obvious implementation — a `daily_quests` table plus a midnight job per
timezone — is the expensive one and the fragile one.

Instead: **`pickQuests()` is a pure hash of `(userId, localDate, tier)`.** The
three quests an account sees are computed, not stored, so:

- the local-midnight reset costs no job, no row and no cron — tomorrow's date
  simply hashes to a different three;
- nothing stateful exists for a retroactive Apple revision to invalidate;
- progress is a read-time projection over `health_buckets` and `daily_sleep`,
  the same property score replay and event progress already have.

This is the pattern `challenge.ts` established (parent §4.3 calls it out for the
opposite reason): **derived, with only the completion stored**, because the
completion pays XP and must fire exactly once.

**A hash, not a PRNG.** `@kairo/core` forbids randomness, and the reason bites
here rather than being a house rule: a random pick would hand the same account a
different three on every render, and the user would watch their morning's work
disappear.

### 4.2 The catalogue lives in `@kairo/core`; the sentences live in the feature

`finalize-days` grades quests and imports `_shared/core.ts`, so the *definitions*
must be reachable from the server. The *copy* is the product's and lives in
`src/features/quests/quest-copy.ts`.

This is exactly the `challenge.ts` / `challenge-copy.ts` split, and it is why
`quest_completions.quest_id` is opaque `text` in the database: adding a quest
costs no migration. The price, stated in the column comment, is that a
**renamed id orphans every completion banked against it** — retire a quest by
deleting the row and leaving the id unused, never by reusing it.

### 4.3 The tier rule measures engagement, not capability — recorded, not fixed

Parent §5.3 says tier is auto-assigned "from the account's trailing scored
days". A count of scored days measures how long somebody has been here, not how
far they walk: a thirty-day account averaging 3,000 steps gets the same tier as
one averaging 15,000.

The alternative — a trailing **median of daily steps**, the pattern
`challenge.ts` uses — was considered and **not taken**, because it makes the
quest bar move with the user, which is the exact conflation the Daily Walk
exists to refuse and which the parent restates one paragraph later.

So the rule ships as specified, and **the manual override is the correction for
a rule that is wrong by construction for part of the cohort.** That is why the
override is in Phase 1 rather than deferred, and why it **wins outright** — a
rule that could veto it would make it a hint. The Profile copy names the
automatic rule's actual input, so a user who finds their quests too easy
understands why rather than assuming the app measured them and got it wrong.

### 4.4 The client's tier and the server's must agree

This is the sharpest failure in the subsystem and it is silent.

`finalize-days` grades whichever three quests `pickQuests()` returns for the
tier **it** resolves. If that disagrees with the tier the client resolved — a
different scored-day count, or an ignored override — **the server pays XP for
quests that were never on screen, and the completion latches.**

Both sides therefore call the same `questTier()` with the same lifetime
scored-day count and the same `profiles.quest_tier_override`, and the override
precedence is inside that function rather than at either call site.

### 4.5 The fourth disc, and what "centre" meant

`TabPill` is a hand-built three-disc orbit nav, not a stock tab bar: the
character sits centre and larger because it is where the app opens and returns.
Four items break that geometry.

**The character keeps the raised disc and stops being geometrically centred.**
The raised disc means *anchor*, not *middle*; with four items a raised
third-of-four would be arbitrary, and two raised discs is no anchor at all.

Order becomes `['squad', 'index', 'today', 'profile']` — Squad stays leftmost,
You stays rightmost, so **no existing thumb target moves to the other end of the
bar**, and the new place slots between the two you already visit.

Sizes shrink so four fit the narrowest supported screen: orbits 60→52, centre
74→68, bar gap `space.lg`→`space.md`. `3 × 52 + 68 + 3 × 16 = 272` against
320pt. `NAV_HEIGHT` stays 96, so `TAB_PILL_CLEARANCE` is unchanged — the discs
got smaller, not the bar.

### 4.6 What the gate keeps, exactly — Challenges stay in it

Parent §4.4 names `StatRail` and Strain/Sleep as what the gate keeps, and read
strictly that list is exhaustive, which would take Challenges out of it too.
**It is read as illustrative rather than exhaustive: only quests leave.** The
gate keeps `StatRail`, the Strain/Sleep rows, `TrainEntry` **and** `/train`'s
`resolved && stage === 'core'` redirect, all exactly as they are today.

Three reasons, and the first is decisive:

1. **Parent §5.3 says `/train`'s Challenges keep their name *and their
   behaviour*, unchanged.** The disclosure redirect is part of that behaviour —
   it is a rule about who reaches the screen, not a rule about the mechanic —
   so taking Challenges out of the gate contradicts a sentence the parent wrote
   about Challenges specifically, in service of a list it wrote about something
   else.
2. **§4.4's stated motive is fully served without it.** The concern is a Today
   tab that "shows only the Daily Walk for three days". With the race card,
   three quests and the Daily Walk all ungated, a day-one account meets three
   live things on that tab. Ungating a fourth buys nothing against the problem
   the parent named.
3. **A Challenge is not what teaches the loop; a quest is.** That distinction is
   the whole argument for ungating quests, and it cuts the other way here. A
   Challenge is a trailing-median target derived from workout sessions the
   account may not have any of — `establish`-kind cards exist precisely because
   a new user has no baseline — and it is opt-in and off by default. Showing it
   on day one offers depth to somebody who has not yet produced the data it
   reads.

So the gate's subject list is **unchanged by this subsystem.** Quests are simply
built outside it, which is a fact about a new surface rather than a change to an
existing rule. That makes deviation #50's disclosure half considerably smaller:
the mechanism, the threshold constant, `useScoredDayCount`'s `total > 0` filter,
the retention measurement **and the list of gated surfaces** all stay as they
are.

`GoalCard`, `/goal/new` and `SquadGoalPanel` likewise keep their gate untouched
here and are deleted wholesale by plan 4. Removing a gate from a card that is
about to be deleted is work that can only produce a merge conflict.

**`resolved && stage` still governs navigation.** Hide on `stage`; navigate on
`resolved && stage`. That rule survives this change and applies to any route
that redirects — there simply are fewer of them.

## 5. Data model

### 5.1 `quest_completions` — new

```
quest_completions(user_id, local_date, quest_id, xp_awarded, created_at)
primary key (user_id, local_date, quest_id)
```

Owner-readable, service-role-writable, RLS on. Written by `finalize-days` from
**final** days with `on conflict do nothing`, which is the one-way latch. A
later downward revision never revokes a completion — §19's rule, the same
posture `goal_completions` takes.

### 5.2 `profiles.quest_tier_override text` — new

`check (... in ('starter','steady','strong'))`, nullable. NULL means the
automatic rule. Added to the column-scoped UPDATE grant, with the table-level
revoke preceding it.

### 5.3 `recalculate_user_xp` gains a fourth source

Quest XP is **never** written into `daily_scores.xp_awarded` — a rescore replays
that column from tier points and would wipe it. It lands in
`quest_completions` and reaches `profiles.total_xp` through the rollup, which is
a **full recompute, never an increment**, so nothing double-counts.

**Cross-plan hazard.** Plan 4 rewrites the same function to swap
`goal_completions` for `event_completions`. The function is written out whole
every time it changes, so **whichever plan lands second must read the deployed
body first** and carry the other's sources forward. Landing it blind silently
drops a whole XP source and every affected account's level falls on the next
write. The check is one query:
`select prosrc from pg_proc where proname = 'recalculate_user_xp'`.

## 6. Quest content

Hand-authored, three tiers, **at least six per tier** so the daily pick has
something to choose between — with exactly three, every day would show the same
three in a different order and the reset would read as a bug.

Metrics are all figures the app already reads: steps, active calories, active
hours, distance, sleep minutes. **No quest widens what Kairo collects.**

XP is deliberately small: `MAX_REALISTIC_DAILY_XP` is 200, and three quests cap
at 60 together. A quest is a garnish on the loop, never a cheaper route through
it — otherwise the fastest way to level is to clear three easy bars and stop.

**Null is not zero.** A missing `daily_sleep` row means the night is *unknown*,
and rendering "0 of 420 minutes" would accuse somebody of not sleeping when the
truth is that Kairo cannot see it. The copy says "No reading yet". Same rule
`rawFor` in `stat-detail.ts` follows.

Quest content is authored, not generated, so its volume is a real ongoing cost
that nothing in the codebase absorbs (parent §13).

## 7. Screen composition

The Today tab, in order: **race card → three quests → Daily Walk → Challenge
door.** The race is today; the quests are what to do about it; the walk is the
floor every day shares; Challenges are the opt-in depth underneath.

**The Challenge door is the only gated thing on the tab** (§4.6), so a `core`
account sees the first three and a `full` account sees all four. That ordering
is chosen so the gated item is **last**: a hidden card at the bottom leaves no
hole, where one removed from the middle would.

The character screen keeps its hero, `TodayPanel`, `SyncStatus`, the disclosure
note and (until plan 4) `GoalCard`. It sheds the Daily Walk and the Challenge
door.

Every card on the Today tab is keyed to the player's own local date (§2) and
none of them reads the clock — `localToday` is threaded from
`profiles.timezone`, as everywhere else.

All four queries are already in TanStack's cache from the character and squad
screens, so **the tab adds no requests**.

## 8. Accessibility

- **One accessibility element per quest card**, with both halves of the
  grouping fix. Three cards with a bar and an XP chip each is twelve stops
  otherwise — the leaderboard's failure in miniature.
- **Flow-based throughout.** No `top` on any child. Three stacked cards with a
  bar in each is exactly the shape that overlapped when the character HUD pinned
  its pills at fixed offsets.
- The headline takes `flex: 1` so the XP chip is pushed to the end rather than
  sitting at a fixed width that tears at large Dynamic Type.
- The nav must report **four `tab` elements** named Character, Today, Squad, You.

Verified at `accessibility-extra-extra-extra-large` after a relaunch, then in
the Accessibility Inspector.

## 9. Testing

- `quest.ts` in `@kairo/core` — catalogue wellformedness (unique ids, six per
  tier, XP ceiling), tier resolution including the override and a NaN count,
  determinism per day, difference across days and across accounts, no repeat
  within a day, progress clamping, null-is-not-zero. Pure, in Node.
- `quest-copy.ts` — the three states of the progress line, durations and
  distances as words, the composed label. Pure, in Node.
- `quest-plan.ts` — that grading uses the **override's** tier, that nothing is
  paid on an empty day, that an already-banked quest is skipped, and that the
  XP carried is the quest's own.
- Schema suite (PGlite): owner-only reads, no client write, the latch, the
  fourth XP source, and an assertion that `recalculate_user_xp`'s body still
  names every source.
- UI by hand. A brand-new account with zero scored days is the case that matters.

## 10. Proposed roadmap deviation

| # | Deviation |
|---|---|
| 50 | Fourth tab (`Today`) with three derived quests a day, built **outside** the disclosure gate; the gate's own subject list is unchanged — `StatRail`, the Strain/Sleep rows, `TrainEntry` and `/train`'s redirect all stay in it (§4.6) |

## 11. Open risks

- **The tier rule is knowingly a proxy for the wrong thing** (§4.3). The
  override is the mitigation; `quest_cleared`'s `{ tier }` payload (plan 5) is
  how the bars get checked against reality rather than guessed.
- **Quest content volume is an ongoing authoring cost** with no automation
  behind it, and it is the part of the pivot most likely to go stale quietly.
- **Four discs on the narrowest device is computed, not measured.** 272 against
  320pt has margin, but the bar has never carried four items and the arithmetic
  assumes the shadow does not extend the hit area.
- **The `recalculate_user_xp` collision with plan 4 is a silent, level-dropping
  failure** if the second migration lands blind. It is called out in both plans
  and in both migrations' comments, which is the whole mitigation available.
