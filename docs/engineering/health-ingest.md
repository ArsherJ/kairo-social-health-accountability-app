# Health ingest and anti-cheat — the reasoning

Extracted verbatim from `CLAUDE.md` on 2026-09-08 to keep that file inside its
size limit. **The rules still live in `CLAUDE.md`** (search "Health reads are
filtered at the source"); this file is the *why* behind them — the silent
failure each half invites, the simulator verification run that distinguishes
them, and what was deliberately left out of scope.

Covers deviation #67 (2026-09-06), all three parts: typed-in samples excluded at
the query, untrusted step sources dropped, and an implausible hour flagging the
day.

---

**Typed-in Health samples are excluded at the query as of 2026-09-06**
(deviation #67, first of its three parts). `EXCLUDE_TYPED_IN` in
`src/features/health/read.ts` is spread into the filter of **every**
`queryStatisticsCollectionForQuantity` call — steps, distance, active energy,
exercise minutes, hourly heart rate and resting heart rate — so a number typed
into the Health app stops being Kairo activity at the source rather than only
being bounded downstream. Four things break easily:

- **`operatorType: notEqualTo` is the trap, and the compound `NOT` is the
  answer.** An automatically-recorded sample carries **no `HKWasUserEntered`
  key at all**, and a `!=` against a missing key is not reliably true: the
  plausible failure is every quantity read returning zero, forever, with no
  error anywhere — the `activity_type` omission's silent shape in a new place.
  `NOT [{ metadata: { withMetadataKey, equalTo, true } }]` asks the opposite
  question, and `createNotPredicateForSamples` ANDs it with the date range
  rather than replacing it. A test bans the word `notEqualTo` in that file.
- **This is not what sleep and workouts do, and the doc comment says so.** Those
  read the flag off *returned samples* and let a pure module decide downstream;
  a statistics collection returns sums, so there is nothing left to filter.
  `queryWorkoutSamples` therefore keeps a **date-only** filter (`dateFilter`,
  beside `quantityFilter`) on purpose: excluding typed-in workouts at the query
  would make `WorkoutSessionReading.wasUserEntered` dead and move a §3 rule the
  server owns onto the client, by omission.
- **The guard is a source scan, and it has no exceptions.**
  `typed-in-samples.test.ts` resolves each call's filter through one level of
  `const` and fails any collection that does not reach `EXCLUDE_TYPED_IN` —
  `calibration-read.test.ts`'s arrangement, for its reason: `read.ts` imports
  the HealthKit library, whose Flow syntax root Vitest cannot parse, and the
  behaviour is native anyway. It strips comments first, because the module
  explains the trap it is avoiding and a guard that fails on that sentence gets
  deleted.
- **It costs the simulator dev loop, and `dev-seed.ts` is not the part that
  breaks.** Typing a day into a simulator's Health app now produces nothing
  Kairo can see, which is the usual way a simulator gets data. `dev-seed.ts`
  survives, **verified on the simulator 2026-09-06**: it saves samples
  programmatically and attaches no `HKWasUserEntered` metadata, and HealthKit
  does not add the key on an app's behalf — so do not "fix" it by adding one.
  What neither covers is a *squadmate's* day, which only `seed-health` can
  fabricate; it earns its keep for that, fail-closed on `CRON_SECRET` (shared
  rather than a second credential; the `seed_test_users` allowlist, not secret
  uniqueness, is what bounds the damage) and reachable by no client path.
- **A simulator proves more than "it cannot see this failure" suggests, and the
  test is two readings that must disagree.** The catastrophic failure is the
  predicate excluding *everything*, and `dev-seed.ts` is exactly the control
  that rules it out, because it writes unflagged samples through the same read
  path. The run on 2026-09-06: HealthKit held **71,736** steps for the day — two
  dev-seed runs plus one 50,000-step sample typed into the Health app — and both
  Kairo and `health_buckets` held **22,000**, the seeded total alone. The figure
  moved 11,000 → 22,000 when the second seed landed, so the read was live rather
  than a cached server value. (The 264 between 50,000 typed and the 49,736
  HealthKit attributes to it is its own overlap de-duplication of an
  instantaneous 12:36 sample against a seeded hour-12 interval — same-source
  merging, nothing the predicate did.) **Re-run this before touching
  `EXCLUDE_TYPED_IN` or any collection's filter**; it is cheaper than a build and
  it is the only check that distinguishes the two silent failures from each
  other. What is still device-only is narrower than the whole change: whether
  Apple's own *sensor-recorded* samples behave like unflagged programmatic ones.
  No simulator produces those.

**Untrusted step sources stop counting as of 2026-09-06** (deviation #67, second
of its three parts). `partitionStepSources` in
`src/features/health/step-sources.ts` splits the day's contributing sources; the
trusted ones go back to HealthKit as `filter.sources` on the **same** combined
statistics collection. Seven things break easily:

- **A source predicate, never per-source sums.** Apple deduplicates *inside* one
  query, which is what stops an iPhone and its paired Watch counting the same
  steps (deviation #8). `queryStatisticsCollectionForQuantitySeparateBySource`
  exists and summing its output looks equivalent — it rebuilds that double count
  for exactly the most competitive users.
- **An empty trusted list means skip the query, not pass an empty array.**
  Natively an empty source set yields *no* predicate
  (`createSourcePredicate` returns nil), so `sources: []` counts **every**
  source including the ones just rejected — the exact failure the read exists to
  prevent, arrived at by tidiness. `read.ts` skips the steps collection instead,
  which **does** zero the day's steps server-side — `toBuckets` seeds every hour
  of every requested date, so producing no readings uploads `steps: 0` across
  the window. That is correct when nothing contributing is counted, and it is
  why the disclosure line is not optional.
- **`null` and empty are different answers and fail in opposite directions.**
  `null` means the *enumeration* threw and there is no verdict about anybody's
  steps, so the read counts every source exactly as it did before the predicate
  existed. Failing closed there would make a transient native error silently
  delete the player's own iPhone steps with no line to explain it — the "number
  too low, no reason" failure this pass exists to remove, reintroduced by its own
  fix. An empty partition means the enumeration answered and trusted nothing,
  which must count nothing. Collapsing the two into one `[]` is the easy mistake,
  and it was made once here before being caught.
- **The prefix is `com.apple.health.` — case-sensitive, trailing dot,
  something after it.** All three are load-bearing. `com.apple.Health` is the
  *Health app*, i.e. hand entry, and differs only by case, so a
  case-insensitive match would trust typed-in numbers with `EXCLUDE_TYPED_IN` as
  the only thing left between them and the score; without the dot
  `com.apple.healthkitreporter` matches; and the bare prefix is not a device.
  It is a prefix rule rather than `WORKOUT_SOURCE_ALLOWLIST`'s exact list
  because device data carries `com.apple.health.<device-uuid>` — one list per
  shape of identifier, and they are not interchangeable.
- **`STEP_SOURCE_BRIDGE_ALLOWLIST` is empty on purpose, and it ships in the
  app.** Empty because no cohort exists and a wrong guess here is the only kind
  that inflates a score; the disclosure line is how it gets filled, from what
  players actually carry. **In the app, not server-side** — the filter is applied
  at read time on the phone, so the list moves by OTA. The design doc said
  server-side and was corrected.
- **Exclusion is inert and must never flag the day.** §5's rule is that a false
  positive costs more than a miss, and the Philippine market runs cheap bands
  that write under their own identifiers — "count Apple only and flag the rest"
  accuses the target market of cheating for owning its own hardware.
  `today-details.ts`'s line states a fact and a test bans seven accusing words.
- **`dev-seed.ts` writes as Kairo and would be dropped by this.** `read.ts`
  passes the app's own bundle id through `partitionStepSources`' `alsoTrust`
  under `__DEV__` only — otherwise the source predicate takes the simulator loop
  out a second time, straight after `EXCLUDE_TYPED_IN` took it out the first.
  Empty in a release build, where the app writes no steps at all.
- **`filter.sources` must hold the objects `querySources` returned.** The native
  side recovers each with `source as? SourceProxy`, so a mapped or spread copy
  downcasts to nil, contributes no predicate, and the query counts every source
  **silently**. `partitionStepSources` is generic over its element type for
  exactly this reason: it returns the same instances and never rebuilds one.
- **The names describe the sync window, not today**, and the line is worded for
  it — "aren't counted yet" is a standing fact about a source, not a claim about
  today's steps. A first sync spans up to 31 days, so it can name an app that
  wrote nothing today, and that is still true rather than misleading.
- **The dropped names never leave the phone.** Not in the sync body, no
  projection, no telemetry payload, and `status-store.ts` holds them in memory
  rather than persisting them — a stale list outliving an uninstalled app is a
  sentence about nothing. `step-sources.test.ts` scans `sync.ts`,
  `useHealthSync.ts` and Today for both leaks, because "log which bands the
  cohort carries" is one line away and would turn a disclosure into a
  collection.

**Two limits of that pass, deliberate and worth knowing.** The predicate is on
**steps only** — distance, active energy and exercise minutes are unfiltered,
because the ticket scoped the day's step total and widening it silently would
change the anti-cheat stride check's inputs without a decision. And it applies
to `readHealthWindow` only: `readStepsToday` (the onboarding reveal) and
`readDailySteps` (calibration) still read every source, so an account whose only
source is an unrecognised band sees a real number on `/connect` and is
calibrated on steps that will not later count. Both are follow-ups, not
oversights, and the calibration half is **issue #43** — it writes a durable
`quest_tier_override` from steps the day totals will never contain, which is a
wrong stored value rather than a cosmetic gap.

**An implausible hour flags the day, and a flagged day sets no best day, as of
2026-09-06** (deviation #67, third and last of its three parts). Per hour:
`HOURLY_CEILINGS` in `packages/kairo-core/src/anticheat.ts` — 12,000 steps,
15,000 m, 1,200 active kcal, beside the `<= 60` exercise-minute clamp
`parseBucket` has always had. `isDayFlagged` checks `exceedsHourlyCeiling`
alongside `evaluateStepBurst`, and `stat_records()` skips a flagged day
(migration `20260906120000`). Six things break easily:

- **It flags. It does not clamp and it does not reject**, and both were the
  first instinct. Hourly buckets are the source of truth every score replays
  from, so a clamp writes a number Apple never reported into the one store that
  has to stay true and a later threshold change cannot recover the original —
  and the ceilings are near real human maxima, so a clamp would *reduce a real
  day*, which the progress-is-still-progress rule forbids. Rejecting is worse:
  a refused sync is indistinguishable from the 9–11 August outage. A test sends
  90,000 steps through `validateSyncRequest` and asserts the payload is
  accepted with every figure intact.
- **The ceilings are unsuppressible, and the burst rule stays suppressible.**
  A workout and a heart rate clear a burst, because a burst is about missing
  corroboration; they do not clear a ceiling, because a payload that fabricates
  an hour can claim both. The two rules sit side by side in `isDayFlagged`.
- **The substantive half is `stat_records()`, not the ceilings.** Almost
  nothing consumes these numbers uncapped — the race caps at the ridge, points
  cap per stat, XP is banded, Mastery derives from capped points, quests are
  boolean — so the personal best is the outcome a forged sync could buy. **One
  consumer was still uncapped and the flag did not stop it**: a Battle pooled
  raw active calories against a stored target and paid XP, and a flagged day
  still contributed. **That closed on 2026-09-06** with deviation #66; there is
  no uncapped consumer left, and adding one reopens the hole rather than merely
  widening a feature. The
  ceilings buy the *claim*; skipping flagged days closes the outcome. A flag
  removes the whole **local date**, Mind's night included, and the exclusion is
  `not exists` rather than a join: an inner join would drop a date with no
  `daily_scores` row at all, narrowing the read silently, and only an actual
  `flagged = true` may remove a day.
- **The accused hears it first, and the sentence names a consequence that is
  real.** `FLAGGED_DAY_NOTE` in `today-details.ts` — *"Some of today's hours
  don't look like walking, so today can't set a personal best — and your flock
  sees a flag on your row."* — lands on the flagged player's own details before
  the chip a squadmate sees on their leaderboard row. **The design's draft ended
  "so they won't count towards the flock" and that is the one thing that is not
  true**: `squad_leaderboard()` ranks on the weighted total and only projects
  the flag, the corridor re-ranks capped steps without reading it, and XP,
  Mastery and the streak are untouched — a flag is a social signal, never a
  score reduction (`trust.ts`). Two tests pin the wording and ban the
  "won't count" claim from coming back. It names no rule, no threshold and
  no figure, and a test pins that: one sentence for two rules is also why
  `daily_scores.flagged` stays a **boolean**, and naming the bar would publish
  it to the one reader with a motive to sit just under it. `useTodayScore`
  selects `flagged` for this and nothing else decides anything from it. The
  **Counting** screen (`app/counting.tsx`, 2026-09-14) is where a player
  learns what a flag is — a day whose hours don't look like human movement,
  costing no points, blocking a personal best that day, shown on the flock
  row, about that day only — and `counting-copy.test.ts` bans the ceiling
  figures, formatted and bare, for the same reason.
- **The distance comment was corrected and the rule was not touched.**
  `DistanceWalkingRunning` is pedometer-estimated by the motion coprocessor on
  iPhone, not GPS-derived. Requiring a workout or heart rate *beside* the
  distance would make `MIN_PLAUSIBLE_STRIDE_M` dead code — a workout returns
  early and heart rate alone already clears — and would flag the honest
  phone-only runner, whose hour at running cadence clears the 9,000-step bar
  with only the distance to vouch for them; `EXCLUDE_TYPED_IN` kills the attack
  it aimed at anyway. `SuppressionSignal`'s `'gps_distance'` value is
  deliberately **not** renamed: it is reporting only, nothing stores it, and it
  is what the suppression tests already say.
- **All five Edge Functions redeploy together**, because the planner is shared,
  and the deployed behaviour was verified rather than assumed on 2026-09-06:
  `smoke-sync.mjs` passed, and a one-off through the real door sent a
  30,000-step hour with a workout and a heart rate vouching for it — the
  payload was accepted, the bucket stored as `30000 / 22500 / 700`, the day
  flagged, and `stat_records()` returned no rows.


## The rules, in full (moved from `CLAUDE.md` 2026-09-12)

**Health reads are filtered at the source, and an implausible hour flags the
day, as of 2026-09-06** (deviation #67, all three parts). The reasoning, the
silent failures each half invites, and the simulator verification run are
`docs/engineering/health-ingest.md` — **read it before touching any read
filter, the ceilings, or `stat_records()`.** The rules:

- **`EXCLUDE_TYPED_IN` is spread into the filter of every
  `queryStatisticsCollectionForQuantity` call** in `src/features/health/read.ts`,
  so a number typed into the Health app stops being Kairo activity at the
  source. It is a compound `NOT` over `withMetadataKey`, **never
  `operatorType: notEqualTo`** — an automatically-recorded sample carries no
  `HKWasUserEntered` key at all, and `!=` against a missing key silently zeroes
  every quantity read forever. A source scan bans the word `notEqualTo` in that
  file and has no exceptions. `queryWorkoutSamples` keeps a **date-only** filter
  on purpose: sleep and workouts read the flag off returned samples instead, and
  filtering them at the query would make `WorkoutSessionReading.wasUserEntered`
  dead and move a §3 rule the server owns onto the client.
- **Untrusted step sources stop counting**, via `partitionStepSources`
  (`src/features/health/step-sources.ts`) feeding `filter.sources` on the
  **same** combined statistics collection — never per-source sums, which rebuild
  the iPhone/Watch double count Apple's in-query de-duplication prevents
  (deviation #8). `null` (the enumeration threw) counts every source; an empty
  trusted list **skips the steps collection**, which zeroes the day — passing
  `sources: []` yields no predicate natively and counts everything, the exact
  failure the read exists to prevent. The trusted prefix is
  `com.apple.health.`: case-sensitive, trailing dot, something after it, all
  three load-bearing. `STEP_SOURCE_BRIDGE_ALLOWLIST` is empty on purpose and
  ships **in the app**, so it moves by OTA. Exclusion is inert and must never
  flag the day; `today-details.ts` discloses the dropped names as a standing
  fact about a source and a test bans seven accusing words. `filter.sources`
  must hold the objects `querySources` returned — a mapped or spread copy
  downcasts to nil natively and counts every source silently. The dropped names
  never leave the phone, and a scan of `sync.ts`, `useHealthSync.ts` and Today
  holds both halves of that.
- **`dev-seed.ts` is the simulator control and must keep working.** It writes
  unflagged samples through the same read path, which is the only check that
  distinguishes "the predicate excludes everything" from "the predicate works";
  `read.ts` passes the app's own bundle id through `alsoTrust` under `__DEV__`
  only. Re-run the two-reading check in the doc before changing
  `EXCLUDE_TYPED_IN` or any collection's filter.
- **Two deliberate limits.** The source predicate is on **steps only**, and it
  applies to `readHealthWindow` only — `readStepsToday` (the onboarding reveal)
  and `readDailySteps` (calibration) still read every source. The calibration
  half is **issue #43**: it writes a durable `quest_tier_override` from steps
  the day totals will never contain.
- **`HOURLY_CEILINGS` flag; they do not clamp and do not reject.** 12,000 steps,
  15,000 m, 1,200 active kcal per hour in `packages/kairo-core/src/anticheat.ts`,
  checked by `isDayFlagged` beside `evaluateStepBurst`. A clamp writes a number
  Apple never reported into the store every score replays from and would reduce
  a real day; a rejection is indistinguishable from the August outage. A test
  sends 90,000 steps through `validateSyncRequest` and asserts the payload is
  accepted intact. The ceilings are **unsuppressible**; the burst rule stays
  suppressible, because a burst is about missing corroboration and a fabricated
  hour can claim both.
- **The substantive half is `stat_records()` skipping a flagged day** (migration
  `20260906120000`) — `not exists` rather than a join, removing the whole local
  date. Nothing else consumes raw units uncapped; the Battle was the last and
  went with deviation #66, so adding an uncapped consumer reopens the hole
  rather than merely widening a feature.
- **`FLAGGED_DAY_NOTE` in `today-details.ts` reaches the accused first**, names
  a consequence that is real (no personal best, a flag on the flock row) and
  never "won't count towards the flock" — a flag is a social signal, never a
  score reduction (`trust.ts`). It names no rule, threshold or figure, which is
  also why `daily_scores.flagged` stays a boolean. Tests pin the wording and ban
  the "won't count" claim.
- **All five Edge Functions redeploy together**, because the planner is shared.
