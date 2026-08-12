# Kairo End-to-End QA & MVP Critique

**Test date:** 11 August 2026 (Asia/Manila)  
**Environment:** iPhone 17 Pro simulator, iOS 26.1, Xcode 26.1.1, Debug build, live Supabase-backed development account  
**Test data created:** character `QaAeon0811`, squad `QA Runners 0811`, squad goal `QA Move 1000`  
**Repository state:** no source files changed; Git worktree remained clean

## 1. Executive Summary

Kairo is **not ready for a wider MVP release**. The single biggest risk is absolute: release builds expose no sign-in provider, so the TestFlight build cannot acquire a session; the working anonymous entry is compiled into development builds only. Behind that blocker is a serious Health trust/integrity problem: the app requests more sensitive Health types than its disclosure names, keeps showing revoked cached data as current, and did not reconcile newly seeded activity until a cold launch. The narrow current beta—solo character, squad creation, leaderboard, and shared goal—has a coherent visual shell and survived the session without a crash, but much of the supplied launch proposition (character morphing/gear, referrals, sabotage, and monetization) either has been removed or is intentionally not built.

## Test coverage and constraints

- Built and launched the app, signed out, entered as a new development user, selected a character, named it, and completed onboarding.
- Exercised Character, Profile, Health data, squad create, program selection, invite-code display, leaderboard Today/Yesterday, shared-goal create/detail, leave-squad warning, and development demo/Health seeding controls.
- Revoked and restored Apple Health Steps and iOS notification permissions while the app was installed; force-quit and relaunched several times.
- Ran the full automated suite: **916 tests passed** (297 core tests + 619 schema/planner tests). TypeScript and Edge Function type-checking passed.
- A clean isolated Xcode build succeeded. Xcode's normal Run path also exposed the build-environment defect documented under Stability.
- A second real account/device was unavailable, so invite redemption and multi-member live ranking could not be completed. Poor/no-network and long-duration battery tests were not run because they would require changing the host's network or a multi-hour physical-device session. The simulator had already recorded the initial Health and notification permission decisions, so the native first-request dialogs could not be replayed without destroying the anonymous test identity.

## 2. Feature-by-feature findings

### 1) Onboarding & Account Setup — **3/10**

**Flow walked**

1. Opened Profile and signed out of the existing development session.
2. From the Kairo gate, tapped **Enter the gate**; development anonymous sign-in succeeded.
3. Selected the male character. Continue correctly remained disabled until a character was selected.
4. Entered `QaAeon0811`. Begin correctly remained disabled until the field contained a valid value.
5. Landed on Character without joining a squad. Force-quit/relaunch preserved the account, character, and name.
6. Opened body metrics, tried height `0`, and received the correct inline error: “Height must be between 50 cm and 260 cm.”

**Bugs and friction**

- **Release blocker:** `src/features/auth/providers.ts:41-42` returns the anonymous provider only under `__DEV__` and an empty list in Release. `docs/roadmap.md:135` still marks Sign in with Apple as blocked. The working flow therefore cannot reach TestFlight.
- **App Store blocker:** there is Sign out but no in-app account deletion. The project design explicitly says the required backend deletion path is missing (`docs/superpowers/specs/2026-08-01-solo-mode-and-profile-design.md:113-115`).
- The app's purpose is not clear within the first minute. “Every day is a Kairo moment,” character selection, and naming communicate RPG progression, but not the central “health activity + barkada competition” loop. The Health sheet explains this later.
- The solo path is real and usable; no squad gate blocked onboarding.
- Body metrics displayed blank values, but Edit opened with 170 cm / 65 kg / 1995 defaults. A user can accidentally save invented health data.

**Recommendations**

1. Ship and test Sign in with Apple in an actual Release/TestFlight build, including first login, relaunch, token refresh, sign out/in, and account recovery.
2. Add in-app account deletion with a clear consequence screen and backend cascade verification before external distribution.
3. Add one concise first-minute value statement: “Apple Health powers your character; a squad of up to six competes on daily scores.” Do not prefill missing body measurements with plausible-looking data.

### 2) Core Stat Tracking — **3/10**

**Flow walked**

