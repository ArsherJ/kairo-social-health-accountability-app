# Road to a high rating — design and plan (2026-09-06)

Answers `docs/qa/2026-09-06-evaluation-panel.md`. Every finding there is
assigned below, and three founder decisions taken the same day are designed in:
**the Battle goes**, **Body earns a whack at a friend**, **Mind boosts your own
progress**. Read the panel first; this document does not restate the findings,
it disposes of them.

**Revised the same day, after a grilling pass against the code.** The first
draft rested on six claims that do not survive checking — the HealthKit
predicate mechanism, the per-source read, the distance rule, the flag's shape,
what the Mind boost makes newly visible, and which PNG the character screen
actually draws. Each is corrected in place below with the file and line that
settles it, because a design that is wrong about the code it edits is worse than
no design: it gets implemented.

Conventions: **OTA** means the change ships over the air; **BUILD** means it
moves the fingerprint and spends one of the month's fifteen EAS builds;
**MIGRATION** means it touches the database and ships with an Edge Function
redeploy in the same pass. Phases are ordered; a later phase never blocks an
earlier one.

---

## 0. What does not move

Six things stay fixed through everything below, because the panel's three
strongest findings — the engine, the privacy projection, the writing — are the
things that already work.

1. **The scoring engine is untouched.** `tierFor`, `TIER_POINTS`, `THRESHOLDS`,
   `computeDailyScore`, `planDay`, the streak and `finalizable_days()` decide
   every day exactly as now. New mechanics read *alongside* them.
2. **Nothing reduces earned progress.** The 2026-08-09 decision ("progress is
   still progress") is what makes the whack designable at all: a whack must be
   something that happens *to the bird*, never to the score, the streak, the
   race position or the XP. It is also why Part A **flags and never clamps**: a
   ceiling that lowered a real day would break this rule from the other side.
3. **Replay compatibility's licence is re-dated, not spent** (ADR-0001, amended
   today). The gate is cohort *size*, not cohort *existence*: `replay-scores` is
   a deployed Edge Function, so rescoring a twenty-person beta's fortnight is a
   call, not a project. The Mind boost may therefore ship after the first cohort
   arrives, with a rescore in the same pass. What the ADR protects — strangers'
   *months* — is unchanged.
4. **Privacy is a projection.** No new mechanic widens what `squad_leaderboard()`
   returns. A whack carries the sender's name and a timestamp and nothing about
   the session that earned it.
5. **The finish line is flat.** The ridge is `DAILY_STEP_BASELINE`, the Daily
   Walk is the same number, and no boost, shift or whack moves either. A Mind
   boost that lowered the ridge would be a public-health number scaling with the
   user, which is the failure `AGI_base` exists to prevent. This is also why the
   rested shift lands on **Body**, not Motion — see Part D.
6. **OTA-first.** Every phase below is designed to ship over the air except the
   items marked BUILD, which are batched into one build in Phase 4.

---

## Part A — Close the promise (Phase 1, all OTA or MIGRATION)

The panel's unanimous first finding: "you cannot fake your progress" is not yet
true. Five changes, each small, all before any cohort.

### A1 — Exclude typed-in samples, in the form that does not silently zero everyone

**OTA.** `src/features/health/read.ts`.

Add a metadata predicate to the step, distance, energy and exercise-minute
statistics collections in `readHealthWindow`, `readStepsToday` and
`readDailySteps`.

**Not the form the first draft specified.** Three corrections:

- **It does not "match what sleep and workouts already do."** Those read
  `metadata?.HKWasUserEntered` off *returned samples* and filter downstream
  (`read.ts:395` for workouts, `read.ts:422` for sleep). A statistics collection
  returns sums, not samples, so it has to filter at the query. Different
  mechanism, and the doc comment should say so rather than implying a precedent
  that isn't there.
- **`operatorType: notEqualTo` is the trap.** The library maps `filter.metadata`
  onto `HKQuery.predicateForObjects(withMetadataKey:operatorType:value:)`
  (`node_modules/@kingstinct/react-native-healthkit/ios/PredicateHelpers.swift:238`).
  An automatically-recorded step sample carries **no `HKWasUserEntered` key at
  all**, and a `!=` comparison against a missing key is not reliably true. The
  plausible failure is every quantity read returning **zero, forever, with no
  error anywhere** — the same shape as the `activity_type` omission that would
  have credited Body nothing.
- **The safe form is the compound NOT**, which the library supports
  (`createNotPredicateForSamples`, same file:327):

  ```ts
  filter: {
    date: { startDate: from, endDate: to },
    NOT: [{ metadata: { withMetadataKey: 'HKWasUserEntered',
                        operatorType: ComparisonPredicateOperator.equalTo,
                        value: true } }],
  }
  ```

**The guard** is a scan of `read.ts` that fails if any
`queryStatisticsCollectionForQuantity` call lacks the predicate, written the way
`calibration-read.test.ts` guards that function's width. A scan, not a unit
test: the behaviour is native and unreachable from Node.

**Verified on a real device before the OTA ships, not on the simulator.** The
failure mode is silent zeroes, which no test in this repo can see.

