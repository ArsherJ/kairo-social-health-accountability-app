# Three-Stat Attribute Model — STR / AGI / MND

**Status:** Design, approved in brainstorm 2026-08-18. Not yet planned or built.
**Supersedes:** `docs/Ideas/kairo-attribute-system-design.md` (which describes a
three-stat STR/AGI/INT model Kairo never had, and asks questions — RN vs
Flutter, Health Connect — that are closed).
**Roadmap deviation:** #41.

---

## 1. What changes, and why this is not the Ideas doc

Kairo ships **four** core stats — `AGI` (steps), `STR` (active kcal), `END`
(active minutes), `VIT` (active hours) — plus **REC**, a sleep-driven *bonus*
that is not a stat. Sleep is already read, already attributed per local date by
`sleep-attribution.ts`, already scored by `recBonusFor()`, and already curved to
flatten oversleep. The Ideas doc's central recommendations (use sleep, cap the
curve) are therefore descriptions of the present, not proposals.

This design does the thing that document was reaching for and could not see:
collapses four stats to three, and promotes sleep from a bonus to a full stat.

| Stat | Raw value (the number on screen) | Modifier | Absorbs |
|---|---|---|---|
| `AGI` | `totals.steps` | spread shift from `activeHours` | VIT |
| `STR` | `totals.activeKcal` | workout shift from verified sessions | END |
| `MND` | `sleepMinutes` | none — the trust gate decides *whether* it scores | REC |

`CoreStat` becomes `'AGI' | 'STR' | 'MND'`. The user-facing word is **Mind**;
the code is `MND` throughout — schema, `tiers` JSONB keys, `kairo-core`.

### Why the folds work the way they do

**END folds into STR's modifier, not into its raw value.** Adding active minutes
into the kcal figure would break the one-unit rule that makes the home hero
speakable. `AppleExerciseTime` and workout duration measure nearly the same
thing, so END's signal survives as the *magnitude* of STR's threshold shift, in
the one place it was already redundant. STR's headline stays "412 kcal".

**VIT folds the same way, more directly.** `VIT_ACTIVE_HOUR_STEPS` (250) is
untouched and becomes the input to AGI's spread shift. `aggregateBuckets` keeps
computing `activeHours` and `activeMinutes`; they stop being stats, not
measurements.

### Modifiers are threshold shifts, never point multipliers

A stored multiplier stacks with the squad program's read-time weight. That is
exactly why deviation #10 retired the featured-stat rotation from stored
scoring — an AGI week in a running squad scored 2.25x. A stored spread
multiplier would rebuild that trap: 2x spread inside a 1.5x running tilt is a
3x day.

Shifting the *threshold* cannot stack, and it is easier to say out loud: moving
all day makes Gold arrive sooner, rather than making Gold worth more.

### What this preserves for free

- **`DAILY_STEP_BASELINE = THRESHOLDS.AGI.gold` survives intact.** AGI still
  exists and its raw value is still steps, so the walk streak's
  `tiers->>'AGI' = 'gold'` read out of `daily_scores` keeps working with no
  migration. This looked like the sharpest edge in the change and is not one.
  The `scoring.test.ts` literal pinning it at 10,000 stays, and still guards the
  same failure.
- **`health_buckets` needs no schema change.** Every input still comes from the
  same four hourly columns plus `daily_sleep`.
- **`KAIRO_READ_TYPES` needs no change.** Sleep, workouts and heart rate are
  already requested and `sourceRevision` needs no additional permission — so no
  new HealthKit prompt, no `NSHealthShareUsageDescription` edit, and
  `disclosure.test.ts` stays green.

---

## 2. Thresholds and the re-tune

### The parity problem

Today a day maxes at **4,400** phone-only and **4,900** with a wearable:
`4 x 900` stat points, an 800 breadth bonus, and REC's 500. The wearable is
worth 11% of the ceiling.

Three stats at the current tier points would drop the ceiling to 3,500. The
first lever is `TIER_POINTS`, and it is derived rather than invented:
`4 x 900 = 3 x 1,200`.

| | Bronze | Silver | Gold |
|---|---|---|---|
| Today | 200 | 500 | 900 |
| Proposed | 250 | 650 | 1,200 |

`STAT_POINTS_MAX` stays derived from `TIER_POINTS.gold`, so UI bar sizing
follows automatically. `MAX_DAILY_SCORE_PHONE_ONLY` and
`MAX_DAILY_SCORE_WITH_WEARABLE` are recomputed from the new arithmetic.

### Bands

| Stat | Bronze | Silver | Gold |
|---|---|---|---|
| `AGI` | 1,000 | 5,000 | 10,000 steps |
| `STR` | 50 | 200 | 400 kcal |
| `MND` | 5h | 6h | 7h sleep |