1. Inspected all four stat explanations: AGI = steps/distance, STR = active calories, END = active minutes, VIT = hourly movement.
2. Used **Seed Apple Health (dev)**. The app confirmed 11,000 steps across ten hours and said it was syncing.
3. Checked Character immediately and after about ten seconds: values remained unchanged.
4. Force-quit/relaunched: Health totals then jumped; repeated seed runs eventually displayed 44,000 steps, 33.00 km, 1,040 kcal, 0 active minutes, and 7h sleep.
5. Opened demo stat detail: independent contributions were visible as AGI +1,850, STR +1,240, END +980, VIT +700, plus consistency/recovery.
6. In iOS Settings, revoked only **Steps**, returned to Kairo, then force-quit/relaunched. Kairo continued to display the cached 44,000 steps with no warning or freshness marker. Restored the permission afterward.

**Bugs and friction**

- **Broken freshness:** new Health data did not appear on the mounted screen within a sane refresh window; it appeared only after a cold launch in the observed flow.
- **Broken reconciliation:** the live account showed 44,000 steps, 33 km, and 1,040 kcal while daily score remained 0, character ability ratings remained 1, and the player was “1st · leading.” Raw activity, score, progression, and ranking contradicted one another.
- **Silent revocation/staleness:** after Steps was revoked, Kairo continued presenting the old number as current. There is no “last synced,” permission status, stale badge, or settings recovery action. HealthKit cannot reveal read authorization directly, but Kairo can still show read/sync outcomes and freshness instead of implying success.
- **Privacy disclosure mismatch:** the in-app copy says Kairo reads steps, distance, active calories, and active minutes. iOS showed it also requesting Sleep, Heart Rate, Resting Heart Rate, and Workouts. The source confirms all eight types in `src/features/health/permission.ts:21-34`. This is a material trust problem for a health app.
- Sync failures are stored and retried internally, but the mounted UI consumes no failure state. Offline/server failures therefore have no user-visible explanation.
- Bronze/Silver/Gold are not visible. This is intentional roadmap deviation #23, not an accidental rendering bug, but it directly fails the supplied checklist and makes daily scoring harder to audit. The demo proves independent stat scoring; the live UI does not explain its thresholds.
- Stationary-day behavior was represented by zero active minutes, but a full physical day was not elapsed. Airplane/no-network behavior was not safely executed on the host.

**Recommendations**

1. Make the Health pipeline observable: show last successful sync, syncing/failed/stale states, manual retry, and foreground reconciliation; invalidate and refetch the displayed raw totals as part of the same successful sync.
2. Add invariant monitoring/tests so non-zero landed buckets cannot leave score, ability totals, and leaderboard mutually inconsistent. Re-run this scenario against production-like data.
3. Rewrite the permission disclosure to name every requested type and its purpose, or remove Heart Rate/Resting Heart Rate/Workouts until their anti-cheat value justifies the extra access. Expose threshold progress in plain units even if medal names remain internal.

### 3) Character System — **4/10**

**Flow walked**

1. Selected a character during onboarding and reviewed the Character home at zero and seeded activity states.
2. Expanded stat detail and inspected level, XP, score, guidance, raw metrics, and ability ratings.
3. Looked for customization, equipment, preview, earning, and gear slots across Character and Profile; none exist.

**Bugs and friction**

- The single Hunter illustration is attractive and consistent with the palette, but it is a static/placeholder presentation. Stat changes did not morph the character.
- There is no equipment system for Chest, Shoulders, Bracers, or Weapon, and no gear earning/equipping/preview flow.
- There is no Rive-driven character animation to assess. No stutter occurred because the central character is not delivering the promised animated behavior.
- The four ability ratings remained 1 despite the live seeded raw activity, reinforcing the Health/progression inconsistency.
- This gap is documented current scope: the repository says commissioned art and Rive are V1. The supplied QA brief describes a larger/stale MVP contract.

**Recommendations**

1. Stop positioning visible morphing, Rive animation, or gear as current-MVP functionality unless it is actually in the release candidate.
2. Before building gear breadth, make one progression response unmistakable—for example, a stat aura/state change triggered by a verified rating threshold.
3. Add a clear “how this character changes” explanation and test progression from real Health input through the rendered character state.

### 4) Squad Mechanics — **6/10**

**Flow walked**

1. Opened the solo squad state: rank 1st of 1, five empty seats, Create and invite-code entry options.
2. Opened Create, selected All-around, and entered a 40-character name; Create stayed disabled without an explanation.
3. Entered `QA Runners 0811`, created the squad, and received invite code `NRN7P7`.
4. Inspected the one-member live leaderboard, Today/Yesterday toggle, and program weighting.
5. Created `QA Move 1000` for 1,000 total over one week and opened its detail screen.
6. Opened Leave squad. The warning correctly explained loss of place/history and permanent squad deletion for the last member. Chose **Stay** because deletion was irreversible and a second account was unavailable.

