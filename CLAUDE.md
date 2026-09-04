# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily race to a shared finish line, plus a pooled Battle the squad fights together. iOS first via Expo; Supabase backend.

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
  `event_completed` and `challenge_cleared` are the two pushes that *do* arrive
  overnight. `notifications.ts` argues they should not ("a push at 02:00 to say
  'well done' is worth waiting for morning"); that is an intent the send path
  does not implement, and a "never overnight" claim shipped on it for one
  review round before being caught.
- **`shouldAskForNotifications` earns the ask on a squad, a running Battle, or
  a first scored day, as of 2026-09-04.** The first two are social,
  which was right while the pushes they enabled were; #52 left one scheduled
  push and Kairo is solo-first, so `hasSquad || hasEvent` excluded the whole
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

**Kairo scores three stats as of 2026-08-20** (deviation #41). `CoreStat` is
`'AGI' | 'STR' | 'MND'`: steps, active calories, sleep. END folded into STR and
VIT into AGI as **threshold shifts** — never point multipliers, because a
stored multiplier stacks with the squad program's read-time weight and that is
deviation #10's trap — and sleep was promoted from the REC bonus to a full
stat. **END's half of that is retired as of 2026-08-29**; see the block below
for what replaced it. VIT's spread shift on AGI is unchanged. A day's stat points scale by `3 / earnable stats`, so both ceilings are
4,400 and a wearable buys a third route to the same ceiling rather than a
higher one. Three things break easily:

- **The Daily Walk reads `tiers->>'AGI_base'`, never `tiers->>'AGI'`.** The
  spread shift lowers AGI's whole ladder, Gold included, and `tiers` stores the
  **shifted** tier — so Gold arrives at 7,500 steps on an eight-active-hour day
  and the baseline scales with the user, which is exactly what it must never
  do. `sync-plan.ts` writes both keys; the 90-day streak in `train/queries.ts`
  reads `AGI_base` and falls back to `AGI` for rows written before the switch,
  for which the two agree. **A guard written through
  `tierFor` cannot catch this**, and one was: `tierFor` *is*
  `shiftedTierFor(stat, raw, 0)`, the single path where the shift is absent by
  definition, so `scoring.test.ts`'s 10,000 literal passed throughout. Assert
  through `computeDailyScore` — that is the only place the two ladders can
  disagree.
- **`planDay` requires `earnableStats` and `verifiedStrengthMinutes`, and
  neither is defaulted.** `DailyScoreInput` defaults both, which is right for a
  pure function whose callers include tests. `planDay` has exactly two callers
  and **both are write paths**, so a default there is the silent failure the
  fields exist to prevent: every stored row scoring at factor 1.0 with nothing
  anywhere to notice. `scoring-inputs.ts` derives them, against **the date being
  scored** and never wall-clock today — identical on a live sync, wrong on a
  replay, and the difference is a 6,200-point day against a 4,400 ceiling that
  `contributing_stats` still passes.
- **The board re-sums the per-stat columns; it does not read `total`.** That is
  the only way `squad_leaderboard()` can apply the program weights at read time
  (deviation #11), and it means a stat is competitively invisible until it is
  added to `program_weighted_total` **and** `squad_leaderboard` **and**
  `weightedBoardTotal` in `@kairo/core`. MND shipped missing from all three for
  a day: 1,200 stored points the ranking number could not see, on every
  program. Changing that function's signature is a **drop by exact argument
  list**, never `create or replace` — the `create_goal` / `p_metric` trap, and a
  surviving overload fails nothing until a call site resolves to it.

**Body reads work, points are a curve, and Mind tapers, as of 2026-08-29.**
Licensed by `docs/adr/0001-replay-compatibility-expires-at-launch.md`: the live
project held **3 profiles and 6 scored days**, all development accounts, so
replay-comparability was protecting nobody and was pure design cost. **That
licence expires at the first real cohort** — from that day a scoring change that
moves stored history needs a migration that rescores, or it does not ship. The
replay *mechanism* is untouched and is not what the ADR is about. Design:
`docs/superpowers/specs/2026-08-29-body-motion-mind-design.md`. Vocabulary:
`CONTEXT.md`. Six things break easily:

- **`workoutShift` is gone, and reinstating it is a double-count.** Verified
  strength minutes used to lower Body's *bands*; they raise Body's *raw value*
  now, at `STRENGTH_MINUTE_KCAL_CREDIT` (4) kcal-equivalent per minute. One
  signal must never do both — that is the whole reason the shift was retired
  rather than kept alongside. `statShifts` therefore takes **only
  `activeHours`**, and `STR` is a hard 0 in it. AGI's spread shift is untouched
  and is *not* the same arrangement: different signal, different stat, no
  double-count.
- **`verifiedStrengthMinutesFrom` filters on `activity_type`, and
  `activity_type` had to be added to `WORKOUT_SESSION_COLUMNS`.** It was not in
  the select list or in `WorkoutSessionRow`. Without it every row reads
  `undefined`, `Number(undefined)` is `NaN`, `NaN` is in no list, and Body
  credits **nothing, forever, with no error anywhere**. The completeness guard
  (`UnselectedWorkoutColumn extends never`) is what stops that, and it only
  works because the field is declared on the row type. A run is deliberately not
  credited: it already reports its calories honestly through `active_kcal`.
- **Points interpolate between the tier anchors; they are no longer a lookup.**
  `statPointsFor` is the single path. 250 / 650 / 1,200 still land **exactly** on
  the bands, so the 4,400 ceiling, `tierFor`, the Daily Walk streak and
  `AGI_base` are all unmoved — and 5,000 steps no longer scores the same as
  9,999. **Below Bronze is still zero and that is load-bearing**: interpolating
  from the origin is the obvious next step and would let fifty steps score
  points, count as a scored day, and keep a streak alive.
- **Mind tapers to Silver instead of falling to Bronze.** Gold holds to
  `MIND_OVERSLEEP_HOURS` (9), declines to the Silver anchor by
  `MIND_TAPER_END_HOURS` (10.5), and floors there — so an eleven-hour night can
  no longer score below a five-hour one. The reason is the data, not just
  fairness: HealthKit sleep is noisy (a watch on the nightstand, `inBed` against
  `asleep`, a merged nap), and a cliff punishes *measurement error* as though it
  were behaviour. **`mindTierFor` derives its tier from `mindPoints`**, never
  from a second threshold table, so the two cannot disagree about one night.
  XP still steps once at nine hours, because `TIER_XP` is banded and this pass
  did not change that.
- **`TIER_POINTS` lives in `tier-points.ts` now, and passing it as an argument is
  the mistake that was already made.** `mind.ts` needs the anchors and
  `scoring.ts` imports `mind.ts`, so the reverse import is a cycle. Threading the
  table through as a parameter was the first attempt and broke an
  out-of-package caller (`character-resolver.ts`) at *runtime* rather than
  compile time. One module, imported by both.
- **All five Edge Functions redeploy together.** `sync-health`, `finalize-days`,
  `replay-scores`, `seed-health` and `dispatch-notifications` all bundle either
  `core.ts` or `rescore.deno.ts`. Deploying only `sync-health` leaves
  `finalize-days` rescoring days with the *old* model — the split-brain that
  took scoring down for two days in August 2026, in a new place. Verified after
  deploy with `supabase/scripts/smoke-sync.mjs`; a `str_points` that is not
  250/650/1,200 is the proof the interpolation is live.

**Two more from the same pass (Phase 2).**

- **`profiles.has_sleep_source` is the single stored answer to "can this account
  earn Mind?", and both quest paths read it.** `pickQuests` now takes `hasSleep`
  and filters `sleep_minutes` quests out — until 2026-08-29 it filtered on tier
  alone, so a phone-only account could be dealt `starter-sleep-360` on day one
  with **no route to clearing it, ever**. The client draws and `finalize-days`
  grades, so the two must agree: they read one column rather than deriving
  capability twice, exactly as they already share `quest_tier_override`. The
  column is **deliberately absent from `profiles`' column-level UPDATE grant**
  (a client that could set it could change what the grader pays), and — unlike
  `has_wearable`, which is sticky — it **flips both ways**, because a source
  that goes away must take the sleep quests with it. `sync-health` writes it for
  the **latest** date in the payload, never the last one the loop happens to
  visit. `smoke-sync.mjs` asserts it, so a deploy that silently stops writing it
  fails at deploy time rather than by quietly withholding every sleep quest.
- **`stat_records()` is derived on every read and takes no argument.** Best day
  per stat in raw units, with its date. Derived for the same reason Event
  progress is — a retroactive Apple revision has to move a record the way it
  moves a score, and a stored best would go stale with nothing to notice. No
  argument for the same reason `delete_account()` has none: a `p_user_id` would
  put it one bug from reading any account's history, and a personal best must
  never reach a leaderboard. **Body's record is active calories only, without
  the strength credit** — a record is a thing a calorimeter actually saw, not a
  scoring input, and that line is also what keeps the function clear of
  `workout_sessions`, which no `public` function body may name. Mind reads
  `was_user_entered is not true`; without it somebody types one fourteen-hour
  night and holds a record they did not sleep. A stat with no qualifying day
  returns **no row**, never a zero.

**The surfaces (Phase 3), all OTA.** The through-line is one sentence form —
**observation, em dash, consequence** — used by `spreadLine`, `statDetailLine`
and `ceilingLine`. The app computed an elaborate model and showed almost none of
it; the fix was legibility, not more numbers. Five things break easily:

- **`spreadLine` says "tops out sooner", never "ridge" and never a target.**
  Both would collide with numbers already on the same screen: **ridge** is the
  race's finish line (`RACE_FINISH_LINE`, flat for everyone), and the Daily Walk
  is that same flat figure and **deliberately unshifted** — it reads `AGI_base`
  precisely so a spread day cannot move a public-health number. Naming a
  *shifted* figure with either word puts two values behind one noun. The line
  reports the discount instead, which is what the shift actually is. A test pins
  it.
- **The engine-key guards are case-sensitive and word-bounded**
  (`/\b(AGI|STR|MND)\b/`). A loose `/agi/i` matches "D**agi**t", a perfectly good
  name for a Philippine eagle — and it did, on first run. A guard that fails on
  real input gets loosened until it guards nothing.
- **`statDetailLine` never prints `StatDetail.points`, though the field is right
  there.** That field predates deviation #34 and its own doc comment still
  describes copy that named the reward as a number. `topsOut` is what the
  sentence needs; the number stays for ranking stats internally.
- **The crest changes the sky, never the bird.** The figure already says four
  things by shape (species, level band, build, presence ring) and a fifth would
  make the centrepiece a readout. It is **always paired with `ceilingLine`** —
  an unexplained change to the screen someone opens first is indistinguishable
  from a bug, which is the failure this whole pass exists to remove. The trigger
  reads `daily_scores.total` against `MAX_DAILY_SCORE_PHONE_ONLY`: **read, never
  rendered**, and one comparison covers both cohorts because normalization makes
  the two ceilings equal.
- **`/progress` had gone false and is the only screen that explains the model.**
  It said active minutes and active hours "earn points" — they became shifts at
  deviation #41 — and never mentioned Mind at all. A stale entry there is worse
  than none: the reader has no second source to correct it against.

Also renamed in this pass: **"ability rating" is "mastery" everywhere**, comments
included, and `CONTEXT.md` records why — a monotone lifetime figure cannot
measure current ability, and it stays monotone because a falling number punishes
the quiet week, which is the same argument `useScoredDayCount` already makes.
And the **HealthKit permission sheet's privacy claim was false**: it promised
squadmates "never your raw numbers", which deviation #47 stopped being true. A
stale privacy claim is the worst kind, so it is rewritten rather than annotated.

Retiring the shift **deleted** `stat-detail.ts`'s `unquantified` state,
`strShiftUnknowable` and `workoutDaySignal` — roughly 137 lines that existed only
because Body had a shift the screen could not measure. Do not reintroduce them;
Body quotes the published ladder now.

**Stat surface names are Body (`STR`) · Motion (`AGI`) · Mind (`MND`) as of
2026-08-25** (deviation #51). The engine keys above are unchanged and must stay
so — this is deviation #23's move in a second place, the engine keeping its
vocabulary while the surface gets the player's. **Mind did not move**; two words
changed, not three. Three things break easily:

- **`src/ui/stat-names.ts` is the single source, and it is zero-runtime-import
  on purpose.** `STAT_NAMES` lived in `StatIcon.tsx`, which reaches
  `@expo/vector-icons` and therefore React Native's Flow syntax that root Vitest
  cannot parse — so the stat words were untestable while seven call sites read
  them. `StatIcon.tsx` re-exports the table so no call site changed. **Do not
  import `@/ui/index.ts` from a module root Vitest tests**: the barrel
  re-exports every component *and* the `@/` alias does not resolve there, which
  is why `program-copy.ts` reaches `stat-names.ts` by relative path exactly as
  `event-copy.ts` reaches `kairo-core`.
- **`dominanceName()` replaced `DOMINANCE_LABELS`, and a parallel table of stat
  words anywhere is stale by construction.** Two copies existed before this and
  neither contained a stat word to grep for in the obvious way — the home
  screen's own `Record<CoreStat | 'balanced', string>`, and `boostChipLabel`,
  which printed the raw `CoreStat` key (`AGI ×1.5`) and was the last surface in
  the app showing an engine name to a player. The guard is a test in
  `stat-names.test.ts` that scans every non-test file under `src` and `app` for
  the word **Agility**; it immediately caught two stale doc comments quoting
  rendered copy back at the reader.
- **"Strength" is deliberately not guarded, and squad programs and Challenge
  areas keep their names.** `squads.program`'s `strength` and `ChallengeArea`'s
  `strength` name a *game*, not a stat, and members consented to a squad under
  that name; "Strength" also survives in `STRENGTH_ACCURACY_NOTE` and in the two
  `HKWorkoutActivityType` identifiers, so a guard on it would be noise, and a
  noisy guard gets deleted. What each program's **blurb** must do is name the
  stat it weights in the current vocabulary — hence "Body counts for more". A
  member of a Strength squad therefore reads "Body counts for more", which is
  correct and briefly confusing; that trade was taken knowingly.

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

**Goals became Events on 2026-08-25** (deviations #45, #48, #49). `goals` is
`challenge_events`, `goal_participants` is `event_participants`,
`goal_completions` is `event_completions`. `create_goal()`, `abandon_goal()`,
`goal_window_scores()` and `can_see_goal()` are dropped; `create_event()`,
`abandon_event()`, `event_progress()` and `can_see_event()` replace them.
`src/features/goals/` and both `/goal` routes are gone. Seven things break
easily:

- **`closed_at is null` is not optional on any read.** The table still holds
  every pre-pivot Goal row so banked XP does not vanish, so the `kind`,
  `metric`, `events_need_end` and `events_need_squad` checks are all written
  `check (closed_at is not null or …)` — validated constraints, never
  `NOT VALID`. Omitting the filter renders a points goal as a Battle.
  `challenge_events_one_live_per_kind` keys off the same column, which is why
  `abandon_event()` **closes** rather than deletes.
- **An Event's target is snapshotted at creation; a Challenge's is derived on
  every read.** `bossHp()` computes it once on the client and `create_event()`
  stores `p_target` verbatim — the one place a client decides a number the
  server keeps, accepted because reimplementing the median in plpgsql is
  deviation #18's differential-test tax again, and because the exposure is a
  squad setting an easy boss for itself. Progress stays a read-time projection,
  so revisions still replay: **the target is fixed, the progress is replayed.**
  Both modules carry a comment saying so.
- **Pooled means every roster member is paid**, contributor or not. Paying only
  contributors rebuilds the per-member N-of-M rule the pivot removed.
- **`pooledDays()` in `@kairo/core` holds three rules and all three fail
  silently.** Take each date **once** — `event_progress()` repeats the pooled
  figure on every participant's row. Read `pooled_value`, **never** `value`:
  that column is behind deviation #47's consent gate, which keys off the
  *viewer's profile* and not their role, so `finalize-days` grading from it
  pools a whole fight to zero for any candidate who never consented, completes
  nothing, and logs nothing. And a date is final **only when every
  participant's is**, since a squad spans timezones and a mixed date would let
  a still-revisable contribution pay XP. It lives in the keystone precisely so
  the client's bar and the server's grading cannot disagree.
- **`recalculate_user_xp` is a full recompute written out whole**, and the
  deployed body names `challenge_completions` as a third XP source *and* writes
  `agi_total`/`str_total`/`mnd_total`. Read it before editing — a source
  omitted is a source dropped, and every account's ratings fall on the next
  sync. The quests plan rewrites the same function.
- **An erasure function had to be recreated, not renamed.** A plpgsql body is
  text resolved at execution, so `alter table … rename` does not rewrite the
  table names inside it — `collect_orphaned_goals()` would have raised
  `relation "public.goals" does not exist` on the first account deletion and
  nowhere else. It is `collect_orphaned_events()` now and still **AFTER
  DELETE**.
- **`goal_completed` survives as a notification trigger and routes to `/`.**
  `notification_log.kind` is free text, historical rows say it, and a push sent
  before the deploy can be tapped after it. A tap that goes nowhere is
  indistinguishable from push being broken.

**The invite link is unchanged by the above.** The universal-links chain has
three sources and every failure is silent: `ios.associatedDomains` in
`app.config.ts`, the extensionless AASA file's `Content-Type`
(`web/vercel.json`), and the **Associated Domains capability on the App ID** in
Apple's portal. EAS CNG generates the native entitlement from config; never
hand-edit the ignored `ios/` project. Same failure class as `aps-environment`.
The domain is a one-way door — `INVITE_HOST` is one constant that both
`app.config.ts` and `invite-message.ts` read, and changing it breaks every link
already shared. Runbook: `web/README.md`.

**A new account does not see the whole app, as of 2026-08-17** (deviations
#37–#39). `disclosureStage()` in `@kairo/core` returns `core` below
`DISCLOSURE_THRESHOLD_DAYS` and `full` at or above it; `TrainEntry`, `StatRail`
and the Strain/Sleep rows are hidden in `core`. **The Battle is not gated** —
`SquadEventPanel` and both `/event` routes check nothing, because an Event is a
squad's shared thing and gating it on one member's scored-day count would hide
from a new member what the rest are already looking at. Nothing is deleted —
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
- **Onboarding is `/connect` → `/name`** (two screens since deviation #55; the
  species picker sat between them), and the profile row still commits exactly
  once, on the last screen. Add steps *before* the name,
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

**Kairo says things without words, and each one needs an accessible name.** A
stat is a glyph with no letters beside it; the character's level band, dominant
stat and ability rating are shape, shadow and ring. The pattern, set by
`StatIcon`, is: **a decorative or duplicative element is hidden**
(`accessibilityElementsHidden`), and **the group that means something is one
element with a composed label**. `src/ui/stat-names.ts` is the single source for
stat words — it also exports `dominanceName()`, since `Dominance` is
`CoreStat | 'balanced' | null` and so the figure needs naming too, and a
parallel table would drift. Where composition has real edges it gets a
tested pure module: `src/features/squad/row-label.ts` exists because a
leaderboard row was twelve separate stops (a six-person board took seventy-odd
swipes), and because "1-day streak" is right on screen and wrong out loud.
Before adding a label, check the text already beside it — `BattleCard`'s pace
marker needs nothing, since `eventStatusLine()` already says "behind pace".

**Three rules the 2026-08-14 device pass added.** First: **grouping is
explicit.** `accessible` + `accessibilityLabel` on a parent is documented to
collapse its descendants on iOS and *did not* on that build — a leaderboard row
still read as separate stops. The mechanism is unconfirmed and the fix
deliberately does not depend on it: the parent keeps both props **and** every
direct child is hidden with `accessibilityElementsHidden` +
`importantForAccessibility="no-hide-descendants"`. Neither half is redundant;
removing one is how this comes back. Second: **the character HUD's layout stays
flow-based.** It was the app's only absolutely-positioned chrome, pinned at
`+8`/`+48`/`+48`/`+132`, and those constants assumed pill heights nothing
enforced — at large Dynamic Type the pills grew past each other and overlapped.
It is one flowing column now; do not reintroduce a `top` on any child. Third:
**before adding an accessible name, read what is already spoken around it.** A
label that repeats an adjacent line is noise; a label inside a control that
already names itself is a bug — `StatCoin` got one inside `StatRail`, which is a
single `Pressable` already speaking every rating on the rail, and it was reverted.

**Accessibility structure is verified in Xcode's Accessibility Inspector on the
simulator before a TestFlight build is cut.** This qualifies the "UI is verified
by hand on device" posture below rather than replacing it: the grouping failure
above cost a full build to find and another to confirm, and the inspector
answers *"is this row one element or twelve"* directly, with no VoiceOver
gestures and no build. Dynamic Type needs no GUI at all —
`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
sets it and `xcrun simctl io booted screenshot` captures the result.

**Stat identity is a glyph, not three letters, as of 2026-08-11.** `src/ui/StatIcon.tsx`
owns the only mapping; `StatCoin`, `StatBar` and `LeaderboardRow` all read it. It is
MaterialCommunityIcons on purpose while all chrome stays Feather — the split is
hairline = *things you operate*, solid = *things you are*. Don't blur it in either
direction.

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
- **Onboarding is `/connect` → `/name`, and the profile row still commits
  exactly once**, on the name screen — two screens since #55, and still
  load-bearing. Deviation #22 deleted the `finishingOnboarding` flag when
  onboarding collapsed to one step; asking anything *after* the INSERT flips
  `resolveRoute` to `'ready'` under the unfinished screen and needs that flag
  back. Add onboarding steps *before* the name, never after.
- **The picker's layout lessons outlived it and now live on `/name`**: it
  scrolls, and its text sits in a `View` with a real width. Both are the
  permission sheet's 2026-08-17 lessons, and on a screen carrying a 28pt input
  they are not optional.

**Two documents hold the decisions. Read them before proposing changes.**

- `docs/Kairo_Master_Summary.md` — the product spec (v1.4). Sections are cited throughout the code as `§5`, `§12`, etc. Comments referencing a `§` are pointing here. §5's and §6's stat tables are superseded by deviation #41 and marked as such in place; the section numbering does not move.
- `docs/roadmap.md` — build sequencing, phase status, and an **approved-deviations table**. Deviations from the spec are deliberate and recorded; propose changes against that table rather than "fixing" them.

`docs/user-journey.md` walks the end-to-end user flow (onboarding → daily loop → character → squad → battles) grounded in what's actually built, not just spec'd. Update it whenever a flow changes.

**`docs/mvp-scope.md` is the IN/OUT contract.** Cite it in any QA brief, test plan or store-facing copy. It exists because the August 2026 QA pass graded Kairo against a v1.3-era brief and scored four sections 1/10 for features that were deliberately removed (sabotage) or deliberately deferred (gear, referrals, monetization) — burying the findings that mattered under findings about a product that no longer exists. If a brief describes something not listed there, the brief is stale.

`docs/qa/kairo-end-to-end-qa-report.md` is that pass, plus an addendum tracing its central finding to a stale Edge Function deployment. **Two of its claims do not survive checking** and are corrected in place: the body-metric "defaults" are placeholders on empty inputs (nothing invented can be saved), and the finalization scheduler was healthy throughout. Its dispositions are tabulated in `docs/roadmap.md` under "End-to-end QA findings".

## Tooling conventions

- **Use context7 for library/SDK docs.** Before writing or debugging code against a versioned dependency (Expo SDK, Supabase client, React Navigation, HealthKit wrappers, etc.), pull current docs via context7 rather than relying on training-data recall — APIs move and training data goes stale.
- **Use graphify to navigate the codebase.** Prefer it over ad-hoc grep/find for architecture questions, call graphs, and cross-file relationships (`graphify-out/` holds the indexed graph) — it's faster and keeps answers grounded in the real dependency structure.
- **Route UI/UX changes through the frontend-design skill.** Any new or modified screen/component under `app/` or `src/` gets a design pass through that skill before implementation, so it lands as intentional design rather than generic RN defaults — Kairo's character-first visual identity (§6) is easy to flatten otherwise.
- **Documentation updates are part of the change, not a follow-up.** A change to product behavior, architecture, or setup steps updates `README.md`, this file, and `docs/user-journey.md` (or whichever `docs/` file governs it) in the same pass.
- **A Notion mirror of this documentation exists** (design: `docs/superpowers/specs/2026-08-15-notion-documentation-design.md`), summarized and chunked, with mermaid diagrams and Tasks/Backlog + Decisions Log databases. It updates **on request, not automatically** — when asked to "update Notion" (or when a finished feature is doc-worthy and the user agrees), sync the relevant Notion pages and append a dated entry to the Changelog page. The repo docs stay authoritative; Notion links back to them rather than mirroring verbatim.

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

**This machine also cannot pair an iPhone over USB, and the cause is not fixable from the phone.** It is corporate-managed — CrowdStrike Falcon runs as an Endpoint Security system extension (alongside Zscaler, Tanium and GlobalProtect), and its Device Control policy denies `usbmuxd` the iPhone's USB interface. The kernel signature is `IOUC AppleUSBHostInterfaceUserClient failed MACF in process pid …, usbmuxd`. Because no lockdown pairing record can be written, the phone re-prompts "Trust This Computer?" on *every* plug-in, `xcrun devicectl list devices` always says `No devices found`, and Developer Mode never appears in iOS Settings (it is gated on a completed pairing). **`npx expo run:ios --device` is therefore unavailable here** — physical-device builds go through **EAS Build → TestFlight**, which installs over the air and never touches USB. Four things were tested and are *not* the cause, so do not re-derive them: Developer Mode, a cached "Don't Trust", macOS accessory authorization, and the cable. Triage table in `README.md` under "Building onto a physical device".

**`ios/` and `android/` are generated and ignored as of 2026-08-23** (roadmap deviation #42). `app.config.ts` and the project-owned config plugins are the only native source of truth. EAS uses Continuous Native Generation for remote builds; `npm run prebuild` materialises the same inputs for local simulator/Xcode work, and `postprebuild` restores the machine-local `ios/.xcode.env.local`. Never commit or depend on a hand-edit under a generated native directory — it disappears on the next clean generation. EAS environment variables supply the JS-side `extra` and `EXPO_PUBLIC_*` values during the remote build.

**EAS guards both build inputs and generated native outcomes.** The `eas-build-pre-install` hook runs `scripts/guard-eas-build-platform.mjs`: it preserves Android's development-only boundary and rejects either missing public Supabase variable without printing its value. The iOS-only `eas-build-post-install` hook runs after dependency installation, CNG prebuild and CocoaPods, when `scripts/verify-ios-native-output.mjs` can assert the generated result: React Native is configured and actually built from source, the incompatible `React-Core-prebuilt` pod is absent, a generated target frameworks script embeds `ExpoModulesJSI.framework`, and the generated `Expo.plist` carries a working EAS Update configuration (enabled, `file:fingerprint`, zero launch wait, a real `u.expo.dev` endpoint). These lifecycle hooks replace the retired Xcode Cloud artifact guards. Do not move the outcome checks into pre-install, where `ios/` and `Pods/` do not exist yet.

**Kairo is Playful as of 2026-08-30** (deviation #58), which supersedes Sunlit's
palette and type. The block below on Sunlit is kept because its *reasoning* is
what this pass followed; only its values are stale. Same move a third time:
**every token in `src/theme.ts` kept its name and changed its value**, so around
ninety call sites re-skinned without being edited. A token names a *role*, never
a hue — `ramp.sage[500]` is a violet now and still means "your lane". Two
families are new: **gold** (earned) and **sky** (the flight). Fredoka and Nunito
replace Caprasimo and Figtree. Six things break easily:

- **A bright fill takes ink, never cream.** Sunlit's accent was amber and
  cream-on-amber was already impossible, so nobody had written it; Playful's is
  orange, which *looks* dark enough to take a cream label and measures
  **2.65:1**. Coral is 2.93 and gold is **1.52**. Four call sites shipped that
  pairing in this redesign's own first pass — the active tab pill, the board's
  day toggle, the streak chip and `CtaPill` — and every one of them rendered
  perfectly. `contrast.test.ts` now asserts the rule for every fill in the
  system *including the failures*, so a palette that later made one dark enough
  for cream fails loudly rather than silently becoming allowed. **`coralEdge`
  carries neither** ink nor cream and is pinned as such: it is a 3px lip, and
  the only wrong thing to do with it is set a word on it.
- **`Glass` is not a blur and must not become one.** `backdrop-filter` has no
  RN equivalent and `expo-blur` is a native module: it would move the
  fingerprint, spend one of the month's fifteen builds and withhold every OTA
  until that build landed. Same trade the Sky corridor already refused for
  `react-native-svg` (#56), and the reason this whole redesign shipped over the
  air. `Gradient` gained a `direction` and is now used ~20 times rather than
  twice; `experimental_backgroundImage` is deliberately unused, because its
  failure mode is a *transparent* view and an invisible active tab is worse
  than a banded one.
- **The corridor climbs now.** `sky-path.ts` went 402×520 → 393×1560 and two
  cubics became three. **`x` is no longer monotonic** — the flight weaves, and
  that assertion was replaced rather than left to rot; `dy < 0` is the
  invariant. `SkyCorridor`'s `BAND` was `0.11` of the *height*, which was the
  narrow axis when the race ran left-to-right and is the long one now: left
  alone it drew a 158pt band down a 361pt screen. Segment length is measured off
  the path now instead of approximated from the box, which is what stopped being
  right when the aspect inverted. **Nothing about the race's mechanics moved** —
  same payload, same client-side re-rank by capped steps, same derived finish
  line, same reciprocal consent gate.
- **The "Did you know?" beat is a phase of `/connect`, not a route, and its
  floor is deliberate.** It covers the real `readStepsToday` between the grant
  and the step reveal. Two things are easy to get wrong: the window opens when
  **`connectHealth` resolves, not at tap** — iOS has the permission sheet up
  during `connectHealth`, so a beat started at tap spends its whole minimum
  behind that sheet and vanishes in the frame it is dismissed — and the card
  comes down at the **later** of "minimum served" and "read finished", never the
  earlier, or a slow read hands over to a reveal with no number in it.
  `hatching-window.ts` is pure and tested on both. `trivia.ts` picks by a hash
  of the account (a `Math.random()` in a render body would swap the card's text
  mid-read, the same reason `pickQuests` is a hash) and states **no effect
  size** — every number in it is the app's own constant or the size of an
  action, and a test bans a bare `%`.
- **Onboarding is seven beats and the last one is still the name** (deviation
  #62, 2026-09-04). `/welcome` → `/one-sky` → `/mirror` → `/connect` →
  `/difficulty` → `/privacy` → `/name`. The design
  puts difficulty and privacy *after* the name, which is deviation #22's trap
  exactly. They ask before it — but `quest_tier_override` and
  `squad_data_consent_at` are in `profiles`' column-level **UPDATE** grant and
  not its INSERT grant, so there is nothing to write to until the row exists.
  `useOnboardingAnswers` holds both and the name screen writes them *after* the
  insert. Nothing is **asked** after the INSERT, the row still commits exactly
  once, and both grants are respected. Read that store before touching the flow.
  The entry moved from `/connect`, so `redirectTarget` returns `/welcome` now.
- **The run is declared once, in `src/features/onboarding/beats.ts`, and four
  numbers are derived from it.** A beat declares its **phase**; the registry
  gives it `filled`/`partial` for the rail and `index`/`count` for the paged
  dots. All four were hand-written across the screens, and both pairs had
  already gone wrong the way that invites — the dots promised three cards while
  two existed. `beat-registry.test.ts` scans `app/(onboard)/` and
  `src/features/onboarding/` and fails any screen that puts a literal back, or
  that hand-writes its button words, its skip destination, or its impression.
  **The rail measures four phases, not screens** — what this is, letting it in,
  your choices, the name — so adding a beat moves fills and partials inside one
  phase and never the segment count.
- **The difficulty beat opens with a measurement, and the tier it proposes is a
  seed rather than a rule** (deviation #63, 2026-09-04). `/connect` reads
  **fourteen complete local days** of step totals off the phone after the grant;
  `calibrateQuestTier()` in `quest.ts` medians them and proposes the highest
  tier whose entry bar the median clears; `/difficulty` states the reading above
  the choices it already renders, with the proposal pre-selected. **A new
  account is therefore no longer on Automatic by default.** Seven things break
  easily:
  - **Deviation #50 rejected the trailing median and this adopts it, and the
    two are not in conflict — a rule re-reads and a seed does not.** #50's
    argument is about a *standing* rule, whose bar rises as the player improves;
    read once into `quest_tier_override`, the same median cannot rise, because
    nothing re-reads it. `questTier()` is untouched and is still the fallback
    for accounts that predate calibration, hit `no-history`, skip the beat, or
    clear their override, and **its comment records both halves** — without that
    the code says the median was refused while the app ships it.
  - **The whole rule set is one pure function in `quest.ts`**, not a module of
    its own: it needs the tier rule *and* the catalogue, and a sibling importing
    both is an import cycle the moment either wants the result back. Threading
    `QUEST_CATALOGUE` through as an argument is the `TIER_POINTS` mistake, which
    broke an out-of-package caller at runtime rather than compile time.
  - **Today is excluded, zeroes are dropped, four qualifying days are the
    floor.** The grant is usually taken mid-morning, so a partial day drags the
    median down by roughly half a band. A zero-sum day is indistinguishable from
    a phone in a drawer or a phone bought last week, so counting them would
    median a new-phone player to the floor while the screen claims to have
    measured them — and a fortnight of zeroes is `no-history`, **never**
    Starter. `no-history` and a low proposal are different sentences and must
    stay so: one means we could not measure, the other means we did.
  - **Bands are each tier's *minimum* steps target, derived from the catalogue
    and pinned as literals by the same test.** The minimum because a tier's bars
    should be met on a good day, not already beaten on a median one; both halves
    of the guard because the derivation stops a second number describing the old
    bars and the literal stops a catalogue edit silently re-sorting every new
    account. Same arrangement `DAILY_STEP_BASELINE` has.
  - **`readDailySteps` is one daily-interval step collection and must stay
    narrow.** `readHealthWindow` over fourteen days is the obvious reuse and
    runs six hourly collections plus every workout sample plus sleep —
    including **heart rate**, owner-readable only and absent from every
    projection. Reading that much to propose a quest size would leave the beat's
    privacy claim technically accurate and morally misleading;
    `calibration-read.test.ts` scans the function body and fails if it widens.
  - **Nothing about those fourteen days leaves the phone**, and the screen says
    so. The median crosses beats in `useOnboardingAnswers` (already cleared on
    commit), is never written to `profiles`, and never enters a telemetry
    payload — a scan holds both. `calibration_completed` carries `{ outcome }`
    and **not the tier proposed**, once ever on an MMKV marker, because
    re-entering `/connect` and granting again re-runs the reading.
  - **The player's answer wins outright, and `questTierChosen` is what makes
    that true.** Pre-selection writes `questTier`, so without a flag a seeded
    value is indistinguishable from a chosen one and a second reading would
    reach two screens forward and undo a choice. No calibration *screen* is
    built: with the proposal pre-selected, "we'd start you on Steady" followed
    by "how big?" with Steady already chosen is two screens for one decision.
- **The mirror beat is third and both skip affordances land on it.**
  `onboardingSkipTarget()` derives that as the last beat of the opening phase
  rather than naming a route twice: skip's purpose is getting past the pitch,
  and the pitch *is* phase 0. Both cards used to name `/connect`, which was
  right while the pitch ended there — landing past the mirror beat would route
  the people most likely to decline around the argument written for them, on
  the beat that exists to move blame off them before the one dialog whose
  refusal cannot be undone from inside the app. The beat itself carries no
  skip. Kairo appears on it as a **pose with a heavy ground shadow** and the
  `tired` reaction still has **no producer** — sleepiness is a daily Mind state
  rather than an event, and an onboarding screen has no account state to key an
  occurrence against.
- **Each beat records one impression**, `onboarding_beat_seen` with `{ route }`
  and nothing else, emitted by `useBeatImpression` — one hook taking a beat
  name, which is what makes "the route name only" true by construction rather
  than by review, since `/connect` is holding today's step count while it
  reports. **Unguarded, on mount**: the run happens once per account, so the
  funnel is honest with no marker store and a back-and-forward duplicate is
  absorbed by counting distinct beats. `userId` is deliberately **not** an
  effect dependency — it resolves a frame late and a dep fires the beat twice,
  once buffered and once live, which is the one duplicate that is not a person
  navigating. The hatch reports nothing; it is a phase of `/connect`, whose own
  impression covers the moment.
- **The disclosure gate did not move, and Today's hero is where it nearly
  did.** The three glass stat coins on the sky are the same
  `ratingForStatPoints` over the same lifetime rollups the You tab's rail reads,
  so they carry the same `full` gate — an ungated copy on the screen a brand-new
  account opens first would have undone deviation #37 by the back door. The
  sleep and lane tiles are the Strain/Sleep rows in a fourth dress and keep
  theirs. Quests, the hero, the race line and the Daily Walk stay ungated.
- **One icon family.** The Feather/MDI split (hairline = things you operate,
  solid = things you are) is **retired**. Its stated reason was that a hairline
  glyph beside a fat display numeral reads as a clerical annotation; Playful
  sets the whole surface in that register, so the reason points the same way and
  the surface it points at changed. All six Feather call sites moved.
  Reintroducing a second family is a design decision, not a convenience.
  Relatedly, `STAT_COLORS` **reverses** Sunlit's "no per-stat hue" rule: a Flock
  row carries four stat figures at 11pt with no words beside them, and shape
  alone does not separate three things at a glance. The hues are not new ones.

**`Screen bleed` hands the top inset back, and forgetting it is invisible until
somebody looks at a device.** Three of the four bleeding surfaces re-applied it;
`ProfileHeader` did not, so the You tab drew its handle under the clock and its
gear inside the Dynamic Island's cutout — where the only route to Settings could
not be tapped. Nothing errored and the screen was recognisably itself apart from
one row. `src/ui/bleed-inset.test.ts` now scans every `<Screen bleed>` for an
`insets.top`, following one level of imports because the header component is
usually what pads rather than the route file. It was verified against the real
bug: reintroduce it and the test names `app/(tabs)/profile.tsx`.

**The Sky flock rail is one row with exactly one trailing slot.** It used to
draw a dashed seat per unfilled place — five circles for a squad of one, which
wrapped to a second row and read as five separate things to do rather than as
one invitation. Four roster slots then one trailing slot, which is the invite or
an overflow `+N`, never both and never none. `MAX_SLOTS`/`SEAT` are a real width
budget (320pt screen − rail inset − padding = 260pt; 5×46 + 4×6 = 254), and
`flexWrap` is deliberately **absent**: this has to fail by clipping, which is
visible, rather than by wrapping, which is what it did and what looked like a
design. Withheld members sort last, so the row never drops a bird that has a
position in favour of one that does not.

**The Flock band names the day's leader** from `rows[0]` — no extra request, and
**ordered by the board rather than by the race**: `squad_leaderboard()` sorts by
the program-weighted total (deviation #11), so the name on the band is the top
of the rows beneath it. The Sky corridor re-ranks the same payload by capped
steps and can legitimately name somebody else; two races, each screen naming its
own. It follows `mode`, so a finished day reads "won the day" rather than the
live "is ahead" — the same class of care the completed board takes with the
streak figure. Guarded on two or more rows, because "you are ahead" in a squad
of one is the app congratulating somebody for being alone.

Also in this pass: **Settings is its own screen** (`/settings`, behind the gear
on You) — a move, not a feature; quest difficulty, timezone, notifications, sign
out and delete account were loose at the foot of a two-and-a-half-screen tab.
**`src/theme.ts` is the only file that may name a typeface**, which was not being
kept — seven call sites still said `'Figtree-Bold'` as a string literal, and RN's
answer to an unknown family is a silent fallback to the system face, invisible on
a simulator that has the old font and visible only on a clean device.
`type-faces.test.ts` scans for it and also checks every named face is actually
loaded and present on disk. **"Dress your Kairo" is deliberately not built**:
`character-assets.ts` says the cosmetic PNGs are flattened full-character
previews, not composable layers, so a four-slot tray has no assets behind it.

**This whole redesign shipped over the air, and that was verified rather than
assumed**: the tree's fingerprint is `324fba3e`, byte-identical to the last
build's. Fredoka and Nunito are copied into `assets/fonts/` and loaded through
`useFonts`, *not* added as npm dependencies — `package.json` is a fingerprint
input and adding two lines to it would have cost one of the month's fifteen
builds to ship a font.

**Kairo is Sunlit as of 2026-08-27** (deviations #53, #54). The palette shifted
in place — every token in `src/theme.ts` kept its name and changed its value, so
around ninety call sites re-skinned without being edited. The tabs are
**Today · Sky · Flock · You**, flat, and the character tab is gone. Three things
break easily:

- **`colors.accent` is a fill and never text.** It is `#f5a623`, which measures
  **1.9:1** on the cream ground — invisible, and it renders perfectly while
  being so. The terracotta it replaced measured 4.7:1 and could do both jobs,
  which is why 53 call sites had to be classified by hand rather than
  find-and-replaced: the prop is named `color` whether it is `<Meter>`'s fill or
  `<Feather>`'s ink. Body-size accent text is **`colors.accentDeep`**; large
  display type is **`colors.accentInk`** (3.3:1, so 24pt and up only). The guard
  is `src/ui/contrast.test.ts`, which asserts `accent` *fails* as text — so the
  test goes red if the value ever drifts back into a range that would tempt
  somebody.
- **The ramps' step contract is ink strength, and 37 call sites depend on it.**
  200 is a wash you set text on, 500 is a fill, 700 and 800 are inks.
  `ramp.accent[700]` in particular must stay at or above 4.5:1 on `colors.bg`,
  because `Label`'s accent eyebrow is 10pt and reads it — that is why the
  design's own `#c9721c` is *not* a ramp step but a separate large-text-only
  role. Change a step's strength and every site reading it goes wrong at once,
  silently.
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
- **Onboarding is `/connect` → `/name`, two screens.** The picker sat between
  them. This *removes* a step, so deviation #22's rule is strengthened rather
  than merely respected: the profile row still commits exactly once, on the last
  screen. Add onboarding steps **before** the name, never after — anything after
  the INSERT flips `resolveRoute` to `'ready'` under an unfinished screen and
  needs the deleted `finishingOnboarding` flag back.
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

**Kairo had four tabs from 2026-08-25 to 2026-08-27** (deviation #50) — Character · Today ·
Squad · You. The Today tab is the present moment: a race summary card, three
quests, the Daily Walk and the Challenge door, in that order. The character
screen kept its hero, `TodayPanel`, `SyncStatus` and the disclosure note and
shed the other two. Six things break easily:

- **`TabPill` is hand-built and its geometry is load-bearing.** Orbits are 52,
  the centre is 68, the bar gap is `space.md`: `3 × 52 + 68 + 3 × 16 = 272`
  against 320pt on the narrowest supported screen. `NAV_HEIGHT` stays 96, so
  `TAB_PILL_CLEARANCE` is unchanged — the discs got smaller, not the bar. Order
  is `['squad', 'index', 'today', 'profile']` so Squad stays leftmost and You
  stays rightmost and **no existing thumb target moved to the other end**.
  **The character keeps the raised disc and is no longer geometrically
  centred**: raised means *anchor*, not *middle*, a raised third-of-four would
  be arbitrary, and two raised discs is no anchor at all. Do not add a second.
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
- **The disclosure gate keeps the stat rail, the Strain/Sleep rows,
  `TrainEntry` and `/train`'s redirect** — the list is now written down in
  `useDisclosure`'s doc comment, because it never was, and that is what let a
  wider reading look plausible. Quests are built outside it; **nothing was
  taken out of it**. The constant, the `total > 0` filter, the
  `resolved && stage` navigation rule and the retention measurement are all
  unchanged. The Challenge door is last on the tab deliberately: a hidden card
  at the bottom leaves no hole, where one removed from the middle would.
- **The Today tab adds no requests.** Every hook on it resolves to a key the
  character or squad screen already uses, so the two cannot disagree in one
  frame. `RaceCard` re-ranks the board payload by capped steps on the client,
  exactly as `RaceTrack` does — `squad_leaderboard()` orders by the
  program-weighted total, and ranking once in SQL silently deletes the program
  feature (deviation #11).

**The squad board was a race from 2026-08-26 to 2026-08-27** (roadmap
deviations #46, #47; the six lanes are superseded by #56 above).
The daily leaderboard became a track: six characters running horizontal lanes
at one shared flag, drawn over the same payload the board already fetched.
Nothing about the scoring engine changed. Five things break easily:

- **`RACE_FINISH_LINE` is `DAILY_STEP_BASELINE`, derived and never a literal**,
  so crossing the line *is* clearing the Daily Walk — one number, two readings,
  social here and personal in the streak. `10_000` must not appear in
  `packages/kairo-core/src/race.ts` or in `src/features/squad/Sky*.tsx`. The
  race is clear of the `AGI`/`AGI_base` trap **only because it never reads a
  tier**: it takes raw steps from the widened projection. Anything that later
  decides "did they cross the line" from `daily_scores.tiers` must read
  `tiers->>'AGI_base'`, or the flag moves with the user's active hours.
- **The cap *is* the anti-cheat.** `cappedSteps` stops at the line, so past it
  extra steps buy nothing — which restores the resistance the tier ladder
  already had and a raw-step race would have given away. It also means two
  active people are tied on the primary key **by construction**, so the
  tie-break through daily score and then `user_id` is the common path, not an
  edge case. Drop the `user_id` key and the board twitches on every poll.
- **`squad_leaderboard()` orders by the weighted total, not by steps.** The
  race re-ranks on the client — two orderings, one payload, and a schema test
  pins it on a fixture where the two genuinely disagree. Ranking once in SQL is
  the obvious "improvement" and it silently deletes the program feature
  (deviation #11).
- **The consent gate is reciprocal and per row**, refining the parent spec's
  whole-squad rule: whole-squad gating leaks the holdout's decision to the five
  people who agreed. `useSquadDataConsent` exposes **`isSuccess`** and callers
  must use it — a query in flight reads `false`, indistinguishable from a
  refusal (deviation #37's lesson again). Gate on `isSuccess && !consented`,
  and put the early return **below every hook**: above one it is a conditional
  hook and the count changes the frame consent lands. A row whose `steps` is
  null keeps its lane with no position; dropping it looks like the member left,
  and drawing it at zero invents a bad day. **The privacy policy and the App
  Store privacy answers are not yet updated, and that is a launch blocker** —
  guideline 5.1.3.
- **A lane is one accessibility element and needs both halves** of the
  2026-08-14 grouping fix, and the whole track is **flow-based** — the figure
  is placed by two flex spacers, and `flex: 0` on either is the bug (it refuses
  to shrink as well as to grow, so the figure is squeezed at 0% and 100%). The
  finish line is drawn per lane as a right-edge rule with **no vertical gap
  between lanes**, so the segments abut into one continuous line; adding a
  `gap` or a `marginBottom` there breaks the one picture that makes this a race
  rather than six bars.

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
- **A migration touching a table an Edge Function writes ships with that function's redeploy.** Applying one without the other took scoring down for two days in August 2026: `remove_sabotage` dropped `daily_scores.sabotage_delta`, the deployed `sync-health` kept sending it, and because its bucket upsert commits *before* the score upsert, health data kept landing while nothing scored. Every test passed the whole time — they check the source, not the deployed artifact. Two guards now exist and both matter: the schema suite inserts `planDay`'s **real output** into `daily_scores` (so drift fails at commit time), and `supabase/scripts/smoke-sync.mjs` runs a real sync against the deployed function (so drift fails at deploy time). Run the latter after every deploy. Full post-mortem in `docs/qa/kairo-end-to-end-qa-report.md`.
- **Sign in with Apple has two halves the repo cannot see.** The app side landed 2026-08-12 (`appleProvider` in `src/features/auth/providers.ts`, `usesAppleSignIn` in `app.config.ts`, Apple's branded button on `app/(auth)/sign-in.tsx` — required by their HIG, so do not swap it for Kairo's `Button`). The other two halves live outside git and fail silently: the **Sign in with Apple capability on the App ID**, whose absence is indistinguishable from a device not signed into an Apple ID, and the **client secret**, an ES256 JWT that Apple caps at ~182 days and that takes sign-in down for every user at once when it lapses. `npm run apple-secret` mints and installs it and prints the expiry — diary that date. The nonce is load-bearing: `signInAsync` gets the SHA-256 hash, `signInWithIdToken` gets the raw value, and sending the hash to both makes gotrue hash a hash. Runbook in `docs/sign-in-with-apple.md`. `external_anonymous_users_enabled` stays `true` on the project on purpose — the `__DEV__` guard in `availableProviders()`, not the project setting, is what keeps anonymous out of TestFlight.
- **Every request has a deadline, because a hung request is worse than a failed one.** `supabase-js` sets no timeout and neither does `fetch`, so a **black-holed** host — DNS resolves, the TCP connection never completes — yields a promise that never settles. On 2026-08-14 a WiFi network began blocking `*.supabase.co` that way and the app sat on the KAIRO hold overlay permanently, surviving relaunches *and* a reinstall from TestFlight: `resolveRoute` reports a query with no data as `'loading'`, so the `'profile-error'` cover with its "Try again" button was already built and unreachable, because nothing ever errored. `src/lib/fetch-timeout.ts` is wired into `createClient`'s `global.fetch`. It **races** a deadline against the request rather than only aborting, since aborting merely asks the transport to reject and this exists for the case where the network layer is misbehaving; the abort still fires, to free the socket. Diagnostic worth reusing: `curl -w 'connect=%{time_connect}s'` showing DNS resolved but `connect=0.000000s` is a block, not an outage — and check the Management API separately, since `api.supabase.com` is a different host and stays up while the project's own subdomain is unreachable.
- **TanStack Query does not know what offline means on a phone unless told.** Its default online detection is the browser's `online`/`offline` events, which React Native does not have — so without wiring it believes it is permanently online, and a query fired with no signal spends `retry: 2` immediately and lands in an error state instead of pausing. `src/lib/query-client.ts` wires `onlineManager` to NetInfo using **TanStack's documented recipe unmodified** — `Boolean(state.isConnected)`. It briefly read `isInternetReachable` instead, on the reasoning that a captive-portal wifi is "connected" and cannot reach Supabase. True, but the wrong trade: that field is NetInfo's own probe against an unrelated third-party endpoint, so a network blocking *the probe* while Supabase works reports offline forever, and paused queries never error — the same endless spinner as above. Prefer the false positive that fails loudly over the false negative that hangs; `fetch-timeout.ts` covers the captive-portal case. Do not "improve" on the documented recipe here again.
- **Push has a client half that was missing until 2026-08-14, and a credential the repo cannot see.** The server had been sending a deep-link payload — `{trigger, localDate, screen}` from `dispatch-notifications`, plus `eventId` from `finalize-days` — since the notification engine shipped, and **nothing read it**: no `setNotificationHandler` (so a foreground push displayed nothing at all, which reads exactly like push being broken) and no response listener (so a tap went nowhere). `src/features/notifications/routing.ts` is the fix and follows the house split — `notificationTarget()` decides and is tested in Node, `useNotificationRouting()` performs. Three things there are load-bearing: `screen: 'character'` maps to **`/`**, not `/character`, which is the *onboarding* body picker; the hook is mounted in `app/(tabs)/_layout.tsx` because that layout only exists for a `'ready'` user, so mounting **is** the gate; and both `useLastNotificationResponse()` and the response listener are wired, because a tap that launches the app from terminated is retained by the former and never emitted to the latter. The credential is the **APNs key uploaded to Expo** (`eas credentials`) — same failure shape as the Apple client secret, invisible in git, and a send without it returns a ticket error rather than doing nothing.
- **`aps-environment` is generated from Expo config.** Expo's notifications plugin defaults it to `development` (the APNs sandbox), so `app.config.ts` declares `['expo-notifications', { mode: 'production' }]` explicitly and EAS CNG carries that into the distribution entitlement. Never patch the ignored generated entitlements. Do not treat the declaration as proof push works: Expo's service relays to both environments. **And do not try to read the value back on TestFlight** — `expo-application` parses `embedded.mobileprovision`, App Store distribution strips that file from the bundle, and the answer is `null` there structurally (the library's own `appReleaseType` has an explicit branch for the file's absence). A diagnostic built on it shipped on 2026-08-14 and told a healthy TestFlight device it was a simulator. What `NotificationSettingsCard` reports instead is **registration**, which is knowable everywhere and the stronger signal anyway: `getExpoPushTokenAsync` fails with *"no valid aps-environment entitlement string found"* when the entitlement is wrong, so a token that exists is evidence the entitlement is right. Simulator is decided by the release type, never by a null environment. The line ships in **Release** on purpose — `__DEV__` would hide it from TestFlight.
- **The app icon is an Icon Composer bundle, and nothing in JS validates it.** `assets/Kairo.icon/` holds a *transparent* terracotta symbol plus an `icon.json` declaring the cream ground as `fill`; iOS renders the light, dark and tinted appearances from that one layered source, which is what a flat PNG cannot do. Four things break it silently. **It must sit on `ios.icon` as a plain string** — `@expo/prebuild-config` warns and falls back if a `.icon` path is given to the *root* `icon` field or to the light/dark/tinted object form, so the root `icon` stays a PNG serving Android, web and pre-iOS-26. **Expo copies the directory verbatim** into `ios/<App>/Kairo.icon` and sets `ASSETCATALOG_COMPILER_APPICON_NAME`; the schema is Apple's and is only ever checked by `actool` at Xcode/EAS build time, so a malformed edit passes `prebuild` and every local check and fails in CI — the `aps-environment` failure shape again. Validate locally instead of guessing, with `mkdir -p /tmp/out && xcrun actool --compile /tmp/out --platform iphoneos --minimum-deployment-target 26.0 --target-device iphone --app-icon Kairo --output-partial-info-plist /tmp/out/p.plist assets/Kairo.icon` (the `mkdir` is load-bearing — `actool` errors rather than creating the output directory), which exits non-zero on a bad schema and otherwise writes the real rendered PNGs — the only way to *see* the glass treatment without a device. **`fill` colours are `<colour-space>:r,g,b,a` floats, not hex** (`extended-srgb:0.96078,0.91765,0.84706,1.00000` is `colors.bg`). And **the basename is the icon name**, so renaming the directory renames the build setting. **Editing the artwork without editing `app.config.ts` leaves the native copy stale and silent** — `npm run ios` does not re-sync `ios/Kairo/Kairo.icon`, because the config *value* is unchanged and only the bytes it points at moved, so the build succeeds against the previous icon (hit on 2026-08-25: the simulator kept rendering the ink mark after the terracotta one was installed). After changing icon artwork run `npx expo prebuild -p ios --no-install`, then `xcrun simctl uninstall` before reinstalling, since SpringBoard caches icons across reinstalls — and diff the native copy rather than trusting the build. **The Dark appearance is auto-derived, which constrains the symbol colour** — with one layer declared, iOS darkens the cream ground and keeps the symbol unchanged, so the symbol has to work on both. That is why it is terracotta (`colors.accent`) and not the far higher-contrast ink (`colors.text`): ink measured 13.95:1 on cream but **1.00:1** on the darkened ground, invisible, confirmed on the simulator 2026-08-25; terracotta reads 3.03:1 and 4.60:1, and Dark was then checked by hand and reads correctly. Darkening the symbol for a punchier Default silently destroys the Dark appearance. The override mechanism is the `*-specializations` family (`fill-specializations`, `image-name-specializations`, `glass-specializations`, …) keyed by `light-color` / `dark-color` / `dark-tint` / `dark-clear`, but **do not hand-write it from that vocabulary**: an invented nesting is a silent no-op, proven by pointing a specialization at a nonexistent file and still getting exit 0, where the same trick on the *primary* `image-name` fails the build. Author it in Apple's Icon Composer, which writes canonical JSON, or pick a mid-tone symbol that survives both grounds. And note `actool` is **nondeterministic** — identical input yields different `Assets.car` digests — so diffing the compiled output cannot tell you whether an edit landed. The fallback `assets/icon.png` has its own trap: it carries **no alpha channel** (PNG colour type 2), because Apple rejects an App Store icon that has one even when every pixel is opaque (ITMS-90717, raised at upload rather than at build) — most re-exports silently add it back, so check with `sips -g hasAlpha`.
- **The HealthKit disclosure is derived, not written.** `src/features/health/read-types.ts` is the single list of requested types; `disclosure.ts` maps each to user-facing copy, and `disclosure.test.ts` fails if either side names something the other does not. That list lives apart from `permission.ts` because anything importing `@kingstinct/react-native-healthkit` drags in React Native's Flow syntax that root Vitest cannot parse — the same constraint `sync-state.ts` records. The `NSHealthShareUsageDescription` string in `app.config.ts` covers the same types and is the one half no test can lock; update it by hand when the list changes.
- **Telemetry's decisions live in zero-import modules, for the same parse-failure reason as the HealthKit disclosure.** `src/features/telemetry/buffer.ts` (the pre-sign-in event queue) and `milestones.ts` (the once-ever rule) import nothing, so root Vitest — no `@/` alias, no MMKV — can load and test them directly; the MMKV-backed store and the Supabase write sit in separate files that pull those dependencies in. `first_sync_seen` and `first_score_seen` are gated on an MMKV once-ever marker in `milestone-store.ts`, claimed before the write and released via `markUnreached` if it fails — **not** the per-session marker `useAppOpenTelemetry` (`src/features/notifications/useNotifications.ts`) uses, which fires every relaunch on purpose and would silently overcount activation if reused here. `public.kairo_retention()` is admin analytics with EXECUTE revoked from `public`, `anon` and `authenticated` — it is run through `remote-sql.sh` against the live project, never from a client. Runbook: `docs/beta-measurement.md`. **Deviation #59 adds four types with three different lifetimes**: `today_seen` and `next_step_shown` are **once per the account's own local day** on `daily-marker.ts` (`ALL_MARKERS` grew with them, so `clearDailyMarkers` still reaches everything on sign-out); `today_details_opened` is **per tap**, because the question is how often the complete day is actually wanted; `character_reaction_seen` is **per occurrence**, emitted from the hook that presents the reaction rather than from a render. **Every payload is category-only** — `{ category }` of `motion`/`body`/`none`, or `{ kind }` — and no payload may carry a health figure, an occurrence id, a quest id, **or the Motion location**, because a five-band location is a coarse step count. `living-mirror-events.test.ts` scans `app/(tabs)/index.tsx` for all three bans. **`onboarding_beat_seen` is a fourth lifetime** — unguarded, once per beat mount, carrying `{ route }` and nothing else; see the onboarding block above for why it needs no marker store and why `userId` must stay out of its effect deps. **`calibration_completed` is a fifth**, and takes the opposite decision for a stated reason: it is **once ever** on an MMKV marker (`calibration_recorded`, added to `ALL_MILESTONES` so `clearMilestones` reaches it), because the reading it reports re-runs whenever `/connect` is re-entered and granted again, so unguarded its denominator would count taps rather than accounts. Its payload is `{ outcome }` — `proposed` or `no-history` — and carries neither the median nor **the tier proposed**, which would be a distribution of the cohort's fitness sitting in `app_events` to answer a question nobody asked. It is built inside `runCalibration` rather than at the call site, so no screen can reach it.

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
