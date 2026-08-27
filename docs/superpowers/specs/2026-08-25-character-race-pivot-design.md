# The character race pivot — design

**Date:** 2026-08-25
**Status:** Design approved in brainstorming; not yet built.
**Source:** `docs/Ideas/KAIRO_Character_Solo_Squad_Gameplay_Design(1).md`, interrogated
against the shipped build on 2026-08-25.

This is a **pre-launch pivot**, decided deliberately. The TestFlight build stops
being the thing measured; `kairo_retention()` and the milestone events are
re-pointed at the loop described here. No user data is destroyed.

It proposes **roadmap deviations #44–#52**, listed in §12. Nothing here is
implemented until those rows exist in `docs/roadmap.md`.

---

## 1. Thesis

> Your real life powers your character, and your character races your friends.

The shipped app converts activity into a *score* and ranks it. The pivot keeps
that engine exactly as it is and puts a **race** on top of it, drawn in raw
units, with the four Philippine endemic figures running the track.

The critical finding of the design pass: **almost none of the source document's
cost is real.** The race is `squad_leaderboard()` with characters on it, the
boss reuses `challenge.ts`'s trailing-median pattern, expedition distance is
already stored in `health_buckets.distance_m`, and Battle and Adventure fit the
`goals` table's shape rather than needing a new one. What the document asks for
that genuinely costs money — cosmetics, equipment, an animation runtime, a solo
world map, a currency — is all deferred.

---

## 2. Decisions taken

| Question | Decision |
|---|---|
| Doc status | Pre-launch pivot |
| Scoring engine | **Survives untouched.** Races read raw units alongside it |
| Stat names | Engine keys stay `AGI`/`STR`/`MND`; players read **Body · Motion · Mind** |
| Goals | Deleted at the product surface; the *tables* are reshaped into Events |
| Squad data | Daily totals for all metrics become squad-visible. Hourly buckets and workout sessions stay owner-only |
| Race | Always-on daily, no creation flow. Pooled contribution nowhere — it is a rank |
| Battle / Adventure | Created events, **pooled**, anyone creates, one of each live per squad |
| Battle damage | Active calories (`STR`) |
| Adventure distance | `health_buckets.distance_m` — walking and running only |
| Boss HP | Scaled to the squad's recent output, **snapshotted at creation** (§4.3) |
| Race finish line | `DAILY_STEP_BASELINE` — see §4.1, this is the same number as the Daily Walk |
| Anti-cheat | The finish line is a **cap**: race contribution counts steps up to it and no further |
| Result finality | Final once the window closes past the existing ~2h grace. History kept |
| Navigation | Four tabs — Character · **Today** · Squad · Profile |
| Race visual | Horizontal lanes full-screen on Squad; hero card on Today |
| Solo user | Races their own previous days as ghost characters |
| Quests | Auto-tiered from history, three per day, reset at local midnight |
| Level reward | The figure itself changes more visibly. No cosmetics, no coins in Phase 1 |
| Species | The four Philippine endemics. Roster unchanged |
| Beta accounts | Keep everything. Only the goal tables and screens go |
| Naming | `/train` keeps "Challenge". Race/Battle/Adventure are **Events** |
| Push volume | **One digest a day, maximum** |
| Squad size | Stays 6. Six lanes is the design |
| Disclosure | Survives; races are never hidden, and quests leave the gate (§4.4) |

---

## 3. What survives, what changes, what goes

**Survives, entirely untouched.** `packages/kairo-core`'s scoring: `tierFor`,
`shiftedTierFor`, `TIER_POINTS`, `THRESHOLDS`, `computeDailyScore`, the
`3 / earnable stats` ceiling scaling, `planDay`, `finalizable_days()`,
`isFinalizable()`, the streak and its shield, `challenge.ts`, `strain`,
`disclosureStage()`. `sync-health` and its bucket-then-rescore ordering.
`profiles` rollups and `recalculate_user_xp`. Species, invites, deep links,
Sign in with Apple, account deletion, EAS Update.