**The dev-loop cost, and the answer.** Every Health sample on the simulator is
typed in, so after A1 the simulator reads **zero steps forever** — the loop the
whole panel was run against. `seed-health` is redeployed for this reason,
guarded by `CRON_SECRET` and reachable only by the founder's own accounts. It
stays undeployed-in-spirit: it fabricates activity, no real account can call it,
and the alternative is an unverifiable fix.

### A2 — Server plausibility ceilings that flag, and never clamp

**MIGRATION** (redeploy all Edge Functions; the planner is shared).
`supabase/functions/_shared/sync-plan.ts`.

Per hour bucket: steps ≤ 12,000, distance ≤ 15,000 m, active kcal ≤ 1,200
(exercise minutes are already ≤ 60). Exceeding one **flags the day** and stores
the bucket exactly as reported.

**Clamping was the first draft's answer and it is wrong twice.** Buckets are the
replay source of truth — a clamp writes a number Apple never reported into the
one store every score replays from, and a later threshold change cannot recover
the original. And 15,000 m in an hour is a real runner's hour; 1,200 kcal is a
hard cyclist's. A clamp would reduce a real day, which §0.2 forbids.

**What a ceiling buys, honestly stated.** After Part B removes the Battle,
nothing uncapped consumes these numbers: the race caps at the ridge, points cap
at 1,200 per stat, XP is banded, Mastery derives from capped points, quests are
boolean. The one remaining uncapped consumer is `stat_records()`. So:

- the ceilings buy **the claim** — the server bounds what an hour can contain —
  at the cost of a boolean, and
- **`stat_records()` ignores flagged days**, which closes the only outcome a
  forged sync could still buy. That is the substantive half of A2.

Rejecting a payload is not on the table: a rejected sync is indistinguishable
from the 9–11 August outage, and this repo has already lost two days of scoring
to a sync that failed after its bucket upsert committed.

### A3 — Trust the source, with a predicate, and tell the player what was dropped

**MIGRATION.** `read.ts`, `sync-plan.ts`, one migration.

The first draft proposed reading raw step samples to recover per-source sums,
on the premise that `queryStatisticsCollectionForQuantity` cannot return them.
**Both halves are wrong.** `queryStatisticsCollectionForQuantitySeparateBySource`
exists (`node_modules/@kingstinct/react-native-healthkit/src/healthkit.ts:249`),
and reading raw samples would lose Apple's cross-source deduplication and
rebuild deviation #8's iPhone-plus-Watch double count for exactly the most
competitive users.

**But summing per-source sums has the same defect**, because the dedup happens
*inside* one combined query. The mechanism is therefore a **source predicate**:

1. `querySources` (`healthkit.ts:118`) for the window returns each contributing
   source's `{ name, bundleIdentifier }`.
2. Partition against the allowlist.
3. Pass the allowlisted `SourceProxy`s as `filter.sources` on the **same
   combined statistics query** already being run. Apple dedups within them; an
   untrusted source's contribution never enters the sum.
4. The untrusted partition yields a **display name**, which is what the
   disclosure below needs.

**The allowlist is a prefix rule, and case-sensitive.** Device-recorded iPhone
and Watch data carries `com.apple.health.<device-uuid>`, so an exact match like
`WORKOUT_SOURCE_ALLOWLIST`'s cannot work. `com.apple.Health` — capital H — is
the Health app, i.e. hand entry, and differs from the trusted prefix **only by
case**. A case-insensitive prefix match trusts hand-entered data, with A1 as the
only thing standing between it and the score. Beside the prefix sits a short
server-side list of bridge apps, seeded from what the cohort actually carries.

**Exclusion is inert, never accusatory.** A day carrying an unrecognised step
source is **not flagged**. Flagging is an accusation, §5's own principle is that
a false positive costs more than a miss, and the Philippine market runs cheap
bands that write to HealthKit under their own bundle id — CLAUDE.md already
names Xiaomi-band sleep support as a market decision. "Count only Apple sources
and flag the rest" would accuse the target market of cheating for owning the
hardware it owns. The posture is `workout-units.ts`'s: inert beats wrong.

**And the player is told.** An owner-only line in Today's details naming the
app — *"Steps from Mi Fitness aren't counted yet"* — using the display name from
step 4. Silence here would leave the player with a low number and no reason,
which is indistinguishable from Kairo being broken; that is the exact argument
used to *accept* third-party sleep, and it applies with more force when the app
is the thing dropping the data. The line is also the allowlist's backlog: you
learn which bands the market runs by reading it, instead of guessing before a
cohort exists.

### A4 — Correct the comment. Do not change the rule.

**OTA.** `packages/kairo-core/src/anticheat.ts`.

The comment calling `DistanceWalkingRunning` "GPS-derived" is wrong — on iPhone
it is pedometer-estimated by the motion coprocessor. Fix the comment.