**Bugs and friction**

- Squad creation, fixed program selection, solo empty state, and shared-goal creation all worked.
- The invite code is plain text with no visible Copy, Share, or deep-link action. Empty “Invite your squad” seats are not actionable. The central social loop stops at displaying six characters.
- The long squad name failure gives no max-length counter or validation message; the button simply remains disabled.
- Yesterday (10 Aug) still said “not final yet” late on 11 Aug Manila time, long after the documented early-morning finalization window. That is either a backend scheduler failure or misleading status copy.
- At 0 of 1,000, the new goal said both “on pace” and “needs everyone.” “On pace” at zero is unearned, and “needs everyone” is odd for an aggregate target.
- Demo mode kept the same displayed date/scores when switching Today/Yesterday, which makes the development fixture unreliable for manual regression testing.
- Program weighting is reasonably visible (`AGI ×1.5` in the Running demo), and squadmates' raw Health numbers remain private.
- Join/redeem/rejoin and real-time multi-member reordering were not proven end-to-end with one identity.

**Recommendations**

1. Add a first-class system Share action and Copy confirmation for a universal/deep link, then prove redemption, attribution, membership, and rejoin with two clean accounts.
2. Fix completed-day finalization/status and add a production monitor for days still open past their timezone deadline.
3. Show validation at the field, correct zero-progress pacing language, and make empty seats actionable.

### 5) Sabotage Mechanic — **1/10**

**Flow walked**

1. Searched Character, Squad, goals, empty states, profile, and member/leaderboard surfaces for sabotage inventory, education, targeting, deployment, feed, and protection controls.
2. No sabotage UI or action exists.

**Findings**

- Sabotage cannot be acquired, explained, used, abused, or judged for fairness because it is not in this build.
- This is intentional, not a hidden broken button: roadmap deviation #17 records that sabotage was removed on 9 Aug 2026 and replaced by Goals.
- Relative to the supplied “social sabotage” product proposition, the signature mechanic is absent. Relative to current v1.4 scope, this area should be marked removed rather than treated as an implementation regression.

**Recommendations**

1. Update all beta positioning, test plans, and store-facing copy to remove sabotage claims.
2. Define success metrics for Goals as the replacement social loop; otherwise the product has removed its stated differentiator without proving the replacement.

### 6) Referral System / “War Declarations” — **1/10**

**Flow walked**

1. Looked for referral entry points in onboarding, squad, goal, character, and profile.
2. Tested the only invite surface available: the squad's six-character code.

**Bugs and friction**

- There is no three-layer referral flow, war-declaration framing, link generation, redemption tracking, or reward delivery.
- The squad invite code is membership plumbing, not a referral system, and it lacks even Copy/Share affordances.
- Current documentation says the old framing was replaced by “Shared Target” and the referral remains “spec'd, not yet built.”

**Recommendations**

1. Remove referral rewards/war declarations from the wider-release acceptance criteria or implement one measurable, end-to-end referral loop before launch.
2. Start with universal-link squad/goal sharing and reliable redemption telemetry; do not add layered rewards until the base invite works.

### 7) Monetization — **1/10**

**Flow walked**

1. Searched all tabs and goal/squad flows for coin packs, shop, Legendary subscription, restore purchases, paywalls, and rewarded ads.
2. No monetization surface exists, so no sandbox purchase or reward delivery could be executed.

**Findings**

- Coin packs, the ₱129/month versus ₱899/year Legendary offer, AdMob rewarded ads, purchase restoration, and entitlement recovery are absent.
- There is no predatory gating because there is no monetization.
- This is consistent with the current beta/legal scope: shop, IAP, subscriptions, ads, and coin economy are deferred. It still means the monetization checklist is wholly unproven for a wider commercial MVP.

**Recommendations**

1. Label this beta explicitly non-monetized and remove pricing claims from its release criteria.
2. Before any paid launch, test purchase, cancel, pending, interrupted, refunded, restored, family-sharing, and cross-device entitlement states—not only the happy path.

### 8) Notifications & Retention Hooks — **4/10**

**Flow walked**