AGI's and STR's bands are unchanged, which is what keeps replayed history
comparable.

Above nine hours, `MND` scores **Bronze, never none**. That preserves
`recBonusFor`'s existing shape — it already pays 200 for oversleep, less than a
bronze-equivalent — and honours "a bonus, never a penalty" now that it is a
stat.

### The shifts

- **AGI:** each active hour beyond 3 lowers the step bands by 5%, capped at
  25%. At 8 active hours, Gold arrives at 7,500 steps. This is VIT's old 3/6/9
  ladder expressed as generosity instead of points.
- **STR:** each 12 verified exercise minutes lowers the kcal bands by 5%, on
  the same 25% cap — reached at 60 minutes, END's old Gold. An unverified
  session shifts nothing.

### Breadth

`CONSISTENCY_BONUS` re-indexes to `[0, 0, 400, 800]`, and full breadth means
**all stats available to you** — two without a wearable, three with.

### Normalization: the wearable must not become a 27% advantage

Promoting sleep to a stat changes what a wearable is worth. Phone-only a user
would max at 3,200 against a wearable user's 4,400 — 27% of the ceiling, and a
permanent leaderboard gradient rather than a daily bonus. On a Philippines-market
app that lands hardest on the users least likely to own one.

**A day's stat points scale by `3 / earnable stats`.** Phone-only
Gold + Gold equals wearable Gold + Gold + Gold, and the arithmetic closes:
`(2 x 1,200) x 1.5 + 800 = 4,400`, exactly the wearable user's
`(3 x 1,200) x 1.0 + 800 = 4,400`. This is the same principle as the breadth
rule above, applied to stat points as well.

Both `MAX_DAILY_SCORE_PHONE_ONLY` and `MAX_DAILY_SCORE_WITH_WEARABLE` therefore
become **4,400** — the same figure phone-only users have today. The two
constants stay separate rather than collapsing into one, because they document
different routes to the ceiling and a future change may part them again.

**Say plainly what this does to wearable users:** their ceiling falls from 4,900
to 4,400, and the wearable stops conferring any raw scoring advantage. That is
the deliberate consequence of normalizing, not an oversight. What a wearable
buys instead is a **third route to the same ceiling** — a day with poor steps
and low burn can still be redeemed by sleep, where a phone-only user has only
two levers. Flexibility, not points. This framing has to survive into the
update note, or it reads as the wearable being nerfed.

The cost is real and should be stated on the surface rather than hidden: two
users with identical steps and kcal can score differently.

### Verification, not assertion

These constants are not trusted on paper. `remote-sql.sh` can pull the beta
cohort's real `health_buckets` and `daily_sleep`, and `computeDailyScore` is
pure, so every stored day is replayable under both models.

**Acceptance criterion:** median per-user daily delta within +/-10%, and no
user's rank on any past leaderboard moving more than one place. If the constants
miss, they are tuned against that output. Nothing ships until it passes.

---

## 3. Mind's trust layers and eligibility

### Three layers, in order

1. **`HKWasUserEntered === true` -> the sample is discarded.** Apple flags its
   own manual-entry path. This catches the trivial cheat with no list to
   maintain.
2. **Allowlisted `sourceRevision.source.bundleIdentifier` -> scores normally.**
   Apple Watch, Oura, Whoop, Fitbit, and the phone-only sensor apps (Sleep
   Cycle, Pillow, SleepScore) that make "wearable-gated" narrower than it looks.
3. **Unknown source, not user-entered -> scores, and sets `flagged`.**
   Rejecting these is the wrong trade: `flagged` is already documented as
   social-only, never a ban or a score reduction (§20), and a legitimate
   obscure sleep app scoring zero is indistinguishable from Kairo being broken.

Workouts get the identical treatment. Sensor evidence is
`getStatistic('HKQuantityTypeIdentifierHeartRate')` per session, at the cost of
N bridge round-trips per sync window.

### The client never sends the verdict

Source metadata exists only on the device, so filtering *looks* like a client
job. It is not: `sync-health` is server-authoritative and the client never posts
a number.

The client sends the **bundle identifier** and the **user-entered flag**. The
**allowlist lives server-side** in the Edge Function. A forged client can lie
about which app wrote a sample; it cannot promote itself past a list it does not
hold. This is the arrangement `profiles.has_wearable` already uses — capability
observed from data, never asserted — and it means the allowlist is editable
without an app release.

### Eligibility is a trailing capability window, and the obvious answers are traps

Normalization needs "how many stats can this user earn".

- **"Did trusted sleep arrive today"** inverts the incentive: skip tracking
  tonight, be normalized as a two-stat user, and score *more* for sleeping less.
- **`profiles.has_wearable`** fails the other way. It is deliberately sticky, so
  someone who abandons their wearable is divided by three forever while MND sits
  at zero — penalised twice for the same thing.