**Changes.** `squad_leaderboard()` gains raw daily totals (§7.1). `STAT_NAMES`
gains new words (§5.5). `finalize-days` learns to write race results and grade
Events. `dispatch-notifications` collapses to one digest. Four tabs instead of
three. The character figure's level-band response becomes more legible.

**Goes.** `GoalCard`, `/goal/new`, `SquadGoalPanel`, `goal_window_scores()`,
`create_goal()`, the walk-goal `target: 1` sentinel, `windowLine()`,
`contribution()`'s metric-before-kind ordering, `stillPossible()`. The *tables*
do not go — see §7.2.

---

## 4. The five decisions folded in

These were surfaced during the interview and are decided here with reasoning,
rather than left open.

### 4.1 The finish line and the Daily Walk are the same number — deliberately

`DAILY_STEP_BASELINE` is `THRESHOLDS.AGI.gold`, which is 10,000, and
`scoring.test.ts:873` pins it there. Making the race finish line Gold's AGI
threshold therefore makes **crossing the line and clearing the Daily Walk the
same event**.

**Recommendation: unify them, and say so in the UI.** One number the app
teaches, reinforced twice — the race is the social reading of the walk, the
streak is the personal one. A second competitive bar at a different number
would split attention between two step targets, and the whole design brief is
"simple to understand, deep underneath".

Three constraints follow and all three are load-bearing:

- The race reads **raw steps**, which `daily_scores` does not store. It comes
  from the widened projection in §7.1, not from `tiers`.
- Anything that reads a *tier* to decide whether the line was crossed must read
  **`tiers->>'AGI_base'`, never `tiers->>'AGI'`**. The spread shift lowers AGI's
  whole ladder including Gold, and a race whose finish line moves with the
  user's active hours is exactly the public-health failure `DAILY_STEP_BASELINE`
  exists to prevent.
- The cap is **imported**, never re-derived. The race module imports
  `DAILY_STEP_BASELINE` from `@kairo/core`. Writing `10_000` anywhere in the
  race code reintroduces the drift that constant was built to stop.

### 4.2 The daily digest fires in the morning, not at finalization

Results finalize roughly two hours after each user's local midnight. A digest
carrying the finalized result would therefore fire at about 2am.

**Recommendation: decouple them.** `finalize-days` writes the result when the
day closes. `dispatch-notifications` sends one digest per user at a fixed local
hour — **08:00 in `profiles.timezone`** — carrying *yesterday's final result*
and *today's live standing*. The function already runs on cron and already reads
each user's timezone, so this is a query change, not new infrastructure.

The cap is enforced **server-side, in the dispatch query**, not by client
suppression. One row per user per local date in a sent-digest ledger; the query
excludes anyone already sent. A client-side cap is not a cap — it is a race
between devices.

### 4.3 Boss HP is snapshotted at creation, unlike a Challenge

`challenge.ts` derives its target fresh on every read, and that is correct
*there*: nothing stateful exists for a retroactive Apple revision to invalidate.

An Event is the opposite case and inherits §8's Goal invariant instead. A target
that moves mid-window silently re-grades every day already counted — which is
precisely why a Challenge had to be a sibling concept rather than a `GoalKind`.
A boss whose HP rises because the squad got fitter mid-fight is that bug wearing
a hat.

**Recommendation: derive at creation, store on the row.** HP is computed once
from the participants' trailing median daily `active_kcal` over the prior 14
days, multiplied by the window length and a difficulty factor, then written to
`challenge_events.target`. Thereafter it is a constant. Progress against it stays
a read-time projection over `health_buckets`, so revisions flow through the way
they already do — the **target** is fixed, the **progress** is replayed.

This asymmetry needs a comment in both modules, because "why is this one derived
and that one stored" is the question the next reader will have.

### 4.4 Quests leave the disclosure gate