1. Confirmed iOS notifications were enabled for Kairo with banners, sounds, and badges.
2. Disabled notifications in Settings mid-session, returned to Kairo, navigated normally, and force-quit/relaunched.
3. Found no in-app status, warning, or route back to Settings; restored permission afterward.

**Bugs and friction**

- The planned permission timing/copy is sensible: it is contextual after squad/goal activity rather than an onboarding ambush, mentions value, quiet hours, and a three-per-day cap.
- Actual first permission presentation and push delivery were not replayable in this already-authorized simulator session. No scheduled notification arrived during the time-boxed run, so delivery reliability is unproven.
- Revocation is silent. Profile has no notification status/preferences or re-enable action.
- Planner tests passed, but a green planner is not evidence that APNs registration, server dispatch, device receipt, tap routing, deduplication, and timezone behavior work together.

**Recommendations**

1. Add a Profile notification status/preferences row that detects denied status on foreground and deep-links to Settings.
2. Run a production-like two-device delivery matrix for goal completion, day ending, day ended, timezone changes, cap/quiet-hour rules, and tap routing.
3. Add delivery observability from planner decision through APNs response and client open, with no Health payload in notification analytics.

### 9) General UX / Visual Polish — **6/10**

**Flow walked**

1. Navigated repeatedly across the three tabs and nested squad goal/create screens.
2. Exercised empty, validation, demo, seeded-data, warning, and cold-launch states.
3. Checked accessibility labels through the simulator's accessibility tree.

**Bugs and friction**

- The cream/green/terracotta system is cohesive, typography is readable, and the Hunter gives the app a recognizable face.
- Navigation is small and understandable. Back behavior and tab state were stable.
- Accessibility labeling is better than average for this stage: stat summary, radio choices, and goal actions have meaningful labels.
- Cold launch showed a mostly blank cream loading state for roughly 3–4 seconds without explanatory copy or skeleton content.
- Several actions fail silently through disabled buttons, particularly long squad names.
- Stat details extend below the fold with little indication that more content is available.
- Gamer terminology is partially explained in stat detail, but daily score, ability ratings, XP, consistency/recovery, and hidden tiers form too many overlapping progression concepts for a new user.
- The goal copy issues and fabricated body-metric defaults reduce trust.
- No crash or obvious interaction stutter occurred. Memory warnings, energy impact, and long-session battery drain were not measured on a physical phone.

**Recommendations**

1. Add explicit validation/counters and meaningful loading/error states to every asynchronous or disabled action.
2. Reduce the progression model visible at one time: explain daily score versus lifetime ability versus XP in one compact help surface.
3. Run a physical-device accessibility/performance pass: Dynamic Type, VoiceOver order, Reduce Motion, contrast, cold launch, memory, and battery.

### 10) Stability — **6/10**

**Flow walked**

1. Force-quit/relaunched during the account, Health, character, and squad-goal session.
2. Backgrounded to iOS Settings for Health and notification changes, then returned.
3. Ran all automated tests and type checks.
4. Built from the Xcode workspace through the normal Xcode Run action and through a clean isolated build directory.

**Bugs and friction**

- No app crash occurred. Character name, squad, goal, and account state persisted across cold launches.
- **Xcode Run is currently broken on this machine:** target `hermes-engine`, phase `[CP-User] [Hermes] Replace Hermes for the right configuration`, fails with `Script-46EB2E00023A30.sh: line 9: : command not found`, followed by `Command PhaseScriptExecution failed with a nonzero exit code`.
- Root cause: `ios/.xcode.env:11` evaluates `command -v node` inside Xcode's restricted PATH and resolves `NODE_BINARY` to empty. A clean isolated command-line build succeeded, proving the source can compile but the normal developer path is not reproducible.
- The 916 automated tests and full typecheck passed, which is strong regression evidence for pure logic—not for live auth, HealthKit, APNs, multi-user real time, or backend schedulers.
- Poor/no network, long background duration, and interrupted purchase/sabotage were not executed. Purchases and sabotage do not exist in this build.

**Recommendations**

1. Generate `ios/.xcode.env.local` with the resolved absolute Node path (not a build-time `command -v`), clean DerivedData, and require a fresh-machine Xcode Run check in CI/release instructions.
2. Add deterministic UI/device tests for onboarding, Health sync/error freshness, squad invite redemption, finalization, and notification tap routing.
3. Run the missing release-candidate matrix on physical devices: offline/poor network, background overnight, permission subsets, reinstall/upgrade, low storage, and interrupted backend requests.