**MND counts toward earnable stats if trusted sleep data arrived in the last 14
days.** One missed night changes nothing. Abandoning a wearable drops you to two
stats after two weeks. Gaming it costs fourteen nights of untracked sleep to buy
a normalization bump, which returns far less. It is derived at read time from
`daily_sleep` and stores nothing new — the same shape `resolveChallenge()` has.

`has_wearable` stays exactly as it is for the leaderboard icon. It simply stops
being load-bearing for scoring.

---

## 4. Schema migration and deploy ordering

| Object | Change |
|---|---|
| `daily_scores.rec_points` | -> `mind_points` |
| `daily_scores.end_points`, `vit_points` | dropped |
| `contributing_stats` | check `0..4` -> `0..3` |
| `featured_stat` | check -> `('AGI','STR','MND')` |
| `tiers` JSONB keys | `END`/`VIT` gone, `MND` added |
| `daily_sleep` | + `was_user_entered boolean`; `source` finally populated |
| `workout_sessions` | + source bundle id, user-entered flag, HR-evidence flag |
| `profiles.end_total`, `vit_total` | -> `mnd_total` |
| `squads.program` | + a recovery program; existing `walking` rows re-point to AGI |

### The rename is the August outage in miniature

`sync-health` writes `rec_points`. Rename the column and the deployed function
fails on a table whose **bucket upsert commits first** — so health data keeps
landing while nothing scores, silently, exactly as `remove_sabotage` did. No
ordering of one migration and one deploy avoids a window: deploy first and it
writes to a column that does not exist; migrate first and the old function
breaks.

**Four-step expand/contract, revertible at every point:**

1. Add `mind_points`, defaulted. Nothing deployed.
2. Deploy `sync-health` and `finalize-days` writing **both** columns, reading
   `mind_points`.
3. Backfill `mind_points = rec_points` across history; run the replay (§5).
4. Drop `rec_points`, `end_points`, `vit_points`; tighten the check constraints;
   redeploy.

`smoke-sync.mjs` runs after **every** deploy step, not just the last.

The cheaper alternative — one atomic migration plus an immediate redeploy — is
defensible given a small pre-launch cohort, but it has a real window where
scoring is down and the only signal is a smoke test someone has to remember to
run. Rejected.

### The rollup trigger needs deliberate care

`20260810150000_stat_rollups.sql` maintains `agi_total` / `str_total` /
`end_total` / `vit_total`, which feed the ability ratings. It skips
recomputation when every column it reads is unchanged, and that guard is already
documented as easy to narrow wrongly.

Dropping two of four `*_total` columns while adding a third changes what
"unchanged" means. **If the guard is not updated in lockstep, the replay writes
new `daily_scores` rows and `profiles` silently never recomputes** — every
ability rating freezes at its pre-change value, with no error anywhere.

### Test coverage

All four migrations apply under PGlite (no realtime, no auth schema, so no
`UNSUPPORTED_MIGRATIONS` entries). The schema suite's pinned `squad_leaderboard()`
row shape is updated deliberately rather than incidentally. The suite's existing
habit of inserting `planDay`'s real output into `daily_scores` is what catches
engine/schema drift at commit time.

---

## 5. Replay, rollback, and update day

### The replay is `rescoreDay()`, not a new implementation

`_shared/rescore.deno.ts` already replays a day from stored buckets. The replay
is that existing path with new constants, over every stored (user, date),
batched **by user** so the rollup trigger settles once per user rather than once
per day.

**Dry run first:** the same job with writes disabled, emitting per-user old
total, new total, percentage change, and rank movement on every past
leaderboard. That is what tests §2's constants against reality.

### The replay must not go through `finalize-days`

That function inserts into `notification_log`. Replaying through it would push a
goal-completion notification for every goal that ever completed, to every beta
user at once. `rescoreDay()` does not touch notifications, which is why it is
the right primitive.

Second-order: goal progress is a read-time projection over `daily_scores`, so a
replay moves every in-flight goal's progress. A goal that now clears its target
latches on the **next** hourly `finalize-days` run and pushes a legitimate-looking
completion — for a goal completed only because the model changed underneath the
user. Suppress goal latching for one cron cycle after the replay, or say so in
the update note.

### Rollback

`health_buckets` and `daily_sleep` are never modified by any of this, and scores
are always replayed rather than adjusted. Reverting the model is: redeploy the
previous functions, re-run `rescoreDay` with the old constants, and every
historical score returns bit-for-bit. **This property is what makes the change
affordable.**

Three things do not roll back:

- `goal_completions` and challenge completions — stored, with targets
  snapshotted, deliberately. The asymmetry is one-way: a replay can *create*
  completions, never remove them.