**The rule change the first draft proposed is rejected.** "Cleared by distance
only when a workout or heart rate is also present" would make
`MIN_PLAUSIBLE_STRIDE_M` dead code: `evaluateStepBurst` returns early on
`hadWorkout`, and heart rate alone already clears. And the bar is 1,500 steps
per 10 minutes, i.e. **more than 9,000 steps in an hour**, which an hour of
running at 160 spm (9,600) reaches — so the change would flag the honest
phone-only runner with no logged workout and no wearable, whose only suppressor
is the distance. The attack it aimed at — typed steps plus matching typed
distance — is killed at the source by A1, because a fabricated distance sample
is `HKWasUserEntered` too.

### A5 — App Attest

**BUILD, Phase 4.** Native module, so it costs a build; a cohort of people the
founder invited personally does not justify one, and A2's flag plus A1's
predicate bound what a forged sync buys. Recorded here so nobody files it as
forgotten.

### A6 — Timezone-hopping test

**Schema suite; MIGRATION only if it fails.** Two syncs for one UTC window under
two zones must not produce more than 24 buckets on any local date. If it fails,
key the bucket on the server's reading of `profiles.timezone` at sync time.

### What the flag becomes

`daily_scores.flagged` stays a **boolean**. After A3's exclusion, the reason set
is two implausibility rules that mean the same thing to a player, so a reason
column would store a distinction no sentence draws. Add one the day a third
reason says something different.

What does change is the order in which it is spoken: **the accused hears it
first**. One sentence on the flagged player's own Today details — *"Some of
today's hours don't look like walking, so they won't count towards the flock"* —
before the chip anyone else sees. The social signal stays (§20); the accusation
stops arriving first through a friend's screen.

---

## Part B — Remove the Battle (Phase 1, MIGRATION)