## 3. Overall MVP Readiness Score — **4/10**

The current development build demonstrates a real, navigable beta slice, but a wider MVP cannot launch when Release has no authentication and account deletion is absent. Health activity is the product's source of truth, yet this session produced contradictory raw data, score, ability, and ranking states while hiding both stale permissions and sync failure. Squad creation and goals are promising, but the invite loop is not end-to-end, yesterday's finalization looks unhealthy, and most features in the supplied proposition are outside the current build. Passing 916 tests and avoiding crashes raises confidence in the internal logic; it does not overcome unproven or missing release-critical device/backend flows.

## 4. Top 5 Prioritized Fixes Before Wider Release

| Rank | Fix | User impact | Effort | Why now |
|---:|---|---|---|---|
| 1 | Complete the release account lifecycle: Sign in with Apple in Release/TestFlight plus in-app account deletion | Critical | High | Without sign-in nobody can enter; without deletion App Store submission and user control are blocked. |
| 2 | Make Xcode builds reproducible by fixing `NODE_BINARY` resolution, then verify a clean Release archive on a fresh environment | High | Low | The ordinary Run path fails today; this is cheap to fix and removes false-negative build noise before deeper QA. |
| 3 | Repair Health reconciliation and freshness: immediate foreground/observer refresh, visible sync outcome/last-sync state, manual retry, and invariants across raw totals, score, ratings, and leaderboard | Critical | Medium–High | Kairo cannot be trusted if the same activity produces mutually contradictory progress. |
| 4 | Correct the Health permission contract: disclose every requested data type and purpose, minimize access, and handle revoked/partial access without presenting stale values as current | Critical | Low–Medium | The current wording understates sensitive access; that is a trust and review risk in the product's core permission moment. |
| 5 | Finish the smallest viable social loop: Share/Copy deep link, two-account redemption, live board update, rejoin behavior, and reliable completed-day finalization | High | Medium | A squad app whose invite stops at a code and whose prior day does not finalize has not proven its retention loop. |

The team also needs one explicit scope decision before calling this a “wider MVP”: either remove morphing/gear, referrals, sabotage, and monetization from launch claims and QA criteria, or budget and test them as real features. The current v1.4 repository and the supplied v1.3-style QA brief describe different products.

## 5. What's Genuinely Working Well

- The solo path is first-class: a new user can reach a functioning Character screen without friends or a squad.
- Squad creation, fixed program selection, a one-member empty state, leaderboard presentation, and shared-goal creation all completed without a crash.
- The visual system is coherent and distinctive enough to recognize as Kairo; accessibility labels for important controls are meaningfully authored.
- State survived repeated force-quits and permission-setting detours.
- The pure logic safety net is substantial: all 916 tests and type checks passed in this run.

---

# Addendum — root-cause diagnostics, 11 August 2026

Read-only investigation against the live project (`zniopywbwenrzxezolwv`) via
`supabase/scripts/remote-sql.sh` and the Management API, run after the session above. It resolves
§2's "broken reconciliation" and §4's "yesterday not final yet" into **one cause**, and corrects two
findings.

## The Health integrity failure and the finalization failure are the same bug

**`sync-health` was four days stale in production.** Deployed versions at time of writing:

| Function | Version | Deployed |
|---|---|---|
| **sync-health** | **v3** | **2026-08-07 10:56** |
| finalize-days | v6 | 2026-08-10 11:15 |
| dispatch-notifications | v2 | 2026-08-07 20:44 |
| seed-health | v2 | 2026-08-07 10:57 |
| **deploy-sabotage** | **v6** | **2026-08-07 20:44 — still ACTIVE, deleted from the repo on 9 Aug** |

Commit `0e5b308` ("Remove sabotage from kairo-core, Edge Functions, and the schema", 2026-08-09
23:33 +08) removed `sabotage_delta` from `DayScoreRow` in `_shared/sync-plan.ts`, and its migration
`20260809120000_remove_sabotage.sql` dropped the column. **The migration was applied; the Edge
Functions were never redeployed.** The deployed v3 still sends `sabotage_delta` in its
`daily_scores` upsert, against a table that no longer has that column.

The consequence follows the handler's statement order in `supabase/functions/sync-health/index.ts`:
the bucket upsert commits first, the score upsert runs ~150 lines later and 500s, and the
`app_events` insert at the end is never reached.

**Evidence:**

- `daily_scores` has had **no write project-wide since 2026-08-09 07:28 UTC** (65 rows, newest
  `local_date` 2026-08-09).