Disclosure survives, and races are never hidden. But if quests stay gated, a new
account's **Today tab** — tab 2 of 4, named for the present moment — shows only
the Daily Walk for three days.

**Recommendation: quests are ungated; the gate keeps `StatRail` and
Strain/Sleep.** The mechanism, the threshold constant, `useScoredDayCount`'s
`total > 0` filter and the retention measurement all stay exactly as they are —
only the subject list shrinks. Quests are the new user's onboarding into the
loop, and gating the thing that teaches the loop is backwards.

The `resolved && stage === 'core'` rule for **navigation** still applies to any
route that redirects. Hide on `stage`; navigate on `resolved && stage`.

### 4.5 The privacy widening is a launch blocker with a consent gate

Widening `squad_leaderboard()` to carry sleep, calories and steps is a
**one-way door**. A squadmate who has seen a figure cannot unsee it, and the
current beta cohort joined under a model where they could not.

**Recommendation, and this blocks the first outsider joining a squad:**

1. An **explicit consent surface** at squad create and squad join, naming the
   specific figures that become visible — steps, distance, active calories,
   sleep duration — and naming what stays private: hourly movement, heart rate,
   workout sessions, pace and routes. Not a line in a policy; a screen with a
   decline path, built to the same standard as the HealthKit permission sheet
   (bounded height, `ScrollView` at `flexGrow: 0, flexShrink: 1`, text wrapped
   in a `View` with a computed point width — the 2026-08-17 lessons apply).
2. **Existing squad members must consent again.** They joined under the old
   model. Until every member of a squad has consented, that squad's board shows
   what it shows today.
3. The privacy policy and the App Store privacy answers are updated in the same
   pass. HealthKit data disclosed to other users engages App Review guideline
   5.1.3; consent is the defensible posture and an implicit one is not.

The narrower option — steps and distance only, no sleep — remains available and
would remove most of this cost. It is recorded here as the fallback if the
consent surface proves expensive.

---

## 5. Subsystem designs

### 5.1 Race — always on, no creation flow

A Race is not an object. It is a **reading of the day**: `squad_leaderboard()`
for one local date, ranked by capped steps, drawn as a track.

- **Progress** = `min(steps, DAILY_STEP_BASELINE) / DAILY_STEP_BASELINE`.
- **Rank** = capped steps descending. Ties are broken by daily score, then by
  `user_id`, so ordering is stable across refetches.
- **Liveness is stated, never implied.** Every lane carries the racer's last
  sync time; a lane stale beyond a threshold is visibly marked. HealthKit
  background delivery is opportunistic and the app must not pretend otherwise.
- **Full screen (Squad tab):** horizontal lanes, six maximum.
- **Summary card (Today tab):** your figure, your position, distance to the
  flag, rivals as a strip underneath.
- **Solo:** with no squadmates, the rivals are your own previous days rendered
  as ghost figures. This is the narrow, deliberate exception to the source
  document's §20 warning against solo challenge modes — it exists so that no
  user ever meets an empty tab, and so the mechanic teaches itself before a
  friend arrives.

**Accessibility is not optional here, it is the main build risk.** A six-lane
track is the character-HUD failure waiting to happen:

- Lanes are **flow-based**. No `top` on any lane child. The HUD's `+8/+48/+48/+132`
  constants assumed heights nothing enforced and overlapped at large Dynamic
  Type; a track is the same shape of mistake.
- Each lane is **one accessibility element** with a composed label, following
  `StatIcon`'s pattern: parent gets `accessible` + `accessibilityLabel`, and
  every direct child gets `accessibilityElementsHidden` +
  `importantForAccessibility="no-hide-descendants"`. Both halves. Removing one
  is how the twelve-stops-per-row bug comes back.
- The composition is a tested pure module, extending `row-label.ts` rather than
  forking it.