Founder decision, and the panel's PM would have cut it anyway: it is the only
squad mechanic with an open defect (the expired-fight lockout), the only
uncapped XP-paying path, and it needs a squad to test. **Follow the Goals
precedent exactly** (deviation #45): nothing that banked XP is destroyed.

### What goes

- `src/features/events/` (seven files, ~1,400 lines), `app/event/[id].tsx`,
  `app/event/new.tsx`, `SquadEventPanel` from the Flock tab, `useLiveEvent` and
  `BattleCard`.
- `packages/kairo-core/src/event.ts` **stays** — `pooledDays` and
  `eventCompletionXp` are what `recalculate_user_xp`'s banked rows were computed
  with, and a future reader of a completion needs the arithmetic that produced
  it. Mark the module `@deprecated`, keep its tests.
- `create_event()`, `abandon_event()`, `can_see_event()` — dropped **by exact
  argument list** (the `create_goal`/`p_metric` trap). `event_progress()` stays
  read-only for the same reason `event.ts` stays.
- `finalize-days`' event grading block and the `event_completed` push.
- `dispatch-notifications`' Battle branch in the digest.
- `hasEvent` as a reason in `shouldAskForNotifications` — the ask keeps
  `hasSquad || hasScoredDay`; `ask-copy.ts` drops "a boss goes down".
- `event_created` stays in `AppEventType` as a historical value, exactly as
  `goal_created` did.

### What stays, and why

| Kept | Reason |
|---|---|
| `challenge_events`, `event_participants`, `event_completions` tables | `recalculate_user_xp` sums `event_completions.xp_awarded`. Dropping the table drops every account's banked Battle XP on the next write. Close every live row (`closed_at = now()`) in the migration so no read ever renders one. |
| `event_completed` in `NotificationTrigger` and `notificationTarget()` | A push sent before the deploy can be tapped after it. Routes to `/flock`. |
| `EVENT_KINDS`, `EVENT_METRICS` | Column CHECKs reference them. |

### The squad keeps something cooperative

Removing the Battle leaves the squad layer entirely comparative — a private
leaderboard, a capped race — and Part C then makes it antagonistic. The panel's
PM listed pooling as one of three reasons a quiet member costs the group
nothing.

**F's week-strip fix carries the cooperative reading instead**, at zero new
mechanics: the strip of empty circles on Flock becomes **one filled circle per
member who cleared the Daily Walk today**. The data is already in
`daily_scores`, it is already inside the consent projection, and it says the one
true cooperative thing about a flock — how many of us walked. It replaces a
mechanic that needed a schema, an RPC, a grading block and a push.

### Sequencing

1. Migration: close all live events, drop the three RPCs by signature, revoke
   nothing else. Insert the `schema_migrations` row by hand (Postgres is
   unreachable from this machine).
2. Redeploy **all** Edge Functions in one pass — `finalize-days` and
   `dispatch-notifications` both change, and `sync-health` shares the planner.
3. OTA the client. Order matters: a client that still renders the panel against
   a database with no `create_event` shows an error card, not a crash, so the
   server may go first.
4. Docs: `mvp-scope.md` moves the Battle to the OUT table with this document as
   the reason; `user-journey.md` loses the Battle section; CLAUDE.md's ground
   truth block and the Goals-became-Events block are annotated; roadmap gains
   deviation #66.

**Size:** about a day. The panel's auditor items 5 and 6 close as a consequence.

---

## Part C — Body earns a whack (Phase 3, MIGRATION + OTA; Rive pose is Phase 4)

**Moved behind the first cohort, deliberately.** The one number the whack exists
to move — *does being whacked bring a lapsed player back* — needs a **baseline**
from the same cohort, and a whack present on day one leaves nothing to compare
against. It is also the largest new build in this plan and the least validated,
so gating the cohort's arrival on it would put the riskiest item on the critical
path. The cohort arrives at the end of Phase 2 and the whack lands on them one
to two weeks later, as the first new thing they receive.

### The tension, stated once

Sabotage was removed because a day you earned must not be reducible by another
player's tap. A "whack" is antagonistic on its face. The design below keeps the
whole of that rule: **a whack changes what the target's bird does, and nothing
the target earned.** No score, no XP, no race position, no streak, no shield.
That is what separates it from the retired mechanic, and it is the line every
later "just make it cost them a little" proposal has to cross knowingly. It is
recorded as ADR-0002 for that reason.

Three shapes were considered:

| Option | What a whack does | Verdict |
|---|---|---|
| **C-social (taken)** | Lands on the target's Kairo as a reaction (feathers ruffled, a wobble, a look), sends one push through the ordinary dispatch, shows on their Flock row as "whacked by Rty", and opens a **whack back** that needs the target's own day to have gone well. | New table, one RPC, one reaction, one push kind. Respects §0.2 entirely. |
| C-race | Also knocks the target's bird back on today's corridor picture, read-time only. | Rejected. Breaks "crossing the line is clearing the Daily Walk" — a bird behind the line with 10,000 steps is a lie the Sky tab tells. |
| C-score | Also costs the target points or XP. | Rejected. This is sabotage, by the 2026-08-09 decision; recorded as the option it is. |

### What earns one

**One per local day, from either route, and they do not stack:**

- a **verified strength session** (allowlisted source **and** heart-rate
  evidence, the existing `workoutVerified` rule); or
- **Body Gold** for the day (`tiers->>'STR'` reaching gold).

**Say what this actually is.** Body Gold is **400 active kcal**
(`packages/kairo-core/src/scoring.ts:89`), which a 10,000-step day lands near for
most people. So the phone-only route reads *you did your day*, not *you lifted*,
and it will be near-daily for an active player. The copy must not dress it as a
lifting reward — the verified-strength route is the scarce one and it needs a
watch, and pretending otherwise is the same class of false claim Part A exists
to remove.

**The scarcity that matters is the target limit, not the charge**: one whack per
target per sender per local day. If it turns out everyone holds one every day
and nobody spends it, that is a copy problem. If everyone spends it every day,
the dial is a higher phone-only bar — Body Gold *and* the ridge — and it costs
one condition.

Charges are **derived, never stored**, the same way a quest and a Challenge are:
a pure function of that day's `daily_scores.tiers` and verified minutes, minus
the whacks already sent that day (stored). A retroactive Apple revision that
removes a session removes the charge; a whack already sent stays sent, exactly as
a cleared quest stays cleared. Nothing banks, and it expires at local midnight —
a currency with a wallet is the coin-pack problem in a new dress.

**The player never reads the word "charge."** They meet a verb and a state:
*Whack* enabled, or disabled with the reason — *"You can whack again tomorrow."*
A noun is what makes a thing feel bankable even when it isn't, and Part F is
putting the app on a noun diet in the same plan.

### The landing

- **On the target's Today**: a new `ReactionKind` `'whacked'` producing
  `KairoReactionId` `'whacked'` (static art: the base pose with ruffled crest and
  a two-frame wobble via `Animated`; Rive later). Presented through the existing
  `useLivingReaction` path — one reaction per focus, `REACTION_FLOOR_MS` still
  applies, and `moments.ts` gains a sixth fixed key.
  - **Priority 45** — above `record` (40), below `level` (50). A level-up is
    rarer and it is *yours*; losing it to a friend's poke is the worse trade.
  - **Occurrence `whacked:<localDate>:<count>`**, so a second whack the same day
    re-fires. Each friend's poke is felt, and a reaction it displaces is not
    lost, because only the *presented* reaction is marked seen.
  - **The sentence names the most recent sender**, with "and 2 others" past one —
    one form in `kairo-voice.ts`, not a combinatorial set. *"Rty whacked Dagit.
    Dagit is fine. Dagit remembers."*
- **This is a new read on Today, and it is the right kind.** Deviation #59
  removed the leaderboard, recent-day and race-rank reads from this screen —
  reads about **other people**. Whacks received today are *your* row: one
  owner-scoped query, count plus sender names for the local date, alongside the
  strength summary and personal records that #59 added deliberately. Flock-only
  would kill the mechanic, since Flock is the tab a solo-leaning player opens
  least, and the whole point is that the bird answers.
- **On the target's Flock row**: a small mark for the day, "whacked ×2", spoken
  by `row-label.ts`.
- **One push**, kind `whacked`, budgeted (not `BUDGET_EXEMPT`), riding the
  **ordinary hourly dispatch**. Both crons are hourly
  (`20260807110300_schedule_dispatch_notifications.sql`), so a whack lands within
  the hour, and one sent at 23:30 lands at 07:00 in the digest. An immediate send
  from `send_whack` was rejected: `QUIET_HOURS` lives in `planNotifications`,
  whose only caller is `dispatch-notifications`, so a direct sender is exactly
  the arrangement that makes `event_completed` arrive at 02:00 — and this pass
  removes the last one of those. An hour's delay costs a joke nothing.
- **Whack back** is the same action with the whacker as target, and it needs the
  target's own day to have earned one. That is the whole loop: *the only way to
  answer is to move.*

### Limits, so it stays a joke

- One whack per target per sender per local day.
- **There is no invisibility, and mute is on the push.** The first draft hid
  muted players from the target list; in a squad capped at six, a player
  vanishing from that list *is* the message, and the absence is legible to
  everyone who can count. So: `profiles.accepts_whack_pushes` (default true, in
  the column-level UPDATE grant) controls the **interruption** only. The mark
  still appears on the row and the bird still ruffles. The annoyance vector is
  the push, so that is the proportionate control; it is the only shape with no
  hidden state and no leak; and in a barkada of six you invited yourself,
  "tell them to stop" is the real mechanism — the same posture §20 takes on
  anti-cheat, where the squad polices itself.
- Squad-only: `send_whack(p_target uuid)` is `SECURITY DEFINER`, checks both
  parties share a squad, re-derives the day's entitlement server-side from
  `daily_scores` and `workout_sessions`, and inserts. **The client never states
  it holds one**; the server derives it.
- No whack from a flagged day (`daily_scores.flagged`), so a fabricated session
  buys no hits.

### Schema

```sql
create table public.whacks (
  id          bigint generated always as identity primary key,
  squad_id    uuid not null references public.squads(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  target_id   uuid not null references public.profiles(id) on delete cascade,
  local_date  date not null,        -- the SENDER's local date
  created_at  timestamptz not null default now(),
  unique (sender_id, target_id, local_date)
);
```

**Two dates, both correct, and this needs the comment or someone will "fix" it.**
`local_date` is the **sender's**, because the day that earned it is theirs — the
limit reads "one per target per day *of yours*". The **mark on the Flock row is
counted by the target's local date**, so a player's row always reads their own
day. A squad spanning zones can therefore show a target two whacks from one
sender inside the target's own day, which is the correct behaviour and not a bug.

`squad_id` is **snapshotted at send** and the projection reads by it, so a
member who leaves still has this morning's whack visible for the rest of the day
and it departs with the day. Same read-time posture as an Event's snapshotted
target.

Readable by squad members through a projection (`squad_whacks(p_date)`) that
returns sender name, target name and count — never the session. Erasure:
cascades from `profiles`, as `app_events` does.

### Measurement — no new telemetry

`whack_sent`, `whack_received` and a `whack_back` kind were proposed and are
**not built**. The question they answer is a join between `whacks` and
`daily_scores`, both already stored, which is exactly the shape
`kairo_retention()` already has: an admin function with EXECUTE revoked from
`public`, `anon` and `authenticated`, run through `remote-sql.sh`. Add
`kairo_whack_effect()` beside it.

`app_events` earns an event when the fact is not otherwise recorded — a tap, a
dismissal, a beat impression. A whack is a row in a table. This also leaves the
payload allowlist and its scan completely untouched.

### Copy rules

The whack is affectionate. Words that ban themselves: *attack, damage, hit
points, lose, punish, revenge*. Words that fit: *whack, bonk, ruffle, remember,
answer*. A test in `whack-copy.test.ts` holds the ban list, and also bans
**charge** as a player-facing noun.

---

## Part D — Mind boosts your own progress (Phase 2, OTA + redeploy)

Sleep already scores Mind. "Boost" has to mean something Mind does *for another
stat* without becoming a multiplier — a stored multiplier stacks with the program
weight at read time, which is deviation #10's trap and the reason `END` and `VIT`
became threshold shifts.

**D-rested, landing on Body.** A rested night lowers **today's Body bands**.
`statShifts` gains `sleepMinutes`; `restedShift(minutes)` returns 0 below 7h,
ramps to `MAX_THRESHOLD_SHIFT / 2` (12.5%) at 8h, and tapers back down past
`MIND_OVERSLEEP_HOURS` exactly as `mindPoints` does. Replayable (sleep is stored
per date), no multiplier, no new column.

**Body, not Motion, and this is the whole decision.** The first draft shifted
both. Motion's shift already reaches `MAX_THRESHOLD_SHIFT` (0.25) at eight active
hours (`packages/kairo-core/src/shifts.ts`), so an additive rested shift is a
**no-op for exactly the players who sleep well and move all day** — the boost
would be invisible to its best case. Body's shift is a hard `0` today, so there
is no cap collision, no interaction with the spread shift, and no second reason
to reason about `AGI` versus `AGI_base`. One signal, one stat, one direction.

**Rules that break easily**

- **`AGI` is untouched, so `AGI_base` needs no new argument.** The Daily Walk,
  the ridge and the race are unaffected by definition rather than by care.
- **One signal, one place.** Sleep scores Mind (raw value) and shifts *Body's*
  bands. It never shifts Mind's own bands — that is the `workoutShift`
  double-count in a new dress. And it does not touch Body's raw value, which is
  where the strength credit already lives.
- **This is wearable-gated, and the doc says so plainly.** A phone-only account
  has `sleepMinutes: null`, shift 0, and never sees the sentence.
  `has_sleep_source` gates the display and the arithmetic alike. User-entered
  sleep stays rejected — that is not up for revision — so the honest statement is
  that Mind's boost reaches watch and band owners, and the phone-only majority
  gets nothing from it. Better to write that down than to let the cohort discover
  a stat that does nothing for them.
- **It does not give `tired` a producer, and the first draft was wrong to say it
  would.** `SleepState` already has one: `character-resolver.ts:68` maps the Mind
  tier onto `well_rested`/`normal`/`sleepy`, and `character-assets.ts` already
  ships the art. The states are `well_rested` and `sleepy`, not `rested` and
  `tired`; `tired` is a *reaction id* whose lack of a producer is a recorded
  decision ("a one-shot celebration of somebody being tired is the wrong
  register"). D-rested's genuinely new visible thing is the **sentence**, in the
  observation–em-dash–consequence form `spreadLine` uses: *"Slept 8h — Body tops
  out 50 kcal sooner today."*
- **Replay.** This moves stored history. Under the amended ADR-0001 it may ship
  after the cohort arrives, with a `replay-scores` pass in the same deploy.

---

## Part E — The character (Phases 2–4)

The panel's juror and tester said the same thing: the bird does not visibly
answer to the player.

### E1 — Growth stages (OTA, Phase 2) — nine images, not three

`evolutionStageForLevel()` already returns 1–4 for levels 1–5, 6–10, 11–20, 21+.
Nothing renders it.

**The first draft's "stage applies to the base only" would have been nearly
invisible.** `motionPose()` (`src/features/character/living-mirror.ts:71`) always
returns a pose — `idle` at worst — so `staticFigureSelection` returns
`{ kind: 'base' }` essentially **never** on Today. Four base statics would show
almost nowhere, on the one screen they exist for.

So: **three new stages × the three poses that actually render** —
`idle` / `walk` / `run` — is **nine images**. Adult stays the current art.

- **Reactions fall back to the stage's own art.** `race_victory` is what the
  level and record reactions draw, held for `REACTION_HOLD_MS`; with adult-only
  reaction art, a stage-1 bird would become an adult for three seconds every time
  it celebrated — on the level-up moment E1 exists to serve. A reaction on a
  pre-adult stage draws that stage's `run` (or `idle`), and the wobble carries
  the celebration.
- **Mind states stay adult-only.** They are wearable-gated and a sleepy adult on
  a stage-1 account is a smaller lie than a celebrating one. Revisit with Rive.
- The 4×4 pose-by-stage matrix is still not built.

### E2 — Say what it is (OTA, Phase 2)

No screen names the Philippine eagle. Put "a Philippine eagle" on the You tab
under the name, once, and in the App Store description. The cultural specificity
the juror scored 2/5 is one line away from being visible.

### E3 — Plumage by dominance — **pulled forward to Phase 2**

`Build` already carries the dominant stat. Tint the crest with the stat's hue
from `STAT_COLORS` — the one place the redesign already allowed per-stat colour.
Two eagles in a flock stop being identical the day one of them lifts.

Pulled forward because it costs no art and no commission, and it means the
Phase-2 cohort gate ("the bird changes") is met by two independent things rather
than resting entirely on nine images arriving on time. A stage-dependent scale
and shadow ride along with it, same OTA.

### E4 — Rive (BUILD, Phase 4)

The artboard exists (15 named parts, L/R split). Rive replaces only the render
priority and `REACTION_HOLD_MS`, as the Living Mirror block records. The reaction
vocabulary grows by one before the handoff — `whacked` — so the animator gets the
full list once. `expo-rive` is a native module: batch it with A5 and the share
card into **one** build.

### E5 — Not built, still

Unlockable species, cosmetic slots with a shop, per-species evolution sets. The
reasoning in `mvp-scope.md` holds; E1 gives the "morph" the brief promised
without a 96-asset matrix.

---

## Part F — UI/UX (Phase 1 fixes, Phase 3 Flock rework, all OTA)

### Phase 1 — the sentences that are false

| Screen | Fix |
|---|---|
| Flock band | The unguarded line is **`standingSubline`** (`src/features/squad/Leaderboard.tsx:152`), which renders "1st of 1 · leading". The `rows.length > 1` guard at `:385` is on the *leader* line and is not stale — this is a second sentence. Guard it the same way; a squad of one gets the Sky tab's sentence: *"You have the sky to yourself."* |
| You / streak | Below `SHIELD_MINIMUM_STREAK`: *"Shield unlocks at a 5-day streak."* Test pins both branches. |
| `/connect` help | Replace *"Your squad sees your progress — never the raw numbers"* with the privacy beat's own wording (*"Daily totals only — never your route, never an hour-by-hour"*) and drop "active minutes". Covered by the consolidated claim scan below, **not** by bolting an entry onto `invite-message.test.ts`. |
| Sky corridor | The racer's own bird at path start is drawn under the flock rail; give the corridor a top inset equal to the rail's height plus `space.md`, or start the path below it. |
| Flock invite code | `scale="fixed"` and `adjustsFontSizeToFit` with `numberOfLines={1}`; a code is drawn geometry. |
| Week strip | Becomes one filled circle per member who cleared the Daily Walk today (Part B). |
| `/event/new` | Goes with the Battle. |
| Dev "Tools" gear | Confirm absent on TestFlight; if it is the dev-client floating button, disable it in `app.config.ts` for the dev profile so screenshots stop carrying it. |

**The claim scans consolidate in Phase 1, with the `/connect` fix — not later.**
`invite-message.test.ts` (landing page), `links.test.ts` (privacy policy) and
`disclosure.test.ts` (permission sheet) check the same fact from three files, and
`/connect` is the fifth surface making it. One `privacy-claims.test.ts` reading a
list of surfaces is the structural answer; adding the fifth entry to a test named
after something else is precisely how the fourth went stale unnoticed.

### Phase 3 — the Flock tab is the weak tab

The panel: Today and Sky are considered; Flock is a leaderboard with a gradient.
The whack makes Flock the social surface, so it is redrawn **after** the whack
ships, around **birds, not rows**.

- **Hero**: the flock as a perch — up to six birds side by side at rest, each in
  its growth stage and plumage, the day's leader wearing the crown that already
  exists. Tap a bird to whack it (if today earned one) or to see their row. This
  is the screenshot the juror asked for: the mechanic visible in the picture.
- **Under the perch**: the existing board, unchanged in data, restyled as one
  card with rank, name, the four stat figures and the whack mark. `LockedSlot`
  stays one row.
- **The band's copy** follows `mode` as now, and never speaks to a squad of one.
- **The invite** becomes the trailing bird-shaped slot on the perch, the Sky
  rail's rule in a second place: exactly one trailing slot, never a row per seat.
- **Accessibility**: the perch needs a label per bird ("Dagit, level 6,
  whackable") and the whack reaction needs `AccessibilityInfo.announceForAccessibility`,
  since the wobble is silent.

### Also, across screens

- **The noun diet.** Retire *Mastery* from the You tab's first screen (keep it in
  the rail's expanded state); rename *record* to *best day* everywhere (the You
  tab already says "Your best days"). **Battle** leaves with Part B and **whack**
  arrives, so the net count falls by one. **Charge** never becomes a noun at all.
- **Onboarding** stays seven beats; add the eagle's name to `/name`'s title (E2)
  and nothing else. The calibrated difficulty beat is the best thing in the flow —
  protect it.

---

## Part G — Features and growth (Phase 3–4)

| Feature | Why | Type |
|---|---|---|
| **Shareable best-day card** — render the You tab's "Your best days" (or a whack) to an image via `react-native-view-shot` and hand it to the share sheet. | The growth persona: nothing leaves the app. This is the cheapest thing that does. | `view-shot` is native → **BUILD**, batch with Rive. Until then, share text + the landing link. |
| **Taglish voice** — a `voice` setting with `en` and `tl-en`, `kairo-voice.ts` tables keyed by locale. | The juror's cultural score is a locale away from moving; no US app can copy a Taglish eagle. | OTA; copy work, not code. Phase 3. |
| **Digest after the Battle** — yesterday's race result, today's standing, whacks received overnight, the rested line. | The digest loses its Battle branch and gains the new mechanics. | Redeploy. |
| **Android + Health Connect** — the structural ceiling. Spike Health Connect reads through the existing `HealthSource` policy; the app already has the Android development boundary. | Every persona named it. | BUILD (a new native target); its own quarter, not a phase here. |
| **Lock-screen widget / Live Activity** for the corridor. | A step app on iOS without a widget leaves the platform's best surface unused. | BUILD; after Rive. |

---

## Part H — Architecture hardening

- **Modal ownership becomes a mechanism.** The convention plus one host has held
  for three sheets; the whack reaction is a fourth surface on Today. Turn
  `modal-owner.ts`'s lease into a typed registry that throws in `__DEV__` when a
  second owner claims in one frame.
- **The claim scans consolidate in Phase 1** — see Part F.
- **Edge Functions redeploy as a set**, always; write
  `supabase/scripts/deploy-all.sh` that deploys the four live functions and runs
  `smoke-sync.mjs` after. Two outages came from a partial deploy.
- **Rate limits.** `join_squad` moves **into Phase 2** — it was scheduled "before
  public launch", and the cohort now arrives at the end of Phase 2. `send_whack`
  gets the same shape in Phase 3. A per-user counter table with a daily window,
  checked inside the RPC.
- **App Attest** (A5) with the Phase 4 build.
- **The timezone test** (A6) in the schema suite regardless of outcome.

---

## Phasing

| Phase | Contents | Ship as | Gate to next |
|---|---|---|---|
| **1 — Close the promise** | A1–A4, A6, Part B (Battle removal + the week strip), Phase-1 UI fixes, the consolidated claim scan | One migration + full redeploy + one OTA | `smoke-sync.mjs` green; A1 verified on a device; the false sentences gone; auditor items 1, 2a, 5, 6 closed |
| **2 — Make the bird answer** | D-rested (Body), E1 nine images, E2 the name, E3 plumage + stage scale, `join_squad` rate limit, the cohort's App Store Connect work | One migration + full redeploy + one OTA | See the cohort gate below |
| **— first outside cohort —** | External TestFlight | | Baseline measured before the whack exists |
| **3 — The social surface** | Part C (the whack, end to end), then the Flock perch rework, digest rewrite, noun diet, Taglish voice | Migration + redeploy + OTA | `kairo_whack_effect()` has a before and an after to compare |
| **4 — The build** | Rive (E4), App Attest (A5), share card, widget | **One** EAS build | Fingerprint moves once |
| **Android** | Health Connect, Play listing, `assetlinks.json` | Its own plan | — |

### The cohort gate — what must be true before anyone outside is invited

The gate is **not** the replay licence (ADR-0001 is amended; a rescore is
affordable at this scale). It is:

1. **The promise is kept** — A1 verified on a device, A2's ceilings live, A3's
   source predicate live with its disclosure line, `stat_records()` ignoring
   flagged days.
2. **The bird changes** — E1's nine images shipped, or, if the art is not ready,
   E3 plumage plus stage scale alone, and the gate is written down as the weaker
   claim it then is.
3. **Outside testers means external TestFlight, which means Beta App Review.**
   That is a dependency the first draft did not name, and it drags three
   hand-done items into Phase 2:
   - the controller's legal name filled into `web/privacy.html`;
   - the App Store Connect privacy answers entered from `docs/app-store-privacy.md`;
   - Beta App Review submitted with enough lead time that it is not the thing
     being waited on.

   `NSHealthShareUsageDescription` is already done — build 23 moved the
   fingerprint for exactly that string.
4. **`join_squad` is rate-limited** (Part H).

Phases 1 and 2 are roughly a week each for one person; Phase 3 is design-heavy.

---

## Decisions taken

Recorded so they are not re-litigated. Each replaces an open question in the
first draft.

1. **Cohort after Phase 2, not Phase 3.** The gate is the promise plus a changed
   bird, not the whack and not the Flock rework.
2. **ADR-0001 is amended, not spent.** The licence's gate is cohort *size*.
3. **The Battle is deleted; the cooperative surface survives as the week strip.**
4. **A1 uses the compound-NOT predicate**, is device-verified, and `seed-health`
   is redeployed for founder accounts so a dev loop still exists.
5. **A2 flags and never clamps; `stat_records()` ignores flagged days.**
6. **A3 uses a source predicate on the combined query**, a case-sensitive prefix
   allowlist, exclusion rather than accusation, and tells the player what was
   dropped.
7. **A4 is a comment fix. The rule does not change.**
8. **No flag reason column.** Two reasons, one sentence, and the accused hears it
   first.
9. **The whack ships after the cohort**, priority 45, count-keyed occurrence,
   read on Today as an owner-scoped query, pushed through the hourly dispatch.
10. **One per day, either route, no stacking**, and the copy says what Body Gold
    actually is.
11. **No invisibility; mute is push-scoped.**
12. **Sender's date on the row, target's date on the mark**, `squad_id`
    snapshotted.
13. **No new telemetry.** `kairo_whack_effect()` beside `kairo_retention()`.
14. **D-rested lands on Body**, is wearable-gated, and says so.
15. **E1 is nine images with stage-aware reactions; E3 is pulled forward.**
16. **"Charge" is never a player-facing word.**
17. **The claim scans consolidate in Phase 1.**
18. **`join_squad`'s rate limit and the App Store Connect work move to Phase 2.**

---

## Appendix — every panel finding, disposed

| Finding | Part | Phase |
|---|---|---|
| Typed-in Health samples count | A1 | 1 |
| Sync payload unbounded, no attestation | A2, A5 | 1, 4 |
| Third-party HealthKit writers | A3 | 1 |
| Distance called GPS-derived | A4 (comment only) | 1 |
| Battle pooling uncapped; easy boss | B | 1 |
| Expired Battle lockout | B | 1 |
| Sleep from any app scores | accepted, documented | — |
| Invite-code guessing | H rate limits | 2 |
| Timezone hopping unverified | A6 | 1 |
| Stale privacy line on `/connect` | F + consolidated claim scan | 1 |
| Shield sentence false below 5 | F | 1 |
| "1st of 1 · leading" | F (`standingSubline`) | 1 |
| Dead Battle card on Flock | B | 1 |
| Corridor bird clipped under rail | F | 1 |
| Invite code wraps at XXXL | F | 1 |
| `/event/new` spinner | B | 1 |
| Floating "Tools" gear | F | 1 |
| Bird does not visibly change | E1, E3, E4 | 2, 2, 4 |
| One identical eagle per flock | E1, E3 | 2 |
| Eagle never named | E2 | 2 |
| Flock is a template | F Phase 3 | 3 |
| Nine nouns | F noun diet | 3 |
| Nothing pulls a lapsed player back | C whack, digest | 3 |
| Nothing leaves the app | G share card | 4 |
| Anti-cheat story aimed at engineers | G (GTM), not code | — |
| iOS-only | G Android | own plan |
| No Reddit plan | not a code deliverable; write it around the Today screen | — |
| Monetization | stays out; revisit after Android with cosmetics as the product | — |