- `health_sync` telemetry **stops at 2026-08-09 11:31 UTC** — 204 events, then nothing. The
  migration landed ~15:33 UTC the same day.
- The QA account (`18eb6993…`, `QaAeon0811`) has **48 health_buckets rows** — 2026-08-10 and
  2026-08-11, 24 hours each — all written in a single instant, `2026-08-11 11:02:53.426+00`. That
  is exactly one client sync of the two-day routine window emitted whole (deviation #8).
- Its `daily_scores` is **empty**, and `profiles.agi_total/str_total/end_total/vit_total`,
  `total_xp` are all `0`, `level` 1.
- `daily_sleep` **did** land for both dates (420 min), proving execution passed the sleep upsert and
  died after it.
- The account is **not** in `seed_test_users`, so `seed-health` could not have produced those
  buckets — guard 2 refuses. The client path is the only door they came through.

**Everything the session observed follows from this and needs no other explanation:**

| Observation | Cause |
|---|---|
| 44,000 steps / 33 km shown | buckets landed; `useTodayBuckets` reads `health_buckets` directly |
| daily score 0 | `daily_scores` row never written |
| ability ratings stuck at 1 | `daily_scores_xp_rollup` never fired, so the rollups stayed 0 |
| "1st · leading" | `squad_leaderboard()` LEFT JOINs and coalesces — 1st of 1 at 0 is correct |
| yesterday "not final yet" | `finalizable_days()` returns **empty**: it can only finalize existing provisional rows, and none were ever created |

**The finalization scheduler is healthy** and the report's suspicion of it is wrong: `cron.job` shows
both jobs active on `5 * * * *` and `7 * * * *`, and `net._http_response` shows **200 on every run**,
each returning `candidates: 0`. It had nothing to do. `profiles.timezone` is correctly `Asia/Manila`.
All migrations through `20260811130000` are applied.

**Fix:** redeploy the Edge Functions, then backfill. The stored buckets are intact, and scores are
always replayed from buckets rather than adjusted in place (§12) — so a rescore of 10/11 Aug
reconstructs the missing days exactly. No data was lost.

## Two independent defects confirmed by reading the code

Both are real regardless of the deployment gap, and both are why this stayed invisible for two days:

1. **`useHealthSync` never invalidates the raw-totals queries.** It invalidates `todayScoreKey`,
   `profileKey` and `squadKeys.allBoards()`, but not `todayBucketsKey` or `todayVitalsKey`
   (`src/features/health/useHealthSync.ts`). This is §2's "new Health data appeared only after a
   cold launch".
2. **Sync failure is unobservable.** `SyncState.lastError` / `lastErrorAt` / `lastSyncedAt` are
   persisted and reach no UI — `src/features/health/sync-state.ts` says so in its own comment
   ("Persisted for the Phase 7 profile screen. Nothing renders it yet"). A 500 on every sync for
   two days produced no user-visible signal and no operator signal.

## Corrections to the report

- **§1 "Edit opened with 170 cm / 65 kg / 1995 defaults … a user can accidentally save invented
  health data" is incorrect.** Those are `placeholder` strings on empty inputs
  (`BodyMetricsCard.tsx`); `draftsFrom()` seeds `''` when the stored value is null, and
  `parseBodyMetric()` maps `''` → `null` (`body-metrics.ts`). Nothing invented can be saved.
- **§4's "backend scheduler failure" is incorrect** — see above; the scheduler ran and succeeded
  every hour. The status copy was reporting the true state of a day that genuinely never scored.
- The report's sabotage / referral / monetization / gear sections grade against a v1.3-era brief.
  They are recorded deviations (#17 and the V1 split), not regressions — see `docs/mvp-scope.md`.

## New finding the session could not have seen

**`deploy-sabotage` is still deployed and ACTIVE**, four days after the feature was deleted from the
repo and its tables dropped. Client-only testing cannot see this. It should be deleted from the
project, and the release process should verify that deployed functions match the repo.

## Process gap this exposes

Nothing tests the deployed artifact. The 916 tests exercise the *source*; `UNSUPPORTED_MIGRATIONS`
in `supabase/tests/harness.ts` already documents that the cron schedules are outside the harness.
There is no check that a migration and the functions reading its schema ship together — which is
exactly the shape of this outage. A post-deploy smoke check and a "functions match HEAD" assertion
belong in the release steps.
