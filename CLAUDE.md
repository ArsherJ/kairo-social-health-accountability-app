# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily race to a shared finish line. (A pooled Battle sat beside the race until deviation #66 retired it on 2026-09-06.) iOS first via Expo; Supabase backend.

**Current state (2026-09-11) — the ground truth a fresh session needs first:**

- **Tabs** are **Today · Sky · Flock · You** — `app/(tabs)/` is `index` (Today) · `sky` · `flock` · `profile` (You). There is no character tab.
- **Onboarding** is seven beats: `/welcome → /one-sky → /mirror → /connect → /difficulty → /privacy → /name` (`/mirror` sits between the sky card and the Health ask, added by deviation #62). The profile row commits exactly once, on `/name` (deviation #58; see its block below).
- **Today is a progress-and-character dashboard as of 2026-09-11**: Motion and its walk meter sit beside the plush eagle in one responsive hero, followed by the bird's sentence/details action, Body and Mind, and the three quest rows. Motion appears once. `resolveLivingMirror` still owns the figure — Mind, verified strength, summit and reaction priority — while level scale, presence, plumage and the ceiling sky remain intact. Still no race copy, Mastery coins or score total; `today-board.ts` owns reading copy.
- **The app has warm-pastel light and dark schemes**: cream/charcoal pages, cocoa/cream ink, apricot primary actions, lilac support and mint secondary surfaces under the existing semantic roles. `src/theme.ts` exports `light`, `dark` and `themes`; themed screens — including all seven onboarding views — read `useTheme()` / `useStyles(makeStyles)`. Static `colors`/`ramp` remain the light palette for pure tests and authored sign-in. Settings → Appearance is System / Light / Dark on MMKV. **`userInterfaceStyle` is `automatic` in `app.config.ts`, a native field that ships with a build, not an OTA.**
- **The Sky is open-air flight toward a ridge** (2026-09-11 refinement): no winding trail, including on the scrubbable right-side minimap. Forward distance is a straight presentation of earned step progress; birds drift sideways automatically over layered scenery. Drift never changes steps or rank, stops for Reduce Motion/inactive screens, and uses the unchanged v3 assets. The scene, minimap and Locate share presentation coordinates; `flightFrame` still owns measured chrome clearance. See `docs/engineering/surfaces.md` before changing this projection.
- **The compact Flock perch is horizontally scrollable and never clamps a person's name by line count.** Cards keep a 96-point minimum, while a long label may widen to 144 points and make the card grow vertically; the domain allows 20-character names and XXXL readability outranks the earlier two-line silhouette.
- **The palette is Playful** (deviation #58), quieter since #72: one accent wash on the tab bar rather than four gradients, no gradient bands on Flock or You, cards at `radius.lg`. Every character is a **Philippine eagle** (deviations #55/#57); `profiles.species` still stores all four values and is resolved at the render boundary.
- **The character art is the plush eagle v3 pack as of 2026-09-11** (deviation #73): eleven renders and eleven crest masks, unsuffixed filenames, **no per-stage bodies and no cosmetics**. The growth stage reads as size through `figureResponse`'s `bodyScale`; `summit` is the seventh pose and the one the ridge draws. Ships with a build, riding along on the one deviation #72 already owes.
- **The account-free preview mounts the four tabs and all seven real onboarding views.** Its local controls cover ready/loading/empty/private/error plus long names, ridge/summit, ceiling/reaction, missing sleep, solo ghosts and every shield branch; Connect, quest, privacy and name answers never invoke production stores or mutations. The toolbar consumes the top safe area, so only the shared screen canvas receives a preview-local top inset of zero; the nested Name view uses its measured window offset for the keyboard, while the production route keeps zero. The real bottom inset and route ownership stay intact. See `docs/engineering/mobile-screen-preview.md` before sample UI verification.
- **The scoring engine is untouched since the race pivot** and still decides every day exactly as §5/§6 specify.
- **There is no Battle, and no squad-wide target of any kind** (deviation #66, 2026-09-06). Nothing creates, renders or grades one and every live row is closed; what survives is history — see the block below. The notification ask keeps `hasSquad || hasScoredDay`.
- **The Digest reaches solo players and stops for lapsed ones** (deviations #61/#65). The privacy claim is made in **three** places, not four.
- **The privacy policy exists** (2026-09-02): `web/privacy.html`, served at `/privacy` on the invite host, linked from Settings beside a "Send feedback" row, and guarded — since 2026-09-07 — by `src/features/privacy/claim-surfaces.test.ts` along with every other surface that makes the claim. The App Store answers are `docs/app-store-privacy.md` and the listing copy — name, subtitle, description, keywords — is `docs/app-store-listing.md`. What remains is by hand: the controller's legal name in the page, App Store Connect's fields (the privacy answers **and** the listing), the `NSHealthShareUsageDescription` build.

Everything below this line is the *why* and the *history* behind those facts. Several blocks describe design eras, tab layouts and flows that have **since been replaced** — each such block states its date range and what superseded it. Read a dated "as of" claim against this list before acting on it.

**Three passes are deep enough that their reasoning was extracted, on 2026-09-08, to keep this file inside its size limit. The rules stayed here; the *why* moved.** Each block below carries the rules and points at its doc, and the docs are verbatim — nothing was rewritten or dropped:

- `docs/engineering/scoring.md` — the three-stat switch, the Body/Motion/Mind pass, the surface names, the rested-night shift. Read before changing a threshold, a shift, a point curve or a stat's copy.
- `docs/engineering/health-ingest.md` — typed-in samples, untrusted step sources, the hourly ceilings. Read before touching a read filter, the ceilings or `stat_records()`.
- `docs/engineering/surfaces.md` — the accessibility pass, the Playful redesign, onboarding, the Sky corridor, the art passes, three rounds of device-seen layout faults. Read before adding or reshaping a screen.
- `docs/archive/battle-and-goals.md` — two retired mechanics, kept because their schema survives them.

**Kairo is a race as of 2026-08-25** (roadmap deviation #44) — the pivot, now
complete across all five sub-projects. Your real life powers your character;
your character races your friends. **The scoring engine is untouched** and still
decides every day exactly as §5/§6 specify — `tierFor`, `TIER_POINTS`,
`THRESHOLDS`, `computeDailyScore`, `planDay`, `finalizable_days()` and the
streak all behave as before, and the race reads **raw units alongside them**,
never instead of them. No user data was destroyed: scores, XP, ratings,
streaks, species, invites and completions all survive, and banked Goal XP is
kept by #45's `closed_at` mechanism. If a doc outside `docs/archive/` describes
the app as a leaderboard with goals, it is stale — fix it.

- **One push a day** (deviation #52): `daily_digest` at `DIGEST_HOUR` (08:00
  local), and **08:00 rather than finalization** because days finalize about
  two hours after local midnight, so a digest carrying the result would fire at
  2am. The cap is `users_needing_digest()`'s exclusion **and**
  `notification_log_one_digest_per_day` — both halves, because the first is the
  behaviour and the second is the guarantee, and a client-side cap is a race
  between the same account's devices. `MAX_NOTIFICATIONS_PER_DAY` **stays 3**:
  it bounds the event-driven pushes, which #52 did not touch. The three retired
  triggers stay in `NotificationTrigger` (free-text `kind`, and a push sent
  before the deploy can be tapped after it), and `users_at_local_hour()` was
  deliberately not dropped. **What the app *says* about this lives in
  `src/features/notifications/ask-copy.ts`**, pure and zero-import so root
  Vitest can hold it: the permission sheet advertised the three retired pushes
  for ten days after they stopped existing, on the screen that spends the one
  dialog iOS grants per install. Its `DIGEST_LOCAL_HOUR` is a second copy of
  `DIGEST_HOUR` — the app cannot import an Edge Function's module, and moving
  the constant into the keystone would put a five-function redeploy behind a
  copy fix — so a test imports both and asserts they agree.
  `RETIRED_PUSH_PHRASES` lives in the same module and both copy surfaces are
  tested against it, rather than each keeping its own list. **No surface may
  state a hard daily cap**, though `MAX_NOTIFICATIONS_PER_DAY` is 3: `BUDGET_EXEMPT`
  sends bypass the budget *without consuming it*, so a digest, a cleared
  challenge and a beaten Event are four, and both surfaces printed "three a day
  at most" until 2026-09-04. **Nor may any surface promise quiet hours.**
  `QUIET_HOURS` is enforced in `planNotifications`, and `dispatch-notifications`
  is its only caller — `finalize-days` reaches `sendToUser` directly, and
  finalization runs `FINALIZATION_GRACE_MS` (2h) after local midnight, so
  `challenge_cleared` is the push that *does* arrive
  overnight. `notifications.ts` argues they should not ("a push at 02:00 to say
  'well done' is worth waiting for morning"); that is an intent the send path
  does not implement, and a "never overnight" claim shipped on it for one
  review round before being caught.
- **`shouldAskForNotifications` earns the ask on a squad or a first scored
  day, as of 2026-09-04.** A running Battle was a third reason until deviation
  #66 dropped it on 2026-09-06; nobody could hold it without also holding
  `hasSquad`, since `events_need_squad` made every Event a squad's, so no
  account lost the ask. The social reasons were right while the pushes they
  enabled were; #52 left one scheduled
  push and Kairo is solo-first, so gating on them alone excluded the whole
  solo cohort from the app's only re-engagement. `hasScoredDay` reads the Today
  tab's own `useScoredDayCount` key — lifetime, `total > 0`, for that query's
  reasons — so it costs no request, and a count in flight reads false and
  withholds the ask for a frame rather than presenting it on a guess. **The
  widening adds a reason, never a surface**: the primer sheet, the Health-first
  ordering in `permissions/ask-order.ts`, the one-ask-per-session latch and the
  single modal host are all untouched, because two `<Modal>`s presenting on one
  root view controller is the defect that ordering function exists to prevent.
  `notification_ask_answered` fires **per answer** — `granted`, `declined` or
  `deferred`, with no other payload, and a test pins that — because "Not now"
  never reaches the system dialog and so can genuinely recur. The Settings row's
  undetermined help line is part of the policy: it told solo players they needed
  a squad to be asked, and `status-copy.test.ts` now holds it honest.
- **`race_results` has no client grant at all.** Read it through
  `race_result()`, which returns rank and species to anyone in the squad and
  gates capped steps reciprocally (#47). Written **once**, by the **last**
  member of a squad to finalize that date — `squadDayIsComplete()` returns
  false for an empty roster on purpose, because `every` over an empty list is
  true and would occupy a write-once key forever. The one exception to reading
  through the RPC is `dispatch-notifications`, which has no JWT and reads the
  table with the service role — which is exactly why the table has no grant
  rather than an RLS policy.
- **`figureResponse()` owns how loudly the character answers to progress**
  (`src/features/character/level-response.ts`). It is tested, and the test pins
  a 1.7× span across the level range **and** a visible change at every single
  level — the old inline arithmetic moved only at levels 6, 11 and 21, which is
  why the QA pass said the character did not morph. Tune the constants there,
  never inline in `CharacterFigure.tsx`.
- **`kairo_retention()` is deliberately unchanged across the pivot.** The
  definition of an active day did not move; only the funnel vocabulary did —
  `squad_data_consent_granted`, `race_seen`, `quest_cleared`, `event_created`,
  with `goal_created` kept as a historical value. `race_seen` and
  `quest_cleared` fire once per **local day** via
  `src/features/telemetry/daily-marker.ts`, which is neither the once-ever
  milestone store nor the per-session `app_open` marker; confusing the three is
  how a count becomes a launch counter or a scroll counter.

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

**Body metrics are inert, and the app says so as of 2026-09-04** (deviation
#60). `profiles.height_cm` and `profiles.weight_kg` reach **no scoring path** —
Apple computes active calories against the body profile in the *Health app*,
before Kairo sees them, and Kairo's columns are a disconnected second copy. The
card promised "more accurate Body tracking" for years and that was false; the
copy is `BODY_METRICS_NOTE` in `body-metrics.ts` now, with a test banning a
stat name and any claim of benefit. **`birth_year` has no live reader either**:
its one consumer is `maxHeartRateForAge()` behind the display-only Strain
figure, and `TodayPanel` — the only surface that ever rendered Strain — was
unmounted by deviation #59, so the note names no surface at all and a test
holds it there. All three fields are inert today. They are never asked in
onboarding —
a question that changes nothing does not earn a screen — and the columns,
constraints, grants and editor are all untouched, so collecting them later is
adding a screen rather than restoring a schema.

**Sabotage was removed on 2026-08-09.** It was the original premise (§8, and §20's principle #4 called it "the soul of the product"), so a lot of prose still assumes it. Nothing in the code does. If you find a reference, it is stale — fix it.

**Bronze/Silver/Gold are internal to scoring as of 2026-08-10.** `tierFor()`, `TIER_POINTS` and `daily_scores.tiers` still decide every day exactly as §5/§6 specify — nothing about the engine changed. But no surface renders a tier name or colour any more: the character sheet and the leaderboard both show a numeric **ability rating** from `ratingForStatPoints()` over lifetime per-stat rollups on `profiles`. If you find UI naming a tier, it is stale. **`profiles.focus` was dropped the same day** — `squads.program` is the only focus concept, and the character screen's "lane" reads observed dominance instead.

**Points are spoken nowhere, as of 2026-08-15 and more so since.** `daily_scores.total`
still ranks the board and feeds XP and ratings — nothing
about the engine changed, exactly as with tiers in deviation #23. But no ambient
surface prints it: the home hero is the day in real units, a leaderboard row is
rank and the gap to the row above, and `src/features/squad/row-label.ts` speaks
that gap rather than a total — deliberately, because a screen reader naming a
figure the screen does not show describes a different product. The last exception
went with Goals on 2026-08-25: an Event's target is a number of **calories**,
which the squad produces rather than accrues. If you find any surface rendering
a score total, it is stale — fix it.

**Kairo scores three stats, and the ladder is not a lookup.** Deviations #41
(three stats, 2026-08-20), the 2026-08-29 Body/Motion/Mind pass, #51 (surface
names, 2026-08-25) and #68 (a rested night, 2026-09-08). The full accounts —
what each pass moved, what it retired, the double-counts it would reintroduce,
and the ADR-0001 replay licence it spent — are `docs/engineering/scoring.md`,
with the design at
`docs/superpowers/specs/2026-08-29-body-motion-mind-design.md` and the
vocabulary in `CONTEXT.md`. **Read that doc before changing a threshold, a
shift, a point curve or a stat's surface copy.** The rules:

- **`CoreStat` is `'AGI' | 'STR' | 'MND'`** — steps, active calories, sleep.
  END folded into STR and VIT into AGI as **threshold shifts**, never point
  multipliers (a stored multiplier stacks with the squad program's read-time
  weight — deviation #10's trap). A day's stat points scale by
  `3 / earnable stats`, so both ceilings are 4,400 and a wearable buys a third
  route to the same ceiling rather than a higher one.
- **The surface names are Body (`STR`) · Motion (`AGI`) · Mind (`MND`)**, and
  the engine keys never change — deviation #23's move in a second place.
  `src/ui/stat-names.ts` is the single source, zero-runtime-import so root
  Vitest can hold it, re-exported by `StatIcon.tsx`; `dominanceName()` replaced
  `DOMINANCE_LABELS` and a parallel table of stat words anywhere is stale by
  construction. A test scans `src` and `app` for the word **Agility**.
  "Strength" is deliberately not guarded: `squads.program` and `ChallengeArea`
  name a game, not a stat — a Strength squad's blurb still reads "Body counts
  for more", which is correct and briefly confusing, and that trade was taken
  knowingly. **Do not import `@/ui/index.ts` from a module root Vitest tests.**
- **The Daily Walk reads `tiers->>'AGI_base'`, never `tiers->>'AGI'`.** AGI's
  spread shift lowers its whole ladder, so the stored shifted tier would make a
  public-health baseline scale with the user. `sync-plan.ts` writes both keys;
  `train/queries.ts` falls back to `AGI` for rows written before the switch.
- **Prove any shift through `computeDailyScore`, never through `tierFor`.**
  `tierFor` *is* `shiftedTierFor(stat, raw, 0)`, the one path where a shift is
  absent by definition — a guard written there passes however wrong the scored
  day becomes, which is how the `AGI`/`AGI_base` divergence got through review
  once.
- **`planDay` requires `earnableStats` and `verifiedStrengthMinutes`, and
  neither is defaulted.** Both its callers are write paths, so a default is
  every stored row scoring at factor 1.0 with nothing to notice.
  `scoring-inputs.ts` derives them against **the date being scored**, never
  wall-clock today.
- **The board re-sums the per-stat columns; it does not read `total`.** That is
  what lets `squad_leaderboard()` apply the program weights at read time
  (deviation #11), and it means a stat is competitively invisible until it is in
  `program_weighted_total` **and** `squad_leaderboard` **and**
  `weightedBoardTotal`. Changing that function's signature is a **drop by exact
  argument list**, never `create or replace`.
- **One signal, one mechanism, and the retired `workoutShift` is why.**
  Verified strength minutes raise Body's **raw value**
  (`STRENGTH_MINUTE_KCAL_CREDIT`, 4 kcal/minute) and must never touch its bands;
  a rested night (`restedShift` in `packages/kairo-core/src/shifts.ts`, routed
  to `STR` by `statShifts`) lowers Body's **bands** and must never touch its raw
  value, nor Mind's own bands. Route either through the other's mechanism and
  the double-count returns exactly as it was. `statShifts`' `sleepMinutes` is
  **required** — a default makes "no wearable" and "caller forgot" the same
  silent answer — and the value is already trust-gated, so a phone-only account
  takes a zero shift and meets no sentence. Sleep shifts Body and **never
  Motion**, whose shift already caps at eight active hours.
  `verifiedStrengthMinutesFrom` filters on `activity_type`, which had to be
  added to `WORKOUT_SESSION_COLUMNS` — without it every row reads `undefined`
  and Body credits nothing, forever, with no error.
- **`statPointsFor` interpolates between the tier anchors.** 250 / 650 / 1,200
  still land exactly on the bands, so the 4,400 ceiling, `tierFor`, the Daily
  Walk streak and `AGI_base` are unmoved. **Below Bronze is still zero** and
  that is load-bearing: interpolating from the origin would let fifty steps
  score points, count as a scored day and keep a streak alive.
- **Mind tapers to Silver rather than falling to Bronze** — Gold holds to
  `MIND_OVERSLEEP_HOURS` (9), declines to the Silver anchor by
  `MIND_TAPER_END_HOURS` (10.5), floors there. HealthKit sleep is noisy, and a
  cliff punishes measurement error as behaviour. `mindTierFor` derives its tier
  from `mindPoints`, never a second threshold table. `TIER_POINTS` lives in
  `tier-points.ts` and is **imported by both** `mind.ts` and `scoring.ts` —
  threading it through as an argument broke an out-of-package caller at runtime.
  `topBandFor(stat, shift)` is the only way a threshold leaves the engine.
- **`profiles.has_sleep_source` is the single stored answer to "can this account
  earn Mind?"**, read by both quest paths (`pickQuests` takes `hasSleep`), absent
  from `profiles`' column-level UPDATE grant, and **flips both ways** — unlike
  sticky `has_wearable`. `sync-health` writes it for the **latest** date in the
  payload; `smoke-sync.mjs` asserts it.
- **`stat_records()` is derived on every read and takes no argument.** Best day
  per stat in raw units. Body's record is active calories **without** the
  strength credit, which is also what keeps the function clear of
  `workout_sessions`; Mind reads `was_user_entered is not true`; a stat with no
  qualifying day returns **no row**, never a zero. A flagged day is skipped
  (see the anti-cheat rules above).
- **The surfaces use one sentence form — observation, em dash, consequence** —
  in `spreadLine`, `statDetailLine`, `ceilingLine` and `restedLine`. `spreadLine`
  and `restedLine` report the **discount**, never the moved figure, and
  `spreadLine` may say neither "ridge" nor a target, because both name flat
  figures already on screen. `statDetailLine` never prints `StatDetail.points`.
  The crest changes **the sky, never the bird**, and is always paired with
  `ceilingLine`. Engine-key guards are case-sensitive and word-bounded
  (`/\b(AGI|STR|MND)\b/`) — a loose `/agi/i` matches "Dagit". `/progress` is the
  only screen that explains the model, so a stale entry there is worse than
  none. **"Ability rating" is "mastery" everywhere**, comments included.
  `stat-detail.ts`'s deleted `unquantified` state must not come back: Body's
  shift is measurable now, and those 137 lines existed for one that was not.
- **A scoring change that moves stored history redeploys all five Edge
  Functions and runs `replay-scores` in the same deploy**, under ADR-0001's
  2026-09-06 amendment (`REPLAY_SECRET` minted for the pass and unset after).
  Past roughly fifty accounts or sixty days the original rule returns: a
  migration that rescores, or it does not ship. **A replay skipped at the time
  is a silent divergence the next replay pays for in one lump** — #68's pass
  moved ten days and only three were its own.

**Solo mode gained a floor and a curve on 2026-08-15** (deviations #31–#33).
Three things that are easy to break by accident:

- **`DAILY_STEP_BASELINE` is derived from `THRESHOLDS.AGI.gold`, never written
  as a literal** — and `scoring.test.ts` *also* pins it at 10,000. Both halves
  matter and they guard opposite failures. The derivation stops a raised Gold
  leaving a second number describing the old one; it is what lets the walk
  streak read a tier out of `daily_scores`, which stores tiers and never raw
  steps — **`tiers->>'AGI_base'`, not `tiers->>'AGI'`**, since the three-stat
  switch, for the reason in the block above. The literal in the test stops the
  derivation being *too*
  obedient: the Daily Walk baseline is a public-health number that must never
  scale with the user, so a raised Gold silently dragging it upward would be
  exactly as wrong as it going stale. Raise Gold and the test fails, and a human
  decides.
- **A Challenge is derived, never stored.** `resolveChallenge()` is a pure
  function of qualifying sessions **strictly before** the day being judged, and
  "strictly before" is load-bearing twice: the session being judged cannot move
  its own bar, and nothing stateful exists for a retroactive Apple revision to
  invalidate — the read-time projection property Event progress already has.
  Only the *completion* is stored, with the target snapshotted, because the
  trailing median can no longer answer "what did I clear in March". Do not add
  a stored level counter; clearing already makes the next one harder, because
  the median moved.
- **`workout_sessions` is owner-readable only and appears in no projection.** A
  pace carries fitness, and with distance it carries routine — at least as
  identifying as the hourly movement §5 protects. A schema test asserts no
  `public` function's body mentions the table; keep it that way. Apple's
  `HKWorkoutActivityType` **raw number** is stored untranslated, and which
  numbers mean something is decided in `challenge.ts`. `kairo-core` cannot
  import the HealthKit library and neither can a test (Flow syntax root Vitest
  cannot parse), so the guard is a **compile-time** assertion in
  `src/features/health/activity-types.ts` — proposing a runtime one is the
  obvious mistake. Related: `queryWorkoutSamples` takes **no unit parameter**,
  unlike every other read in `read.ts`, so `workout-units.ts` converts from the
  unit each `Quantity` reports and yields null for an unrecognised one, which
  becomes 0 and makes the session non-qualifying. Inert beats wrong — a 5-mile
  run stored as 5,000 metres would quietly corrupt every pace after it.

**The Battle is retired as of 2026-09-06** (deviation #66), and Goals became
Events before it (deviations #45/#48/#49, 2026-08-25). Both accounts — how a
Battle worked, what the rename moved, and why the remains are shaped as they
are — are `docs/archive/battle-and-goals.md`. What is still live:

- **The three tables stay and must not be dropped.** `recalculate_user_xp` sums
  `event_completions.xp_awarded`, so dropping them silently drops every
  account's banked Battle XP on the next write to any other XP source, and every
  level falls with nothing to notice. `packages/kairo-core/src/event.ts` stays
  whole and tested under `@deprecated` for the same reason, and `EVENT_KINDS` /
  `EVENT_METRICS` are the values the column CHECKs reference.
- **`closed_at is null` is not optional on any read** of `challenge_events`; the
  table still holds pre-pivot rows, which is why the `kind`, `metric`,
  `events_need_end` and `events_need_squad` checks are all written
  `check (closed_at is not null or …)`.
- **`event_progress()` survives and holds the whole old visibility rule**
  (participant OR member of the event's squad), while the three RLS policies
  recreated in `20260906130000_retire_the_battle.sql` are narrower —
  participation for `challenge_events`, owner-only for the children — so the
  mutual recursion `can_see_event()` existed to break cannot form. They
  deliberately disagree.
- **`event_completed` and `event_created` stay as historical values** in
  `NotificationTrigger` and `AppEventType` (`notification_log.kind` is free
  text, and a push sent before a deploy can be tapped after it). The `eventId`
  such a payload carries addresses nothing and must never be interpolated into a
  path again.
- **Testing a migration's effect on existing rows needs a staged harness** —
  `setupHarness({ stopBefore })` + `applyMigration()`, because the suite
  otherwise applies every file before the first test.
- **`recalculate_user_xp` is a full recompute written out whole.** Read the
  deployed body before editing: a source omitted is a source dropped, and every
  account's ratings fall on the next sync.

**The invite link is unchanged by the above.** The universal-links chain has
three sources and every failure is silent: `ios.associatedDomains` in
`app.config.ts`, the extensionless AASA file's `Content-Type`
(`web/vercel.json`), and the **Associated Domains capability on the App ID** in
Apple's portal. EAS CNG generates the native entitlement from config; never
hand-edit the ignored `ios/` project. Same failure class as `aps-environment`.
The domain is a one-way door — `INVITE_HOST` is one constant that both
`app.config.ts` and `invite-message.ts` read, and changing it breaks every link
already shared. Runbook: `web/README.md`.

**Guessing an invite code costs a daily budget, and `join_squad` returns null
now, as of 2026-09-08** (deviation #71, issue #34). `rate_limits (user_id,
action, window_date, attempts)` with no client grant, charged by
`consume_rate_limit(p_action, p_limit)` inside the RPC; `join_squad` and
`preview_squad` both spend the `invite_code` action, thirty a day. Nine things
break easily:

- **A raise and a counter cannot coexist in one transaction, and that is why
  the contract changed.** `join_squad` raised `22023` for an unknown code; an
  exception aborts the transaction, so the increment recording the guess is
  rolled back with it, the counter only ever advances on the calls that
  *succeeded*, and the limit never trips — silently, with every test about
  refusing a bad code still green. The miss path returns **null**, and
  `useJoinSquad` turns that into the sentence 22023 used to produce. Do not
  "restore" the raise.
- **Over-budget returns the same null**, so the two answers are identical by
  construction rather than by two branches that agree today: one return
  statement, no code, no message. `NO_SUCH_SQUAD` in `mutations.ts` is one
  constant for the same reason. Nothing may ever say "too many attempts" —
  `CONTEXT.md` carries that as a vocabulary rule.
- **`preview_squad` shares the budget**, which is one step past the ticket's
  "inside the join RPC" and the difference between a control and theatre: it
  answers the same question for any authenticated caller *and* hands back the
  squad's name, so limiting only the join leaves the enumeration door open and
  closes the one you walk through afterwards holding the answer. One action key,
  because a budget per door is a budget an attacker picks the larger of.
- **It is `volatile` now and that is load-bearing.** PostgREST runs a STABLE
  function in a read-only transaction on the GET path, where the charge fails
  outright.
- **The window is the UTC date, alone in this codebase.** Everything else is
  keyed by the player's own local day (§2); `profiles.timezone` is in the
  client's column-level UPDATE grant, so a local-day window would be a reset
  button. A rate limit is the one place the account's own claim about when its
  day ends cannot be the authority.
- **Charged before the lookup, and the over-budget attempt is charged too.**
  Charging afterwards lets an exhausted account still join on the guess that
  finally lands, which is the outcome the budget exists to prevent. A legitimate
  join spends two of thirty — one preview, one join — which is the best case
  rather than the bound: a mistyped code previews too, and `useSquadPreview`'s
  `retry: 2` can charge three for one attempt. Thirty rather than a number
  closer to two because the failures are not symmetrical — thirty guesses a day
  against 2.18e9 is the same nothing ten is, while a false refusal tells an
  honest person their correct code is wrong in the sentence built to give them
  no way to find out otherwise.
  The `20` is a commented literal for `users_needing_digest()`'s seven-day
  reason: SQL cannot import from the keystone, and no client may know the
  number, since a client counting down to a published bar would undo the whole
  indistinguishability property.
- **Built for a second caller.** `send_whack` takes the same shape in Phase 3
  (deviation #70), so the next one adds a string rather than a mechanism. It
  resolves the account from `auth.uid()` rather than taking a `p_user_id`, for
  `delete_account()`'s reason — an identity argument is one accidental grant
  from letting a caller spend, or clear, somebody else's budget.
- **What it does not buy, and say so rather than implying otherwise.** The
  counter is per account and accounts are cheap — anonymous sign-in is enabled
  on the project, and `preview_squad` needs only a session where `join_squad`
  also needs a profile. Enumeration now costs one account per thirty tries
  instead of nothing, and the free unlimited existence oracle is gone; that is
  the whole claim. A floor on the identity itself (App Attest) is still owed.
  There is also **no pruning path**: one row per account, action and UTC day,
  forever, reached only by `delete_account()`'s cascade. It is small, and a
  sweep belongs with the next job that needs one rather than with this.
- **The OTA ships before the migration, and the order is not symmetric.** An old
  client against the new schema reads `data: null` with no error, hands it to
  `onSuccess` and dereferences `squad.program` — a crash on an ordinary mistyped
  code. A new client against the old schema is fine, because the old one still
  raises 22023 and the mapping is still there. **No Edge Function bundles either
  RPC**, so nothing redeploys; `seed-health` inserts membership directly and
  names `join_squad` only in a comment.

**A new account does not see the whole app, as of 2026-08-17** (deviations
#37–#39). `disclosureStage()` in `@kairo/core` returns `core` below
`DISCLOSURE_THRESHOLD_DAYS` and `full` at or above it; `TrainEntry`, `StatRail`
and the Strain/Sleep rows are hidden in `core`. **The Battle was deliberately
not gated**, and the rule outlived it (deviation #66 retired the mechanic on
2026-09-06): a squad's shared surface must not be gated on one member's
scored-day count, or a new member is hidden from what the rest are already
looking at. Nothing is deleted —
every gated surface stays built and reachable, which is what makes this cheap to
reverse. Four things break easily:

- **The threshold is pinned by a test and gates on *lifetime* scored days**,
  never a recent window — a recent-activity gate would demote someone returning
  from a quiet week back into the reduced app, and that user is exactly who the
  retention measurement is about. `useScoredDayCount` filters `total > 0` for a
  related reason: `sync-health` writes a `daily_scores` row per date in the
  payload whether or not it scored and `resolveSyncWindow` always sends today
  *and* yesterday, so a bare row count reads 2 on install and would open the
  gate on day 1 for someone who has done nothing.
- **Hiding an entry point is not closing a door.** `/train` checks the stage
  itself, because push routing and deep links reach it regardless of the home
  screen. **It gates on `resolved && stage === 'core'`, not on the stage
  alone** — the stage reads `core` while the count is in flight, which is
  correct for hiding a card and wrong for a redirect: a Challenge push that
  cold-launches into `/train` has no cached count, and bouncing a `full` user
  home on that frame reads exactly like the feature being removed. Hide on
  `stage`, navigate on `resolved && stage`.
- **Onboarding is the six-beat flow** (deviation #58 — see its block below for
  the ordered list), and the profile row still commits exactly once, on the
  final `/name` screen. Add steps *before* the name,
  never after — that is still deviation #22's deleted flag. `/connect` reads
  HealthKit **locally** via `readStepsToday` against the *device* zone, because
  no profile row and therefore no `profiles.timezone` exists yet; that is the
  whole reason the reveal can work that early.
- **`syncStatus`'s `'no-data'` never shadows `'failed'`** (the 9–11 Aug outage
  class) or `'stale'`, and it waits `QUIET_GRACE_MS` from `SyncState.firstSyncedAt`
  — stamped once, never overwritten. Without the window it accuses someone who
  connected at 8am with 200 steps, which is the same false accusation the state
  exists to remove. HealthKit does not report read-permission denial, so the app
  can only ever say nothing has arrived, never that the user declined. Two
  things keep it honest and both were found in review: `useHealthSync` **must
  invalidate `scoredDayCountKey`** (nothing else refetches it, and a stale count
  lets the accusation through the back door), and `everReceivedData` is **not**
  the scored-day count alone — Bronze AGI is 1,000 steps, so a 400-step day is
  real data that scored nothing, and today's buckets are OR'd in.
- **The permission sheet is bounded, scrolls, and wraps its content in a View
  with an explicit point width.** All three are load-bearing and were found the
  hard way on 2026-08-17. `Panel` sets `overflow: 'hidden'`, so an oversized
  sheet never visibly spilled — it was silently clipped *inside* the card, and
  at XXXL the Health ask lost its "Not now", the one control that lets someone
  decline. Three separate faults: no height bound (fixed with `maxHeight` plus
  a `ScrollView` that is `flexGrow: 0, flexShrink: 1`, so the card still hugs
  short content instead of always taking the cap); no width bound on **direct
  `Text` children of a scroll container**, which laid out wider than the card
  and clipped mid-word — a `View` with a computed point width fixes it and
  `width: '100%'` does not, because the percentage resolves against a
  ScrollView whose own size depends on measuring that content; and a two-column
  row that cannot fit past ~1.3x, which now stacks.
  **Two testing notes.** This class of bug is invisible at every normal text
  size — `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
  is how it was found. And **relaunch the app after changing content size**:
  RN caches text measurements, so a size change on a running app renders correct
  text inside stale boxes and looks exactly like a layout regression.
- **Connecting Apple Health is `connect-health.ts`, never inlined.** It is five
  steps — request, `configureHealthBackgroundDelivery`,
  `notifyHealthPermissionGranted`, read the state back, track — and `/connect`
  and `HealthAsk` both call it. It exists because the sequence was paraphrased
  into `/connect` and three steps vanished with no error and no log: the worst
  was background delivery, since after a grant `readHealthPermissionState()`
  returns `'asked'` and `nextPermissionAsk` never offers the sheet again, so
  nothing would ever have registered it for the whole new-user cohort.

**"Hunter" and "barkada" were retired on 2026-08-11** (roadmap deviation #26). The
character has no noun — it is "your character", and the centre tab is `Character`;
a squad is a **squad**. The spec says "Hunter" throughout (§6, §15, §20) and so do
the dated docs under `docs/superpowers/`; both are historical records, not intent.
Two things deliberately still say it and are *not* stale: `profiles.class`'s
`'hunter'` default (inert internal enum, no surface renders it) and the
`output/imagegen/hunter-*.png` render sources. **§20's "dark fantasy hunter
aesthetic" brief and the art-direction prompts in
`scripts/generate_swap_assets*.py` used to be listed here as a genuinely open
decision; deviation #40 settles it** — the direction is flat vector, bold
outlines, colourful, and the subject is an animal. Those prompts are now stale
like anything else. Anywhere else, it is stale — fix it.

**`src/ui/Text.tsx` is the only Text, as of 2026-08-14.** Import it from `@/ui`,
never from `react-native` — the two are otherwise identical, which is exactly
why the wrong one is easy to reach for. It exists because React Native scales
with Dynamic Type without an upper bound, so at the largest accessibility sizes
a 34pt display line became ~80pt and every fixed-height row tore apart. It
**caps, never refuses**: `allowFontScaling={false}` would make the layout safe
by making the app unreadable for the people the setting exists for, and it
appears nowhere in this codebase. Three scales, chosen by *what the type sits
inside* rather than by how important it is — `prose` (1.8) for copy in
containers that grow, `chrome` (1.4) for buttons and meta lines, `fixed` (1.2)
for type locked to drawn geometry. `prose` is the default so tightening is
deliberate, and it belongs in the component that owns the geometry.

**The character is an animal as of 2026-08-18** (roadmap deviation #40, which
supersedes #27). **Deviation #55 supersedes the *choosing* half of it on
2026-08-27** — every character is now the eagle and the picker is retired; the
registry, the column and the art are all unchanged. Four Philippine endemic
species — `'pilandok' | 'tamaraw' | 'carabao' | 'eagle'` — live in
`src/features/character/species.ts`, a
zero-import registry that is the single source for ids, names, hues,
affinities and blurbs. **`affinity` is flavour and nothing in `@kairo/core`
imports that file**: a species never touches scoring, and adding a mechanical
bonus later would rescore history, because `daily_scores` is replayed from
stored buckets. Four things break easily:

- **`profiles.species` is a new nullable column; `profiles.character_body` is
  dead**, never written and read by no surface — the same disposition as
  `profiles.sex`. Its TypeScript parser was deleted (a parser for a value no
  screen can produce documents nothing); the column comment and its schema test
  are what record the disposition.
- **`SpeciesPicker`, `/species`, `app/(onboard)/character.tsx` and the home
  screen's one-per-launch prompt are all gone** (deviation #55, 2026-08-27).
  The picker was mounted by two routes because `redirectTarget` cuts both ways
  — a `ready` user inside `(onboard)` is bounced to `/`, a `needs-profile` user
  outside it to `/connect` — and that is worth remembering the next time a
  screen has to serve both cohorts, not for this one.
- **The profile row commits exactly once, on the `/name` screen** — still
  load-bearing however many screens precede it (six since deviation #58; see its
  block below). Deviation #22 deleted the `finishingOnboarding` flag when
  onboarding briefly collapsed to one step; asking anything *after* the INSERT
  flips `resolveRoute` to `'ready'` under the unfinished screen and needs that
  flag back. Add onboarding steps *before* the name, never after.
- **The picker's layout lessons outlived it and now live on `/name`**: it
  scrolls, and its text sits in a `View` with a real width. Both are the
  permission sheet's 2026-08-17 lessons, and on a screen carrying a 28pt input
  they are not optional.

**The Digest is reachable and bounded as of 2026-09-02** (deviations #61 for
the ask, #65 for the suppression — split across two roadmap rows because a
second, independent pass landed the same ask-widening under #61 before this
row's own #60 could be reconciled; the table is corrected in place). Two
halves that correct each other and must never ship apart. `shouldAskForNotifications`
gains the account's **first scored day** as a third reason beside a squad and a
live Battle (that second reason went with deviation #66 on 2026-09-06) — the
social reason is unchanged, `nextPermissionAsk`'s
ordering is unchanged, and Health still goes first. `users_needing_digest()`
gains an activity predicate: **no scored day in seven local days** and the
account gets nothing, silently, until its next scored day. Five things break
easily:

- **Opening the ask without the suppression is worse than shipping neither.**
  It gives a lapsed solo player thirty pushes a month they would never
  previously have received; deviation #52's whole argument was that volume is
  not urgency. Applying the suppression without the ask changes nothing for
  the population it was written for, because they hold no token. The two
  shipped in the same pass for exactly that reason, even though the numbering
  collision above left them recorded as two roadmap rows rather than one.
- **An account that has never scored is suppressed, and that is not a bug that
  eats a first Digest.** The ask fires on the first scored day, so such an
  account holds no push token; the two rules meet at the same boundary from
  opposite sides. The reasoning is in the function body because the next reader
  will otherwise "fix" it with a young-account exemption, and a redundant second
  rule is how two rules later disagree.
- **The window is `> today - 7`, not `>=`.** Six days ago qualifies; seven and
  eight do not. The schema suite pins both sides, because an off-by-one here
  silences an active cohort. `total > 0` is the same reading of "scored" every
  other surface uses — `sync-health` writes a row per date in the payload
  whether or not it scored.
- **The 7 is a commented literal and stays one.** SQL cannot import from the
  keystone and a mirrored TypeScript constant would have no reader: no client
  asks whether it is suppressed. Deliberately unlike `DAILY_STEP_BASELINE`,
  which is derived precisely because two places read it. Suppression is not
  recorded either — `notification_log` says who was *sent*, and the suppressed
  population is derivable from scores, which is `kairo_retention()`'s job.
- **A lapse is not a quiet week and `CONTEXT.md` now defines the two against
  each other.** A player scoring little still scores, so they pass the
  predicate every day. Lapse stops the Digest and nothing else: no demotion, no
  lost Mastery, no altered gate, nothing stored, and the player is never told.
  **No Edge Function redeploys** — the function is replaced in place and its
  signature does not move.
- **The ask sheet's copy describes the Digest and is guarded.** It promised the
  11 PM and midnight pushes deviation #52 retired, and survived a week only
  because the ask never reached a solo player. It names no rank (the solo digest
  branch declines to, and a solo player is now the typical reader) and claims no
  hard daily cap — `MAX_NOTIFICATIONS_PER_DAY` bounds the *budgeted* triggers
  and `event_completed` was `BUDGET_EXEMPT`, so "three a day at most" was never
  guaranteed. `ask-copy.test.ts` reads the `.tsx` off disk, which is the only
  way to test it: root Vitest cannot parse React Native's Flow syntax.
- **Two ordering constraints, and both windows are silent.** The migration is
  applied **before** the client ships, or solo players hold tokens against an
  unsuppressed Digest. The landing page is deployed **before** the OTA that
  drops the invite message's privacy clause, or the claim briefly exists on no
  surface a non-user can reach — the very failure this pass corrects,
  reintroduced by sequencing.

**One test owns the privacy claim, across a declared list of surfaces, as of
2026-09-07** (issues #19 and #27). `src/features/privacy/claim-surfaces.test.ts`
is that test and there is no second one; `src/features/privacy/claim-copy.ts` is
where every in-app sentence making the claim lives, zero-runtime-import so root
Vitest can hold it — the `ask-copy.ts` split, for the same reason. The list is
`web/privacy.html`, `web/index.html`, `HealthPermissionSheet.tsx` (the sheet's
derived type list *and* its fine print), `app/(onboard)/privacy.tsx`,
`app/(onboard)/connect.tsx`, and the invite message, which is registered as a
surface that makes **no** claim and points at one that does. Each declares the rules it makes — the contact address, the four
totals, reciprocity, what a squadmate never sees, the pooled-Battle and deletion
clauses — and the **bans apply to all of them**, because a retired promise is
wrong wherever it appears: engine keys, retired stats, tier names, the retired
promises themselves, `[[TODO`. Seven things break easily:

- **There were six surfaces, not five, and the sweep is what found the sixth.**
  `HealthPermissionSheet.tsx` had been making the claim in its own words the
  whole time — in the component that renders the disclosure, guarded by
  nothing. Its wording was already true, which is the luck this arrangement
  removes the need for. It moved to `claim-copy.ts` unchanged. Nothing but a
  sweep finds a surface nobody remembered, which is why `CLAIM_MARKERS`
  includes "daily totals": a marker list written only from the sentences
  somebody already knew about finds only those.
- **The screens are asserted to *render* the sentence, not just to have one.**
  `claim()` reads the module, so without `rendersFrom` deleting the `<Text>`
  from `/connect` leaves every rule passing on copy nobody can see. The web
  surfaces are read off disk and have the link by construction; the three
  screens state it.
- **`NO_TRAIL_CLAUSE` is one string used by both beats**, not two strings a
  regex holds close together. `/connect` and `/privacy` are two beats apart and
  worded the same claim themselves for months, one of them falsely; a rule
  loose enough to accept both honest wordings is loose enough to let them drift
  again inside it.
- **A denial is required in the sentence that names what it denies.** Two
  unanchored matches let a page say "we collect your heart rate" and, four
  paragraphs later, "your route is never shared" — and pass a rule named "says
  heart rate is not shared". `sentencesWith` is the fix, and the shape was
  already named in this file for the disclosure sheet before it was fixed for
  the pages.
- **`namesNoRetiredStat` is declared per surface and is not a universal ban.**
  "Active minutes" is what `/connect` wrongly listed among what Kairo scores —
  and also the name of a HealthKit type the permission sheet legitimately
  discloses reading. The rule belongs to the surfaces whose sentence is about
  what is *scored or shared*; banning the label everywhere would fail honest
  copy, and a guard that fails on real input gets loosened until it guards
  nothing.
- **This replaced three scans and they were removed, not left alongside.** One
  was named after the invite message, one after the support links, one after the
  HealthKit disclosure — so a fourth surface making the claim had nowhere
  obvious to be registered, which is exactly how the claim went stale in four
  places at once. Two scans of one rule always drift, and one always ends up
  quietly narrower. Do not start a second one beside this; that is the whole
  defect.
- **Bans read the claim *and* the wider document, never one instead of the
  other**, and each covers the other's blind spot. Reading only the claim misses
  a retired sentence that merely moved into a caption one element over; reading
  only the document misses the claim itself, now that the copy lives in
  `claim-copy.ts` and the screen only imports it. Restoring "never the raw
  numbers" to `/connect` passed this file once, on the document-only reading,
  before being caught.
- **A registered surface is not exempt from the hand-written-claim sweep.**
  Being on the list means the claim is guarded, not that the screen may write
  one — `/privacy` and `/connect` are both registered and both read the module.
  `claim-copy.ts` is the only file under `app/` or `src/` allowed the words, and
  a screen writing "hour-by-hour" itself fails. That exemption was briefly
  wrong and let a screen hand-write the claim.
- **The list is held whole by three sweeps**, because "removing a surface" must
  fail rather than quietly narrow the guard: every `web/*.html` page is
  registered, every sentence exported from `claim-copy.ts` is registered, and
  every line of `HEALTH_DISCLOSURE` is covered by the sheet's entry.
- **`/connect`'s help line was the stale one, corrected on 2026-09-07** (issue
  #27). It promised the squad sees your progress "never the raw numbers" —
  false since deviation #47's per-row consent gate — and named "active
  minutes", not a stat since deviation #41, on the screen a 5.1.3 reviewer
  reads and two beats before the privacy beat wording the same claim correctly.
  It carries the beat's claim now: **daily totals only, never your route, never
  an hour-by-hour trail, and only where you have both agreed.**
- **The `/connect` line does not enumerate the read list, deliberately.** Eight
  identifiers do not belong in a sentence and Apple's own sheet is the
  authority; naming four of them as though they were all of them understates the
  ask on the one screen where understating it is a trust problem. So it names
  what is read in the general, and the four totals as *what a flockmate sees*.
- **A shorter true sentence is never the fix.** The compression is the cause —
  it is what made the invite message's "Steps, never Health data" both
  self-contradictory (steps *are* Health data) and subject-less — and the next
  compression fails the same way. Say the whole claim and let the scan hold it.
  What no test reaches: `NSHealthShareUsageDescription`, App Store Connect's
  fields, and TestFlight's test information all carry the claim outside the
  repo. Three more things:

- **The landing page shows the recipient their own code**, revealed by an
  inline script that validates six characters *before* filling the box. Hidden
  in the markup, so a bare address, a mangled one, a crawler and a browser with
  scripting off all render the page unchanged rather than an empty box. It had
  promised the code would be waiting in the app; it never was, and that was the
  only path in the product where somebody who wanted to join could silently
  fail to.
- **The page's six-character check is a necessary second copy** of
  `isValidInviteCode`, since standalone HTML cannot import it. The guard catches
  deletion, not divergence. No build step and no external request — both are
  properties of that page worth keeping for one rule.
- **The Sky says something true when a player is alone on it.** `sky-empty.ts`
  is a pure module tested in Node (the screen is a component file the runner
  cannot load) and owns both halves of what was one condition on the screen:
  whether a race exists — which also gates `race_seen` — and what to say when
  it does not. The corridor still draws, because the ridge is a real opponent;
  the observation comes first and the offer second; it **names no rank and
  invents no rival**, and ghost racing counts as a race so it never fires for a
  player with scored history. The offer shares the squad's own invite through
  `shareInvite`, so the message and the code cannot fork, and sends a squadless
  account to the Flock tab instead of offering an invite it has no code for.

**Two documents hold the decisions. Read them before proposing changes.** (`docs/engineering/` holds the extracted reasoning behind three of the blocks above; `docs/archive/` holds retired eras.)

- `docs/Kairo_Master_Summary.md` — the product spec (v1.4). Sections are cited throughout the code as `§5`, `§12`, etc. Comments referencing a `§` are pointing here. §5's and §6's stat tables are superseded by deviation #41 and marked as such in place; the section numbering does not move.
- `docs/roadmap.md` — build sequencing, phase status, and an **approved-deviations table**. Deviations from the spec are deliberate and recorded; propose changes against that table rather than "fixing" them.

`docs/user-journey.md` walks the end-to-end user flow (onboarding → daily loop → character → squad) grounded in what's actually built, not just spec'd. Update it whenever a flow changes.

**`docs/mvp-scope.md` is the IN/OUT contract.** Cite it in any QA brief, test plan or store-facing copy. It exists because the August 2026 QA pass graded Kairo against a v1.3-era brief and scored four sections 1/10 for features that were deliberately removed (sabotage) or deliberately deferred (gear, referrals, monetization) — burying the findings that mattered under findings about a product that no longer exists. If a brief describes something not listed there, the brief is stale.

`docs/qa/kairo-end-to-end-qa-report.md` is that pass, plus an addendum tracing its central finding to a stale Edge Function deployment. **Two of its claims do not survive checking** and are corrected in place: the body-metric "defaults" are placeholders on empty inputs (nothing invented can be saved), and the finalization scheduler was healthy throughout. Its dispositions are tabulated in `docs/roadmap.md` under "End-to-end QA findings".

## Tooling conventions

- **Use context7 for library/SDK docs.** Before writing or debugging code against a versioned dependency (Expo SDK, Supabase client, React Navigation, HealthKit wrappers, etc.), pull current docs via context7 rather than relying on training-data recall — APIs move and training data goes stale.
- **Use graphify to navigate the codebase.** Prefer it over ad-hoc grep/find for architecture questions, call graphs, and cross-file relationships (`graphify-out/` holds the indexed graph) — it's faster and keeps answers grounded in the real dependency structure.
- **Route UI/UX changes through the frontend-design skill.** Any new or modified screen/component under `app/` or `src/` gets a design pass through that skill before implementation, so it lands as intentional design rather than generic RN defaults — Kairo's character-first visual identity (§6) is easy to flatten otherwise.
- **Documentation updates are part of the change, not a follow-up.** A change to product behavior, architecture, or setup steps updates `README.md`, this file, and `docs/user-journey.md` (or whichever `docs/` file governs it) in the same pass.
- **A Notion mirror of this documentation exists** (design: `docs/superpowers/specs/2026-08-15-notion-documentation-design.md`), summarized and chunked, with mermaid diagrams and Tasks/Backlog + Decisions Log databases. It updates **on request, not automatically** — when asked to "update Notion" (or when a finished feature is doc-worthy and the user agrees), sync the relevant Notion pages and append a dated entry to the Changelog page. The repo docs stay authoritative; Notion links back to them rather than mirroring verbatim.

## Agent skills

### Issue tracker

GitHub Issues on `ArsherJ/kairo-social-health-accountability-app`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + root `docs/adr/`. See `docs/agents/domain.md`.

## Commands

```bash
npm test                 # everything: kairo-core (node) + schema/planner suites
npm run test:core        # packages/kairo-core only
npm run test:schema      # schema (PGlite) + Edge Function planners
npm run typecheck        # tsc + workspace tsc + deno check, all three

# single file / single test
npm run test:core -- --run src/streak.test.ts
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts
npx vitest run --config vitest.config.ts -t "Streak Shield"

# app
npm run ios              # build + run on simulator (needs Xcode + CocoaPods)
npm run prebuild         # regenerate ignored native projects from app.config.ts/plugins; never commit them

# shipping — OTA is free and unlimited; a build is one of 15 a month
npm run eas:update:production   # JS/assets to installed TestFlight builds.
                                #   Non-interactive shells need BOTH flags this
                                #   script does not carry — run the full command:
                                #   npx eas-cli update --channel production \
                                #     --environment production -m "..."
                                #   **Do not "fix" this by editing the script.**
                                #   `packageJson:scripts` is a fingerprint input,
                                #   so touching it moves runtimeVersion and
                                #   orphans every OTA from the installed build.
                                #   Verified 2026-08-29: that edit alone took the
                                #   fingerprint 324fba3e -> a8f47fe3.
npm run eas:build:ios:production # native changes only; spends quota. = eas build -p ios
                                 #   --profile ios-production --auto-submit (builds AND
                                 #   submits to App Store Connect / TestFlight in one shot)
npm run eas:build:ios:local     # same pipeline locally, no quota (needs fastlane)
npm run eas:fingerprint         # this tree's iOS runtime version

# which one? compare this tree's fingerprint to the last build's:
npm run eas:fingerprint                          # -> runtimeVersion of the working tree
npx eas-cli build:list --platform ios --limit 1  # -> "Fingerprint" of the last build
#   match    -> npm run eas:update:production  (free; applies on next app launch)
#   differ   -> npm run eas:build:ios:production  (native drift; an OTA update would
#               publish fine and silently never reach the device)

# build / submission status (read-only, no quota)
npx eas-cli build:list --platform ios --limit 5
npx eas-cli submit:list --platform ios --limit 3
# after Apple finishes processing (~5-10 min post-submit), first build needs the
# export-compliance prompt cleared once:
#   https://appstoreconnect.apple.com/apps/6800990955/testflight/ios

# backend
./supabase/scripts/remote-sql.sh "select ..."      # SQL against the live project
./supabase/scripts/remote-sql.sh -f file.sql
supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
```

## Environment constraints — read before debugging connection errors

This dev machine cannot reach Postgres directly. Three independent causes, none of which indicate a broken project:

- Outbound **port 5432 is blocked** on this network.
- Supabase's direct host resolves **IPv6-only** with no IPv4 route here.
- **Docker is unavailable.** Podman Desktop is installed but its VM does not mount the project directory (`workdir ... does not exist on container`).

So `supabase db push`, `psql`, and `supabase start` all fail. What works, all over HTTPS: `supabase/scripts/remote-sql.sh` (Management API, auth from the CLI's Keychain entry), `supabase functions deploy`, and the PGlite test harness.

**Applying a migration** therefore means: run it via `remote-sql.sh -f`, then insert its row into `supabase_migrations.schema_migrations` yourself, or the CLI will try to re-apply it later. Wrap multi-statement migrations in `begin; ... commit;`.

**The Supabase CLI cannot reach the Management API without being handed the
machine's own root certificates** (found 2026-09-08). Corporate Zscaler
intercepts TLS — `openssl s_client` against `api.supabase.com` returns a chain
issued by *Zscaler Intermediate Root CA* — and the CLI's Node HTTP client trusts
its bundled roots only, so **every** command fails with the same useless
`HttpClientError: Transport error`, `--debug` included. `curl` is unaffected
(macOS hands it the system keychain), which is why `remote-sql.sh` has always
worked while `supabase functions deploy` and `supabase secrets set` did not, and
why the failure reads like an outage rather than a trust problem. The fix is one
environment variable:

```bash
security find-certificate -a -p /Library/Keychains/System.keychain > /tmp/mac-roots.pem
NODE_EXTRA_CA_CERTS=/tmp/mac-roots.pem supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
```

Do **not** reach for `NODE_TLS_REJECT_UNAUTHORIZED=0`, which disables
verification for every host the process talks to rather than trusting one more
root. The same variable is what a `gh`, `npm` or `eas` failure of this shape
wants; `curl`-based scripts in `supabase/scripts/` need nothing.

**This machine also cannot pair an iPhone over USB, and the cause is not fixable from the phone.** It is corporate-managed — CrowdStrike Falcon runs as an Endpoint Security system extension (alongside Zscaler, Tanium and GlobalProtect), and its Device Control policy denies `usbmuxd` the iPhone's USB interface. The kernel signature is `IOUC AppleUSBHostInterfaceUserClient failed MACF in process pid …, usbmuxd`. Because no lockdown pairing record can be written, the phone re-prompts "Trust This Computer?" on *every* plug-in, `xcrun devicectl list devices` always says `No devices found`, and Developer Mode never appears in iOS Settings (it is gated on a completed pairing). **`npx expo run:ios --device` is therefore unavailable here** — physical-device builds go through **EAS Build → TestFlight**, which installs over the air and never touches USB. Four things were tested and are *not* the cause, so do not re-derive them: Developer Mode, a cached "Don't Trust", macOS accessory authorization, and the cable. Triage table in `README.md` under "Building onto a physical device".

**`ios/` and `android/` are generated and ignored as of 2026-08-23** (roadmap deviation #42). `app.config.ts` and the project-owned config plugins are the only native source of truth. EAS uses Continuous Native Generation for remote builds; `npm run prebuild` materialises the same inputs for local simulator/Xcode work, and `postprebuild` restores the machine-local `ios/.xcode.env.local`. Never commit or depend on a hand-edit under a generated native directory — it disappears on the next clean generation. EAS environment variables supply the JS-side `extra` and `EXPO_PUBLIC_*` values during the remote build.

**EAS guards both build inputs and generated native outcomes.** The `eas-build-pre-install` hook runs `scripts/guard-eas-build-platform.mjs`: it preserves Android's development-only boundary and rejects either missing public Supabase variable without printing its value. The iOS-only `eas-build-post-install` hook runs after dependency installation, CNG prebuild and CocoaPods, when `scripts/verify-ios-native-output.mjs` can assert the generated result: React Native is configured and actually built from source, the incompatible `React-Core-prebuilt` pod is absent, a generated target frameworks script embeds `ExpoModulesJSI.framework`, and the generated `Expo.plist` carries a working EAS Update configuration (enabled, `file:fingerprint`, zero launch wait, a real `u.expo.dev` endpoint). These lifecycle hooks replace the retired Xcode Cloud artifact guards. Do not move the outcome checks into pre-install, where `ios/` and `Pods/` do not exist yet.

**Kairo's warm-pastel plush presentation is current as of 2026-09-11.** The
palette and shared controls keep the semantic-role and contrast contracts below.
Today combines Motion progress and the resolved figure in one responsive hero;
Sky uses a finer trail without changing `flightFrame`, race progress or minimap
math; Flock compacts the perch and keeps board semantics; You uses one shared
portrait/header; all seven onboarding routes consume theme-aware shared views.
The safe preview mounts those views with local fixture state and no production
auth, health, profile, consent or telemetry effects. Detailed preview boundaries
and verification limits live in `docs/engineering/mobile-screen-preview.md`.

**Appearance architecture established 2026-09-10** (deviation #72). The
screen-layout descriptions in this block are historical where the 2026-09-11
warm-pastel presentation above replaces them; the scheme, token, inset and
geometry contracts remain current. The reasoning is in
`docs/engineering/surfaces.md` under the dated headings:

- **Two schemes, one set of roles.** `src/theme.ts` keeps every token name and
  adds `light`, `dark`, `themes`, `Theme` and `Scheme`. The static exports
  (`colors`, `ramp`, `glass`, `shadow`, `earnedColor`) **are the light
  palette** and stay: root Vitest reads them and `contrast.test.ts` holds both
  palettes to the same claims. Authored sign-in still reads the light roles;
  onboarding now consumes the local theme scope. A themed screen writes
  `const makeStyles = (t: Theme) => StyleSheet.create({...})` at module scope
  and reads `useStyles(makeStyles)`; a one-off colour reads `useTheme()`. The
  factory **must be a module-level constant** — the cache is keyed by its
  identity, so an inline factory rebuilds the sheet every render.
- **The ramp's ink-strength contract holds in both schemes, and that is what
  makes the migration correct by construction.** Under the dark scheme the low
  steps are dark tints and the high steps are light tints: `ramp.x[200]` is
  still a wash you set text on, `[500]` still a fill, `[700]`/`[800]` still
  inks. The middle of every ramp is the same hue at night — a fill is a fill.
- **Two tokens do not flip.** `colors.ink` is always dark and sits on a bright
  fill (the primary button, the streak pill, a cleared calendar day, the
  selected segment); `colors.onDeep` is always light and sits on a deep fill
  (teal, sage 600, night). **`colors.text` on a bright fill is the mistake**:
  it renders correctly in the light scheme and vanishes at night. Every
  bright-fill label in the app reads `ink` now, and the dark block of
  `contrast.test.ts` asserts `ink` on every bright fill and `onDeep` on every
  deep one.
- **`userInterfaceStyle` is `automatic`.** It was `dark`, which forced the trait
  collection and made `useColorScheme()` unable to report the phone's answer;
  `system` would have been a lie. It is a native field, so the fingerprint
  moves and this ships with a build. `useScheme()` reads the MMKV preference
  (`appearance-store.ts`, its own storage id, untouched by sign-out) through
  `resolveScheme()` (`appearance.ts`, zero-import, tested); a phone that
  reports nothing reads as light, never a silent flip to dark. The status bar
  follows the focused surface via `status-bar-tone.ts` in `app/_layout.tsx`.
- **Local theme scopes use the same tokens.** `ThemeScope` in `use-theme.ts`
  overrides rendering only, never the stored preference. The root scopes the
  authored auth routes to light; onboarding consumes the current scheme and
  `statusBarTone` follows each surface. The sample preview scopes its own light/dark toggle so
  `Screen`, cards, sheets and scenery all change together. Preview boundaries
  and verification are in `docs/engineering/mobile-screen-preview.md`.
- **Today is a dashboard and the Living Mirror's rules are what keep it
  honest.** `today-board.ts` composes every tile sentence and is the only place
  a tile's words come from — raw units only, no engine key, unknown is never
  zero, and the Motion tile reaches the ridge through `DailyWalkState` so no
  literal appears (`today-composition.test.ts` scans for one). `TodayTiles`
  and `QuestRows` draw; `todayQuests()` still resolves exactly three and
  `selectNextStep()` only marks one of them. The scene is `Diorama` at
  `SCENE_HEIGHT` (236), a card in the column rather than the page's header,
  and the location word is the Motion tile's eyebrow. `TodayCount` is gone.
- **The Sky minimap is a map, not a picture.** `SkyMinimap` is pinned to the
  right edge between the measured rail and the measured foot — both
  `onLayout`, for the Dynamic Type reason the rail always was — and sized by
  `minimapHeight()`. It draws `miniPath`, `miniRacers` and the ridge from the
  **same** `flightFrame` numbers the corridor is drawn with, so the two cannot
  disagree about where a bird is; the window's `translateY` is an
  interpolation of the scroller's native `Animated.Value`, and a touch or drag
  on the strip calls `offsetForMapY()` and `scrollTo`. **The corridor is
  painted by steps**: `SkyCorridor` takes `progress` (the reader's own
  `raceProgress`, capped at the line) and paints the flown segments in the
  accent. `flight-frame.test.ts`'s scan of `sky.tsx` is unchanged and still
  binds.
- **The bar is one wash.** `TabPill`'s four per-tab gradients went; the moving
  pill is `ramp.accent[200]` with `accentDeep` on it, so the bar says which
  tab and nothing else. `NAV_HEIGHT` is still 96; `BAR_HEIGHT` is 68.
- **`SegmentedControl` is the only filter control**, and its selected segment
  is a raised surface in the page's ink, never an accent fill: the board's
  Today/Yesterday toggle painted its active half orange, which made a filter
  look like the screen's primary action. `Tile` is the dashboard's unit — one
  accessibility element, two sizes and no third.
- **Flock and You have no bands.** The board's violet-into-pink field and the
  You tab's sky band are gone; both screens still `bleed` and take
  `insets.top` themselves (`bleed-inset.test.ts`). The leader's row carries a
  gold rule down its leading edge rather than a sage tint; the flock strip's
  marks sit on the page in the page's inks, and its withheld mark is still a
  ring. The You tab's ring sits beside its words rather than above them.

**Kairo is Playful as of 2026-08-30** (deviation #58), which supersedes Sunlit's
palette and type; Sunlit's stale values are in `docs/archive/design-history.md`.
Every token in `src/theme.ts` kept its name and changed its value, so around
ninety call sites re-skinned without being edited — **a token names a role,
never a hue** (`ramp.sage[500]` is a violet now and still means "your lane").
Fredoka and Nunito replace Caprasimo and Figtree, **copied into
`assets/fonts/` and loaded through `useFonts`, not added as npm dependencies**,
because `package.json` is a fingerprint input.

**`docs/engineering/surfaces.md` holds the reasoning for every screen rule
below** — the Playful redesign in full, the onboarding run and its calibration
and welcome beats, the Sky corridor, the growth-stage and plumage art passes,
and the three device-fault rounds that produced most of the layout rules.
**Read it before adding or reshaping a screen**; the rules themselves:

- **A bright fill takes ink, never cream.** `colors.accent` measures 2.65:1
  against cream, coral 2.93 and gold 1.52, and all three render perfectly —
  four call sites shipped that pairing in this redesign's own first pass.
  `contrast.test.ts` asserts the rule for every fill *including the failures*,
  so a palette that later made one dark enough for cream fails loudly.
  `coralEdge` carries neither ink nor cream and is pinned as such. Body-size
  accent text is `colors.accentDeep`; large display type is `colors.accentInk`.
  The ramps' step contract is ink strength — 200 a wash, 500 a fill, 700/800
  inks — and ~37 call sites depend on it.
- **No native module may be added for a visual effect.** `Glass` is not a blur
  and must not become one; the Sky corridor is twenty-four rotated plain-RN
  segments rather than `react-native-svg`; the crest tint is a generated mask
  rather than a runtime blend. Each would move the fingerprint, spend one of the
  month's fifteen builds and withhold every OTA until that build landed.
  `Gradient` gained a `direction`; `experimental_backgroundImage` is
  deliberately unused, because its failure mode is a transparent view.
- **One icon family.** The Feather/MDI split is retired; reintroducing a second
  family is a design decision, not a convenience. `STAT_COLORS` (in
  `src/ui/stat-colors.ts`, re-exported from `StatIcon.tsx`) reverses Sunlit's
  no-per-stat-hue rule, because a Flock row carries four stat figures at 11pt
  with no words beside them.
- **`src/theme.ts` is the only file that may name a typeface.** RN falls back to
  the system face silently for an unknown family — invisible on a simulator that
  has the old font. `type-faces.test.ts` scans for literals and checks every
  named face is loaded and on disk.
- **Onboarding is seven beats and the last one is still the name**: `/welcome →
  /one-sky → /mirror → /connect → /difficulty → /privacy → /name`. Add steps
  **before** the name, never after — anything asked after the INSERT flips
  `resolveRoute` to `'ready'` under an unfinished screen and needs deviation
  #22's deleted `finishingOnboarding` flag back. `/difficulty` and `/privacy`
  ask before the row exists and `useOnboardingAnswers` holds their answers until
  `/name` writes them, because `quest_tier_override` and `squad_data_consent_at`
  are in the UPDATE grant and not the INSERT grant. **The run is declared once,
  in `src/features/onboarding/beats.ts`** — a beat declares its phase and the
  registry derives the rail's fills, the paged dots and the button words;
  `beat-registry.test.ts` fails any screen that hand-writes one, its skip
  destination or its impression. The rail measures **four phases, not screens**.
  `onboardingSkipTarget()` derives the skip landing as the last beat of phase 0
  (the mirror), rather than naming a route twice.
- **The difficulty beat opens with a measurement, and the tier it proposes is a
  seed rather than a rule** (deviation #63). `/connect` reads fourteen complete
  local days through `readDailySteps`; `calibrateQuestTier()` in `quest.ts`
  medians them, drops zeroes, excludes today and needs four qualifying days,
  and `no-history` is a different sentence from a low proposal. `questTier()` is
  untouched and stays the fallback; the whole rule set is one pure function in
  `quest.ts` rather than a sibling module, and `QUEST_CATALOGUE` is imported
  rather than threaded through. `readDailySteps` must stay one daily-interval
  step collection — `readHealthWindow` would read heart rate to size a quest.
  Nothing about those days leaves the phone: no `profiles` write, no telemetry,
  and `calibration_completed` carries `{ outcome }` and not the tier proposed.
  `questTierChosen` is what makes the player's answer win outright.
- **The welcome run is four cards and the fourth is the flock ask** (deviation
  #64) — a card rather than a sheet, because a separately leased sheet would put
  two first-run surfaces on one first focus. Exactly one card carries an actions
  slot and a test asserts it. `welcome_seen` is claimed when the run **opens**,
  so an interrupted run loses the ask; that loss is bounded by the Sky tab's
  permanent invite slot and must not be repaired with a second marker. The join
  door is withheld from an account that already has a squad. Every word lives in
  `welcome-cards.ts`, reading `RACE_FINISH_LINE` and `FREE_SQUAD_MAX_MEMBERS`
  from the constants; the request crosses to the Flock tab as `?pane=join`
  through `flock-pane.ts`, which owns both the href and the parser, and the tab
  **consumes and clears** it. One answer per run, on a ref.
- **Each beat records one impression** — `onboarding_beat_seen` with `{ route }`,
  from `useBeatImpression`, unguarded on mount, and `userId` is deliberately not
  an effect dependency. The hatch (`/connect`'s "Did you know?" phase) reports
  nothing: it is a phase, not a route. Its window opens when `connectHealth`
  **resolves, not at tap**, and closes at the **later** of "minimum served" and
  "read finished" (`hatching-window.ts`); `trivia.ts` picks by a hash of the
  account and states no effect size.
- **Native modals lease `src/ui/modal-owner.ts`** — permission asks, welcome
  cards and Today details must never be visible under different owners in one
  frame. Claim in an effect, release in the same effect, never from a close
  callback.
- **The sheet lessons apply to every bounded surface**: a `maxHeight`, a
  `ScrollView` that is `flexGrow: 0, flexShrink: 1`, and content wrapped in a
  `View` with an explicit **point** width (`width: '100%'` resolves against a
  ScrollView measuring that content). `Panel` sets `overflow: 'hidden'`, so an
  oversized sheet is clipped **silently** and the child that goes is the decline
  control. `OnboardingCta` takes `lines?: 1 | 2` for the same reason. Find this
  class of bug with
  `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`,
  and **relaunch after changing content size** — RN caches text measurements.
- **`<Screen bleed>` hands the top inset back**, and forgetting it is invisible
  until somebody looks at a device: the You tab drew its only route to Settings
  inside the Dynamic Island's cutout. `src/ui/bleed-inset.test.ts` scans every
  bleeding surface, following one level of imports. A `<Modal>` gets no inset of
  its own, so `TodayDetailsSheet` takes the **bottom** inset for its only
  dismissal.
- **A rail or list draws one trailing slot, never one per free seat.** The Sky
  flock rail is four roster slots then one trailing slot (the invite or an
  overflow `+N`, never both and never none), with `flexWrap` deliberately absent
  so it fails by clipping rather than by wrapping; `LockedSlot` is **one** row
  carrying the count and no rank. Withheld members sort last on the rail, and
  keep board order in the strip.
- **The flight is inset below the flock rail**, and `flight-frame.ts` owns that
  arithmetic plus the opening offset. The rail's height is **measured**, not
  assumed; `flightFrame` is handed `chromeBottom` so every assertion holds for
  whatever the screen composes, and a source scan on `sky.tsx` closes the rest;
  the gradient spans the whole scroller, inset included; the inset moves the
  **drawing box**, not the path.
- **Counted figures go through `countWords` in `quest-copy.ts`** — HealthKit
  reports active energy as a float, and "395.66 active kcal" shipped in Today's
  one visible sentence. **`StatRail` declares `flexDirection: 'row'`**: a layout
  that depends on a default moves when its container does. **The invite code
  takes the `fixed` scale plus `numberOfLines={1}`, `adjustsFontSizeToFit` and a
  `minimumFontScale` floor** — correct only together, and guarded by a scan of
  the tag itself.
- **The dev client's floating gear is turned off at runtime**
  (`hideDevMenuFloatingButton()`, `__DEV__`-guarded), deliberately **not** via
  `ios.infoPlist.EXDevMenuShowFloatingActionButton`, which is a fingerprint
  input and costs a native build. It was never in TestFlight: `expo-dev-menu` is
  a debug-only pod.
- **The character is the plush eagle v3 pack, and there is no per-stage body**
  (deviation #73, 2026-09-11, superseding issues #30/#31). Eleven renders and
  eleven crest masks under `assets/character/{base,poses,states,crests}`, named
  **without a version suffix** — v1 is deleted, not shipped beside it, so there
  is nothing to disambiguate from. `KAIRO_STAGE_ASSETS`, `KAIRO_STAGE_CRESTS`,
  `STAGE_POSES` and the whole cosmetics system are gone with it, and the bundle
  fell from 7.7 MB to 1.2 MB. Literal `require`s are still mandatory — a computed
  path is a blank image on a device and nothing at build time — and
  `character-assets.test.ts` still fails a cell that is missing, computed or
  naming an absent file.
- **The growth stage now reads as *size*, never as anatomy.** `staticFigureSelection`
  has no `{ kind: 'stage' }` branch and `resolveLivingMirror` takes no stage at
  all; `CharacterFigure` keeps the prop because `figureResponse`'s `bodyScale`,
  the ground shadow and the presence ring all read it. Restoring per-stage bodies
  is re-adding one table and one branch. **Shipping mixed was refused**: a
  character that silently becomes a different species at level 21 reads as a bug,
  and pointing all four stage cells at one file is exactly what
  `character-assets.test.ts`'s `'two stages share a drawing'` assertion exists to
  reject. `firstLevelOfStage` still derives 1/6/11/21 from
  `evolutionStageForLevel`, and the stage names are still a development
  vocabulary no player surface speaks.
- **`dayPose()` resolves Motion against Body, and `summit` wins outright.**
  Ridge draws `summit` whatever else happened; below it, **a verified strength
  session takes the figure for the rest of the day** and draws `workout`;
  otherwise the Motion ladder answers. Two axes want one drawing, so the order is
  stated in one function and tested, rather than being an accident of branch
  placement. The trade is deliberate — a trained player at the treeline loses
  that day's `walk` — because Motion still reads in the tile, the meter and the
  location word, while Body reads nowhere but the figure and the ground shadow.
  It takes **minutes, not the occurrence id**: `living-reaction.ts` still reads
  `verifiedWorkoutOccurrence` to fire the one-shot celebration, and a count
  cannot re-fire anything. `resolveLivingMirror`'s `verifiedStrengthMinutes` is
  **required and never defaulted**, or "did not train" and "caller forgot" become
  the same silent answer.
- **`summit` is the seventh pose and the ridge draws it** (deviation #73).
  `motionPose()` returns `idle → walk → run → summit` across the five Motion
  bands, so the day's finish stops looking identical to 80% of the way there. It
  is **persistent, not a celebration**: `daily_walk` still fires its
  `race_victory` reaction on the crossing and still wins the priority cascade for
  `REACTION_HOLD_MS`, and the figure settles into `summit` afterwards. The name
  is deliberately not `ridge` — that word already means the step count, the
  Motion band and the race's finish line, and `CONTEXT.md` carries `summit` as
  silent development vocabulary. **No surface speaks it**, and `MOTION_LOCATIONS`
  is unchanged: the ladder still ends at the ridge and `locationName` still says
  "Ridge".
- **`scripts/generate_crest_masks.py` is the only character art generator left**,
  and it must be **re-run after any change to the art in its `SOURCES`**, which a
  test holds against `REQUIRED_PNG`. Its constants were not retuned for v3 — they
  reproduce the pack's checked-in masks byte-identically. `generate_stage_art.py`
  is deleted; there is no stage art to generate. **A render must be framed against
  the base** — same 570 × 636 canvas, same figure height, same ground line, same
  centre — and `character-assets.test.ts`'s "frames every render against the base"
  is what holds it, because `bodyScale` can only make a young bird small if the
  artwork never is.
- **Run's stance is a camera problem, not a prompt problem.** Deviation #73
  committed to fixing its "bouncy hop/skip" read and three `gpt-image-2` edits
  failed: one streamed the wings off both canvas edges, one read as a bird
  sitting with its legs out. Running is a side-on motion and every pose in this
  pack is front-facing — a front view can show a leg stagger and a few degrees of
  lean, not travel. The shipped pose buys its motion with asymmetry and a raised
  foot, which is what reads at 44 and 72 px. Fixing it means a three-quarter view
  for `run`, which is a decision about the whole pack's camera. Attempts and
  prompts are in `output/imagegen/plush-eagle-v3/pose-commission-01/`.
- **Two Mind faces are local edits, not generations.** `sleepy` and
  `well_rested` are deterministic Pillow edits of the idle render — Mind's whole
  premise is that the body does not move, only the face, and generating a whole
  bird to shift two eyes is how identity drifts. `normal` is a byte copy of idle
  under a second filename, because the registry guard reads paths and a shared
  path reads as a duplicated cell. `staticFigureSelection` never picks `normal`,
  and nothing draws the `sleep` pose at all — it exists so the registry stays
  whole.
- **The crest takes the dominant stat's hue and the body's scale follows the
  stage** (issue #33), which is how two eagles in a flock stop looking
  identical. `crestTint` reads **lifetime** points through `laneStat` — not
  `useDominantStat`'s fortnight, which `squad_leaderboard()` cannot project — so
  Today and a flock row cannot disagree; a balanced player takes no hue. The
  crest, never the bird: the figure already says four things by shape.
  `scripts/generate_crest_masks.py` finds the crest by **geometry** (topmost
  opaque row inside the central 44%) and must be **re-run after any change to
  the art in its `SOURCES`**, which a test holds against `REQUIRED_PNG`.
  `CREST_TINT_OPACITY` is 0.62 — full strength erases the outlines beneath. The
  crest is never spoken, and `plumage.test.ts` scans from the two label
  functions' own declarations. The thumbnail deliberately does not scale.
  **"Crest" names two things**: capital-C is the ceiling day's sky, lowercase is
  the bird's head feathers; the feature word is **plumage**.
- **The You tab's header band carries no bird of its own** — the ring is the
  bird on that screen — and one ground shadow, centred under it.
- **The Flock band names the day's leader** from `rows[0]`, ordered by the board
  rather than by the race, following `mode` ("won the day" vs "is ahead"), and
  guarded on two or more rows. **A squad of one reads the Sky's own sentence**:
  `resolveSquadStanding` answers `{ kind: 'alone' }` from the **squad's size,
  never the board's row count**, carries no rank and no denominator, and renders
  `SOLO_SKY_OBSERVATION` imported from the Sky. `LeaderboardRow` takes `ranked`,
  false on a board of one, which withholds the glyph *and* the spoken `Rank 1`;
  `RowLabelInput.rank` is `number | null` rather than a flag beside a number.
  The copy lives in `standing.ts` and `ordinal()` is one module.
- **The shield sentence names the streak minimum below it.**
  `shield_available_on === null` means only that nothing is recharging, so
  `shield-note.ts` holds both halves of the eligibility, derives the `5`, and
  names a pending recharge first at any streak length.
- **`Avatar`'s tint table lives in `avatar-tint.ts`** so `contrast.test.ts` can
  read its inks; it had shipped cream on `colors.accent` for as long as the
  component existed. `colors.text` is the ink; `ramp.accent[900]` is the
  tempting wrong answer at 4.39 and a test asserts that failure. Nothing mounts
  `Avatar` today.
- **Settings is its own screen** (`/settings`, behind the gear on You), and
  **"Dress your Kairo" is deliberately not built.** Its twelve PNGs were
  flattened full-character previews rather than composable layers, and deviation
  #73 deleted them along with `KAIRO_COSMETIC_ASSETS`, `data/cosmetics.json` and
  the manifest validation — keeping a validated contract for an unbuilt feature
  meant every pose change paid it a tax, which `summit` would have paid across
  twelve entries. Building it later starts from layers, which is where it always
  had to start.
- **Kairo says things without words, so a group that means something is one
  element with a composed label** and its decorative children are hidden. That
  grouping is **explicit** — the parent keeps `accessible` +
  `accessibilityLabel` **and** every direct child is hidden with
  `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`;
  neither half is redundant. Before adding a name, read what is already spoken
  beside it — a label that repeats an adjacent line is noise, and one inside a
  control that already names itself is a bug. Where composition has real edges
  it gets a tested pure module: `src/features/squad/row-label.ts` exists because
  a leaderboard row was twelve separate stops. The character HUD's layout stays
  **flow-based** — it was the app's only absolutely-positioned chrome and its
  pills overlapped at large Dynamic Type; do not reintroduce a `top` on any
  child. Structure is verified in Xcode's Accessibility Inspector on the
  simulator before a TestFlight build is cut — it answers "is this row one
  element or twelve" with no build and no VoiceOver gestures.

**This whole redesign shipped over the air, and that was verified rather than
assumed**: the tree's fingerprint was `324fba3e`, byte-identical to build 22's.
**Build 23, 2026-09-02, moved it to `9d76c5d3`** — one string in
`NSHealthShareUsageDescription` and nothing else — and every OTA since targets
that runtime, the plumage pass included.

**Kairo is Sunlit as of 2026-08-27** (deviations #53, #54). *Palette values and
the icon family are superseded by the Playful block above (#58) and the era
detail is in `docs/archive/design-history.md`; the token roles, the
`/today`→`/`, `/squad`→`/flock` routing, `NAV_HEIGHT` and the flat-bar tab shape
below are still live.* The tabs are **Today · Sky · Flock · You**, flat, and the
character tab is gone. Three things break easily:

- **The accent token has three roles and only one is text-safe.** `colors.accent`
  is fill-only — `src/ui/contrast.test.ts` asserts it *fails* as text, so the
  value can't drift back into a tempting range. Body-size accent text is
  **`colors.accentDeep`**; large display type (24pt+) is **`colors.accentInk`**.
  The prop is named `color` whether it is a fill or ink, which is why the split
  is a rule and not a lint. (Sunlit's amber values: archive file above.)
- **The ramps' step contract is ink strength, and ~37 call sites depend on it.**
  200 is a wash you set text on, 500 is a fill, 700 and 800 are inks.
  `ramp.accent[700]` in particular must stay at or above 4.5:1 on `colors.bg`,
  because `Label`'s accent eyebrow is 10pt and reads it. Change a step's
  strength and every site reading it goes wrong at once, silently.
- **`NAV_HEIGHT` stays 96 and there is no raised disc.** The discs became a flat
  bar; the bar's height did not move, so `TAB_PILL_CLEARANCE` and every screen's
  bottom padding are unchanged. The raised disc meant *anchor* and the anchor
  was the character tab — do not add one back for Today. Tab items are `flex: 1`
  with `numberOfLines={1}`: the labels are painted now, and at the `chrome`
  scale's 1.4× cap "FLOCK" reaches ~56pt, so a fixed item width is the
  two-column row that could not fit past 1.3× in a new place.
- **`/today` and `/squad` no longer resolve.** `notificationTarget()` maps
  `'today'` → `/` and `'squad'` → `/flock`. `dispatch-notifications` still sends
  `screen: 'today'` and was **not** redeployed — only the client's reading moved,
  which is why this needed no Edge Function change. A test asserts no retired
  route can be returned.

**There is one Kairo, and it is a Philippine eagle, as of 2026-08-27**
(deviations #55, #57). Four things break easily:

- **`profiles.species` is untouched and must stay so.** The eagle is resolved at
  the *render boundary* by `displaySpecies()`, which takes the stored value and
  ignores it. Nothing migrates, nothing is dropped, and `parseSpecies` still
  accepts all four — narrowing it would fail every stored row on read, which is
  the difference between a display decision and a destructive one. Reversing #55
  is deleting one line. Six call sites resolve through it and each lost its
  `Avatar` fallback, `CharacterFigure`'s View primitives with them; `Build` now
  holds only `shade` and `weight`, the pair the ground shadow reads.
- **Retiring the picker removed a screen** (it sat before `/name`). This
  *strengthens* deviation #22's rule rather than merely respecting it: the
  profile row still commits exactly once, on `/name`, whatever precedes it (the
  flow is six screens as of deviation #58 — see its block below). Add onboarding
  steps **before** the name, never after — anything after the INSERT flips
  `resolveRoute` to `'ready'` under an unfinished screen and needs the deleted
  `finishingOnboarding` flag back.
- **`kairo-voice.ts` owns what the bird says**, and it is zero-runtime-import so
  root Vitest can test it — it reaches `stat-names.ts` by relative path, exactly
  as `program-copy.ts` does, because the `@/ui` barrel does not resolve there.
  Three rules have tests behind them: no score total, no engine key, and a
  missing figure yields a *shorter* sentence rather than a fabricated one. The
  null night reads "No reading yet", which is the rule `finalize-days` grades
  by — a raw `daily_sleep.minutes` read would have the card congratulating
  somebody on a night the engine ignored.
- **The Today tab is the character screen and the old Today tab merged**, and
  the race on it is a *sentence*, not a card. The card is gone; the picture is
  the Sky tab, and `race_seen` fires there — the marker measures looking at the
  race, and this screen no longer shows one. **Deviation #59 removes even the
  sentence** — see the Living Mirror block below for what Today is now.
  `TodayPanel`, `character/standing.ts`, `character/stat-detail.ts` and
  `character/species-label.ts` are unmounted and still on disk with their tests.
- **The app says so out loud as of 2026-09-08** (issue #32), in exactly one
  place *it is printed*: `speciesLine()` in `species.ts` returns *"A Philippine
  eagle"* and the You tab renders it under the character's name. Said is not the
  same as shown — `LeaderboardRow` has passed `SPECIES_NAMES[displaySpecies()]`
  into `leaderboardRowLabel` since deviation #40, so a flock row has spoken the
  species all along, and it stays. The sweep below cannot see that path, because
  it is a registry lookup and a phrase scan only finds copy somebody typed.
  Four things break easily.
  **The words live in the registry and nowhere else** — `species-line.test.ts`
  sweeps every non-test file under `app/` and `src/`, comments stripped, and
  fails the phrase in any file but `species.ts`, so a second surface reads the
  function rather than writing the sentence again. **`noun` is a second string
  beside `name`, not a derivation**: a label takes a label's capitals
  ("Philippine Eagle") and a sentence takes the species-name rule ("Philippine
  eagle"), and no transform gets from one to the other for all four — so the
  test asserts instead that the two say the same words and differ only in case,
  which is `SPECIES_NAMES`' anti-drift rule where a derivation cannot reach.
  The article is written out for the same reason a derivation was refused: no
  noun here begins with a vowel, `SPECIES_IDS` mirrors a CHECK constraint, so a
  fifth species is a migration — and the test's exact four-line assertion is
  what fails in front of whoever writes the fifth sentence.
  **It is one line and must stay one**: not a species readout, not a fact card,
  not a second noun for the character, which still has none — the registry's
  `blurb` is endemic-fact copy that belonged to the retired picker.
  And **the App Store description is held to the same words** by an assertion
  over `docs/app-store-listing.md`, which is the repo's copy of a field typed
  into App Store Connect by hand, exactly like `NSHealthShareUsageDescription`
  and the privacy answers. That file makes **no privacy claim of its own** and
  points at the policy instead, deliberately: it is not registered with
  `claim-surfaces.test.ts`, because a guard over a doc would imply a guard over
  a field nothing in this repo can reach. **The figures in it are pinned to the
  constants** — the Daily Walk baseline and the free flock size — by the same
  test, which is the welcome cards' rule applied where Markdown cannot import;
  a description promising 10,000 steps after the baseline moved would be a
  false claim in the one place a stranger reads before installing.

**Today is the Living Mirror as of deviation #59** (2026-09-01). Its
always-visible order is the KAIRO scene, compact Level/personal Streak, Motion
location plus one step figure, one quest-backed next step, then **See today's
details**. The Sky owns the race; You owns Mastery and records. Do not put race
copy, Mastery coins, three quest rings, sleep/lane tiles, a Daily Walk card, or
a Challenge card back on Today. Nine things break easily:

- **The visible next step never changes the quest contract.** `todayQuests()`
  still resolves exactly three entries from account + local date + tier +
  `has_sleep_source`; `selectNextStep()` only ranks those entries. The server
  grades the same set and completion XP still latches. It is the **nearest
  incomplete quest across Motion and Body together** — deliberately not
  Motion-first with a fallback, which let a Body quest at 95% lose to a Motion
  quest at 80%. The Strength Challenge opt-in (`profiles.trains_strength`) is
  the sole override and wins outright; "attainable" means `!met` and nothing
  more, because a pace or time-of-day heuristic is the fabricated time estimate
  the design forbids. An incomplete sleep quest is an observation in details,
  never a daytime action.
- **The personal Streak and the Daily Walk run are different.** The HUD reads
  `streaks.current_streak`; Motion details reads `dailyWalkState().streak`.
  Never alias either value or label — `walkNote()` says "run" and a test pins
  it, because that sentence now lands on a screen whose header shows the other
  figure.
- **The Motion ladder is `branch → treeline → valley → climb → ridge`, and
  `ridge` is 100%.** "Ridge" already names `RACE_FINISH_LINE`, which *is*
  `DAILY_STEP_BASELINE` — the Sky tab draws `10k · ridge`, `trivia.ts` says
  "steps to the ridge", and `spreadLine` is forbidden the word for exactly this
  reason. Never move it to a lower band and never introduce "Cleared" or
  "Clearing" as a second name for the finish. It follows that `dailyWalkMet` and
  `location === 'ridge'` are the same fact: the arrival gets **one** reaction,
  owned by `daily_walk`, and `reactionCandidates` builds no location candidate
  for the top band.
- **The presence ring is `auraStrength()`'s, not Body's.** Peak rating across
  all three stats, with the All-Rounder's ring unconditional — the argument is
  in `aura.ts` and predates the Living Mirror. Body drives the ground shadow's
  weight and tint only. Deriving the ring from `str_total` deletes it for every
  Motion- or Mind-dominant player and every All-Rounder, and since Today is the
  only screen mounting `CharacterFigure`, that is the whole app. This is why
  Today still queries `dominance` and passes `lifetimePoints`.
- **Static Living Mirror art is priority, not composition.** Current PNGs are
  flattened full-character images. Render one of reaction pose → non-neutral
  Mind state → Motion pose → base. Body uses the ground shadow; do not distort
  the canonical figure or manufacture pose × state × Body exports. **This
  priority and `REACTION_HOLD_MS` are the only two things Rive replaces** — the
  character asset system design stays authoritative for V1, `kairo_v1.riv` is
  being authored, and the trigger vocabulary (`ReactionKind`) is kept separate
  from the animation vocabulary (`KairoReactionId`) precisely so the swap
  touches no trigger rule. Rive signals its own completion, so the fixed timer
  dies with the static art. `tired` is in `KAIRO_REACTIONS` with **no
  producer**, deliberately: sleepiness is a daily Mind state, not an event.
- **Only the presented reaction is consumed, and an opening is a focus or a
  foreground.** Marking every unseen candidate seen means a level-up
  permanently swallows the Daily Walk clear and a personal best on the same
  afternoon. Today is a persistent tab, so a mount-scoped guard is one
  evaluation per app launch; `useFocusEffect` plus `AppState` is what "opening
  Today" means to a person, and `REACTION_FLOOR_MS` (30s) is what stops
  tab-flicking dripping four celebrations in ninety seconds. `moments.ts` is a
  **fixed-size** store — five kind keys plus one observed level per account,
  each holding the last occurrence id — never an append-only ledger; occurrence
  ids are date-keyed so nothing needs pruning.
- **`living-reaction.ts` is the only producer of a `level:a->b` occurrence.**
  `reactionForLevelChange()` in `character-resolver.ts` emitted the identical
  string and is deleted; two producers of one occurrence id is how they drift.
- **Today now adds two owner-only reads deliberately:** today's verified
  strength-session evidence (`useTodayStrengthSummary`) and personal records.
  Neither reaches a projection or telemetry. The strength display predicate is
  contract-tested against the server allowlist (`WORKOUT_SOURCE_ALLOWLIST`), and
  `summarizeTodayStrength` tie-breaks on `hkUuid` because PostgREST guarantees no
  row order and a flipping `latestOccurrence` re-fires a celebrated reaction.
  Scoring remains server-authoritative. In exchange the leaderboard, recent-day
  and race-rank reads are gone from this screen.
- **Native modals lease `src/ui/modal-owner.ts`.** Permission asks, welcome
  cards and Today details must never be visible under different owners in the
  same frame — a `<Modal>` presents on the root view controller wherever it is
  mounted, and UIKit refuses the second silently and wedges the window. Each
  surface claims in an effect and releases in the same effect, never from a
  close callback, so a native dismissal and a button dismissal cannot diverge.

**The disclosure gate did not move, and its list on Today is now one item.**
Same `DISCLOSURE_THRESHOLD_DAYS`, same `total > 0` filter, same lifetime
reading, same `resolved && stage` navigation rule — deviation #37 is untouched.
What got shorter is the list of surfaces: the only gated thing on Today is the
**Challenge link inside the details sheet**, hidden on `stage` alone. `StatRail`
is on You with its own gate; the Strain/Sleep rows and the Challenge-entry card
are *deleted*, not ungated. `/train`'s own `resolved && stage` redirect is the
real door.

**The race is one shared sky as of 2026-08-27** (deviation #56, superseding
#46's six lanes). **Nothing about the scoring engine changed, and nothing about
the race's mechanics changed** — same payload, same client-side re-rank, same
derived finish line, same reciprocal consent gate. Five things break easily:

- **`RACE_FINISH_LINE` is `DAILY_STEP_BASELINE`, derived and never a literal.**
  `10_000` must not appear in `race.ts`, `sky-path.ts` or any `Sky*.tsx`.
  Crossing the line *is* clearing the Daily Walk: one number, two readings. The
  race stays clear of the `AGI`/`AGI_base` trap **only because it never reads a
  tier** — it takes raw steps from the widened projection. Anything that later
  decides "did they cross" from `daily_scores.tiers` must read
  `tiers->>'AGI_base'`, or the flag moves with the user's active hours.
- **`squad_leaderboard()` orders by the weighted total; the corridor re-ranks on
  the client.** Two orderings, one payload. Ranking once in SQL is the obvious
  improvement and it silently deletes the program feature (deviation #11).
- **`placeRacers` in `@kairo/core` owns the de-overlap, and ties are the common
  case.** `cappedSteps` stops at the line, so two active people are tied on the
  primary key *by construction* — invisible on six lanes, two birds on one pixel
  on a shared corridor. Offsets alternate around the line and the function is
  deterministic: the board refetches on realtime broadcasts, and anything
  non-deterministic makes the picture twitch, which is the same failure the
  `user_id` tie-break in `rankRacers` prevents.
- **`sky-path.ts` is arc-length parameterised, and that is not a nicety.** A
  naive per-segment `t` makes the second curve visibly faster than the first, so
  two racers a thousand steps apart look a different distance apart depending on
  where they are. It lives in the keystone because two renderings read it and
  because a component reaching React Native cannot be loaded by root Vitest.
- **The corridor is plain React Native and must stay so.** `react-native-svg`
  would draw it in one element; it is a native module, so it moves the
  fingerprint, costs one of the month's fifteen builds and withholds OTA until
  that build lands. Twenty-four rotated segments is the price of keeping this
  whole redesign shippable over the air.
- **`SoloBoard` has no race on it any more, and that is the same rule.** It drew
  a six-lane track against the player's own past days; the corridor races those
  same ghosts through `ghostRivals`, and the squadless Flock tab kept the one
  thing it was for — an invite affordance beside a real day. Two pictures of one
  race on two tabs is how they start disagreeing. The freshness line went with
  the picture, to the Sky screen, and still claims only *your own* sync time:
  squadmates' is not knowable from there, because the RPC projects totals and
  not sync times.

**Quests are derived, and `recalculate_user_xp` is a full recompute** — the
mechanics shipped with the four-tab Character · Today · Squad · You layout
(deviation #50, 2026-08-25 to 08-27; that layout and its `TabPill` raised-disc
geometry are in `docs/archive/design-history.md`). Four things break easily:

- **A quest is derived, never stored.** `pickQuests()` is a pure hash of
  `(userId, localDate, tier)` — no table, no midnight job, no cron, and nothing
  stateful for a retroactive Apple revision to invalidate, exactly as a
  Challenge. Only `quest_completions` is stored, because it pays XP and must
  fire once. **A `quest_id` is permanent**: it is opaque `text` so a new quest
  costs no migration, and renaming one orphans every completion banked against
  it. Retire a quest by deleting the row and leaving the id unused.
  `pickQuests`'s rotation is **bounded and followed by a linear sweep** — the
  stride only visits every slot while it is co-prime with the tier's pool size,
  and one hand-edited quest makes a seven-entry tier composite; an unbounded
  loop would spin on a render thread rather than fail.
- **The client and `finalize-days` must resolve the same quest tier.** Both
  call `questTier()` with the same lifetime scored-day count — `total > 0` on
  both sides — and the same `profiles.quest_tier_override`, and the override
  wins outright with the precedence inside that function rather than at either
  call site. A disagreement pays XP for a quest that was never on screen, and
  the completion latches. **Sleep is the same rule in miniature**:
  `finalize-days` reads through `scoringSleepMinutes` and the client through
  `scoredSleepMinutes`, so a hand-typed night — which scores no MND at all —
  reads "No reading yet" and clears nothing. A raw `daily_sleep.minutes` read
  on either side pays XP for a bar the card never showed met.
- **`recalculate_user_xp` is a full recompute written out whole** and now sums
  four sources. Read the deployed body before editing it — a migration that
  omits a source drops it silently and every affected account's level falls on
  the next write. **And number the migration after any sibling that rewrites
  the same function**: migrations apply in filename order, so an earlier
  timestamp has its whole change overwritten on every fresh apply while the
  deployed database stays correct, which no test in this repo would catch.
  Quest XP never touches `daily_scores.xp_awarded` (a rescore replays it) or
  the three stat rollups (a cleared quest is not activity in a stat).
- **Quests are built outside the disclosure gate**, and the gate's own surface
  list is in `useDisclosure`'s doc comment. The constant, the `total > 0`
  filter, the `resolved && stage` navigation rule and the retention measurement
  are unchanged — see "The disclosure gate did not move" above for the current
  Today-tab list.

**The reciprocal per-row squad-data consent gate** (deviation #47). It shipped
with the six-lane squad race (deviation #46, 2026-08-26 to 08-27), which the sky
corridor superseded (#56 above) — the lane layout and its flow-based mechanics
are in `docs/archive/design-history.md`. The `RACE_FINISH_LINE`,
`squad_leaderboard()` ordering and `cappedSteps` rules moved intact into the #56
block; what is #47's own, and still live:

- **The cap is the anti-cheat.** `cappedSteps` stops at the finish line, so past
  it extra steps buy nothing — restoring the resistance the tier ladder had and
  a raw-step race would have given away. (The tie-on-the-primary-key consequence
  and the `user_id` tie-break are in the #56 `placeRacers` bullet.)
- **The consent gate is reciprocal and per row**, refining the parent spec's
  whole-squad rule: whole-squad gating leaks the holdout's decision to the five
  people who agreed. `useSquadDataConsent` exposes **`isSuccess`** and callers
  must use it — a query in flight reads `false`, indistinguishable from a
  refusal (deviation #37's lesson again). Gate on `isSuccess && !consented`,
  and put the early return **below every hook**: above one it is a conditional
  hook and the count changes the frame consent lands. A row whose `steps` is
  null keeps its place with no position; dropping it looks like the member left,
  and drawing it at zero invents a bad day. **The privacy policy and the App
  Store privacy answers exist as of 2026-09-02** (`web/privacy.html`,
  `docs/app-store-privacy.md`); entering them in App Store Connect is what is
  left of the 5.1.3 blocker. **Consent has no in-app withdrawal** — nothing
  clears `squad_data_consent_at`, so the policy says "email us"; a Settings
  switch is JS-only and the obvious follow-up.

**JS ships over the air as of 2026-08-25** (roadmap deviation #43). EAS Update
is installed, so a change under `app/`, `src/` or `packages/kairo-core` reaches
installed builds with `npm run eas:update:production` and costs nothing; only a
**native** change spends one of the month's 15 EAS builds. Native means the app
icon, any native field in `app.config.ts`, entitlements, the plugins under
`plugins/`, a new or upgraded native module, an SDK bump — batch those into one
build rather than spending one each. Every failure mode here is silent: the
update publishes successfully and simply never arrives. Four things are pinned
by tests in `src/config/eas-config.test.ts`, and the generated-native half is
asserted on the EAS worker by `scripts/verify-ios-native-output.mjs` against
`ios/Kairo/Supporting/Expo.plist`.

- **`runtimeVersion` is `{ policy: 'fingerprint' }`, and `appVersion` is the
  trap, not the simpler alternative.** `appVersion` ties compatibility to the
  `version` string, so an update reaches every build sharing it — including one
  built before a native module existed, which takes the update and crashes on
  launch with no recovery except a build through review. `fingerprint` hashes
  the real native inputs, so a native change moves the runtime version by
  construction. Both fail when native drifts; this one fails by *withholding* an
  update rather than by bricking the app. It is compatible with
  `appVersionSource: "remote"` + `autoIncrement` only because fingerprint's
  default `balanced` preset skips `ExpoConfigVersions` — otherwise every build's
  fresh buildNumber would mean a fresh fingerprint and nothing would ever match.
- **The local and EAS fingerprints agree only because `/ios/` and `/android/`
  are Git-ignored.** `@expo/fingerprint` resolves the project workflow by asking
  whether the native project marker is Git-ignored: ignored is `managed`,
  tracked is `generic`, and the two hash differently. EAS builds via CNG with no
  `ios/` at all; a local `eas update` runs against a tree where `npm run
  prebuild` has materialised one, and still resolves `managed` purely because of
  deviation #42's ignore entries — verified, `workflow: managed` with `ios/`
  present. Commit the native directories and every update published from this
  machine silently targets a runtime version no build has.
- **Every `eas.json` build profile must declare a `channel`.** A build without
  one is subscribed to nothing: it installs, runs, and ignores every update ever
  published to it, indistinguishable from OTA being broken.
- **`updates.fallbackToCacheTimeout` stays 0.** Non-zero blocks the first frame
  on a network request, which is how this app shipped a permanent hold overlay
  once already (the 2026-08-14 black-holed host). `fetch-timeout.ts` guards
  Supabase; nothing guards this. The cost is that an update applies on the
  *next* launch — "open it twice" is normal, not a bug.

Diagnosis order when an update does not arrive is **never the network first**:
`npm run eas:fingerprint` prints this tree's runtime version, `eas update`
printed the one it published to, and a mismatch means the tree has native
changes the installed build does not — the policy working correctly, and the fix
is a build.

**`eas build --local` needs fastlane, and Homebrew's fastlane is broken out of
the box on this machine.** Ruby 4.0 removed several default gems the formula's
bundled gem set still assumes, so `fastlane` aborts with
`Gem::MissingSpecError: Could not find 'bigdecimal'` — then `digest-crc`, `nkf`
and `rbs` in turn. The fix is to install each into the user gem path already on
fastlane's `GEM_PATH`:
`GEM_HOME=~/.local/share/fastlane/4.0.0 gem install <name>`. Done as of
2026-08-25; if a `brew upgrade` reintroduces it, that is the loop, not a broken
install.

**React Native core is built from source as of 2026-08-13** (roadmap deviation #29),
via `plugins/withReactNativeFromSource.js` → `ios.buildReactNativeFromSource`. This is
not a preference: Meta's prebuilt `React.xcframework` is compiled against libc++ 19,
CocoaPods compiles `ExpoModulesCore` against the installed Xcode's libc++ 21, and the
two disagree about `sizeof(ShadowNodeFamily)` by 64 bytes — so every Expo view
overflows its own heap block and the app dies before the first frame. Headers are
byte-identical; nothing warns. **Do not re-enable prebuilts to speed up CI** —
the config plugin is the durable CNG input, build 21 verified it on the generated
native project, and the post-install outcome guard fails every later EAS iOS
build if the prebuilt pod returns.
The debugging lesson is the durable part: the crash surfaced as
`-[RCTComponentViewFactory createComponentViewWithComponentHandle:]`, which reads as
an unregistered Fabric component and is not one. A crash signature that **varies
between runs of the same binary** is heap corruption, not a bug where it crashed;
reproduce it with a Release *simulator* build (100%, no TestFlight round trip) and
pin it with Guard Malloc, leaving `MALLOC_PROTECT_BEFORE` unset. The retired
build-path account remains in `docs/archive/xcode-cloud.md` for history.

## Architecture

### `packages/kairo-core` is the keystone

Pure, zero-dependency TypeScript: scoring, local-day math, Event evaluation and pooling, anti-cheat, progression, streaks. **No I/O, no clock reads, no randomness** — every function takes what it needs as an argument, which is why timezone and DST behaviour is testable without mocking.

Both consumers import the same files:
- Expo app → `@kairo/core` (tsconfig path + Metro `watchFolders`)
- Supabase Edge Functions → `supabase/functions/_shared/core.ts`, a relative re-export

This is what makes §12's server-authoritative rule affordable. Do not add a second implementation of scoring anywhere, and do not add dependencies to this package.

### Writes are server-authoritative

Clients have `SELECT` on their own rows and **zero write grants** on `health_buckets` or `daily_scores`. Edge Functions own every mutation:

- **`sync-health`** — the only door health data enters. Upserts hourly buckets, then re-reads the *whole* day before rescoring (a partial payload must not collapse the day's total).
- **`finalize-days`** — hourly `pg_cron`, the only place a day becomes `final`. Guarded by `CRON_SECRET`.

Scores are always *replayed* from stored buckets, never adjusted in place. That is what makes retries, Apple's retroactive step revisions, and cron overlap all safe. Preserve this property — Event progress is a read-time projection over `health_buckets` for the same reason, and stores no number of its own.

### Structural invariants worth not breaking

- **Privacy is a projection, not a convention.** `profiles` is owner-readable only (the row holds height/weight/birth year, and RLS is row-level). Squadmates reach data through `squad_leaderboard()`, which has no argument that returns raw steps or hourly movement.
- **`reject_mutation()` and the `kairo.allow_purge` flag are inert.** They enforced append-only on `sabotage_events`, which is dropped; the flag is still set by `handle_profile_deletion()` / `leave_squad()` and now guards nothing. Left in place on purpose — it is not worth reopening that path for a no-op. See `20260809120000_remove_sabotage.sql`. **History (2026-08-11):** that migration's comment and this line both used to say `delete_account()` when no such function existed; the correction is kept because it explains why the flag is inert. **`delete_account()` now does exist** — see below.
- **Erasure is `delete_account()`, and most of it was already wired.** Migration `20260811140000` added the RPC and `app/delete-account.tsx`; the cascade underneath predates it. It takes **no argument** on purpose — the only account it can erase is `auth.uid()`, and a `p_user_id` parameter would make it one bug away from letting any signed-in user erase anybody. Three behaviours are deliberate and easy to "fix" wrongly: `profiles_handle_deletion` (BEFORE DELETE) hands squad leadership on *before* the FK cascade, so erasing a leader does not destroy the squad; `goals.created_by` is **SET NULL**, not CASCADE, so a shared goal survives its author — it confers only the `goals_update_own` title edit, so nulling it means nobody inherits the rename right; and `profiles_collect_orphaned_goals` (AFTER DELETE) sweeps goals left with neither creator nor participant. That sweep **must** stay AFTER: `goal_completions_xp_rollup` updates `profiles`, so reaching a completion from a BEFORE trigger modifies the row being deleted and Postgres aborts the statement.
- **Account-scoped tables reference `auth.users`; character-scoped tables reference `profiles`.** `app_events` and `device_tokens` are the account's (2026-08-11) — a profile does not exist until onboarding commits it, and pointing them at `profiles` made every write between sign-in and profile creation fail `23503`. That did not just drop rows: it made the sign-in → abandon funnel unmeasurable, because a user who never names a character produced no events *by construction*. Before adding a table, ask which it belongs to. Erasure is unaffected either way, since `profiles.id` already cascades from `auth.users`.
- **`profiles.total_xp` is a rollup**, recomputed as `sum(daily_scores.xp_awarded)` (plus `event_completions.xp_awarded` and `challenge_completions.xp_awarded`) by trigger — never incremented, so nothing double-counts. The same function maintains `agi_total`/`str_total`/`mnd_total`, which feed the ability ratings (three since deviation #41 — `end_total` and `vit_total` are dropped, and the skip guard described next had to shed them in the very migration that dropped the columns, or it names a column that no longer exists and fails on the next write). Its trigger skips the recompute only when *every* column it reads is unchanged: a same-tier rescore (5,200 → 8,000 steps, both Silver) moves the raw points and not the XP, and a narrower skip loses it silently.
- **Strain is display-only.** `computeStrain()` runs on the client over `health_buckets.avg_heart_rate` and `daily_heart`. It never touches `daily_scores`, so score replay is unaffected. Heart rate is owner-readable only and absent from every projection — it is at least as revealing as the hourly movement §5 protects.
- **Column-level grants:** `profiles` UPDATE is granted per-column. A column-level `REVOKE` against an existing table-level `GRANT` is silently a no-op in Postgres; revoke the table grant and re-grant the allowed columns.
- **A migration touching a table an Edge Function writes ships with that function's redeploy.** Applying one without the other took scoring down for two days in August 2026: `remove_sabotage` dropped `daily_scores.sabotage_delta`, the deployed `sync-health` kept sending it, and because its bucket upsert commits *before* the score upsert, health data kept landing while nothing scored. Every test passed the whole time — they check the source, not the deployed artifact. Two guards now exist and both matter: the schema suite inserts `planDay`'s **real output** into `daily_scores` (so drift fails at commit time), and `supabase/scripts/smoke-sync.mjs` runs a real sync against the deployed function (so drift fails at deploy time). Run the latter after every deploy. Full post-mortem in `docs/qa/kairo-end-to-end-qa-report.md`. **`health_buckets` joined that seam on 2026-09-06** — the write the outage *committed*, and the one nothing watched: `bucketRows` and `BUCKET_CONFLICT_TARGET` live in `sync-plan.ts` and **`sync-health` reads both**, so the schema suite inserts the real row shape through the real conflict target, and a source scan holds the handler to it — a well-meaning inline of the literal back into `index.ts` would otherwise leave every assertion green. **`seed-health` is deliberately not converted**: it writes a narrower row (the scored columns only, the rest left to their defaults) with its own literal target, it is dev-only and reachable by no client path, and converting it would spend a redeploy to change nothing. That target is also the whole proof that **timezone hopping cannot manufacture a day** (issue #23): the key is `(user_id, local_date, hour)` with `hour` constrained 0-23, so a second sync covering the same UTC window under a travelled-to zone can only overwrite an hour of a local date, never add a twenty-fifth. The test drives the whole chain — `toBuckets` under two zones, `validateSyncRequest`, then the upsert — because the client is what decides `localDate` and `hour` from the zone it asserts and nothing downstream re-derives them. It claims nothing about the same UTC hour coming to rest on two different *local dates*, which is true for anyone who actually travelled and inflates no single day; the one consumer that would have cared was the Battle, which pooled raw units across dates and was retired on 2026-09-06 (deviation #66) — so nothing consumes raw units across dates today.
- **Sign in with Apple has two halves the repo cannot see.** The app side landed 2026-08-12 (`appleProvider` in `src/features/auth/providers.ts`, `usesAppleSignIn` in `app.config.ts`, Apple's branded button on `app/(auth)/sign-in.tsx` — required by their HIG, so do not swap it for Kairo's `Button`). The other two halves live outside git and fail silently: the **Sign in with Apple capability on the App ID**, whose absence is indistinguishable from a device not signed into an Apple ID, and the **client secret**, an ES256 JWT that Apple caps at ~182 days and that takes sign-in down for every user at once when it lapses. `npm run apple-secret` mints and installs it and prints the expiry — diary that date. The nonce is load-bearing: `signInAsync` gets the SHA-256 hash, `signInWithIdToken` gets the raw value, and sending the hash to both makes gotrue hash a hash. Runbook in `docs/sign-in-with-apple.md`. `external_anonymous_users_enabled` stays `true` on the project on purpose — the `__DEV__` guard in `availableProviders()`, not the project setting, is what keeps anonymous out of TestFlight.
- **Every request has a deadline, because a hung request is worse than a failed one.** `supabase-js` sets no timeout and neither does `fetch`, so a **black-holed** host — DNS resolves, the TCP connection never completes — yields a promise that never settles. On 2026-08-14 a WiFi network began blocking `*.supabase.co` that way and the app sat on the KAIRO hold overlay permanently, surviving relaunches *and* a reinstall from TestFlight: `resolveRoute` reports a query with no data as `'loading'`, so the `'profile-error'` cover with its "Try again" button was already built and unreachable, because nothing ever errored. `src/lib/fetch-timeout.ts` is wired into `createClient`'s `global.fetch`. It **races** a deadline against the request rather than only aborting, since aborting merely asks the transport to reject and this exists for the case where the network layer is misbehaving; the abort still fires, to free the socket. Diagnostic worth reusing: `curl -w 'connect=%{time_connect}s'` showing DNS resolved but `connect=0.000000s` is a block, not an outage — and check the Management API separately, since `api.supabase.com` is a different host and stays up while the project's own subdomain is unreachable.
- **TanStack Query does not know what offline means on a phone unless told.** Its default online detection is the browser's `online`/`offline` events, which React Native does not have — so without wiring it believes it is permanently online, and a query fired with no signal spends `retry: 2` immediately and lands in an error state instead of pausing. `src/lib/query-client.ts` wires `onlineManager` to NetInfo using **TanStack's documented recipe unmodified** — `Boolean(state.isConnected)`. It briefly read `isInternetReachable` instead, on the reasoning that a captive-portal wifi is "connected" and cannot reach Supabase. True, but the wrong trade: that field is NetInfo's own probe against an unrelated third-party endpoint, so a network blocking *the probe* while Supabase works reports offline forever, and paused queries never error — the same endless spinner as above. Prefer the false positive that fails loudly over the false negative that hangs; `fetch-timeout.ts` covers the captive-portal case. Do not "improve" on the documented recipe here again.
- **Push has a client half that was missing until 2026-08-14, and a credential the repo cannot see.** The server had been sending a deep-link payload — `{trigger, localDate, screen}` from `dispatch-notifications`, plus `eventId` from `finalize-days` — since the notification engine shipped, and **nothing read it**: no `setNotificationHandler` (so a foreground push displayed nothing at all, which reads exactly like push being broken) and no response listener (so a tap went nowhere). `src/features/notifications/routing.ts` is the fix and follows the house split — `notificationTarget()` decides and is tested in Node, `useNotificationRouting()` performs. Three things there are load-bearing: `screen: 'character'` maps to **`/`**, not `/character`, which is the *onboarding* body picker; the hook is mounted in `app/(tabs)/_layout.tsx` because that layout only exists for a `'ready'` user, so mounting **is** the gate; and both `useLastNotificationResponse()` and the response listener are wired, because a tap that launches the app from terminated is retained by the former and never emitted to the latter. The credential is the **APNs key uploaded to Expo** (`eas credentials`) — same failure shape as the Apple client secret, invisible in git, and a send without it returns a ticket error rather than doing nothing.
- **`aps-environment` is generated from Expo config.** Expo's notifications plugin defaults it to `development` (the APNs sandbox), so `app.config.ts` declares `['expo-notifications', { mode: 'production' }]` explicitly and EAS CNG carries that into the distribution entitlement. Never patch the ignored generated entitlements. Do not treat the declaration as proof push works: Expo's service relays to both environments. **And do not try to read the value back on TestFlight** — `expo-application` parses `embedded.mobileprovision`, App Store distribution strips that file from the bundle, and the answer is `null` there structurally (the library's own `appReleaseType` has an explicit branch for the file's absence). A diagnostic built on it shipped on 2026-08-14 and told a healthy TestFlight device it was a simulator. What `NotificationSettingsCard` reports instead is **registration**, which is knowable everywhere and the stronger signal anyway: `getExpoPushTokenAsync` fails with *"no valid aps-environment entitlement string found"* when the entitlement is wrong, so a token that exists is evidence the entitlement is right. Simulator is decided by the release type, never by a null environment. The line ships in **Release** on purpose — `__DEV__` would hide it from TestFlight.
- **The app icon is an Icon Composer bundle, and nothing in JS validates it.** `assets/Kairo.icon/` holds a *transparent* terracotta symbol plus an `icon.json` declaring the cream ground as `fill`; iOS renders the light, dark and tinted appearances from that one layered source, which is what a flat PNG cannot do. Four things break it silently. **It must sit on `ios.icon` as a plain string** — `@expo/prebuild-config` warns and falls back if a `.icon` path is given to the *root* `icon` field or to the light/dark/tinted object form, so the root `icon` stays a PNG serving Android, web and pre-iOS-26. **Expo copies the directory verbatim** into `ios/<App>/Kairo.icon` and sets `ASSETCATALOG_COMPILER_APPICON_NAME`; the schema is Apple's and is only ever checked by `actool` at Xcode/EAS build time, so a malformed edit passes `prebuild` and every local check and fails in CI — the `aps-environment` failure shape again. Validate locally instead of guessing, with `mkdir -p /tmp/out && xcrun actool --compile /tmp/out --platform iphoneos --minimum-deployment-target 26.0 --target-device iphone --app-icon Kairo --output-partial-info-plist /tmp/out/p.plist assets/Kairo.icon` (the `mkdir` is load-bearing — `actool` errors rather than creating the output directory), which exits non-zero on a bad schema and otherwise writes the real rendered PNGs — the only way to *see* the glass treatment without a device. **`fill` colours are `<colour-space>:r,g,b,a` floats, not hex** (`extended-srgb:0.96078,0.91765,0.84706,1.00000` is `colors.bg`). And **the basename is the icon name**, so renaming the directory renames the build setting. **Editing the artwork without editing `app.config.ts` leaves the native copy stale and silent** — `npm run ios` does not re-sync `ios/Kairo/Kairo.icon`, because the config *value* is unchanged and only the bytes it points at moved, so the build succeeds against the previous icon (hit on 2026-08-25: the simulator kept rendering the ink mark after the terracotta one was installed). After changing icon artwork run `npx expo prebuild -p ios --no-install`, then `xcrun simctl uninstall` before reinstalling, since SpringBoard caches icons across reinstalls — and diff the native copy rather than trusting the build. **The Dark appearance is auto-derived, which constrains the symbol colour** — with one layer declared, iOS darkens the cream ground and keeps the symbol unchanged, so the symbol has to work on both. That is why it is terracotta (`colors.accent`) and not the far higher-contrast ink (`colors.text`): ink measured 13.95:1 on cream but **1.00:1** on the darkened ground, invisible, confirmed on the simulator 2026-08-25; terracotta reads 3.03:1 and 4.60:1, and Dark was then checked by hand and reads correctly. Darkening the symbol for a punchier Default silently destroys the Dark appearance. The override mechanism is the `*-specializations` family (`fill-specializations`, `image-name-specializations`, `glass-specializations`, …) keyed by `light-color` / `dark-color` / `dark-tint` / `dark-clear`, but **do not hand-write it from that vocabulary**: an invented nesting is a silent no-op, proven by pointing a specialization at a nonexistent file and still getting exit 0, where the same trick on the *primary* `image-name` fails the build. Author it in Apple's Icon Composer, which writes canonical JSON, or pick a mid-tone symbol that survives both grounds. And note `actool` is **nondeterministic** — identical input yields different `Assets.car` digests — so diffing the compiled output cannot tell you whether an edit landed. The fallback `assets/icon.png` has its own trap: it carries **no alpha channel** (PNG colour type 2), because Apple rejects an App Store icon that has one even when every pixel is opaque (ITMS-90717, raised at upload rather than at build) — most re-exports silently add it back, so check with `sips -g hasAlpha`.
- **The HealthKit disclosure is derived, not written.** `src/features/health/read-types.ts` is the single list of requested types; `disclosure.ts` maps each to user-facing copy, and `disclosure.test.ts` fails if either side names something the other does not. That list lives apart from `permission.ts` because anything importing `@kingstinct/react-native-healthkit` drags in React Native's Flow syntax that root Vitest cannot parse — the same constraint `sync-state.ts` records. The `NSHealthShareUsageDescription` string in `app.config.ts` covers the same types and is the one half no test can lock; update it by hand when the list changes.
- **Telemetry's decisions live in zero-import modules, for the same parse-failure reason as the HealthKit disclosure.** `src/features/telemetry/buffer.ts` (the pre-sign-in event queue) and `milestones.ts` (the once-ever rule) import nothing, so root Vitest — no `@/` alias, no MMKV — can load and test them directly; the MMKV-backed store and the Supabase write sit in separate files that pull those dependencies in. `first_sync_seen` and `first_score_seen` are gated on an MMKV once-ever marker in `milestone-store.ts`, claimed before the write and released via `markUnreached` if it fails — **not** the per-session marker `useAppOpenTelemetry` (`src/features/notifications/useNotifications.ts`) uses, which fires every relaunch on purpose and would silently overcount activation if reused here. `public.kairo_retention()` is admin analytics with EXECUTE revoked from `public`, `anon` and `authenticated` — it is run through `remote-sql.sh` against the live project, never from a client. Runbook: `docs/beta-measurement.md`. **Deviation #59 adds four types with three different lifetimes**: `today_seen` and `next_step_shown` are **once per the account's own local day** on `daily-marker.ts` (`ALL_MARKERS` grew with them, so `clearDailyMarkers` still reaches everything on sign-out); `today_details_opened` is **per tap**, because the question is how often the complete day is actually wanted; `character_reaction_seen` is **per occurrence**, emitted from the hook that presents the reaction rather than from a render. **Every payload is category-only** — `{ category }` of `motion`/`body`/`none`, or `{ kind }` — and no payload may carry a health figure, an occurrence id, a quest id, **or the Motion location**, because a five-band location is a coarse step count. `telemetry-payloads.test.ts` is where that rule lives for **every** emitting surface — the Today tab, the Sky tab and the onboarding beats — and it bans **the step median** alongside the location, because a fortnight's median is a health figure in the same dress. Do not start a second scan of the same rule beside it; one of the two always ends up quietly narrower. (`ask-answer-telemetry.test.ts` is *not* that second scan: it makes a stricter, single-event claim — `notification_ask_answered` carries the answer and **nothing else** — over a file this one does not read.) Three things keep it from rotting, and all three were put there after it shipped without them. **The floor is an allowlist**, so a payload key nobody anticipated fails whatever it is called — a ban list only catches the names somebody thought of, and `{ scoredDays }` and `{ days }` both already ship elsewhere. **The named health figures are kept as well**, since a banned value rides happily inside an allowed key (`category: todaySteps`), and they are **word-bounded**, because `/location/i` matches "allocation". **The file list is swept**: `app/(tabs)/`, `app/(onboard)/` and `src/features/onboarding/` are walked and any file there calling `track` without being named fails, since a surface the scan does not read is a surface with no ban on it. Comments are stripped before all of that, or a doc comment writing `track()` fails the sweep — and a guard that fails on real source gets deleted. **`onboarding_beat_seen` is a fourth lifetime** — unguarded, once per beat mount, carrying `{ route }` and nothing else; see the onboarding block above for why it needs no marker store and why `userId` must stay out of its effect deps. **`calibration_completed` is a fifth**, and takes the opposite decision for a stated reason: it is **once ever** on an MMKV marker (`calibration_recorded`, added to `ALL_MILESTONES` so `clearMilestones` reaches it), because the reading it reports re-runs whenever `/connect` is re-entered and granted again, so unguarded its denominator would count taps rather than accounts. Its payload is `{ outcome }` — `proposed` or `no-history` — and carries neither the median nor **the tier proposed**, which would be a distribution of the cohort's fitness sitting in `app_events` to answer a question nobody asked. It is built inside `runCalibration` rather than at the call site, so no screen can reach it. **`flock_prompt_answered` is a sixth**, and needs no store at all: it rides the welcome run's `welcome_seen` marker, which is claimed when the run opens, so the card it sits on cannot be reached twice. Its payload is `{ answer }` — `joined`, `invited` or `skipped` — and it records **which door was taken, not what came of it**, since `squad_joined` and `squad_created` already say whether a squad resulted; folding the two together would make the card look like it converts far better than it does.

### Per-user local days

Every player's day runs midnight-to-midnight in **their own** timezone (§2), so a squad spans multiple calendar dates at any instant. Health buckets, scores, and Event windows are keyed by local date. `finalizable_days()` in SQL and `isFinalizable()` in `kairo-core` implement the same ~2h grace window and are kept honest by a differential test.

## Conventions

- **`*.deno.ts`** marks a shared module that imports Deno-only specifiers (`npm:`, Deno globals). These are excluded from `tsc` and checked by `deno check` instead. Everything else under `supabase/functions/_shared/` stays pure so vitest can exercise it.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node; `index.ts` only authenticates, reads, plans, writes. This is deliberate — Docker is unavailable, so anything untestable in Node is effectively untested.
- **`*.deno.test.ts`** is the narrow exception: a Node test that drives a `*.deno.ts` module directly, against a fake PostgREST client. It works only where every `npm:` import on the path is `import type` and vanishes at transform time, so adding a value import from `npm:` breaks it loudly — which is the point. Reach for it only when the behaviour genuinely lives in a query or a call rather than in a pure function (whether an enumeration filters on `status`, say). It is excluded from `tsc` for the same reason its subject is, and `deno check` only follows `index.ts`, so **nothing typechecks it**; that is the price.
- Imports use explicit `.ts` extensions, which Deno requires and Vite/Metro both accept.

## Testing

Strict TDD on scoring, day boundaries, Events, streaks and anti-cheat — the logic where a bug corrupts real leaderboards. UI is verified by hand on device.

**A module tested by root Vitest may not value-import through the `@/` alias.**
`vitest.config.ts` defines no alias, so a value import through it is a load
failure — `import type` is erased and is fine. Reach sideways by relative path,
exactly as `kairo-voice.ts` reaches `stat-names.ts` and `living-mirror.ts` and
`today-details.ts` reach `theme.ts` and `quest-copy.ts`. The include pattern is
`src/**/*.test.ts` and not `.tsx`, which is the other half of the same rule:
nothing under test may pull in React Native's Flow syntax.

**Engine-key guards are case-sensitive and word-bounded** — `/\b(AGI|STR|MND)\b/`.
A loose `/str/i` matches "Verified strength session", which is copy a test
elsewhere *requires*, and a loose `/agi/i` matches "Dagit", a perfectly good name
for a Philippine eagle. A guard that fails on real input gets loosened until it
guards nothing.

`supabase/tests/harness.ts` applies every migration to **PGlite** (real Postgres in WASM) with stubbed `auth` and `realtime` schemas, then asserts behaviour under the non-owner `authenticated` role. Runs in ~1.5s with no Docker.

**Its limits, so nothing over-trusts it:** it does not prove Supabase's Realtime server delivers broadcasts, nor that the hosted `auth` schema matches. `UNSUPPORTED_MIGRATIONS` in that file lists migrations it cannot apply, each with a reason — keep that list as short as possible, since every entry is schema no test covers. Verify those against the live project instead.