- Notifications already sent.
- XP already rolled into `profiles` from those completions.

### What a beta user sees

Even with daily totals flat, two stat glyphs disappear, a third appears, and
**every ability rating shifts** — ratings read lifetime `*_total`, and two of
those rollups are retired. Someone's Agility rating moves without them doing
anything.

That needs an in-app note on first launch after the update. The character screen
is the surface people check, and an unexplained rating drop reads as a bug or a
punishment.

---

## 6. Surface and documentation fallout

| File | Change |
|---|---|
| `src/ui/StatIcon.tsx` | Single source for the glyph and `STAT_NAMES` maps — drop `END: 'timer'` and `VIT: 'heart-pulse'`, add `MND` (proposed `brain`: the glyph names the stat, not its input, and stays in MaterialCommunityIcons per the hairline/solid split) |
| `StatRail` | Four coins to three. It is a single `Pressable` already speaking all ratings, so its composed label shrinks with it — no per-coin label (that was tried and reverted) |
| `src/features/squad/row-label.ts` | Leaderboard row composition; tested pure module |
| Home hero | Three real-unit lines instead of four |
| `character/queries.ts`, `TodayPanel`, `buckets.ts`, `demo/fixtures.ts`, `SoloBoard.tsx`, `squad/queries.ts` | Column renames follow the schema |
| `src/features/character/species.ts` | Affinity remap: carabao -> `STR`, eagle -> `MND`. Flavour only; nothing in `@kairo/core` imports it |
| `packages/kairo-core/src/program.ts` | `walking` -> `AGI`; new recovery program boosting `MND`; SQL mirror of `PROGRAM_WEIGHTS` updated in lockstep |

### The threshold shifts create one new UI problem

If spreading steps lowers AGI's Gold to 7,500, the user reaches Gold at a number
that does not match the figure they have learned. `nextTierFor()` already
returns the gap to the next band; it must return the **shifted** band, and the
hero must say why — "Gold at 7,500 today, because you have been moving since
9am." Silent generosity reads as a bug.

This is the one part routed through the frontend-design skill rather than
specified here.

### Documentation, as part of the change

- `Kairo_Master_Summary.md` §5/§6 — the stat tables are the spec's core; a v1.5
  bump.
- `docs/roadmap.md` — deviation **#41**. It supersedes #40's affinity mapping
  and engages directly with #10's reasoning about stored multipliers.
- `docs/mvp-scope.md`, `docs/user-journey.md`.
- `CLAUDE.md` — the normalization rule, the 14-day capability window, and the
  client-never-sends-the-verdict rule belong in the invariants block.
- `docs/Ideas/kairo-attribute-system-design.md` — marked superseded, not left
  standing.
- Notion mirror and Decisions Log — on request, per the existing convention.

---

## 7. Spike result (2026-08-18), for the record

The design's anti-cheat depends on reading source metadata through
`@kingstinct/react-native-healthkit@14.0.2`. That was verified before this
design was written, by compile-time assertion against the exact call path
`read.ts` uses, with a negative control confirming the assertions were
load-bearing rather than vacuous.

- `BaseObject` declares `readonly sourceRevision: SourceRevision` —
  **not optional** — and both `CategorySample` and `WorkoutSample` extend it.
  `SourceRevision.source` resolves to `{ name, bundleIdentifier }`, plus
  `version`, `operatingSystemVersion`, `productType`. (The optional
  `sourceRevision?` appears only on `CategorySampleForSaving`, the write path,
  which Kairo never uses.)
- **`HKWasUserEntered` is typed metadata** on sleep samples
  (`boolean | undefined`), asserted by the library's own type tests against the
  sleep identifier. `queryCategorySamples` is generic and `read.ts:288` already
  passes the literal identifier, so both fields are typed **today** — they are
  simply discarded when flattening to `SleepSegment`.
- `queryWorkoutSamples` returns `WorkoutProxy[]`, exposing
  `getStatistic(quantityType)` and `getWorkoutRoutes()` for per-session heart
  rate and GPS.

**Consequence for the design:** manual-entry detection does not depend on the
allowlist at all, which is stronger than the Ideas doc assumed. The allowlist
becomes the second layer — deciding which sensor apps to trust — rather than the
only one.

**Still unverified at runtime:** whether Apple's manual-entry path actually sets
`HKWasUserEntered = true`, and what bundle identifier it reports. Unexpectedly,
`com.apple.Health` **is** installed on the iOS 26 simulator and launches
cleanly, so this is confirmable without a device — which matters, since USB
pairing is unavailable on the dev machine. It needs a Kairo build on the
simulator and a hand-entered sleep session, and simulator taps must be performed
by a human. Treated as a confirmation step during implementation, not a second
spike: the fallback if it disappoints is the allowlist, which is already in the
design.