- Verified with `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
  **and a relaunch**, because RN caches text measurements.

### 5.2 Events — Battle and Adventure

One concept, two metrics, pooled across participants.

| | Battle | Adventure |
|---|---|---|
| Metric | `active_kcal` | `distance_m` |
| Target | Boss HP, snapshotted (§4.3) | Party distance, set by creator |
| Framing | Defeat the boss | Reach the destination |
| Progress | Pooled sum over the window | Pooled sum over the window |

- **Anyone in the squad creates**; at most one Battle and one Adventure live per
  squad at a time. The creation flow is the source document's §13, minus the
  participant picker — participants are the squad.
- **Pooled, deliberately.** This reverses the per-member N-of-M rule that squad
  goals used. The reversal is the point: cooperation means the strong member
  carries, and that is a reason to invite people.
- **Progress is a read-time projection** over `health_buckets`, storing no
  number of its own — the same property goal progress had, preserved for the
  same reason.
- **Completion is stored**, with the target snapshotted, in `event_completions`.
- XP flows through `recalculate_user_xp`'s third source, exactly where
  `goal_completions` already sits — **never** through `daily_scores.xp_awarded`,
  which a rescore replays and wipes.

### 5.3 Today tab — quests, walk, challenges

- **Three quests a day**, reset at local midnight, drawn from a hand-authored
  set at three difficulty tiers. Tier is auto-assigned from the account's
  trailing scored days, with a manual override in Profile.
- **The Daily Walk stays flat at 10,000 and stays on this tab.** It is a
  public-health number and never scales with the user. It is also now the race's
  finish line (§4.1).
- **`/train`'s Challenges keep their name and their behaviour**, unchanged, both
  areas still opt-in and off by default.

Quest completion pays XP through the same third source as Events. No coins ship
in Phase 1 — a currency with no sink is a countdown to disappointment, and an
earn rate set before there is anything to buy is an economy you cannot rebalance
once real money touches it.

### 5.4 Character tab — the reward for levelling

With no cosmetics and no coins, **the figure itself is the reward.** The three
visual responses already exist — ground shadow by level band, build proportions
by dominant stat, presence ring by ability rating. They become substantially
more legible: wider bands, larger deltas, a visible change at each level-up
rather than a change you would need two screenshots to notice.

No new dependency. `react-native-svg`, Rive and Reanimated all stay uninstalled.
This is a tuning-and-art pass on `CharacterFigure.tsx`, not an animation build.

### 5.5 Naming

`/train` keeps **Challenge**. Race, Battle and Adventure are collectively
**Events**. No code renames: `challenge.ts`, `challenge_completions`,
`RUN_ACTIVITY_TYPE` and the compile-time activity-type guard are all untouched.

Stat words become **Body** (`STR`), **Motion** (`AGI`), **Mind** (`MND`), in
`STAT_NAMES` (`src/ui/StatIcon.tsx:52`), which is already the single source and
already covers `Dominance`. Engine keys do not move. This is the same move
deviation #23 made with tier names: the engine keeps its vocabulary, the surface
gets the player's.

---

## 6. Vocabulary

| Say | Not |
|---|---|
| Event | Challenge *(reserved for `/train`)* |
| Race | daily leaderboard |
| Body / Motion / Mind | STR / AGI / MND *(engine keys only)* |
| your character | Hunter, avatar |
| squad | barkada, party, clan |

---

## 7. Data model

### 7.1 `squad_leaderboard()` — widened

Gains the day's raw totals: `steps`, `distance_m`, `active_kcal`,
`sleep_minutes`. Does **not** gain hourly movement, heart rate, workout
sessions, pace or timestamps.

Two traps apply and both have bitten this codebase:

- **Drop by exact argument list, then recreate.** Never `create or replace` when
  the signature changes — a surviving overload fails nothing until a call site
  resolves to it. This is the `create_goal` / `p_metric` trap.
- **The board still re-sums the per-stat columns** to apply program weights at
  read time. Adding raw totals does not change ranking; the race ranks on capped
  steps, which is a separate ordering from the weighted board. Both orderings
  ship, and a schema test pins the RPC's exact row shape.

### 7.2 `goals` → `challenge_events`

**Reshape, do not drop.** The table already carries `squad_id`, `created_by`,
`title`, `target`, a widenable `metric` check, a `starts_on`/`ends_on` window,
and window-ordering validation. Its RLS, its column-level grants, its
`finalize-days` grading, its XP rollup and its notification wiring all work.

Changes:

- `kind` check becomes `('battle', 'adventure')`.
- `metric` check widens to `('active_kcal', 'distance_m')`. Note the existing
  value is `'daily_score'` — the *value* name, not `'points'`. Match the
  database.
- `required_days` and `required_members` are dropped along with their
  biconditional constraints; pooled events have neither.
- `goal_participants` → `event_participants`, `goal_completions` →
  `event_completions`, unchanged in shape.
- `created_by` stays **SET NULL** on profile deletion, and
  `profiles_collect_orphaned_goals` stays an **AFTER DELETE** trigger. Moving it
  BEFORE reaches a completion, which updates `profiles`, which modifies the row
  being deleted, and Postgres aborts the statement.

`create_goal()` is **dropped and recreated** as `create_event()`. `authenticated`
holds only SELECT and UPDATE(title, description) on the table, so that function is the only
way a row is ever written — and adding a defaulted parameter to a function that
already has defaults is an ambiguous overload PostgREST cannot resolve.

`goal_window_scores()` is replaced by `event_progress()`, which pools a raw
metric over `health_buckets` instead of projecting scores.

### 7.3 `race_results` — new

```
race_results(squad_id, local_date, standings jsonb, finalized_at)
primary key (squad_id, local_date)
```

Written **once** by `finalize-days`, when the last member's day for that date
finalizes. Because days are per-user local, a squad's race for date *D* is not
final until every member's *D* is. After that the row never changes: a later
Apple revision does not retract anyone's win.

`standings` holds the snapshotted rank, capped steps and species per member —
snapshotted for the same reason `goal_completions` snapshots its target: the
underlying projection can no longer answer "who won on 14 March".

### 7.4 Migration posture

Every migration touching a table an Edge Function writes **ships with that
function's redeploy**, and `supabase/scripts/smoke-sync.mjs` runs after. Applying
one without the other took scoring down for two days in August 2026. The schema
suite must insert `planDay`'s real output so drift fails at commit time.

Applied here via `remote-sql.sh -f`, wrapped in `begin; … commit;`, with the
`supabase_migrations.schema_migrations` row inserted by hand — this machine
cannot reach Postgres directly.

---

## 8. Notifications

One digest per user per local day, at 08:00 in `profiles.timezone`, carrying
yesterday's final race result and today's live standing, plus event progress if
an event is live. Capped by a server-side ledger, not by the client.

`notificationTarget()` gains the digest's `screen` value. Note `screen:
'character'` maps to `/` — and with the fourth tab, `/` is the Character tab and
`/today` is new. Both `useLastNotificationResponse()` and the response listener
stay wired: a tap that cold-launches from terminated is retained by the former
and never emitted to the latter.

---

## 9. Beta account migration

Profiles, species, `daily_scores`, XP, ability ratings, streaks and challenge
completions all survive untouched. `goal_completions` XP stays banked, so nobody's
level drops. Only the goal *screens* disappear; the tables are reshaped in place
per §7.2, and any live goal rows are closed out rather than converted —
per-member N-of-M does not cleanly become a pooled event, and inventing a
conversion is worse than a clean end.

---

## 10. Testing

Strict TDD holds where it already holds: scoring, day boundaries, streaks,
anti-cheat. New pure modules get the same treatment.

- `race.ts` in `@kairo/core` — capping, ranking, tie-breaking, ghost-rival
  construction. Pure, zero-dependency, no clock reads.
- The finish-line cap is asserted **through `computeDailyScore`**, not through
  `tierFor`. `tierFor` *is* `shiftedTierFor(stat, raw, 0)`, the one path where
  the shift is absent by definition — a guard written through it cannot catch
  the `AGI` / `AGI_base` confusion, and one already failed to.
- `event.ts` — pooled progress, completion, target snapshotting.
- Race lane labels — a pure module, tested in Node, extending `row-label.ts`.
- Schema suite (PGlite): `challenge_events` RLS under the non-owner
  `authenticated` role, the widened `squad_leaderboard()` row shape, and the
  standing assertion that no `public` function body mentions `workout_sessions`.
- `race_results` write-once behaviour, including the all-members-final condition.
- Accessibility structure verified in Xcode's Accessibility Inspector before any
  TestFlight build — a six-lane track is exactly the case that cost two builds
  to find last time.

---

## 11. Phase 1 scope line

**In:** the Race (full screen + card + ghost rivals), the Today tab with quests,
the Body/Motion/Mind rename, the widened projection with its consent gate,
Goals deleted, `goals` reshaped to `challenge_events`, **Battle**, the digest,
and the character figure's louder level response.

Battle is in specifically so the schema migration happens **once** rather than
twice.

**Out of Phase 1, and each for a stated reason:**

| Deferred | Why |
|---|---|
| Adventure | Same engine as Battle; ship after the engine is proven live |
| Coins | No sink until cosmetics exist; an earn rate set now cannot be rebalanced later |
| Cosmetics, equipment, slots | Needs a layered-art pipeline that does not exist |
| Animation, auras, idle loops | Needs a runtime dependency deliberately not installed |
| Solo world map | Replaced — the character *is* the world (source doc §26) |
| Species past four, unlockable species | Onboarding choice is the emotional hook |
| Squad size past six | Six lanes is the design |
| Public / stranger racing | Moderation and a public identity surface |

There is no date. The line above is what bounds the work instead.

---

## 12. Proposed roadmap deviations

| # | Deviation |
|---|---|
| 44 | Pre-launch pivot to character racing; retention instrumentation re-pointed |
| 45 | Goals removed at the surface; `goals` reshaped into `challenge_events` |
| 46 | Race is an always-on reading of the day, not a created object; finish line is `DAILY_STEP_BASELINE` and doubles as the anti-cheat cap |
| 47 | `squad_leaderboard()` widened to daily raw totals, behind an explicit consent gate; hourly, heart-rate and workout data stay owner-only |
| 48 | Events are pooled, reversing squad goals' per-member N-of-M |
| 49 | Event targets are snapshotted at creation, unlike Challenge targets — §8's invariant applies to Events and not to Challenges |
| 50 | Fourth tab (`Today`); quests leave the disclosure gate, `StatRail` and Strain/Sleep stay in it |
| 51 | Stat surface names become Body / Motion / Mind; engine keys unchanged |
| 52 | One notification digest per user per local day, capped server-side |

---

## 13. Open risks

- **The race may still read as a leaderboard.** Horizontal lanes are the
  mitigation, but the honest test is a device pass with a real squad, not a
  screenshot. If it does not feel like a race, no amount of Battle and Adventure
  will rescue it — and that is precisely why Phase 1 is bounded where it is.
- **Sync cadence is the ceiling on liveness** and cannot be engineered around
  without background-triggering pushes, which are out of scope. Stating staleness
  honestly is the whole mitigation.
- **The consent gate is a funnel step in the highest-drop-off part of the app.**
  If join conversion falls materially, the fallback in §4.5 — steps and distance
  only, no sleep — removes most of the disclosure.
- **A six-lane track at accessibility text sizes is unproven.** Budget a device
  pass and a possible fallback to a stacked layout above a size threshold.
- **Quest content is authored, not generated**, so its volume is a real ongoing
  cost that nothing in the codebase absorbs.
