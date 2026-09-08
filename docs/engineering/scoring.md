# The scoring engine — the reasoning

Extracted verbatim from `CLAUDE.md` on 2026-09-08 to keep that file inside its
size limit. **The rules still live in `CLAUDE.md`** (search "Kairo scores three
stats"); this file is the *why* behind them — what each pass moved, what it
retired, the double-counts a well-meaning change would reintroduce, and the
replay licence each one spent.

Covers deviation #41 (three stats, 2026-08-20), the 2026-08-29 Body/Motion/Mind
pass and its three phases, deviation #51 (surface names, 2026-08-25), deviation
#68 (a rested night lowers Body's bands, 2026-09-08).

Design: `docs/superpowers/specs/2026-08-29-body-motion-mind-design.md`.
Vocabulary: `CONTEXT.md`. Replay licence:
`docs/adr/0001-replay-compatibility-expires-at-launch.md`.

---

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

**A rested night lowers Body's bands, as of 2026-09-08** (deviation #68,
issue #29). `restedShift` in `packages/kairo-core/src/shifts.ts`, routed to
`STR` by `statShifts`, which now takes a **required** `sleepMinutes`. Zero below
`MIND_THRESHOLD_HOURS.gold` (7h), a ramp to `MAX_RESTED_SHIFT` (half
`MAX_THRESHOLD_SHIFT`, 12.5%) at eight hours, held to `MIND_OVERSLEEP_HOURS`,
and past that **`mindPoints` itself, scaled** — so the taper's shape, its end
and its floor are all Mind's own and cannot drift from them. At the peak Body's
Gold moves 400 kcal to 350. Seven things break easily:

- **Body, and never Motion, and that is the whole decision.** Motion's shift
  already reaches the 0.25 cap at eight active hours, so an additive rested
  shift there would be a no-op for exactly the players who sleep well *and* move
  all day — invisible to its own best case. Body's shift was a hard `0`, so
  there is no cap collision, no interaction with the spread shift, and no second
  reason to reason about `AGI` against `AGI_base`. The Daily Walk, the ridge and
  the race are untouched **by construction rather than by care**.
- **The proof is through `computeDailyScore`, never through `tierFor`.**
  `tierFor` *is* `shiftedTierFor(stat, raw, 0)` — the one path where a shift is
  absent by definition — so a guard written there passes however wrong the
  scored day becomes, which is exactly how the `AGI`/`AGI_base` divergence got
  through review once. `scoring.test.ts`'s "a rested night against Body" block
  sweeps five active-hour counts against five step totals and asserts Motion's
  tier, unshifted tier and points are all identical with and without a night.
- **One signal, one place.** Sleep scores Mind from its raw value and shifts
  Body's bands. It must never shift **Mind's own** bands — that is the retired
  `workoutShift` double-count in a new dress — and it must never touch **Body's
  raw value**, where `STRENGTH_MINUTE_KCAL_CREDIT` already lives. Verified
  minutes and a night are two signals with two mechanisms and no overlap; route
  either through the other's and the double-count returns exactly as it was.
- **Wearable-gated by the value, not by a second condition.** `sleepMinutes` has
  already passed the trust gate (`scoringSleepMinutes` on the server,
  `scoredSleepMinutes` on the client), so a phone-only account and a hand-typed
  night both arrive as `null`, take a zero shift and meet no sentence. That is
  most of the Philippine market, and it is a stated cost rather than a gap:
  write it down rather than letting the cohort discover a stat that does nothing
  for them.
- **`statShifts`' `sleepMinutes` is required and must stay so.** A default would
  make "this account has no wearable" and "this caller forgot" the same silent
  answer on the path that decides how a day is scored — `planDay`'s
  `earnableStats` trap in a new place. Two callers: `computeDailyScore` and
  `stat-detail.ts`, and the second matters, because quoting Body's *published*
  ladder to a rested player is the same bug the spread shift already caused on
  Motion.
- **Nothing new is stored.** `daily_scores.tiers` keeps `AGI_base` and gains no
  `STR_base`: only the Daily Walk asks the unshifted question, and Body has no
  public-health floor to protect. No migration, no constraint change — a shift
  lowers a band and never raises what a band pays, so `MAX_DAILY_SCORE_*` and
  `contributing_stats` are unmoved.
- **`topBandFor(stat, shift)` is the only way a threshold leaves the engine**,
  and it exists so `restedLine` can compute its discount without `400` being
  written down outside `THRESHOLDS`. Top band only — Bronze and Silver reach
  surfaces through `nextTierFor`, as a distance from a real reading rather than
  a bare number.
- **The visible half is one sentence and it is not a new state.** `restedLine`
  in `kairo-voice.ts` — *"Slept 8 hours — Body tops out 50 kcal sooner today."* —
  rendered as the last row of Today's details **Body** section, beside the
  Motion section's `spreadLine`. It reports the *discount*, never the moved
  figure, for `spreadLine`'s reason, and reads the night through `durationWords`
  so the sentence and the Mind row cannot render one night two ways. It does
  **not** give the `tired` reaction a producer: `SleepState` already has one and
  already draws art.
- **It moved stored history, so all five Edge Functions redeployed together and
  a `replay-scores` pass ran in the same deploy**, under ADR-0001's 2026-09-06
  amendment — the project held 4 profiles and 30 scored days, well inside the
  amended licence. Past roughly fifty accounts or sixty days the original rule
  returns: a migration that rescores, or it does not ship. **`REPLAY_SECRET` is
  minted for the pass and unset after it**; the function itself has been
  deployed the whole time (the roadmap's "deleted at step 11" is corrected in
  place), so the secret's absence is what actually shuts that door.
- **That replay moved ten of thirty days and only three of them were this
  change's**, which is worth knowing before the next one. The other seven were
  **August days still carrying the pre-2026-08-29 lookup engine** — the
  interpolation pass changed `statPointsFor` and nothing ever replayed the days
  scored before it, so 2026-08-22 moved 3,300 → 4,172 and 2026-08-23 moved
  0 → 255 for reasons that have nothing to do with sleep. `xp_awarded` and
  `finalized_at` did not move on any row, so no level or settled competition
  changed. The lesson is the ADR's own, in a place it did not look: a licence to
  move stored history is not a licence to *leave* it moved, and a replay skipped
  at the time is a silent divergence that the next replay pays for in one lump,
  attributed to whatever change happened to trigger it.

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
  rather than kept alongside. `statShifts` took **only `activeHours`** and
  `STR` was a hard 0 in it until deviation #68 (2026-09-08) gave Body the
  *night's* shift — which is not this arrangement returning, because sleep
  touches Body's raw value nowhere; route verified minutes back through
  `statShifts` and the double-count is exactly as it was. AGI's spread shift is
  untouched and is *not* the same arrangement either: different signal,
  different stat, no double-count.
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
- **All deployed Edge Functions redeploy together.** `sync-health`,
  `finalize-days`, `replay-scores` and `dispatch-notifications` all bundle
  either `core.ts` or `rescore.deno.ts` — and so does `seed-health`, which
  **has been deployed the whole time this file said it was not.** The
  2026-09-02 undeployment was written down and never run; `functions list` shows
  it ACTIVE since the 2026-08-29 batch, and deviation #67 makes deployment the
  right state anyway. It is one of **five** that redeploy together, not four.
  Deploying only `sync-health` leaves
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
because Body had a shift the screen could not measure. Do not reintroduce them:
Body has a shift again since deviation #68, and it is **measurable** — the night
is a value the screen already holds and passes to `statShifts`, so Body is quoted
from the ladder the scorer used. What those 137 lines existed for was a shift the
screen could not see, and no such shift exists.

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
