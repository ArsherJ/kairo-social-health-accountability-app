# Kairo — MVP Implementation Roadmap

Target: **TestFlight closed beta** per `Kairo_Master_Summary.md` §15 — 5–6 squads × 6 weeks, measuring D21.

The beta exists to answer four risk questions: week-3 stamina, whether a self-set target survives a bad week, stranger-squad validity, and score fairness perception. Scope decisions get graded against those, not against feature completeness.

**Sabotage was removed on 2026-08-09** (spec v1.4 §1, and §20 principle #4 is formally overturned there). Goals replace it. Deviations #13 and the `sabotaged` half of #14 are retired below; everything else in the table stands.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

**Remaining work is sequenced and specified in `docs/mvp-completion-plan.md`**
(approved 2026-08-07, with an implementation spec per workstream under
`docs/superpowers/specs/`). That document covers the four unblocked workstreams
between here and feature-complete — leaving a squad, the notification engine,
and polish — plus the verification pass the Apple Developer Program unlocks.
Its sabotage-UI workstream is void, and
`docs/superpowers/specs/2026-08-07-a-sabotage-ui-design.md` describes deleted
code. The phase list below stays the status index; the plan does not
override it, and product decisions still live in `Kairo_Master_Summary.md`.

---

## Approved deviations from the spec

Recorded here so they aren't re-litigated. Propose changes against this table.

| # | Spec says | We build | Why |
|---|---|---|---|
| 1 | `react-native-health` (§12) | **`@kingstinct/react-native-healthkit`** | **Blocking.** `react-native-health`'s Expo config plugin does not support background processing. §12/§15 require background delivery for *all* users. Kingstinct's is TypeScript-first and Nitro-based (New Architecture), and its `background: true` adds the background-delivery entitlement. **Correction (2026-08-01):** this row originally claimed the plugin "registers observer queries in `didFinishLaunchingWithOptions`". It does not. `app.plugin.js` runs only `withEntitlementsPlist` and `withInfoPlist`, nothing in the pod self-registers, and `ios/Kairo/AppDelegate.swift` has no HealthKit reference. The library *supports* it — `BackgroundDeliveryManager.setupBackgroundObservers()` — but something has to call it. See Phase 3. |
| 2 | React Navigation v6 + Zustand (§12) | **Expo Router + TanStack Query + Zustand** | Expo Router *is* React Navigation underneath; typed routes and deep-link handling cover §14's eight notification deep-links. TanStack Query owns server cache, Zustand owns session/UI/sync-queue. |
| 3 | Buckets as `(user, date, hour, metric)` rows (§11) | **One row per hour, four metric columns** | 24 rows/user/day instead of 96. One upsert statement, no metric-name typos, VIT is `count(*) where steps >= 250`. Idempotency against Apple's retroactive revisions is identical. |
| 4 | "Squadmates see tiers and scores only" (§5) | **`SECURITY DEFINER` RPC**, not client filtering | Makes the privacy rule structural — squadmates cannot reach raw buckets even with a forged client. |
| 10 | Weekly featured stat rotates the meta (§6) | **Rotation retired from stored scoring** — `computeDailyScore` defaults `featuredStat` to `null`; `daily_scores.featured_stat` written as null | Squad programs (deviation #12) carry the meta permanently, and leaving the rotation in stored points would stack multiplicatively with program weights (AGI week in a running squad = 2.25×). `featuredStatFor` stays in `kairo-core`, tested; V1 may resurrect the rotation as a read-time projection on All-around boards. |
| 11 | Stored per-stat points include the featured multiplier (§11/§12 as built) | **`daily_scores` stores base (pre-multiplier) points; ALL weighting is read-time in `squad_leaderboard()`** | Stored scores stay canonical and program-independent: score replay never learns programs exist, a program change can never corrupt stored data, and one Legendary user in three squads gets three weighted views of the same rows for free. |
| ~~13~~ | ~~One free item granted per day, deploy cap 2/day (§8)~~ | **RETIRED 2026-08-09 — sabotage removed.** This row was pure sabotage tuning and died with the feature. Kept struck through rather than deleted so the number is never reused. Original: **`DAILY_ITEM_GRANT_FREE = 2`**, equal to `DEPLOY_CAP_FREE`, and both constants moved into `packages/kairo-core/src/sabotage.ts` | Plan decision #1 (2026-08-07). At a grant of 1 the *grant* bound and the §8 cap was unreachable, so the beta would have measured sabotage sentiment at one hit per person per day — too quiet, in a 6-person squad, to answer "fun or resentment?" either way. Two consequences: the §8 cap becomes the real constraint, and `SAME_ITEM_COOLDOWN_MS` stops being dead code (a free user can now hit the same person twice in a day, so "You already hit them recently" is copy the beta will see — tested in `sabotage-plan.test.ts`). `no_items_remaining` becomes unreachable for free users in exchange, which is fine: `deploy_cap_reached` is the more informative message. The constants live in core because the client must render the remaining count *before* the first deploy materialises the ledger row. |
| 14 | No notifications between 10 PM and 7 AM local **except sabotage** (§14) | **Two exempt triggers** — `day_ending_soon` and `day_ends` — expressed as `QUIET_HOURS_EXEMPT`, a set, and kept separate from `BUDGET_EXEMPT`. **Amended 2026-08-09:** `sabotaged` is dropped from both lists; `BUDGET_EXEMPT` is briefly empty and `goal_completed` claims it. The separation is what made this a two-line change rather than a re-derivation. | Plan decision #2 (2026-08-07). §14 forbids the window and then schedules "Day ending soon" at 23:00 and "Day ends" at 00:00 *inside* it, so read literally the rule suppresses the two notifications that drive the evening loop — leaving an engine that only sends V1 triggers. Those two are the core loop, not discretionary, so they are exempt on the same footing rather than as an exception to an exception. The two lists stay separate because the rules are independent in §14: merging them would make the day-boundary pair budget-exempt as a side effect of a quiet-hours decision, and `countsAgainstBudget()` is the one predicate both the planner and the `sentToday` query use. |
| 15 | Push is delivered through **FCM** (spec C, §14 support) | **Expo's push service** — `getExpoPushTokenAsync()` on the client, `POST exp.host/--/api/v2/push/send` on the server | Founder decision 2026-08-07. The specced pairing could not have delivered a single notification: FCM addresses *FCM registration tokens*, and `expo-notifications` on iOS returns an **APNs device token** — only the Firebase Messaging SDK bridges the two. Hand verification made this concrete rather than theoretical (the token that landed in `device_tokens` was 80 bytes of APNs hex). Of the three ways out, Expo was the only one that *deleted* code: no service-account JWT, no OAuth exchange, no `GoogleService-Info.plist`, no extra native modules, and Android comes free at V1.5. The privacy argument for going direct to APNs was considered and rejected as weak — Apple relays the payload in every option, and push bodies carry a character name, a rank and a score total, none of which is in §5's protected set. **The server holds no push credential at all**; what the Developer Program still gates is the APNs key Expo needs, uploaded with `eas credentials`. Reversal is confined to `_shared/push.deno.ts` and `registerDeviceToken()`. |
| 16 | `docs/roadmap.md` Phase 6 carries the **N-of-M squad streak** as MVP work | **Cut to V1.** No `squad_streaks` table, no trigger, no finalization work in the critical path | Plan decision #5 (2026-08-07). This is the spec's own position, not a reduction of it — §15 lists "Streak system + milestones (incl. N-of-M squad streak)" under **V1**, and only the roadmap phase ever treated it as MVP. Personal streaks and the Streak Shield are built and stay. Recorded as a deviation because the roadmap is what the build is sequenced from, so leaving the phase entry open would have kept re-proposing it. |
| 12 | Squads are untyped (§7) | **`squads.program`** — same-focus squads (`all_around` default · `running` · `gym` · `walking`), fixed at creation for MVP | Founder decision 2026-08-07. Weight mapping, UX and rationale in `docs/assessments/2026-08-06-onboarding-and-program-selection.md` (Part 2). |
| 17 | Sabotage is the core mechanic (§8, §20 #4) | **Removed entirely.** `20260809120000_remove_sabotage.sql` drops `sabotage_events`, `daily_item_ledger`, `daily_scores.sabotage_delta`, the `sabotage_item` type and `squad_feed()`; `deploy-sabotage` and `kairo-core/src/sabotage.ts` are deleted | Founder decision 2026-08-09: progress is still progress. Recorded as a deviation *and* a spec version bump (v1.4) because §20 filed sabotage under **Non-Negotiable** — that needed overturning in the spec, not routing around here. The squad leaderboard stays, which is load-bearing: §5/§20 #3 make social embarrassment the only anti-cheat mechanism, so `daily_scores.flagged` keeps a reader. A fully solo pivot would have removed Kairo's entire anti-cheat surface. `reject_mutation()` and `kairo.allow_purge` are left inert rather than cleaned up — see that migration's closing comment. |
| 18 | — | **Goal progress is a read-time projection over `daily_scores`, stored nowhere.** `goal_window_scores()` returns each participant's per-day score series for the window; all arithmetic lives in `kairo-core/src/goal.ts` | The alternative was aggregating in SQL, which would put goal maths in two places — exactly the differential-test tax `finalizable_days()`/`isFinalizable()` and `program_weighted_total()`/`weightedBoardTotal()` already pay twice over. The cost is that one call returns a *series* of daily totals for co-participants where `squad_leaderboard()` returns one day. §5 protects raw steps, hourly movement and timestamps — not score totals — so this stays inside the privacy rule, but it is a widening of a single call's output and is recorded rather than left to drift. It also means retroactive HealthKit revisions flow into goal progress for free. |
| 20 | — | **`goal_window_scores()` LEFT JOINs `daily_scores`, so every participant appears whether or not they have scored.** A scoreless one returns a single row with null `local_date`/`total`/`status` | Found on device: the inner join dropped a member who had not started, so a 3-person squad goal rendered one standing and hid the roster — on a mechanic whose entire point is *who has and has not hit it*. `squad_leaderboard` had already made this impossible for the board, and 20260807100200's own comment says why (a member who has not moved appears with `total = 0` rather than being absent). The date bound has to stay in the ON clause: moved to WHERE it filters out the null-extended rows and silently restores the inner join. The name comes from this RPC rather than the client reading `goal_participants` because `profiles` is owner-readable only — a squadmate cannot look up another member's character name for itself. |
| 19 | — | **Goal completion is a one-way latch in `goal_completions`, with its own contribution to the `total_xp` rollup** | Progress may be projected, but completion pays XP and must fire exactly once, so it is stored. Goal XP is deliberately **not** written into `daily_scores.xp_awarded`: a rescore replays that column from tier points and would silently wipe it. The rollup trigger is extended to sum both sources instead — safe precisely because it is a full recompute, never an increment. Latching also means a later downward revision from Apple never revokes a goal already met, which is the rule §19 already applies to streak milestones. |
| 21 | Fixed goal windows only — `CreateGoalForm.tsx` argued *against* a date picker ("nobody commits to *17* days, and an arbitrary end date is the single most common way to create a goal whose required_days cannot fit its window") | **A date picker behind a `Pick a date` chip, alongside the four presets, plus `No end date` for cumulative goals — `goals.ends_on` is now nullable** | Founder decision 2026-08-10, from hand-testing. The first half of the original argument was a taste call and is overruled: "by my birthday" and "by the wedding" are the commitments people actually make. The second half was a real risk and is **not** waived — `goals_validate()` is unchanged, the client still mirrors it, and `windowDays` is derived from whichever end date is chosen, so the error became *reachable* again rather than unguarded. Open-ended is **cumulative-only**, enforced by `goals_consistency_needs_end` rather than by the UI: "clear the bar on 25 days, however long it takes" can never become unreachable, so `stillPossible` would be a constant, the pace marker would have no elapsed fraction to sit at, and the goal would have no failure state to make succeeding mean anything. `goalCompletionXp` takes a completion date as a second argument for the same reason — an open-ended goal has no window to scale by, so it is paid on the span it actually ran. |
| 22 | `profiles.focus` — "what the user says they are here to do", asked once in onboarding (§5) | **Dropped entirely, column included.** Onboarding is one step again; `redirectTarget`'s `finishingOnboarding` flag and `useOnboardingStore` went with it | Founder decision 2026-08-10: "we can only use the focus choices in the squad level." It was a second answer to the question `squads.program` already answers, and only the program ever meant anything — the program weights the board (deviation #12), focus was presentation-only. Its sole output was choosing which stat the character screen's guidance line preferred, and **that survives**: the lane now reads observed dominance, which `useDominantStat` already computes for the build label directly above it. Better input than the one it replaces — it cannot go stale, needs no question, and describes what someone does rather than what they said they would. Dropped rather than left inert (contrast `reject_mutation()`, kept because it sits on the erasure path); this column sat on nothing. |
| 23 | Squadmates see **tiers** and scores only (§5); §6's Bronze/Silver/Gold is the per-stat vocabulary | **Tiers are internal to scoring and shown nowhere.** Every surface reads a numeric **ability rating** — `ratingForStatPoints()` over lifetime per-stat points rolled up on `profiles` (`agi_total` … `vit_total`), the same curve family and floor as `levelForXp` | Founder decision 2026-08-10: "a numeric stat that defines my current abilities, just like my level." **The scoring engine is untouched** — `TIER_POINTS`, `tierFor()`, the §5/§6 thresholds and `daily_scores.tiers` all still decide every day exactly as specified, which is why this is a deviation and not a spec version bump. What changed is what a user reads: a medal describes *today*, and "how strong is my character" is cumulative. Privacy is unchanged or better — a rating is a lifetime aggregate, so unlike a tier it cannot be inverted to a same-day step range; `squad_leaderboard()` returns `ratings` alongside `tiers` and still has no argument reaching raw steps or hourly movement. The rollup is safe for the reason `total_xp` already was: `recalculate_user_xp` is a full recompute, never an increment. Its trigger's early return had to widen to every column it reads — a same-tier rescore (5,200 → 8,000 steps, both Silver) moves `agi_points` and not `xp_awarded`, and the old skip would have swallowed it silently. |
| 24 | — | **Strain, derived from heart rate and displayed only.** `health_buckets.avg_heart_rate`, a `daily_heart` table for Apple's per-day resting rate, and `computeStrain()` in `kairo-core` | Founder request 2026-08-10 for the day's real figures. Steps, distance, calories and active minutes were already synced and simply never displayed (`distance_m` had been stored for the §5 stride cross-check since the first migration). Strain is the only new thing, and HealthKit has no such metric — but `read.ts` was already querying hourly `discreteAverage` heart rate for the anti-cheat workout cross-check and **throwing the number away**, keeping one bit for "was this hour above 100 bpm". **It never enters `daily_scores`**, ranks nobody and cannot appear in a goal, so §12's server-authoritative rule is untouched and score replay never learns it exists. Both columns are owner-readable only and absent from every projection: heart rate is at least as revealing as the hourly movement pattern §5 already protects. Null means *not measured*, never *resting* — an hour with the watch on the charger contributes nothing rather than reading as recovery. |
| 25 | — | **The root layout is a `<Stack>`, and the auth gate's loading/error states render *over* it rather than instead of it** | Fixed on device 2026-08-10: returning from a goal route landed on the wrong tab. Two independent causes, both the same shape. (a) `app/_layout.tsx` rendered a bare `<Slot/>`, and expo-router's `SlotNavigator` renders **only the focused descriptor** — so pushing `/goal/new` *unmounted* `(tabs)`, and React Navigation deletes an unmounted navigator's state, so `router.back()` remounted `<Tabs>` at `TabRouter.getInitialState`. (b) `Gate` returned a spinner **instead of** the navigator whenever `useProfile` was transiently pending, which destroyed root *and* tab state the same way. `segments[0]` is unchanged by a root `<Stack>`, so `redirectTarget()` and its tests are untouched. Side effects fixed for free: `useHealthSync`, device-token registration and `app_open` telemetry stopped re-firing on every return from a goal screen, and the squad create pane stopped resetting to `choose`. |
| 26 | The player character is a **Hunter** (§6 "MVP ships one class only (Hunter)", §15, §20's art brief); "barkada" is the word for a squad (§9, §20) | **Neither word appears anywhere in the app.** The character has no noun — it is "your character", and the centre tab is `Character`. A squad is a **squad**, the word the schema, the RPC and the routes already used | Founder decision 2026-08-11: "this is for all and not a hunting app." Two separate narrowings of the audience, fixed together. *Hunter* imported a genre the product is not — Kairo is health accountability, and the word also sat closest to the IP surface §20 explicitly fences off ("Solo Leveling never appears in in-app text"). *Barkada* is Filipino-only for a thing that already had an English name in every other layer of the stack; PH-first is not PH-only, and two words for one entity is a vocabulary tax on every future screen. **Nothing behind the words changed** — no scoring, no schema, no projection — which is why this is a deviation and not a spec bump. Three deliberate exclusions, each of which will otherwise read as a miss: (a) **`profiles.class` keeps its `'hunter'` default and CHECK**, an inert internal enum no surface renders — a migration to rename a dead column's default buys nothing, and its migration comments are left as the applied historical record they are; (b) `output/imagegen/hunter-*.png` and the script paths pointing at them are the *existing render sources*, replaced wholesale by the next plan rather than renamed under it; (c) **the image-generation prompt text in `scripts/generate_swap_assets*.py` still says "unranked hunter gear", and §20's art brief still says "dark fantasy hunter aesthetic" — that is the stale half of this decision and it is deliberately still open.** The words are gone; the *look* they specified is not, and cannot be until the art is regenerated. That is the next plan's first job, together with the gender choice and the animated character. |
| 27 | §6 ships "one class only (Hunter)" with a single character; §5's onboarding collects name only | **SUPERSEDED by #40 (2026-08-18) — the character is an animal, not a human body.** Two character bodies, chosen on a new first onboarding screen. New nullable `profiles.character_body`; onboarding is two screens with the profile still committing once | Founder decision 2026-08-11. §6's premise is that "two people in the same squad look different"; one character made everyone identical. Stored on a **new** column rather than the existing `profiles.sex` — that column's documented purpose is physiological (HealthKit calorie estimate) and this question is cosmetic, and merging the two is what deviation #22 dropped `focus` for. Nullable so existing rows read as *never asked* rather than as having chosen. The choice is asked **before** the name specifically so the single INSERT stays at the end: deviation #22 deleted the `finishingOnboarding` flag when onboarding went back to one step, and asking after the commit would have required resurrecting it. `CHARACTER_ART` stays at 24 empty keys rather than doubling to 48 — the body axis joins the key only when per-dominance art actually exists. | **Superseded:** `profiles.character_body` is dead (never written, read by no surface, comment says so), the picker on that screen now chooses a species, and `parseCharacterBody` / `CHARACTER_BODIES` were deleted with it. The reasoning above survives the supersession intact — every clause about *why the choice is asked before the name* applies unchanged to the species picker, which is why #40 did not have to re-derive it.
| 28 | `ios/` is generated from `app.config.ts` and gitignored (line 4 of `.gitignore`); a native change is `npm run prebuild` and nothing else | **`ios/` is committed.** Only its build output stays ignored — `ios/Pods/` (1.2 GB, reinstalled in CI from the committed `Podfile.lock`), `ios/build/`, `ios/DerivedData/`, `ios/.xcode.env.local` and `xcuserdata/`. `android/` is untouched and still generated | Founder decision 2026-08-12, forced by the machine. USB pairing is blocked at the kernel by CrowdStrike Falcon's Device Control policy (`IOUC AppleUSBHostInterfaceUserClient failed MACF … usbmuxd`), so `npx expo run:ios --device` cannot exist here and the last release blocker — verifying Sign in with Apple on real hardware — needs an over-the-air install. Xcode Cloud provides one and its 25 compute hours/month are already inside the Developer Program membership; EAS Build solves the same problem without a native commit and was declined for that reason. Xcode Cloud configures a workflow against a **scheme in a project that exists in the repo** — `ci_post_clone.sh` runs early enough to *build* a generated project but not early enough to *configure* one — so committing `ios/` is the price of the path, not an incidental tidy-up. **Three consequences, the third being the one that bites:** (a) an Expo SDK bump stops being free — `npm run prebuild` now also means reviewing a large native diff; (b) `.xcode.env.local` still cannot be committed, holding a machine-specific absolute path to node, so CI regenerates it in `ci_post_clone.sh`; (c) **`app.config.ts` is no longer the source of truth for native config.** The committed `Info.plist` and `Kairo.entitlements` are what ship, so changing `usesAppleSignIn`, `NSHealthShareUsageDescription`, the HealthKit plugin's `background: true` or any plugin requires prebuild **and a commit of the result**, or the change silently does not reach the build. The JS side is unaffected — `extra` and `EXPO_PUBLIC_*` are evaluated during the Xcode build's bundle phase, so workflow environment variables do land. Two follow-ons: `ios.buildNumber` and `ios.config.usesNonExemptEncryption: false` were added to `app.config.ts` (a unique `CFBundleVersion` per upload, and export compliance that otherwise stalls every build on a question); and because Apple looks for `ci_scripts` **beside the project**, not at the repo root, the scripts live at `ios/ci_scripts/` — which `expo prebuild --clean` deletes, so `scripts/ci/` is their source of truth and `postprebuild` reinstalls them, the same arrangement `write-xcode-env.mjs` already uses. Full plan and landmines in `docs/archive/xcode-cloud.md`. |
| 29 | React Native 0.86 links Meta's prebuilt `React.xcframework` (`React-Core-prebuilt`), which is the upstream default and exists to cut build times | **React Native core is built from source.** `plugins/withReactNativeFromSource.js` sets `ios.buildReactNativeFromSource`, which makes `ios/Podfile` export `RCT_USE_PREBUILT_RNCORE=0` and `RCT_USE_RN_DEP=0`; `ci_post_clone.sh` fails the build if the `React-Core-prebuilt` pod returns | Forced 2026-08-13 by a launch crash on the first TestFlight build to get past the ExpoModulesJSI embed failure. The prebuilt binaries are compiled by Meta against libc++ 19 (Xcode 16, ABI tag `ne190102`); every pod CocoaPods builds locally — `ExpoModulesCore` among them — compiles against the installed Xcode 26.6's libc++ 21 (`nqe210106`). The two disagree about `sizeof(facebook::react::ShadowNodeFamily)`: **400 bytes in `React.framework`, 336 in `ExpoModulesCore`.** Headers on disk are byte-identical, so nothing warns. `ExpoViewComponentDescriptor::createFamily` inlines `make_shared<ShadowNodeFamily>` and allocates the short 360-byte block, then calls React's out-of-line constructor, which initialises out to offset 400 — 64 bytes past the end, for every Expo view created. **The bug is ordinary; the debugging shape is the thing to remember.** The overflow corrupts whatever block sits next, so the process dies at a *later, unrelated* allocation: five launches of one binary gave three signatures, including the `-[RCTComponentViewFactory createComponentViewWithComponentHandle:]` crash Apple reported, which reads convincingly as an unregistered Fabric component and is not one. A signature that varies between runs of the same binary is heap corruption, not a bug where it crashed. It reproduces 100% in a Release **simulator** build, so no TestFlight round trip is needed, and Guard Malloc (`SIMCTL_CHILD_DYLD_INSERT_LIBRARIES=/usr/lib/libgmalloc.dylib`, with `MALLOC_PROTECT_BEFORE` left unset — it guards the front and hides overflows) traps the offending write directly. **The cost is the point of prebuilts:** CI now compiles React Native itself, so builds get substantially longer. Accepted — a green archive that cannot launch is worth no build time at all. Generalises: any prebuilt C++ binary in the graph is a silent ABI contract with the toolchain that built it, and an Xcode bump can break it without a warning. Full write-up in `docs/archive/xcode-cloud.md` under Known landmines. |
| 30 | The day's `daily_scores.total` is the home screen's hero number, and each leaderboard row shows its own total | **Points are spoken only inside Goals.** The home hero is the day in real units; a board row is rank and the gap to the row above; `row-label.ts` speaks the gap, never the total | Founder decision 2026-08-15: "I think we should remove the scoring. The first time I see it, I don't know what that is for." Directly downstream of #23 — the same argument that made Bronze/Silver/Gold internal to scoring, applied to the total itself. **The engine is untouched**: `total` still ranks `squad_leaderboard()`, still scores every Goal (#18), still feeds `xp_awarded`/`total_xp`/levels/ratings, and still carries `flagged`, which via the board is the only anti-cheat mechanism §5/§20 #3 leave standing. What changed is what is rendered. Points survive inside Goals because there the user typed the target themselves, and a number you chose explains itself in a way an ambient daily total never does. Three consequences worth not rediscovering: `row-label.ts` was speaking `"N points"` into the accessible name, so VoiceOver users would have heard a figure sighted users could not see; the "Includes N for consistency" line existed *only* to reconcile the stat coins against the hero total and deleted with no replacement; and the leaderboard row's boost chip was justified by explaining why that row's total differed from the character screen's unweighted one, so with neither total rendered its documented purpose evaporated — the board **header** already carried the same chip, which is where program information belongs. **One consequence is a real loss and is recorded rather than fixed:** a *consistency* goal's target is a daily points bar, rendered on `app/goal/[id].tsx` as e.g. "1,200 a day", and the home hero was the only place a user could read today's running total against it. With the hero in real units, that goal kind can no longer be self-checked mid-day from anywhere inside the app — the goal card shows days met, which only resolves after the day finalises. No UI was built for this deliberately: the honest options (put the total back on the goal screen, or restate a consistency target in real units) are a product decision about what a consistency goal *is*, not a rendering gap to patch. |
| 31 | The squad program focused on lifting is `gym` (deviation #12) | **`strength`** everywhere — the `squads.program` CHECK value, `SquadProgram` in `@kairo/core`, `program_weighted_total()`'s SQL mapping, `create_squad`'s validation list, and the picker's label | Founder decision D3, 2026-08-15. Forced by the Strength challenge arriving beside it: two words for one idea, on two surfaces, where the program boosts STR and the challenge measures the calories STR is computed from. `calisthenics` was the alternative and was rejected on data grounds — STR rides active calories and cannot distinguish bodyweight work from weights, so the narrower word would promise a distinction the data cannot make. Part 2 §9's calisthenics framing survives as *copy* on the Strength challenge, where "push-ups, pull-ups, squats" is the point that actually mattered. Migration `20260815100000` updates existing rows before swapping the constraint — there is no ordering in which one constraint is true throughout, so it drops, updates, then re-adds. The `PROGRAM_WEIGHTS` ↔ SQL differential test is what proves both halves moved together. |
| 32 | Workouts are read only for the anti-cheat cross-check and reduced to a per-hour `hadWorkout` boolean (§11) | **`workout_sessions`** — the whole sample kept: Apple's sample UUID, activity type, duration, distance, active calories, keyed `(user_id, hk_uuid)` | Needed by Challenges (#33), which cannot exist without it: workout sessions are the **only** reliable way to tell a run from a walk at the data layer, since both collapse into the same AGI steps-and-distance signal. Deliberately *storage, not acquisition* — `read.ts` already called `queryWorkoutSamples` and already received every field, so there is no new HealthKit read type, no `NSHealthShareUsageDescription` change and no `prebuild` (checked rather than assumed, because `ios/` is committed per #28). The per-hour `hadWorkout` path is untouched and anti-cheat keeps working exactly as before. **Privacy: owner-select only, zero client write grants, and present in no projection** — a pace carries fitness and, with distance, routine, which is at least as identifying as the hourly movement §5 protects; a schema test asserts no `public` function's body mentions the table. Apple's `HKWorkoutActivityType` **raw number** is stored untranslated: `read.ts` decides nothing, and a translation table would silently drop every activity it had not been taught, in a table whose whole purpose is telling activities apart. One thing the spec did not anticipate and the build found: `WorkoutQueryOptions` has **no unit parameter**, unlike every other read in `read.ts` which pins its unit — but each `Quantity` reports its own `unit`, so `workout-units.ts` converts from what was reported and returns null for an unrecognised unit, which becomes 0 and makes the session non-qualifying. Inert beats wrong: a 5-mile run stored as 5,000 metres would quietly corrupt the pace the Run challenge is built on. |
| 33 | Cadence goals are a new `GoalKind` (assessment Part 1 §3.2) | **Challenges — a sibling mechanic.** `packages/kairo-core/src/challenge.ts`, `challenge_completions`, and a `/train` route. `goal.ts` is not modified | Founder decision D1/D7, 2026-08-15; Part 2 §10 overturns Part 1 §3.2. §8's Goal invariant — a target fixed at creation, because changing it mid-window would silently re-grade every day already counted — is deliberate and stays true for user-authored Goals. A Challenge's target moves **as the user moves**, which breaks that invariant on purpose, so it is a different concept rather than a variant. **Derived, never stored:** the challenge for day *D* is a pure function of qualifying sessions **strictly before** *D*, which is load-bearing twice — the session being judged cannot move its own bar, and nothing stateful exists for a retroactive Apple revision to invalidate (the read-time projection property from #18). It also delivers the *ease* requirement with no separate rule: a quiet stretch lowers the trailing median, which lowers the target, so there is no ratchet to guard against. Median over the most recent **up to** 5 qualifying sessions in a 90-day window, ±3%; median not mean, so one exceptional session cannot make the app permanently harder. **Scoring is untouched** — the same posture strain takes (#24): pace never enters `daily_scores`, and clearing a challenge adding points to that day was the rejected alternative, since it would make a stored score depend on a per-user moving target and break replay. XP is a flat 40 through a **third** source in `recalculate_user_xp`, never `daily_scores.xp_awarded`, which a rescore would replay and wipe (#19's trap). Both areas are **opt-in and default off**, so nobody meets a permanently unmet card for something they do not do. |

| 34 | An outside review recommended a six-week retention test, kill the loop under 25% engaged at D21 (design §1, §1.3) | **An activation funnel plus one analytics function**, not a dashboard. Eight new `AppEventType` members (`onboarding_started`, `health_ask_completed`, `profile_created`, `first_score_seen`, `squad_created`, `squad_joined`, `goal_created`, `disclosure_unlocked` — `first_sync_seen` was already declared, just unfired, see below); `public.kairo_retention(p_day)` in `20260816120000_retention_reporting.sql` | Founder decision, activation-and-measurement design 2026-08-15/16. The review's own recommendation could not be executed before this: `first_sync_seen` was declared in `AppEventType` and fired nowhere, and there was no event for a profile being created, health being asked, or a squad being joined — three of the funnel's five steps were dead code or missing outright (design §1.3). `disclosure_unlocked` was declared but fired nowhere on purpose — the gate it belongs to was a later plan's work; **it gained its call site on 2026-08-17 in `useDisclosure`, see #37**, and `pitch_seen` and `health_ask_dismissed` joined the vocabulary there, making nine. Two patterns worth not re-deriving: `first_sync_seen` and `first_score_seen` are gated on an MMKV once-ever marker (`milestone-store.ts`) that is **claimed before the write and released via `markUnreached` if `track` resolves `false`**, so a failed insert can retry instead of permanently losing an event this dataset cannot backfill — deliberately not the per-session marker `useAppOpenTelemetry` already uses, which is **module state that resets every cold start**, so reusing it here would OVERcount by firing once per relaunch instead of once per account, not undercount. And `kairo_retention` has EXECUTE revoked from `public`, `anon` and `authenticated` — it reads every user's activity and is admin analytics run through `remote-sql.sh`, never reachable from a client, the same posture `squad_leaderboard()` enforces structurally for squadmates. Its cohort day is `(profiles.created_at at time zone profiles.timezone)::date`, per-user-local rather than UTC — an earlier draft used UTC and would have misdated any Manila signup near midnight, disagreeing with the per-user-local `daily_scores.local_date` it is compared against. Full runbook: `docs/beta-measurement.md`. **The migration has not been applied to the live project** — withheld deliberately for the repo owner to run; see that document's "Not yet applied" section for the two commands. |
| 35 | A goal's target is a number of `daily_scores.total` points; `goals.metric` is pinned to `daily_score` (§8, migration `20260810100000`) | **A second metric, the Daily Walk.** `goals.metric` accepts `daily_walk`; `goal_window_scores()` returns a sixth column `walk_cleared`; `GoalMetric` in `@kairo/core`; the create form leads with it and points become the advanced path | Founder decision, activation-and-measurement design 2026-08-15 §10. A points target asked the user for a unit **no other surface shows** — deviation #30 removed the ambient total from every screen outside Goals, so "60,000 points" became a number nobody could evaluate before typing it, which made the target arbitrary and missing it read as the algorithm's fault. "Clear the Daily Walk 25 days out of 30" is answerable by looking at the streak already on the home shelf. **The column was widened, not added** — it already existed with `check (metric = 'daily_score')`, documented as "widenable at V1 without a type change", which is exactly what this is; note the existing value is `daily_score`, the value name, not `points`. **It reaches no raw data:** `walk_cleared` is `tiers->>'AGI' = 'gold'`, the same figure `squad_leaderboard()` already projects to squadmates, so a squad goal's projection carries nothing new. Reading `health_buckets` would breach §5 while producing an identical screen. Three things the design did not anticipate and the build found. (1) **`create_goal` needed `p_metric`**, or the widened CHECK is unreachable: `authenticated` holds only SELECT and UPDATE(title, description) on `goals`, so that function is the only way a row is ever written — dropped and recreated, since a defaulted parameter added to a function that already has defaults is an ambiguous overload PostgREST cannot resolve. (2) **`finalize-days` had its own `GoalRow` and `toGoal`** and selected no metric, so a walk goal would have been graded as a points goal against its sentinel `target: 1` — every day scoring at least one point counting as a cleared walk, latching the goal, paying XP and pushing a notification saying so. A wrong card re-renders; a latch is permanent. (3) **`stillPossible` had to change.** It keyed off `kind`, because a points day has no ceiling; a walk day is worth at most 1 whichever kind it is, so a cumulative walk goal can die before its window closes and would otherwise have reported reachable until the final day. It now keys off whether the contribution is capped, and a test pins that a cumulative *points* goal is unaffected. A `daily_walk` consistency goal stores **`target: 1` as a sentinel** because the column requires a positive value and the bar is a boolean — `windowLine()` drops its "· N a day" clause for that metric so the sentinel never reaches a screen. |
| 36 | Universal links are out of scope — "needs a domain, a hosted `apple-app-site-association`, the associated-domains entitlement and route handling" (`docs/mvp-scope.md`, QA finding Q8) | **`https://kairo-teal-nine.vercel.app/join/<code>`.** A four-file static site in `web/`, `ios.associatedDomains` in config **and** in the committed entitlements, and `app/join/[code].tsx` | Founder decision, activation-and-measurement design 2026-08-15 §11. The hosting cost that put this out of scope turned out not to exist — the whole server side is one JSON file on a free static host. **The link is an accelerator, never an action:** it seeds the field and stops, because a link can be stale, belong to a full squad, or be tapped by accident, and joining is not free on a free tier that allows one squad. Manual code entry stays for anyone whose chat client mangles the link. Four things fail **silently** here and all four are manual, because Expo's documentation assumes EAS Build "ensures the entitlement is registered with Apple automatically" and **Kairo does not use EAS** — Xcode Cloud ships the committed `ios/` exactly as it finds it (#28). They are: the config declaration, `npm run prebuild` **and a commit of the regenerated `ios/`**, the extensionless file's `Content-Type` (a static host serves it as `octet-stream` by default and Apple ignores it), and the **Associated Domains capability on the App ID** in the Developer portal. Omit any one and the entitlement is present, the link opens Safari, and nothing anywhere reports an error — the same failure class as `aps-environment`. GitHub Pages cannot host it: no custom MIME types, and a project-path repository cannot serve the domain root Apple requires. The domain is a **one-way door** — it is baked into every invite message already sent, so `INVITE_HOST` is a single constant both `app.config.ts` and `invite-message.ts` read, and moving it breaks every link already shared. `paths` is `/join/*` and nothing broader, so the landing page still opens in a browser for somebody who has not installed the app. |
| 37 | Every mechanic §5–§8 describes is on screen from the first launch | **Progressive disclosure.** `disclosureStage()` in `@kairo/core` returns `core` below `DISCLOSURE_THRESHOLD_DAYS` (3) days scored above zero and `full` at or above it; `TrainEntry`, `GoalCard`, `StatRail` and the Strain/Sleep rows are hidden in `core`, and `/train`, `/goal/new` and `SquadGoalPanel` check the stage themselves | Founder decision, activation-and-measurement design 2026-08-15 §5, built 2026-08-17. A new user met eight retention systems at once — level and XP, four ability ratings, a daily score, streaks, raw metrics, a leaderboard, long-horizon goals and squad program multipliers — before having a single day of data to read any of them against, which is the same argument as #23 and #30 applied to the surface count rather than to one number. **Hidden, never deleted:** every gated surface stays built, tested and reachable, and the threshold is one constant, so reversing this is a one-line change plus a test update — which is the property that makes it safe to try on a cohort at all. The threshold is **pinned by a test**, because moving it changes what every new user sees and nothing else would signal the change. Four things the build found. (1) **The gate is on lifetime scored days, never a recent window** — a recent-activity gate would demote someone returning from a quiet week back into the reduced app, and that user is precisely who the retention measurement is about. (2) **`total > 0` is load-bearing in the count, not tidiness**: `sync-health` writes a `daily_scores` row for every date in the payload whether or not it scored and `resolveSyncWindow` always sends today *and* yesterday, so a bare row count reads 2 on install and 3 the next day — the gate would open on day 1 for someone who has done nothing. (3) **Hiding an entry point is not closing a door**, so the two routes guard themselves — `notificationTarget` can route a Challenge push to `/train` and `finalize-days` sends a goal push carrying `goalId`. (4) **A guard that navigates must wait for the count to resolve.** The stage reads `core` while the query is in flight, which is right for hiding a card (showing less then revealing more is a reveal; showing everything then snatching it back is a bug report) and wrong for a redirect — a push tap that cold-launches straight into `/train` has no cached count, and bouncing a `full` user home on that frame is indistinguishable from the feature being removed. Hence `resolved` on the hook: hide on `stage`, navigate on `resolved && stage`. Crossing fires `disclosure_unlocked` once, ever, MMKV-gated with the claim-before-write protocol #34 settled on — the stage is derived from a day count, so without a marker it would re-fire on every launch and become a launch counter. **Existing testers with 0–2 scored days lose those surfaces on update and regain them within days; accepted rather than grandfathered**, since the cohort being measured is new users and a second rule alongside the day count would be permanent. `docs/mvp-scope.md` records this so a QA pass does not re-file the hidden surfaces as missing. |
| 38 | Onboarding is character → name, with HealthKit asked in context afterwards (§5, #27) | **`/connect` → `/character` → `/name`.** Health is the *first* onboarding step and the connect screen reads HealthKit locally to show today's real step count; `redirectTarget`'s `needs-profile` case returns `/connect` | Founder decision, activation-and-measurement design 2026-08-15 §7, built 2026-08-17. Asking fourth — after sign-in, a body choice and a name — meant the first screen a new user landed on was a dashboard of zeroes: the app at its least convincing, at the moment it had just spent all its credit. Asking first means `/name` lands on a home tab with real numbers. **The reveal works this early precisely because it needs no server**: there is no profile row yet, so nothing for `health_buckets` to hang from and no `profiles.timezone` to key a local day by — `readStepsToday` reads HealthKit directly against the *device* zone, and the first `sync-health` call still happens after `/name`. It is a new one-metric read rather than `readHealthWindow`, which reads five metrics plus workouts and sleep across two days to build a bucket payload; this needs one figure immediately, on a screen the user is standing on. Set exactly as the home hero is — same `Numeral size="hero"`, same `accent[700]`, same display-face unit — so the home tab reads as a promise kept. A zero and a throw are treated identically and neither is an error: a new phone and a phone on a desk both land there, and HealthKit will not report a denial anyway. **This screen writes nothing** — the body choice and the name both land in the single INSERT on `/name`, so **every step stays before it** and deviation #22's deleted `finishingOnboarding` flag stays deleted; adding a step *after* the name screen is what would bring it back. `onboarding_started` moved here, since it names the start of onboarding rather than the character screen, which also makes the funnel's documented step order true again (`docs/beta-measurement.md` had it deliberately out of name order for one release). "Not now" is a deferral, not a refusal — `PermissionAsks` still asks later, which is also where `health_ask_dismissed` now fires. |
| 39 | An account with no data shows "Couldn't reach Apple Health" — `syncStatus` has five kinds (2026-08-11) | **A sixth kind, `no-data`:** "Apple Health isn't sending anything yet. · Open Settings", after a six-hour grace window from the first sync ever completed | Founder decision, activation-and-measurement design 2026-08-15 §9, built 2026-08-17. Declining the Health sheet rendered an intentional choice as a technical failure, which is hostile. **A new state rather than new words**, because `failed` exists to catch the 9–11 Aug outage class — buckets committing while scoring was down and the app saying nothing — and softening its copy would blind exactly the case the module was built for. It ranks below both `failed` **and** `stale`: an error and a sync an hour behind are each the nearer problem and the second has a retry. **The grace window is the part that is easy to omit and expensive to get wrong.** Without it the state fires on somebody who connected at 8am with 200 steps and nothing scored yet — the same false accusation, aimed at the opposite user — so `SyncState` gained `firstSyncedAt`, stamped once by `markSynced` and never overwritten (`lastSyncedAt` answers a different question). A state stored before that field existed reads null and the window never elapses, which fails toward silence, the right direction for a claim that something is wrong. The action opens iOS Settings rather than retrying: every sync in the window already succeeded, so there is nothing to run again. **What it cannot say is that the user declined** — HealthKit deliberately never reports read-permission denial, since that would leak whether someone has a given condition — so "nothing has arrived" is the whole of what is knowable and "yet" keeps it a status rather than a verdict. `everReceivedData` reuses `useScoredDayCount`, the same query and key #37's hook uses, so the two readers share one request. |
| 40 | The character is a human body — §6 ships one class (Hunter) with a single figure; #27 widened that to a male and a female body | **Four Philippine endemic species — Pilandok, Tamaraw, Carabao, Philippine Eagle — chosen at onboarding, changeable any time, cosmetic only.** New nullable `profiles.species` with a CHECK constraint, in the column-scoped INSERT and UPDATE grants; `squad_leaderboard()` and `goal_window_scores()` both gain a `species` column; `character_body` left dead in place | Founder decision 2026-08-18, spec `docs/superpowers/specs/2026-08-18-animal-character-system-design.md`. A human body asks a new user to declare an identity at the highest-attention moment in onboarding and buys two assets that must be maintained forever; an endemic animal is a choice about *character* rather than about *self*, and it is the one thing in the app that is unmistakably Philippine. Four things the build found, each of which is easy to get wrong a second time. **First, `redirectTarget` cuts both ways**, so one route cannot serve both cases: a `ready` user inside `(onboard)` is bounced to `/`, and a `needs-profile` user outside it is bounced to `/connect`. One `SpeciesPicker` component is therefore mounted by two thin routes — `app/(onboard)/character.tsx` for onboarding and the groupless `app/species.tsx` for everyone past it. The first draft of this spec read half that function and would have looped a new user between `/species` and `/connect` forever. **Second, a new column rather than a widened `character_body`**, and the old one left dead exactly as `profiles.sex` is: dropping a column is not free, and the deletion that was worth making was the *TypeScript parser* — `parseCharacterBody` and `CHARACTER_BODIES` are gone, because a parser for a value no screen can produce documents nothing and invites a future reader to wire it back up. The column's schema test and its `DEAD` comment are what document the disposition. **Third, species is safe in the two projections and that is not self-evident.** §5's boundary is about health signal: a species is a cosmetic self-declaration that cannot be inverted into steps, a pace or an hour of the day, unlike heart rate, which is owner-only and stays that way. It is added *last* in both `returns table` shapes so positional consumers keep their columns, and the schema suite pins both row shapes literally so the next addition is a decision rather than an accident. `goal_window_scores()` had to be widened too — `profiles` is owner-readable, so a goal participant's species is reachable through a projection or not at all. **Fourth, one artwork per species is enough, because the figure's responses are already code**: `evolutionStageForLevel` drives the ground shadow, dominance the tint, `ratingForStatPoints` the presence ring. The stage × dominance art matrix (~96 assets) was deleted rather than filled, and that is what makes four species affordable to draw and to change. The accessible name is `speciesFigureLabel()`, a pure module tested in Node for the same reason `row-label.ts` is — no dominance yet and no species at all are both edges that read as obviously right and are wrong. |
| 41 | Four core stats — `AGI` (steps), `STR` (active calories), `END` (active minutes), `VIT` (hourly movement) — plus `REC`, a wearable-only sleep **bonus**; a day maxes at 4,400 phone-only and 4,900 with a wearable (§5, §6) | **Three stats: `AGI`, `STR`, `MND`.** `END` folds into `STR` and `VIT` into `AGI` as **threshold shifts**, and sleep is promoted from the `REC` bonus to a full stat, Mind. `TIER_POINTS` re-derives to 250 / 650 / 1,200, `CONSISTENCY_BONUS` to `[0, 0, 400, 800]`, and a day's stat points scale by `3 / earnable stats`, so **both** ceilings are 4,400. Six migrations, `20260819100000`–`150000`: `daily_scores` gains `mind_points` and `normalization_factor` and loses `end_points`, `vit_points`, `rec_points`; `profiles` gains `mnd_total` and loses `end_total`, `vit_total`; `squads.program` gains `recovery` | Founder decision 2026-08-18, spec `docs/superpowers/specs/2026-08-18-three-stat-attribute-model-design.md`, built in three phases to 2026-08-20; the deploy window and the replay are recorded in full under "The three-stat model" below. **The fold is about what the four stats measured, not about the number four.** `AppleExerciseTime` and active calories are two readings of the same effort, and VIT's active hours are a second pass over the step stream AGI already scores — two of four stats paying twice for one behaviour, while the one genuinely independent signal Kairo already read, already attributed per local date and already curved for oversleep, sat outside the model as a bonus. Neither retired stat loses its signal: `VIT_ACTIVE_HOUR_STEPS` (250) still decides an active hour, `aggregateBuckets` still computes `activeHours` and `activeMinutes`. They stopped being stats, not measurements. **Modifiers are threshold shifts, never point multipliers — deviation #10's trap avoided, not a stylistic choice.** A stored multiplier stacks with the squad program's read-time weight; that is exactly why the featured-stat rotation left stored scoring, an AGI week in a running squad having scored 2.25x. A stored spread multiplier inside a 1.5x tilt would rebuild it at 3x. A shifted *band* cannot stack, and it is easier to say out loud: moving all day makes Gold arrive sooner, rather than making Gold worth more. `spreadShift` lowers AGI's ladder 5% per active hour past 3, `workoutShift` lowers STR's 5% per 12 verified minutes, both capped at 25% — VIT's old 3/6/9 ladder and END's old 60-minute Gold, expressed as generosity instead of points. MND's shift is 0 permanently: `mindTierFor` flattens an oversleep night back to Bronze rather than comparing against a band, and the trust gate decides *whether* sleep scores, never how easily. **Normalization exists because promoting sleep changes what a wearable is worth.** Phone-only a user would max at 3,200 against 4,400 — 27% of the ceiling as a permanent leaderboard gradient rather than a daily bonus, landing hardest on the users least likely to own one. Scaling stat points by `3 / earnable stats` closes it exactly: `(2 x 1,200) x 1.5 + 800 = 4,400 = (3 x 1,200) x 1.0 + 800`. Said plainly, because it reads as a nerf otherwise: **the wearable ceiling falls from 4,900 to 4,400 and a wearable confers no raw scoring advantage at all.** What it buys is a *third route* to the same ceiling — a bad day for steps and burn can still be redeemed by sleep, where a phone-only user has two levers. The cost is real and belongs on the surface rather than hidden: two users with identical steps and kcal can score differently. `normalization_factor` is **stored rather than derived** for that reason — `squad_leaderboard()` re-sums the per-stat columns to weight them and has no other route to the figure, and it is the one number that explains the difference. **Eligibility is a trailing 14-day capability window, and both obvious answers are traps.** "Did trusted sleep arrive today" inverts the incentive — skip tracking tonight, be normalized as a two-stat user, score more for sleeping less; `profiles.has_wearable` fails the other way, being deliberately sticky, so abandoning a wearable would divide you by three forever with MND stuck at zero. **Flagged sleep counts toward capability** (if a night scores MND it must also make MND earnable, or the ceiling breaches at 6,200), and **verified means allowlisted source AND heart-rate evidence, both**, since STR's shift is worth a quarter of a band. The client sends the bundle identifier and the user-entered flag and never a verdict; the allowlist is server-side. Related: **`has_wearable` narrowed** — a hand-typed night is the clearest possible evidence of *not* owning a wearable and used to prove one, because `wasUserEntered` did not cross the wire until this change. Detail below. **The walk baseline was the sharpest edge, and the guard that should have caught it was blind by construction.** The spread shift lowers AGI's whole ladder, Gold included, and `daily_scores.tiers` stores the **shifted** tier — so Gold arrived at 7,500 steps on an eight-active-hour day and every Daily Walk read followed it down, breaching the rule that a public-health number must never scale with the user and latching `walk_cleared` on a consistency goal permanently. `sync-plan.ts` now also writes `tiers->>'AGI_base'`, the same ladder with the shift removed; both readers — `goal_window_scores()` and the 90-day streak in `train/queries.ts` — read that key and fall back to `AGI` for rows written before the switch, for which the two agree because no shift existed then (migration `20260819120000`). `scoring.test.ts`'s literal 10,000 stays and **was never able to catch this**: it asserts through `tierFor`, which *is* `shiftedTierFor(stat, raw, 0)` — the one path where the shift is absent by definition. The new tests assert through `computeDailyScore` and pin the case where the two tiers disagree. **MND was competitively invisible for a day, because the board does not read `total`** — `squad_leaderboard()` re-sums the per-stat columns, the only way it can apply program weights at read time (#11), and it was never passed `mind_points`; normalization did not reach it either, so a phone-only maxed day ranked as 3,200. `program_weighted_total` gained `p_mind` and `p_factor`, dropped and recreated by exact argument list rather than replaced — `create_goal`'s `p_metric` trap in a second place, and this time proved by mutation. **A Challenge is still derived, never stored**, and that read-time-projection property is what made the migration affordable: `daily_scores` is always replayed from stored `health_buckets`, so reverting the model is redeploying the previous functions and re-running `rescoreDay`, and every historical score returns bit-for-bit. Three things do not roll back and were accepted knowingly — `goal_completions` and challenge completions (stored, targets snapshotted), notifications already sent, and XP already rolled into `profiles` from those completions. **The ±10% replay acceptance criterion is UNMET and DEFERRED, not met and not waived:** measured median per-user daily delta **111.7%**, over one user and eight days. The figure is not meaningful, and the reason is not the constants — the cohort it was designed against was 14 fixture accounts, since purged, leaving a single real user, so there is no cohort to take a median over. The change shipped on the arithmetic and on the SQL/TS differential tests rather than on a cohort measurement. That is a real gap, recorded as one; the conditions for re-running it are in `scripts/replay-dry-run.mjs`. |
| 42 | Roadmap deviation #28 made the committed `ios/` project and Xcode Cloud the release source of truth; #29 and #36 recorded native consequences of that path | **Reversed after the EAS/CNG cutover.** Xcode Cloud is deactivated; `ios/` and `android/` are generated and ignored; EAS Build → TestFlight is the physical-device distribution path; `app.config.ts` and project-owned config plugins are the native source of truth | Approved 2026-08-23 after both TestFlight gates passed. Gate B was EAS iOS build 21 (`7b0bd494-4a00-4c5e-b789-d4746c9b02f4`), submitted as `98475e53-dcf4-4b00-833a-086ded67c3d6`, and verified on device for launch, Apple sign-in, HealthKit authorization, foreground/background sync, push delivery and tap routing, and universal links. Historical rows #28, #29 and #36 remain factual records of the previous path; this row is their approved operational reversal. Local simulator/Xcode work materialises native projects with `npm run prebuild`, while EAS CNG generates them remotely from the same config inputs. |
| 43 | Nothing in the spec covers over-the-air updates; #42 established EAS Build → TestFlight as the only way a change reaches a device | **EAS Update (`expo-updates`) ships JS and asset changes to installed builds; only native changes spend an EAS build.** `runtimeVersion` is `{ policy: 'fingerprint' }`, `updates.fallbackToCacheTimeout` is 0, and every `eas.json` build profile declares a channel (`development`, `production`). `fastlane` is installed locally, which is the missing prerequisite for `eas build --local` | Approved 2026-08-25. Under #42 every change — a copy fix, a colour, a scoring constant — cost one of the month's 15 EAS builds, and the quota, not the work, set the release cadence. OTA removes that for everything that is not native. Four things here are load-bearing. **First, the policy is `fingerprint` rather than `appVersion`, and the two fail in opposite directions.** `appVersion` ties compatibility to the `version` string, so an update reaches any build sharing it — including one built before a native module existed, which then takes the update and crashes on launch with no recovery except a new build through review. `fingerprint` hashes the real native inputs (the plugins under `plugins/`, the resolved Expo config, native dependency versions, `patches/`), so a native change moves the runtime version by construction and old builds are simply not offered the update. Both policies fail when native drifts; this one fails by withholding rather than by bricking. **Second, `fingerprint` is only compatible with `appVersionSource: "remote"` + `autoIncrement` because the default `balanced` preset skips `ExpoConfigVersions`** — otherwise every build would carry a fresh buildNumber, therefore a fresh fingerprint, and no update would ever match anything. **Third, and the subtlest: the fingerprint is identical locally and on EAS only because `/ios/` and `/android/` are Git-ignored.** `@expo/fingerprint` resolves the project workflow by asking whether the native project marker is Git-ignored — ignored means `managed`, tracked means `generic`, and the two hash differently. EAS builds via CNG with no `ios/` at all; a local `eas update` runs against a tree where `npm run prebuild` has materialised one, and still resolves `managed` purely because of #42's ignore entries. Verified: `workflow: managed` with `ios/` present on disk. Commit the native directories and every locally published update silently targets a runtime version no build has. **Fourth, `fallbackToCacheTimeout` stays 0.** A non-zero value blocks the first frame on a network request, and this app has already shipped one permanent hold overlay from a host that resolved but never connected (2026-08-14); `fetch-timeout.ts` guards Supabase and nothing guards this. Every one of these fails silently — an update publishes successfully and simply never arrives — so all four are pinned by tests in `src/config/eas-config.test.ts`, and the generated-native half is asserted on the EAS worker by `scripts/verify-ios-native-output.mjs` against `ios/Kairo/Supporting/Expo.plist`. What OTA still cannot ship, and what therefore still costs a build: anything native — icons and `app.config.ts` native fields, entitlements, plugins, new native modules, SDK upgrades. Batch those rather than spending a build each. |
| 44–45 | *(reserved)* | Reserved for the character race pivot's sibling subsystems — Body · Motion · Mind (#44) and the Today tab (#45) — which ship on their own plans. | Recorded as a gap on purpose so nothing renumbers later. The pivot's five subsystems were planned together and are being built independently; claiming a number before the work lands would leave a row describing something that does not exist. |
| 46 | The squad screen is a **daily leaderboard**: rows ordered by the program-weighted score, with the ability ratings beside each name (§7). Nothing in the spec is a race, and the Daily Walk's 10,000 steps is a personal streak target only (deviation #31) | **The board becomes a track.** A Race is an always-on *reading* of a day that already exists — no creation flow, no state, nothing stored: `squad_leaderboard()` for one local date, re-ranked on the client by **capped** steps and drawn as horizontal lanes with the endemic figures running them. `RACE_FINISH_LINE` in `packages/kairo-core/src/race.ts` **is** `DAILY_STEP_BASELINE`, derived and never written as a literal, so crossing the line and clearing the Daily Walk are the same event. The cap **is** the anti-cheat. With no squad, the rivals are the player's own recent days as ghost figures | Founder decision 2026-08-25, spec `docs/superpowers/specs/2026-08-25-the-race-design.md`, parent `…/2026-08-25-character-race-pivot-design.md`. Plan 1 of 5. **A race is not a leaderboard with a different skin, and the difference is what the whole pivot rests on.** A leaderboard ranks; a race has a shared destination, so a lane is a ground rule with a figure standing somewhere along it and the finish line is one continuous rule spanning every lane — six people running at the same flag, which a list of rows structurally cannot show. Drawing it as a filled progress bar would have reintroduced leaderboard vocabulary (a quantity, read left to right) and the redesign would have been cosmetic. **Unifying the finish line with the Daily Walk is the load-bearing decision.** `DAILY_STEP_BASELINE` is `THRESHOLDS.AGI.gold`, and pinning the race there means one number the app teaches, read socially by the race and personally by the streak. A second competitive bar at a different number would split attention between two step targets, in a product whose brief is "simple to understand, deep underneath". Three constraints follow. The race reads **raw steps**, which `daily_scores` does not store — hence the widened projection in #47, never `tiers`. The constant is **imported**, never re-derived: `10_000` appears nowhere in the race code and the plan's definition of done greps for it. And because the race never reads a tier at all, it is clear of the `AGI`/`AGI_base` trap entirely — the spread shift lowers AGI's whole ladder including Gold, so a finish line read out of `tiers->>'AGI'` would move with the user's own active hours, which is precisely the public-health failure the baseline exists to prevent. **The cap is the anti-cheat, and it is not a separate mechanism.** Inside scoring, a 40,000-step day and a 12,000-step day are both Gold, so shaking a phone buys almost nothing; racing on *raw* steps would have handed that resistance straight back. Capping race contribution at the finish line restores it exactly — past the line, extra steps buy nothing at all — with no fraud detection, no threshold to tune and no accusation to make. It also makes the common case correct: two people past the line are tied on the primary key **by construction**, not as an edge case, which is why the tie-break falls through to the daily score (the thing the engine already considers a better day) and then to `user_id` (so the order is stable across refetches and the board does not visibly twitch on every poll). **Two orderings, one payload.** `squad_leaderboard()` keeps ordering by the program-weighted total, because that is the only way a squad's program can apply at read time (#11). The race re-ranks on the client. The obvious "improvement" is to rank once in SQL, and it would silently delete the program feature — so a schema test pins that the returned `rank` sequence is still monotonic in `total`, and pins it on a fixture where the step ordering and the weighted ordering genuinely disagree. **Solo mode races your own past days**, which is the narrow deliberate exception to the source document's §20 warning against solo challenge modes: it exists so nobody meets an empty Squad tab, and so the mechanic teaches itself before a friend arrives. Days that scored nothing are **dropped rather than raced** — a new account otherwise lines up against three zeroes, which reads as the feature being broken rather than as an easy win — and with no qualifying history at all the player runs one lane beside the invite affordance. Never an empty track, never a fabricated rival. Two things there are easy to get wrong: the history query is bounded by a **date range, not a row limit**, because `.limit(14 * 24)` looks equivalent and is not (a day with fewer than 24 stored hours shifts the window and the oldest ghost then races on a fraction of its real steps); and `ghostDayLabel` names a weekday only inside a week, because `ghostRivals` takes the three most recent days that *scored* and a quiet stretch can put two Saturdays on the track. **`race_results` is deliberately not built here** (spec §7.3). A result only needs snapshotting once one is displayed as history, which arrives with the digest; building the table before anything reads it is speculative and would mean touching `finalize-days` twice. Plan 5 carries it under this row rather than claiming a number of its own. **Accessibility was the main build risk and is treated as one.** A six-lane track is the character-HUD failure waiting to happen: the HUD's `+8/+48/+48/+132` constants assumed pill heights nothing enforced and overlapped at large Dynamic Type. Lanes are therefore **flow-based throughout** — the figure is placed by two flex spacers and nothing carries a `top` — and each lane is **one accessibility element with both halves** of the 2026-08-14 grouping fix, since the documented collapse behaviour did not happen on that build. The composition is `race-label.ts`, a pure module tested in Node, extending `row-label.ts` rather than forking it. Where the name column stops fitting beside the track (past ~1.3x font scale, the same measured threshold `HealthAsk` uses) the name moves above its own lane, which costs the continuous finish line and keeps every word — the same trade the disclosure schedule makes. |
| 47 | §5's privacy boundary: squadmates reach data only through `squad_leaderboard()`, which "has no argument that returns raw steps or hourly movement". The parent spec's §4.5 gates the widening **per squad** — until every member consents, that squad's board shows what it shows today | **`squad_leaderboard()` gains four trailing columns — `steps`, `distance_m`, `active_kcal`, `sleep_minutes` — behind an explicit consent gate that is per row and reciprocal.** A member's totals are visible only when that member has consented **and** the viewer has. New nullable `profiles.squad_data_consent_at`, added to the column-scoped UPDATE grant; a consent sheet at squad create and join, and once per launch for existing members. Hourly buckets, heart rate, workout sessions, pace and timestamps stay owner-only. Migration `20260826090000_race_projection.sql` | Founder decision 2026-08-25, spec `docs/superpowers/specs/2026-08-25-the-race-design.md` §4.1 and §6. **This is the pivot's one-way door**: a squadmate who has seen a figure cannot unsee it, and the current beta cohort joined under a model where they could not. **The refinement of §4.5 from per-squad to per-row is the substantive change, and the first reason is the one that matters.** Whole-squad gating *leaks the holdout's decision*: five people who agreed see nothing, and the only available explanation is that somebody declined — which turns a private choice into social pressure, the exact opposite of consent. It also lets one holdout block five people who agreed, and it forces the feature to wait on a whole squad rather than rolling out incrementally. **Reciprocity is what stops a non-consenting viewer free-riding** on everyone else's disclosure; without it, declining is strictly dominant — you would see six people's figures and show none of your own. **What was widened is daily totals and nothing else, and the function's shape is the guarantee.** It sums a day and never selects or groups by the `hour` column, which is the difference between a total and a movement pattern; `active_minutes`, `avg_heart_rate` and `workout_sessions` are all still absent. The pre-existing schema assertion that named `steps`, `distance_m` and `active_kcal` as forbidden columns was **reversed in place, deliberately and with the reason written into it**, and re-pointed at the line that did not move. `sleep_minutes` is the one column left un-coalesced: absent sleep means no wearable reported a night, and "0 minutes" is a claim about a night that was never measured — the track has to draw that without saying someone slept for no time at all. **Three traps this migration walks past.** The function is **dropped by exact argument list and recreated**, never `create or replace`, because the return type changes and a surviving overload fails nothing until a call site resolves to it — the `create_goal` / `p_metric` trap; verified live afterwards that exactly one `squad_leaderboard` remains. The **table-level `REVOKE` precedes the column `GRANT`**, because a column-level revoke against a table-level grant is silently a no-op in Postgres, and the re-granted list is written out in full. And the four gate conditions are **written out four times rather than factored into one guard**, so the next column added here has to carry the condition rather than inherit it by accident. **On the client, `useSquadDataConsent` exposes `isSuccess` and callers must use it.** While the query is in flight `consented` reads `false`, which is indistinguishable from a real refusal — deviation #37's fourth lesson in a new place — so every gate is `isSuccess && !consented`, never `!consented` alone. The sheet **replaces** the create/join form rather than covering it: agreeing is part of joining, exactly as consenting to the squad's program already is, and a modal over a half-filled form reads as an interruption to dismiss. The early return sits **below every hook** in both forms; above one it is a conditional hook and the count changes the frame consent lands. Existing members are prompted from a **module-scope** flag rather than MMKV, for the same reason the species prompt is (#40): a permanent dismissal would strand that whole cohort on a track where every lane but theirs reads "not sharing", with no route back to the question. **A non-consenting squadmate keeps their lane and gets no position**, labelled "not sharing". Both alternatives state something false — dropping the row looks like they left the squad, and drawing them at zero looks like they did nothing today — and the second is the worse lie, because it invents a bad day for someone who may have had a good one. **Still outstanding, and it is a launch blocker, not a follow-up:** the privacy policy and the App Store privacy answers are updated in the same pass before any outsider joins a squad. HealthKit data disclosed to other users engages App Review guideline 5.1.3, and explicit consent is the defensible posture where an implicit one is not. The recorded fallback if join conversion falls materially is **steps and distance only, no sleep**, which removes most of the disclosure and most of the sheet. |

**OS constraint that validates the design:** iOS caps HealthKit background delivery for cumulative types like step count at *hourly*. That is exactly the bucket granularity §11 chose.

---

## The three-stat model (2026-08-18 → 2026-08-20)

Deviation #41 above is the decision; this is the half that is operational
rather than product, and the part a future model migration will want to read.

**Deploy is expand/contract, and only the last step is a one-way door.**
Renaming `rec_points` to `mind_points` under a deployed `sync-health` is the
August 2026 outage in miniature — that function's bucket upsert commits
*before* its score upsert, so health data keeps landing while nothing scores,
silently. No ordering of one migration and one deploy avoids a window, so the
column was added first and defaulted, the functions were deployed writing both,
the history was replayed, and only then were `end_points`, `vit_points` and
`rec_points` dropped (`20260819150000`). That last file must run **after** the
replay for a second reason: `program_weighted_total` sums the retired columns
at weight 1 precisely so a board rendered today shows the number it showed in
July, and dropping them first rewrites the past silently and destroys the
evidence. It is also the only point at which the `contributing_stats` check —
`NOT VALID` since `20260819110000`, because 32 of 75 live rows carried 4 — can
be validated. The rollup trigger's skip guard changed in lockstep: it must name
every column the rollup reads and no column it does not, and a guard left
naming `end_points` fails on the **next write**, not at migration time.

**"Replay all history" had no command under it.** `daily_scores` is always
replayed from stored `health_buckets` rather than adjusted in place, which is
the property that makes a model migration possible at all — but nothing could
execute it: `finalize-days` reaches days through `finalizable_days()`, which
filters `status = 'provisional'`, and `seed-health` can only touch seeded
users. `supabase/functions/replay-scores/` is that command and is deliberately
narrow. It has **its own `REPLAY_SECRET`**, not `CRON_SECRET`, whose absence
makes `finalize-days` skip its check — right for a job whose worst case is a
day closing early, wrong for one that rewrites every score row in the project.
It **dry-runs by default**; committing is an explicit `dryRun: false`. It
**preserves `status` and `finalized_at`**, because a replay changes what a day
scored and never when its competition ended. It does **not** go through
`finalize-days`, which writes `notification_log` — replaying through that would
push a completion notification for every goal that ever completed, to everyone
at once. And it is **deleted at runbook step 11**: an authenticated door onto
every score row is not a thing to leave standing for a reason nobody remembers.

**The ±10% acceptance criterion is unmet and deferred, and the reason is the
cohort rather than the constants.** The design required a median per-user daily
delta within ±10% and no rank moving more than one place before anything
shipped. Measured: **111.7%**, one user, eight days. The 15-account cohort the
criterion was written against was 14 fixtures, since purged, so there is nothing
to take a median over — and the finding that made the original run unusable is
worth not repeating: **identical daily totals across users are a fixture
signature**, and a script that averages them into a median is measuring
nothing. `scripts/replay-dry-run.mjs` carries a `Re-running this` section naming
the three conditions under which the number would mean something — roughly 20
users with ≥14 scored days each; a run taken **before** any further change to
`TIER_POINTS`, `CONSISTENCY_BONUS` or the shift constants, since a third model
in between makes the delta unattributable; and both halves modelling the
deployed board. Until then the change rests on the arithmetic and on the SQL/TS
differential tests, which is weaker than a cohort measurement and is recorded
as such rather than dressed up.

**Two spellings that look like a typo and are not.** The score column is
`daily_scores.mind_points`; the lifetime rollup is `profiles.mnd_total`,
matching `agi_total` / `str_total` and the `CoreStat` id. Renaming a column an
Edge Function writes is the deploy hazard above, and it was not worth taking
twice. The split has already cost one silent bug — `useDominantStat` built
`mnd_points` by string, `?? 0` swallowed the `undefined`, and MND could never be
dominant — so both readers now name their columns explicitly.

---

## Scope addition (2026-08-07) — squad programs + focus onboarding

Decided in `docs/assessments/2026-08-06-onboarding-and-program-selection.md`
(Part 2; all three open confirmations closed 2026-08-07). In one paragraph:
squads carry a **program** — `all_around` (default), `running`, `gym`,
`walking` — that boosts exactly one stat ×1.5 **at read time only**
(Running→AGI, Gym→STR, Walking→VIT; END is never boosted because of the
`AppleExerciseTime` risk). Tiers, XP and the consistency bonus stay
universal and unweighted. Onboarding gains a single-select, skippable
**focus** question. Wearable capability is **observed from synced data**
(`has_wearable` set by `sync-health`), never asked. No manual logging, ever —
device-tracked values are the single source of truth.

> **Build note (2026-08-20, roadmap deviations #41, #31 and #22).** Two of
> those four names have moved since. `gym` was renamed `strength` on 2026-08-15
> (#31), and
> **`walking` boosts `AGI`** now that deviation #41 retired VIT — which is what
> walking always measured, since VIT's hourly-movement signal survives as AGI's
> spread threshold shift. A fifth program, `recovery`, boosts `MND`; it is the
> first program a person can play without moving, which is why sleep had to
> become a stat before it could exist. The END warning below still applies, in
> its new place: MND also needs a source most beta users may not have, and what
> makes `recovery` defensible where an END program was not is normalization.
> `profiles.focus` was dropped on 2026-08-10 (#22) — `squads.program` is the
> only focus concept left, and the onboarding focus question no longer exists.

Adds ~33–49h across Phases 1, 3, 4, 5, 7 and 8; items below are tagged
**[SP]**. Deviations #10–12 above are this work.

**Build-order constraint:** the Phase 3 base-points switch (deviation #11)
must land **before or with** the Phase 4 read-time weighting — the SQL
weights assume stored points are pre-multiplier. Dev-seeded `daily_scores`
rows must be rescored (or reseeded) the day the switch deploys; pre-beta is
the last cheap moment for it.

---

## Architecture in one page

**`packages/kairo-core` is the keystone.** Scoring, goal evaluation, local-day math and anti-cheat are pure functions — no I/O, no dependencies, no clock reads. Supabase Edge Functions (Deno) import them by relative path; the Expo app imports them via a `@kairo/core` alias. One implementation, tested once in plain node, running identically on server and client. This is what makes §12's "server-authoritative, client only displays" cheap instead of a duplicated-logic tax.

**All writes are server-authoritative.** Clients have `SELECT` on their own rows and **zero write access** to `health_buckets` or `daily_scores`. Two Edge Functions own every mutation:

- **`sync-health`** — the only door health data enters through. Upserts hourly buckets (idempotent), recomputes the day via `kairo-core`, runs the anti-cheat cross-check, and honours the §19 backfill rule: a finalized day still stores buckets and credits XP/streak, but `total`, rank and coins stay frozen.
- **`finalize-days`** — hourly `pg_cron`. Finalizes each user's day ~2h after their local midnight, awards XP/level/streaks, applies the Streak Shield. Guarded on `status`, so re-running is safe.

Leaderboard liveness comes from a trigger on `daily_scores` calling `realtime.broadcast_changes` into a private `squad:{id}` topic — no row exposure.

---

## Phases

Hours track the spec's 305–430h MVP estimate (§16).

### 🟨 Phase 0 — Foundation · 20–30h
- ✅ Root npm workspace, `packages/kairo-core`, vitest in node
- ✅ Supabase schema + RLS migrations, verified against PGlite **and** against the live project
- ✅ Schema deployed to `zniopywbwenrzxezolwv` (**ap-southeast-1, Singapore**), all 11 migrations recorded
- ✅ Expo SDK 57 + Expo Router app, bundle ID `com.arsherj.kairo`
- ✅ HealthKit background-delivery entitlement confirmed in generated `ios/`
- ✅ Supabase client with Keychain-backed session storage
- ⬜ EAS dev client built and running on the physical iPhone
- 🟨 **Developer Program enrolment — done 2026-08-12.** It gated the three items
  below; all three are now merely unticked rather than blocked.
- ✅ **App ID `com.arsherj.kairo` registered** 2026-08-12, with **HealthKit +
  Sign in with Apple + Push Notifications** — the three capabilities the
  generated `Kairo.entitlements` asks for. A missing capability never fails the
  build; it installs and the feature silently does nothing, which is why all
  three went in one pass.
- ✅ **Apple client secret minted and installed** on the project 2026-08-12
  (key `2LBN6YJCCS`). **Expires 2027-02-08** — re-run `npm run apple-secret`
  before then, or sign-in dies for every user at once.
- ⬜ **APNs auth key, uploaded with `eas credentials`.** No
  `GoogleService-Info.plist` — deviation #15 replaced FCM with Expo's push
  service, and the server holds no push credential at all.

**Dev environment constraint — read before debugging connection errors.**
Outbound Postgres `:5432` is blocked on the current network, and Supabase's
direct host (`db.<ref>.supabase.co`) resolves IPv6-only with no IPv4 route. So
`supabase db push`, `psql` and `supabase start` all fail here, and none of it
indicates a problem with the project.

Working paths, all HTTPS:
- **SQL against the live project:** `./supabase/scripts/remote-sql.sh "<sql>"`
  (Management API; auth from the CLI's Keychain entry)
- **Schema tests:** `npm run test:schema` (PGlite, no Docker, no network)
- **Edge Functions:** `supabase functions deploy` works over HTTPS

`supabase start` additionally needs Docker. Podman Desktop is installed but its
VM does not mount the project directory, producing
`workdir ... does not exist on container`. OrbStack is the low-friction fix if a
local stack is ever genuinely needed — so far nothing has required one.

### 🟨 Phase 1 — Auth + onboarding · 35–45h (+8–12h [SP]; re-opened 2026-08-07)
- ✅ Sign-in provider abstraction; **anonymous sign-in stands in for Apple**
  until the Developer Program is purchased, and is compiled out of release
  builds via `__DEV__`
- ✅ Character-first flow: name + character on screen inside 60 seconds (§5)
- ✅ HealthKit permission asked as a sheet over the character screen, using
  `getRequestStatusForAuthorization` since HealthKit never reveals read authorization
- ✅ Device timezone captured at profile creation and reconciled on foreground
- ✅ Pure decision logic (route gate, permission state, timezone rule) unit-tested in Node; native and rendering code kept thin
- ✅ `profiles` INSERT grant column-scoped — RLS constrains rows, not columns
- 🟨 Sign in with Apple — **app side built 2026-08-12**, the day enrolment came
  through. `appleProvider` with the nonce flow, Apple's branded button on the
  sign-in screen, `usesAppleSignIn` writing the entitlement, and
  `npm run apple-secret` to mint the client-secret JWT and push it to the
  project. What remains is portal configuration and a device pass, both
  checklisted in `docs/sign-in-with-apple.md`. Two things there are worth not
  rediscovering: the secret **expires in ~182 days** and takes sign-in down for
  everyone when it does, and name/email arrive exactly once.
- Body metrics deferred to the soft prompt, never a gate
- ✅ Hand-verified on the simulator — the onboarding flow was walked end to end
  by hand, which is this phase's acceptance criterion (UI is verified on device,
  not by test)
- ✅ **[SP] `profiles.focus` column** — `20260807100000_profiles_focus_and_wearable.sql`.
  Nullable, `check (focus in ('running','gym','walking','general'))`, added to
  both column-scoped grants by the revoke-then-re-grant rule. Mirrored as
  `UserFocus` in `packages/kairo-core/src/program.ts`.
- ✅ **[SP] Focus screen** — `app/(onboard)/focus.tsx`, single-select and
  skippable; skip writes nothing. Profile-row existence is still the onboarding
  marker, so the gate reads 'ready' while the question is on screen — the
  navigation rule moved out of `_layout.tsx` into `redirectTarget()` in
  `features/auth/route.ts`, tested in Node, held off by an **in-memory**
  `finishingOnboarding` flag. A force-quit between the two steps therefore
  resumes into the tabs with focus unset, exactly as specified. Chips are
  shared with the Profile edit row (`FocusChips.tsx`) so the question cannot
  come to mean two things.
- ✅ **[SP] Sign-in value prop** — two lines under the tagline. Copy only.
- ✅ **[SP] `app_events`: `focus_selected` / `focus_skipped`** — plus
  `squad_program_selected`, through a new fire-and-forget
  `src/features/telemetry/events.ts` that never throws into a screen. The
  client INSERT policy already existed; no server change.

### ✅ Phase 2 — Scoring engine (TDD) · 25–35h
- `kairo-core` complete and tested: tiers, consistency bonus, REC, weekly multiplier, local-day boundaries, anti-cheat
- 143 tests. The spec's three worked scenarios (§5) are fixtures and land on 2,900 / 1,300 / 0.

### 🟨 Phase 3 — HealthKit ingest · 50–70h (+6–9h [SP])
- ✅ `sync-health` Edge Function — deployed and verified end-to-end against the
  live project: idempotent re-sync, whole-day rescoring from a partial payload,
  §19 backfill freeze, anti-cheat flag with false-positive control
- ✅ XP rollup and level derivation
- ✅ Client ingest pipeline — window reads over persisted anchors (**deviation
  #8**), local-tz hourly bucketing with DST handled, sleep attribution with
  cross-source dedup, MMKV dirty-date state, observer subscription and
  foreground flush. 91 tests across six pure modules.
- ✅ **Verified on the simulator, end to end (2026-08-01).** Real HealthKit
  samples → `health_buckets` (48 rows: today and yesterday, 24 hours each) →
  `daily_scores` → the character screen. Landed exactly the predicted 3,200:
  AGI gold 900, STR silver 500, END 0, VIT gold 900, consistency 400, REC 500,
  125 XP, level 3. Seeded by the `__DEV__` writer in
  `src/features/health/dev-seed.ts`.
- ✅ `plugins/withHealthKitBackgroundObservers.js` — registers the observer
  queries in `didFinishLaunchingWithOptions`, which the library's own plugin
  never does (see the correction to deviation #1). It reaches
  `BackgroundDeliveryManager` **through the Objective-C runtime**, not
  `import ReactNativeHealthkit`: that module's umbrella header pulls in
  NitroModules' C++ headers and fails to build as an Objective-C module from
  Swift (`'functional' file not found` → `could not build Objective-C module
  'NitroModules'`). The import version does not compile, which a control build
  confirmed. Verified by clean prebuild, a green simulator build, and a launch
  probe showing the real singleton resolved.
- ⬜ **Background delivery behaviour is still unverified.** The registration gap
  is closed, but being woken after termination cannot be observed on a
  simulator and needs the HealthKit capability on the App ID. Note also that the
  native observer calls iOS's completion handler as soon as JS is notified, not
  when the sync finishes — so background delivery is best-effort by design and
  the foreground flush remains the guarantee.
- ⬜ **Verify `AppleExerciseTime` is populated on a phone-only device.** The
  simulator provably cannot answer this: the identifier is absent from
  HealthKit's *writeable* list — it is Apple-derived, never third-party
  written — so END reads zero there no matter what, as the run above shows. If
  it turns out Watch-only in the wild, END is permanently zero for most beta
  users, `contributing_stats` caps at 3, the 800-point four-stat consistency
  bonus is unreachable, and `MAX_DAILY_SCORE_PHONE_ONLY = 4_400` (which assumes
  4 × 900 + 800) is arithmetically wrong. That would be a `kairo-core` scoring
  decision, not an ingest fix.
- ✅ **[SP] Base-points switch (deviations #10 + #11).** The rotation default
  lived in `computeDay` (`compute.ts`), not `computeDailyScore` — which
  already defaulted to null — so that is where it was removed; `planDay` now
  also passes `featuredStat: null` explicitly, so a future change to
  `computeDay`'s default cannot silently reintroduce a stored multiplier.
  `STAT_POINTS_MAX_FEATURED` and both `MAX_DAILY_SCORE_*_FEATURED` constants
  were deleted rather than stranded; `FEATURED_STAT_MULTIPLIER` stays, tested,
  for a V1 read-time projection.
  ~~**Still owed: deploy `sync-health` and rescore or reseed the live dev
  `daily_scores` rows**~~ — stored rows held post-multiplier points until then,
  and the Phase 4 board reads per-stat columns. **Both done 2026-08-07**;
  struck rather than deleted, because a phase entry is a record of what the
  work cost, not a task list.
- ✅ **[SP] `has_wearable` becomes server-observed** (closes Phase 3 follow-up
  #2). `observesWearable()` in `sync-plan.ts` is the decision — sleep minutes
  greater than zero, since a zero-minute night is indistinguishable from no
  data and the flag is sticky. The handler's write is filtered
  `.eq('has_wearable', false)`, so it only ever flips false → true and is a
  no-op for everyone already flagged. Both client grants dropped it in
  `20260807100000_profiles_focus_and_wearable.sql`.

### 🟨 Phase 4 — Squads + leaderboard · 45–60h (+15–22h [SP])
- ✅ `squad_leaderboard` **completed-day mode** — each member ranked on their own
  yesterday, so a mixed-timezone squad compares like with like (closes deviation #6)
- ✅ `seed-health` dev-only function — personas write hourly buckets, scores come
  from the real engine via `rescoreDay`, guarded by `SEED_SECRET` plus the
  `seed_test_users` allowlist
- ✅ Create/join by 6-digit code — empty state, both forms, and the RPC error
  codes mapped to human copy
- ✅ Leaderboard UI — tiers and scores only (§5), Today/Yesterday toggle, and
  mixed-timezone dates surfaced rather than implied away
- ✅ Realtime broadcast wired to the squad screen — broadcasts refresh the board
  through `squad_leaderboard`, with reconnect and foreground refetches covering
  the events Realtime drops
- ✅ **[SP] `squads.program`** — `20260807100100_squads_program.sql`.
  "No UPDATE path" is enforced by **column-scoping the client's UPDATE grant on
  `squads` to `name` alone** — `squads_update_leader` is an RLS policy, and a
  policy constrains rows, not columns. `create_squad` was dropped and recreated
  as `(text, text)` rather than gaining a defaulted parameter, which would have
  left a second overload behind; a schema test asserts exactly one
  `create_squad` exists. **Also added: `preview_squad(p_invite_code)`** — the
  join confirmation cannot show a squad's program otherwise, because
  `squads_select_member` hides the row from the person about to join. Holding a
  valid code is the authorisation; the projection carries no member identities,
  no scores and no invite code.
- ✅ **[SP] Program weights in `@kairo/core`** — `packages/kairo-core/src/program.ts`:
  `PROGRAM_WEIGHTS`, `weightedBoardTotal()`, and the personal-focus vocabulary
  (`UserFocus`, `focusToProgram`, `focusStat`) alongside it. 19 tests, END
  never boosted on any program.
- ✅ **[SP] Read-time weighting in `squad_leaderboard()` (deviation #11)** —
  board total = round(Σ per-stat points × weight) + consistency + rec,
  floored at 0; ranked in both `'current'` and `'completed'`
  modes; the returned `total` becomes this weighted number and the RPC also
  returns `program`. Tiers stay raw — gold AGI means the same thing on every
  board; weights tilt the ranking only. The SQL necessarily duplicates the
  weights table (migrations cannot import TypeScript — the
  `FREE_SQUAD_MAX_MEMBERS` precedent): cross-reference comments on both
  sides, plus a **differential test in the schema suite** asserting SQL and
  `@kairo/core` agree on fixture days (the `finalizable_days()` /
  `isFinalizable()` precedent). **As built:** the weights live in one SQL
  function, `program_weighted_total()`, so the differential test exercises the
  same expression the board uses rather than a copy of it. The board no longer
  reads `daily_scores.total` at all — it recomputes from the per-stat columns,
  which is why the one existing schema test that seeded a bare `total` had to
  start seeding points.
- ✅ **[SP] Program in the squad UI** — chip row in the create form (lead with
  the three focused programs; All-around offered as "a bit of everything");
  the join confirmation shows the squad's name **and program** before joining
  (the program is the game rule — consent to it is part of joining; personal
  focus never gates membership). Program badge on the board header. On the
  user's own row, surface the boost (e.g. an "AGI ×1.5" chip) — the character
  screen shows the unweighted own-day total, so the difference must be
  explained, not hidden. **Gym-squad creation copy:** *"Gym tracking is most
  accurate with a watch or band"* — the honest-capability rule. Copy lives in
  `src/features/squad/program-copy.ts`, tested for coverage of every program
  the core declares.
- ✅ **[SP] Remove featured-stat UI scaling** — `StatBar`'s `featured` prop is
  gone, replaced by `lane` (Phase 7's focus highlight), which marks the bar
  without rescaling it. `TodayScore` no longer selects `featured_stat`. Closes
  Phase 4 backend follow-up #1 and Phase 1 follow-up #2's featured half.

### 🟨 Phase 10 — Goals · ~30–40h (2026-08-09/10)

The feature that replaced sabotage (spec v1.4 §8, deviations #17–#20).

- ✅ **`packages/kairo-core/src/goal.ts`** — `evaluateGoal`, `evaluateSquadGoal`,
  `goalCompletionXp`. The only implementation of goal arithmetic (deviation #18);
  43 tests. Two distinctions the tests forced out and both would have been bugs:
  `progress` vs `finalProgress` (the card shows today's provisional day, but
  completion latches from final days only), and `daysRemaining` vs
  `daysUnresolved` (calendar time left is not days that can still contribute — a
  consistency goal 6 zero-days into a 30-day window needing 25 is dead, and
  counting `daysRemaining` called it reachable on the day it died).
- ✅ **Schema** — `goals` / `goal_participants` / `goal_completions`,
  `create_goal` / `abandon_goal` / `goal_window_scores`, and `can_see_goal` as
  the single visibility predicate. That last one is `SECURITY DEFINER` because
  the `goals` and `goal_participants` policies were otherwise mutually recursive
  ("infinite recursion detected in policy"). `revoke all` before re-granting, not
  `revoke insert, update, delete`: Supabase's default privileges grant ALL, and
  ALL includes TRUNCATE, which RLS does not restrict.
- ✅ **`finalize-days` goal pass** — `_shared/goal-plan.ts` (18 Node tests),
  `on conflict do nothing` as the latch. Verified live through the real pg_cron
  command path: xp 192 for a 41-day window, `total_xp` 360 → 552, level 4 → 5,
  and a re-run returning `goalsCompleted: []`.
- ✅ **`goal_completed`** claims the `BUDGET_EXEMPT` slot sabotage vacated — once
  per commitment, and the user set the commitment. Deliberately not quiet-hours
  exempt: finalization runs ~2h after local midnight.
- ✅ **UI in the two slots sabotage left** — `GoalCard` on the home shelf,
  `SquadGoalPanel` below the board, `CreateGoalForm` and `app/goal/[id]`. No
  navigation change: `TabPill` stays at three items and goals are stacked routes.
  The **pace marker** on `Meter` is the one new visual idea — a hairline tick at
  where the fill should be by today, which is the whole difference between a goal
  and a tally.
- ✅ Hand-verified on the simulator 2026-08-10 (iPhone 17 Pro): empty state,
  populated card with the marker at 30% and a burnt fill at 16% (behind pace),
  the squad detail roster with all three members, and the create form.
- ✅ **Device-test pass 2026-08-10** — eleven findings from the founder's first
  real run at the feature, fixed as deviations #21–#25 above plus straight
  defects: goals gained a `description` and a date picker with an open-ended
  option; the **Set the goal** button is a pinned footer (picking "Most days"
  added two fields and pushed it below the fold, which read as the form having
  no submit at all) and names what is missing when it is disabled; both
  empty-state cards gained a visible `CtaPill` (they were a `Label` and two
  lines of prose inside a dashed border, and were reported as not clickable);
  and **Abandon this goal** / **Leave squad** became a `destructive` Button
  variant instead of 12.5pt grey text. `pickLive()` was lifted out of `GoalCard`
  and `SquadGoalPanel` into a tested `pickLiveGoal()` en route — the two copies
  had already drifted, and a null `ends_on` would have crashed
  `localeCompare` in whichever one was missed.
- ⬜ **Still owed:** a two-client check that one member's finalization updates
  another's squad-goal panel through the existing `daily_scores` broadcast; a
  read of the dev LogBox warning the simulator reports (present before and after
  this work; origin not established); and **strain verified against real
  wearable hardware** — `computeStrain()` has 16 unit tests, but the simulator
  has no heart-rate source, so the end-to-end path from HealthKit through
  `daily_heart` to the TODAY panel is unproven on a device that actually
  produces the data.

**Fixed en route:** `redirectTarget` allowlisted `(tabs)` when ready, so any
stacked route bounced straight back to the home tab before rendering. Now a
denylist of `(auth)`/`(onboard)`, with five tests.

### 🟨 Phase 5 — Push notifications · 40–55h

**Retitled 2026-08-09.** This phase was "Sabotage + push". `deploy-sabotage`,
the sabotage client (workstream A) and `squad_feed()` were all built, verified
live, and are now **deleted** — see deviation #17. The notification engine below
is the half that survives, and it is what the phase is now about. The hours
estimate is left as recorded rather than back-fitted; roughly half of it bought
code that no longer exists, which is the honest cost of the pivot.
- ✅ **Notification engine (workstream C, 2026-08-07)** — three triggers, not
  §14's eight (§15 scopes MVP push to day end + conditional day start; a fourth,
  `goal_completed`, arrives with goals). `planNotifications` in `@kairo/core` owns the §14 rules: quiet hours
  as a **wrapping** window, and two separate exempt lists, because quiet-hours
  exemption and budget exemption are independent rules and collapsing them
  would make the day-boundary pair budget-exempt as a side effect (deviation
  #14). `dispatch-notifications` is a **second hourly cron**, not a branch in
  `finalize-days`: that function's window is local midnight *plus two hours*,
  so riding it would fire "Day ends" at 02:00 local, two hours late and inside
  quiet hours. Every MVP trigger is now on a clock; nothing fires in real time
  from another user's action.
  `users_at_local_hour()` and `register_device_token()` in `20260807110200`;
  `squad_leaderboard` gains `p_as_user` (`20260807110400`) so the JWT-less cron
  reads rank through the *same* projection the screen does, honoured only when
  `auth.uid()` is null.
  **Hand-verified on the simulator 2026-08-07** (prebuild + `npm run ios`,
  iPhone 17 Pro): the sheet stays hidden with no squad and appears on joining
  one, the OS grant is real (`didGrant: 1` in the device log), the token lands
  in `device_tokens` and re-registers on cold start, `app_open` lands, and a
  live send returned `ok: true` while writing `push_failed` (`not_configured`)
  and **no** `notification_log` row — the wrap holds and an unsent push does not
  spend the budget. (That check ran through `deploy-sabotage`, since deleted;
  the wrap it verified is in `_shared/push.deno.ts` and is unchanged.)
  **It also caught a real bug** — see the token-listener loop below.
  **Transport swapped to Expo push (deviation #15)** and verified against the
  live service: a deploy with a well-formed `ExponentPushToken` in
  `device_tokens` returned `ok: true`, Expo answered with a
  `DeviceNotRegistered` ticket, and the dead token was purged with **no**
  `push_failed` row — an unregistered device is a cleanup, not a retryable
  failure. That exercises the whole path except Apple's last hop.
  **`eas init` done (2026-08-11):** project is `@eddytion47/kairo`
  (`ccfa0966-3aa9-4548-b5a2-6e311816d8de`), `owner`/`extra.eas.projectId` set
  by hand in `app.config.ts` since dynamic config can't be written
  automatically. **Still owed at the gate:** the APNs key via
  `eas credentials`, without which `getExpoPushTokenAsync` still cannot mint a
  deliverable token.
- ⚠️ **Noted, deliberately not fixed:** iOS logs *"you still need to add
  `remote-notification` to UIBackgroundModes"* because `expo-notifications`
  implements the background-notification delegate method. MVP sends only
  user-visible alerts, never `content-available`, so the capability would be an
  unused background mode — the kind of thing App Review asks about. Add it if
  and when a silent push actually ships.
- ✅ **Bug found by hand verification: the push-token listener fed itself.**
  `getDevicePushTokenAsync()` asks iOS to register for remote notifications,
  and the token that arrives *fires the push-token listener*. The listener's
  handler called `registerDeviceToken()`, which calls
  `getDevicePushTokenAsync()` again — **66 registration attempts in 25
  seconds** on the simulator, each one a warning and a network round trip. The
  listener now writes the token it is handed and never asks for one; sign-out
  deletes a remembered token for the same reason. No test would have caught
  this: the loop only exists inside the native module's callback.
- ✅ **Live defect found while wiring the second cron: both crons were 401ing.**
  From 2026-08-07 06:05 UTC the Functions gateway began rejecting
  `net.http_post` calls that carry no `Authorization` header —
  `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` — *before* the handler runs, so the
  `x-cron-secret` check never happened and **no day finalized for six hours**.
  Nothing in the database recorded a failure; the only evidence was in
  `net._http_response`. `20260807110500` reschedules both jobs with the
  publishable key (which already ships in the app and authenticates nothing on
  its own) read from Vault; `CRON_SECRET` remains the actual guard. Verified by
  running the scheduled command verbatim: 200, and the backlog of 58 days
  finalized in one pass. **Check `net._http_response` when adding any future
  cron → Function.**
- ⬜ Real-time FCM push (needs Firebase credentials) — everything above it runs
  end to end today and returns `not_configured` at the provider boundary
- **Start beta recruitment during this phase** — stranger squads have a long lead time
- **[SP] Recruit per program:** beyond the friend squads (likely All-around),
  at least one running, one gym and one walking squad — ideally **two gym
  squads, one wearable-heavy and one phone-only**. Their delta is the direct
  measurement of the revised risk question: *is the gym program viable
  phone-only, or does STR-by-estimated-calories feel dead?*

### 🟨 Phase 6 — Day lifecycle · 40–55h
- ✅ `finalize-days` cron — hourly at `5 * * * *`, per-user grace window,
  provisional → final, XP/level, personal streak + Streak Shield
- ✅ Account deletion / right-to-erasure with leadership succession
- ⏭️ N-of-M squad streak (needs a `squad_streaks` table) — **moved to V1**
  (deviation #16). §15 always listed it under V1; this phase held it open.
- ⬜ Coin awards — deferred with the coin economy to V1

### 🟨 Phase 7 — Solo mode + polish · 35–50h (+4–6h [SP])
- ✅ **Solo mode + locked squad slots (§7)** — `SoloBoard` renders the caller's
  own day beside five locked slots; slots also show under a real board, since
  §7 wants them visible every day. Slot counts come from a `squad_members`
  count rather than `squad_leaderboard`'s rows. ⚠️ **Corrected 2026-08-08
  (workstream D3.3):** the stated reason — that the RPC returns only members
  who have *scored* — was never true. Every version reaches `daily_scores` by
  `left join`, so an unmoved member comes back with `total = 0`. The count is
  therefore redundant, not load-bearing; removing it is a V1 cleanup rather
  than a fix, and workstream A's deploy sheet relies on the corrected reading
  (its target list is board rows). `SquadEmptyState` is absorbed.
- ✅ **"Squad slot unlocked" reveal** — an `Animated` fade + scale fired when a
  refetch observes the member count rise. Not Realtime: membership changes do
  not broadcast (Phase 4 follow-up #8), so it lands on the next foreground or
  pull rather than instantly.
- ✅ **Profile screen (§15)** — level with an XP progress bar, current/longest
  streak and whether a Streak Shield is banked, editable body metrics behind
  §5's soft prompt, timezone read-only, `__DEV__` seeder kept.
- ✅ **Visual evolution by dominant stat (§6)** — `dominantStat()` in
  `@kairo/core` owns the All-Rounder predicate (all within 20%); the figure
  varies frame, aura and stance by it, with a label on the character screen.
- ✅ **Notification budget engine (§14)** — `packages/kairo-core/src/notifications.ts`,
  pure and TDD'd. See Phase 5 for the delivery half.
- 🟨 **AI-generated placeholder character art (§15)** — the *path* is built
  (workstream D1): `CharacterFigure` looks art up by `${stage}-${dominance}`
  and renders the `View` primitives whenever a key is missing, so assets land
  one file at a time and a half-populated directory is correct rather than
  broken. `CHARACTER_ART` is empty today, so every character still draws as
  primitives. `assets/character/README.md` specifies the 24 keys and the format.
  **Still owed: the images themselves**, plus one `require` line each.
- ✅ **Telemetry on the two silent failures (workstream D2)** — closes Phase 1
  follow-up #1. `timezone_sync_failed` on the reconcile write error, and
  `health_permission_failed` from a `catch` that `HealthPermissionSheet.ask()`
  never had: it was `try`/`finally`, so a rejected `requestAuthorization`
  became an unhandled rejection *and* the `finally` dismissed the sheet, making
  a failed connect look exactly like a successful one. The sheet now closes
  only on success and shows an error line otherwise.
- ✅ **The two permission sheets could not both present — found 2026-08-08
  during workstream D's hand verification, and it was the worst defect in the
  app.** `HealthPermissionSheet` owned a `<Modal>` on the character screen;
  `NotificationPermissionSheet` owned another at the tabs shell. A `<Modal>`
  presents on the **root** view controller wherever it is mounted, so the two
  were never independent: when both turned visible in the same frame UIKit
  refused the second — *"Attempt to present … which is already presenting …"* —
  and suppressed it with nothing surfaced to the user.

  **Two consequences, and the quiet one was worse.** The loud one: UIKit was
  left inconsistent and the tab bar stopped accepting touches, surviving app
  relaunch and clearing only on a device reboot. The quiet one, reproducible
  from a clean boot: the **Health** sheet lost and never appeared, though
  `permissionState()` returned `should-ask` — silently removing the only
  in-app route to Apple Health, the app's entire data source.

  Trigger: *has a squad + notification permission undetermined + Health not yet
  granted* — i.e. every launch for anyone who tapped "Not now" on Health and has
  a squad, since both sheets re-arm per session. It also lands at the Apple
  gate: after E5, signing in on a second device hits it on first launch.

  **Fix: one decision function and one modal host.**
  `permissions/ask-order.ts` is pure and TDD'd (10 tests);
  `permissions/PermissionAsks.tsx` holds the app's only permission `<Modal>` and
  the two sheets became bodies rendered inside it. Two rules the spec does not
  address and that are therefore recorded here rather than in the deviations
  table: **Health is asked first** (it is the data source — a notification ask
  answered first would be promising to announce nothing), and **one ask per
  session**, because answering Health makes the notification ask eligible in the
  same frame and a sheet arriving as another slides away is how an install
  spends its one iOS dialog on a "Don't Allow".
- ✅ **Two defects from the 2026-08-07 UI verification (workstream D3)** —
  `CreateSquadForm`'s name field now sets `letterSpacing: 0` explicitly, because
  React Native recycles native inputs and applies only properties that are
  *present*, so after Join → Back → Create the field inherited
  `JoinSquadForm`'s `letterSpacing: 8` and truncated its placeholder. And
  `programNote()` moved **above** the program picker: below it, the gym
  accuracy warning rendered off-screen at the moment Gym was tapped, so the one
  person it is written for never saw it. Both hand-verified on the simulator
  2026-08-08: the placeholder renders full after Join → Back → Create, and the
  note is visible without scrolling the moment Gym is selected.
- ✅ **[SP] Focus edit row in Profile** — `FocusCard.tsx`, beside the
  body-metrics card, reusing the onboarding chips.
- ✅ **[SP] "Your lane" highlight** — `src/features/character/lane.ts`, tested.
  Presentation only: the lane bar gets a tag and a border, never a wider
  ceiling or a different colour.
- ✅ **[SP] First-sync moment** — `FirstSyncCallout.tsx` over a pure
  `firstSyncHeadline()`. Steps come from the caller's own `health_buckets`
  (`daily_scores` stores points, not measurements) and are only queried while
  the callout is still owed. One-shot per user in its own MMKV instance, so
  signing out does not resurrect it. Handles the lifter case: a gym session is
  calories, not steps, so "0 steps" never leads.
- ✅ **[SP] "Have an invite code?" affordance on the solo board** — the
  equal-weight "Join with a code" button was demoted to a link. Create stays
  the funnel.

### ✅ Phase 8 — UI redesign · 40–50h
- ✅ **Shared `src/ui` primitive layer** — nine components (`Screen`, `Panel`, `Numeral`, `Label`, `Meter`, `TierChip`, `Button`, `Aura`, `TabPill`) with a unified design language, motion policy, and zero dependencies
- ✅ **Five pure decision modules, 37 new tests** — `ui/motion-policy` (7), `character/standing` (10), `character/stat-detail` (7), `character/stat-fraction` (8), `squad/standing` (5). Every UI *decision* runs in plain node; rendering stays thin, as with the Edge Functions' `*-plan.ts` split
- ✅ **`nextTierFor` added to `kairo-core`** so tier thresholds stay in one place — the stat detail line needs a gap in raw units, which `daily_scores` does not store
- ✅ **Every screen rebuilt on the primitive layer** — the three tabs, onboarding, auth, the health sheet, squad forms and feature cards
- ✅ **Spec reference:** `docs/superpowers/specs/2026-08-04-ui-redesign-design.md`
- ⬜ **Device verification** — end-to-end UI rendering on the physical iPhone (outstanding, batched separately)

### 🟨 Phase 11 — Solo mode: Walk, Strength, Run · ~30–40h (2026-08-15)

Spec: `docs/superpowers/specs/2026-08-15-solo-mode-walk-strength-run-design.md`
(deviations #31–#33). Solo mode becomes three areas that differ in what data
backs them: **Walk** on steps already stored, **Strength** and **Run** on
workout sessions, which are new.

**Phase 9 is deliberately sequenced behind this** (founder decision D2). The
assessment's own recommendation was the opposite — ship the copy changes now and
defer the rest until the beta's first read, on the argument that the beta's four
risk questions need none of it. D2 overrules that on the counter-argument that
Parts 2 and 3 change what solo mode *is*, so betaing without them measures a
product already being replaced. The cost is real and accepted: the beta slips by
the length of this pass.

- ✅ **`gym` → `strength`** (deviation #31) — migration `20260815100000`, plus
  `program.ts` and `program-copy.ts`. Landed alone and first, because it is the
  smallest piece and the one most likely to be left half-done.
- ✅ **Metric purpose** — `STAT_WHY` beside `STAT_UNITS` in `stat-detail.ts`,
  rendered as four lines on `app/progress.tsx`. §5's own medical reasoning,
  which the spec has always carried and the app had never shipped. VIT's is the
  one that matters: not "move a bit more", but that a single long workout does
  not buy off a day spent sitting — a different claim, and the actual reason the
  stat exists. It goes on the existing "How progress works" sheet rather than on
  home, which is already the densest screen in the app.
- ✅ **Daily Walk** — `DAILY_STEP_BASELINE` (derived from `THRESHOLDS.AGI.gold`,
  never a literal), `src/features/train/daily-walk.ts`, and `DailyWalkCard` on
  the home shelf. Flat, permanent, 10,000, **never scaled up even as the user
  improves**: it is a public-health number, not a personal-progress one, and
  conflating the two is the specific error to avoid. That is exactly why it is
  not a Challenge, and it is not a `goals` row either — the Goal shape cannot
  express "every day, forever, resets daily".
  **Two things the build found.** The streak reads `tiers->>'AGI' = 'gold'`,
  which *is* "≥ 10,000 steps" because that is the AGI Gold threshold — so it
  needs no new column and no new sync; a test pins the coupling. And the card
  deliberately **does not restate today's steps or the gap**: the hero already
  sets steps at 64pt and `detailCopy` already names the remaining steps (the
  same figure, since AGI Gold and the baseline are one threshold), so the card
  says the two things nothing else says — that the target is fixed forever, and
  the run of days. A test asserts the copy names no figure but the baseline and
  the streak.
- ✅ **Workout-session ingest** (deviation #32) — `workout_sessions`,
  `read.ts` keeping the fields it already received, `sync-plan.ts` validation
  with `MAX_SESSIONS_PER_SYNC`, and the upsert in `sync-health`. No user-facing
  change. `workout-units.ts` exists because `queryWorkoutSamples` takes no unit
  parameter — see #32.
- ✅ **Challenges engine** (deviation #33) — `challenge.ts` (40 tests),
  `challenge_completions` with the XP rollup's third source,
  `challenge-plan.ts` (14 tests), the `settleChallenges` pass in
  `finalize-days`, and the `challenge_cleared` push. That trigger is
  **budget-counted and not quiet-hours exempt**: a challenge clears repeatedly
  by design, which is precisely the recurring-nudge case `BUDGET_EXEMPT`'s own
  comment excludes.
- ✅ **`/train`** — a stacked route, not a fourth tab (the precedent Phase 10
  set for goals). Opt-in happens here on first visit, so onboarding stays at two
  screens and the profile row still commits exactly once. `TrainEntry` on the
  home shelf shows the live target as text, so the mechanic is legible without
  navigating — for a cold-start user that reads as "Log one run of 1 km", which
  is an invitation.
- ⬜ **Apply the three migrations to the live project, then redeploy
  `sync-health` and `finalize-days`** — in that order, with
  `supabase/scripts/smoke-sync.mjs` between them. A migration touching a table
  an Edge Function writes ships with that function's redeploy.
  **Do not compress the ingest and the engine into one deploy**: a derived
  challenge needs a trailing window, and there is none until sessions have been
  syncing for a few days.
- ⬜ **Hand verification** — Accessibility Inspector on the two new cards and
  the `/train` route (is a challenge card one element or six), and Dynamic Type
  at `accessibility-extra-extra-extra-large`.
- ⬜ **Routines** — designed in §9 of the spec, **not built**. A third mechanic
  beside Goals and Challenges: shared frequency, personal bar. Recorded so the
  next pass starts from a settled design rather than re-deriving one.

### 🟨 Phase 9 — TestFlight + beta · 20–30h

**Sequenced behind Phase 11** as of 2026-08-15 (founder decision D2) — see that
phase for the argument and its accepted cost.
- 🟨 **Privacy policy, ToS and nutrition labels drafted** (workstream D6) in
  `docs/legal/`. Pulled forward from E7 deliberately: §15 puts them in V1, but
  external testers need them and they have a lead time measured in days, so
  drafting them late is the thing that delays a beta. Written against what the
  schema and Edge Functions actually do, with the six decisions that are the
  founder's — controller identity, contact address, retention period, DPO,
  jurisdiction, and whether beta data survives — left as visible `[[TODO]]`s
  rather than guessed. **Still owed: counsel review, and a public URL for the
  policy** (App Store Connect requires one for any app requesting HealthKit).
- ⬜ `app_events` instrumentation
- ⬜ Internal → external testers, beta ops
- ⬜ **Undeploy `seed-health` before external testers join** — it fabricates
  activity, and the beta measures real behaviour
- 🟨 **[SP] Segment beta metrics by squad program and personal focus** —
  the instrumentation is in place (`profiles.focus`, `squads.program`, the
  three `app_events` types) and the four queries are checked in at
  `supabase/analytics/beta-segmentation.sql`: D7/D21 per program, gym viability
  wearable vs phone-only, declared focus vs observed dominance, and the focus
  question's own funnel. Running them is beta-time work.

**Why Phase 2 precedes Phase 3:** scoring is the highest-risk logic in the product and needs no device, HealthKit or network. Green tests first means every later phase debugs *plumbing* against known-correct math, instead of debugging math and plumbing at the same time.

---

## Testing posture — focused TDD

Strict red-green-refactor on the money logic. UI verified by hand on device.

- **`packages/kairo-core`** — vitest in node. Every tier boundary (999/1,000, 9,999/10,000…), all consistency-bonus permutations, REC's over-9-hours penalty, the weekly multiplier, the §5 worked scenarios as fixtures, goal window and N-of-M evaluation, and the jog-must-never-flag anti-cheat case.
- **Day boundaries** — `day.ts` takes `now` as a parameter and never reads the clock, so Manila/Dubai/New York, DST and the grace window are table-driven tests with no time mocking.
- **Edge Functions** — Deno tests against `supabase start`. Idempotency asserted explicitly: run `sync-health` twice, assert one set of rows and one score.
- **`seed-health`** — dev-only function writing synthetic buckets for fake squad members. Non-negotiable for velocity: without it, testing a leaderboard means physically walking 10,000 steps, and testing week-3 dynamics is impossible.
- **Schema** — `npm run test:schema` applies every migration to [PGlite](https://github.com/electric-sql/pglite) (real Postgres, WASM, in-process) and asserts constraints, triggers, RPC behaviour and RLS enforcement under a non-owner role. Runs in ~1.5s with no Docker.

  **Its limits, so nobody over-trusts it:** `supabase/tests/harness.ts` stubs the platform's `auth` and `realtime` schemas. It proves the SQL is valid and the policies bite, but it does *not* prove Supabase's Realtime server actually delivers the broadcasts, nor that the hosted `auth` schema behaves identically. Re-run the same suite against `supabase start` once Docker and the CLI are available.

---

## Open questions

| Question | Status |
|---|---|
| Google Sign-In in the beta? | ✅ **Decided: Apple only.** Apple mandates Sign in with Apple anyway; Google is deferred to the Android work in V1.5. |
| Streak milestones (§19) pay coins, but the beta has no coin economy (§15) | Milestones award **XP + badges only** in MVP; coins arrive at V1 with the shop. |
| Database region | ✅ **Done: `ap-southeast-1` (Singapore).** Project recreated as `zniopywbwenrzxezolwv` while the database was still empty. Supabase cannot relocate a project, so this was the only cheap moment to do it. |

### Deviations introduced during implementation

All three are live and deliberate. Flagged here so they are decisions, not drift.

| # | Spec says | We do | Why |
|---|---|---|---|
| 5 | "Coins + XP distributed at finalization" (§12) | XP accrues **live** as the day progresses; only coins would wait for finalization | XP within a day is monotonic — more activity only ever adds — so live accrual has no downside and makes the character respond while you walk. `profiles.total_xp` is a rollup of `sum(xp_awarded)`, so it self-corrects. One-line change if you want strict spec behaviour: filter the rollup to `status = 'final'`. |
| 6 | "the squad leaderboard compares most-recently-completed days" (§2) | `squad_leaderboard()` defaults to each member's **current** local day | This is the live in-progress board the app shows all day, which §2 also implies ("1 hour left. You're in Nth place"). The settled cross-timezone view is a second mode the RPC now also has — **delivered in Phase 4** via the `'completed'` mode parameter. |
| 8 | "Observer queries + background delivery, **anchored reads with persisted anchors**" (this roadmap, Phase 3) | **Hourly statistics-collection queries over a bounded window; no anchors at all.** State is a dirty *date* set, and every dirty day is sent whole — all 24 hours, zeros included. | Four reasons. (a) `HKStatisticsCollectionQuery` with `cumulativeSum` applies Apple's cross-source dedup, so an iPhone and a paired Watch do not double-count steps; raw anchored samples would mean reimplementing it, and getting it wrong inflates scores for the most competitive users. (b) Hourly bucketing falls out of the query — raw samples would need proportional splitting of a walk spanning 08:50–09:10. (c) Apple's retroactive revisions are free, because re-reading returns corrected totals into an endpoint that already rescores the whole day. (d) A stale anchor is silent, permanent data loss; a window high-water mark's worst case is re-reading data already sent, which the idempotent upsert absorbs. **Whole-day emission is what replaces `deletedSamples`:** an hour revised *downward* is sent as an explicit zero, so the stale bucket is overwritten rather than stranded. 31 days × 24 = 744 is what sizes the window against `MAX_BUCKETS_PER_SYNC = 750`. |
| 9 | — | **A DST day contributes 23 or 25 wall-clock hours but only 24 buckets** | `health_buckets.hour` is `check (hour between 0 and 23)` with a PK on `(user, local_date, hour)`. On a fall-back day the two 01:00 hours are summed into one bucket, so VIT sees 24 candidate hours instead of 25; spring-forward gives 23. ±1 activeHour, twice a year, DST users only. The alternative is a schema change plus a disambiguator column. Not worth it — the day's *total* is preserved either way. |
| 7 | Apple/Google sign-in (§15) | **Apple, plus anonymous in development builds only.** Google stays deferred to V1.5's Android work. | Anonymous was the whole of this deviation until 2026-08-12, because the Developer Program had not been purchased and Sign in with Apple cannot be enabled on the App ID without it. It was one tap with no form — the same shape Apple's flow has — so onboarding was rehearsed against the flow that ships. **Apple landed 2026-08-12** and `availableProviders()` now returns it unconditionally; anonymous survives behind `__DEV__` for simulator work. One line here has been **reversed**: it used to say "disable anonymous sign-ins on the project when Apple lands", and that is the wrong lever. `external_anonymous_users_enabled` stays `true` — the `__DEV__` guard, not the project setting, is what keeps anonymous out of TestFlight, and turning the setting off would break every dev sign-in without making Release one bit safer. |

---

## Device-verification findings (2026-08-11)

Found by hand on the simulator while verifying the character body choice
(deviation #27). Neither was introduced by that work; both predate it.

| # | Item | Status |
|---|---|---|
| 1 | **`app_events` and `device_tokens` referenced `public.profiles`**, which does not exist until onboarding commits it — so every telemetry write and token registration between sign-in and profile creation failed `23503`. The real cost was not the dropped row but that the **sign-in → abandon funnel was structurally unmeasurable**: a user who never names a character produced no events by construction, so the drop-off §15's beta most wants to count could not be counted. | ✅ **Fixed** — `20260811130000_account_scoped_telemetry_fks.sql` repoints both at `auth.users`, which exists from sign-in. Delete actions unchanged (`set null` / `cascade`); erasure unaffected because `profiles.id` already cascaded from `auth.users`. `track()` now reports whether the row landed, so a failed `app_open` no longer poisons the per-session dedupe marker and cost a whole day. |
| 2 | ~~**There is no account-deletion path.** `delete_account()` does not exist — verified against the live project; `leave_squad` is the only routine of its kind, and `handle_profile_deletion` is a trigger. There is no delete-account UI in the client either.~~ **Done 2026-08-11**, `20260811140000_account_deletion.sql` plus `app/delete-account.tsx`. | The cascade underneath was already right — `profiles_handle_deletion` hands squad leadership on before the FK cascade fires — so the RPC and the screen were most of the work. The audit for it surfaced a real gap the QA pass had not: `goals.created_by` cascaded, so erasing an author destroyed a squad goal other members were part-way through. Now **SET NULL**, because that column confers only the `goals_update_own` title edit — succeeding it the way squad leadership succeeds would hand someone editorial control they never had. A new AFTER DELETE trigger, `profiles_collect_orphaned_goals`, sweeps goals left with neither creator nor participant; it must stay AFTER, since `goal_completions_xp_rollup` updates `profiles` and reaching a completion from a BEFORE trigger aborts the statement. Verified end-to-end against the live project with a throwaway account, not just in PGlite. |

## Device-verification findings (2026-08-14)

**The last release blocker recorded in deviation #28 is closed.** Sign in with
Apple was exercised on real hardware from a TestFlight install and works. That
is the one thing the whole Xcode Cloud detour existed to make possible, because
USB pairing is blocked at the kernel on this machine and the two halves of Apple
sign-in that live outside git — the capability on the App ID, and the ES256
client secret — both fail *silently* and in a way that is indistinguishable from
a phone not signed into an Apple ID. Neither could be proven on a simulator.

Two builds reached TestFlight before one could launch, and they are worth reading
together because they share a shape: **a green archive is not evidence of a
working app.** The first died in dyld (`ExpoModulesJSI` never embedded, traced to
build output baked into a patch-package patch); the second died on the first
frame (deviation #29, the prebuilt React ABI mismatch). Nothing was red in either
build's log. Both now have guards in `ci_post_clone.sh` that fail the build
instead, which is the only durable answer to a failure mode whose symptom is
downstream of the archive.

Still unverified on hardware, and not blocking: HealthKit background delivery —
the observer queries registered in `AppDelegate` cannot be exercised on a
simulator. If `setupBackgroundObservers` ever stops resolving it says so loudly
in the device console (`[Kairo] HealthKit background observers NOT registered`),
which is the whole reason that branch is not silent.

### Push delivery, proven end to end (2026-08-14)

**Closed.** Registration → dispatch → receipt → tap routing, all on hardware
from a TestFlight install.

What it took was more than verification, because **the client half did not
exist**. The server had been sending a deep-link payload in every push since the
notification engine shipped — `{trigger, localDate, screen}` from
`dispatch-notifications`, `goalId` from `finalize-days` — and nothing read it.
There was no `setNotificationHandler`, so a push arriving while the app was open
displayed nothing at all, and no response listener, so a tap opened the app
wherever it happened to be. `src/features/notifications/routing.ts` is the fix.

The evidence, in the order it was gathered:

| Leg | How it was shown |
|---|---|
| Registration | `device_tokens` row updated 05:16 UTC by the production build. Strong on its own: `getExpoPushTokenAsync` fails with *"no valid aps-environment entitlement string found"* when the entitlement is wrong |
| Delivery | Expo ticket `ok`, then an **APNs receipt** of `ok` — Apple accepted it, not merely Expo |
| Display | Banner appeared with the app foregrounded, which is what `setNotificationHandler` bought |
| Tap routing | All three app states — foreground, backgrounded, force-quit — each landing on the right tab |
| The real dispatcher | `{"candidates":1,"sent":1,"suppressed":0,"failures":[]}` |

The dispatcher was tested by **moving the profile's timezone to a zone at local
23:00** (`America/Belize`) and invoking the function the way cron does, through
`net.http_post` with the Vault secrets — so the shared secret was never handled
directly. Reverted to `Asia/Manila` immediately after. Do not open the app
during that window: `useTimezoneSync` reconciles the column from the device and
would undo it mid-test.

Two things this surfaced that are worth keeping:

- **`notification_log` was empty until this run.** The scheduled engine had
  never delivered anything in production — unsurprising in hindsight, since the
  APNs key was not uploaded to Expo until the same day, but nothing anywhere
  said so. The one row it now holds carries `local_date = 2026-08-13`, which is
  Belize's date and not Jay's; it is a test artifact and is left in place
  because it is a true record of the first successful send.
- **`getIosPushNotificationServiceEnvironmentAsync()` cannot answer on
  TestFlight.** It parses `embedded.mobileprovision`, and App Store
  distribution strips that file — `EXProvisioningProfile.m`'s own
  `appReleaseType` has an explicit branch for its absence. A diagnostic built on
  it shipped in this build and told the phone it was a simulator while it was
  receiving push. Corrected to report registration instead, which is knowable
  everywhere and is the stronger signal.

`supabase/scripts/send-test-push.mjs` now exists so this does not have to be
re-derived. It bypasses the dispatcher on purpose: if it succeeds and a
scheduled push never arrives, the fault is candidate selection or the budget,
not credentials — two failures that otherwise present identically as "no
notification".

### Invite redemption and Realtime, verified (2026-08-14)

**Closed.** Driven with `supabase/scripts/rehearse-squad-join.mjs`, which puts a
throwaway anonymous account into a squad from outside so a real device can be
watched. That is the only way to check the one property the schema suite
explicitly cannot: PGlite stubs the `realtime` schema, so it can prove the
trigger fires and cannot prove a broadcast **arrives**.

| Checked | Result |
|---|---|
| Redemption by six-character code | Joined on first attempt |
| Live board reorder, no pull-to-refresh | The joining account's 5,350 displaced Jay's 500 on screen |
| `SlotUnlockReveal` | Animates — see Phase 7 follow-up #5 |
| `leave_squad()` + rejoin on **hosted** auth | Membership row gone, then back, same squad id |

The last row closes one of the two gaps `docs/mvp-completion-plan.md` names as
beyond the harness — that `leave_squad()`'s behaviour on the hosted `auth`
schema matches the stub. Tested with an ordinary member, not the leader:
succession is a different path, and exercising it on a live squad would hand
someone's squad to a throwaway account. **Leader succession on hosted auth
remains unverified.**

Rehearsal accounts are erased with `--cleanup`, which deletes through
`auth.users` and lets the cascade take the memberships — the same exit
`smoke-sync.mjs` uses.

### The app hung forever on a blocked network (2026-08-14)

Found by accident mid-verification, and the most user-facing defect of the day.
A WiFi network began blocking `*.supabase.co` at the TCP layer — DNS resolved,
the connection never completed. `supabase-js` sets no timeout and neither does
`fetch`, so the profile query never settled, `resolveRoute` kept reporting
`'loading'`, and the app sat on the KAIRO hold overlay **through relaunches and
a reinstall from TestFlight**. The `'profile-error'` cover with its "Try again"
button was already built and was unreachable, because nothing ever errored.

This matters more than a one-off: the target market is Philippine mobile data,
and "connected but the host is unreachable" is a normal condition there, not an
exotic one.

Fixed by `src/lib/fetch-timeout.ts` on `createClient`'s `global.fetch`. It
**races** a deadline against the request rather than only aborting it — aborting
merely asks the transport to reject, and this exists for the case where the
network layer is misbehaving, so a transport that swallowed the abort would hang
one level down. The test that stubs a fetch ignoring its signal is what caught
that.

Two diagnostics worth reusing, because both cost minutes here:

- `curl -w 'connect=%{time_connect}s'` showing DNS resolved but
  `connect=0.000000s` is a **block, not an outage**. Check the Management API
  separately — `api.supabase.com` is a different host and kept working while
  the project's own subdomain was unreachable, which made the database look
  healthy (it was) and the platform look fine (it was).
- Open the REST or auth URL in **Safari on the phone**. A browser hanging on the
  same host removes the app from the picture entirely, which is what finally
  distinguished "my code" from "this network".

The investigation also surfaced, and reverted, a deviation in
`src/lib/query-client.ts`: `onlineManager` had been wired to NetInfo's
`isInternetReachable` rather than TanStack's documented `isConnected`. It was
**not** the cause — both read true on that network — but it is its own way to
produce the same endless spinner, since that field is a probe against an
unrelated third-party endpoint and paused queries never error.

### What the accessibility pass found on hardware (2026-08-14)

Build `90f75aa` shipped Dynamic Type caps and VoiceOver names. Tested on an
iPhone at the largest accessibility text size and with VoiceOver, it produced
three findings. Design spec:
`docs/superpowers/specs/2026-08-14-accessibility-device-fixes-design.md`.

| # | Finding | Disposition |
|---|---|---|
| 1 | The **character tab** is unreadable at the largest text size; Squad and Profile are fine. | ✅ **Fixed.** It was the app's only absolutely-positioned chrome — four HUD layers pinned at `+8`, `+48`, `+48` and a magic `+132`, each silently assuming the pills were a certain height. Every other screen uses `paddingTop` and flows, which is exactly why only this one broke. Now one flowing column, and the HUD's text caps at `fixed` (1.2×). |
| 2 | VoiceOver reads a **leaderboard row as separate stops** despite the row carrying `accessible` + `accessibilityLabel`. | ✅ **Fixed**, and it is the important one: **a technique shipped across six components in that build does not do what it claims.** iOS is documented to collapse descendants of an `accessible` parent and did not here. |
| 3 | Layout stays sized for large text after returning to normal, until relaunch. | ⛔️ **Won't fix** — see below. |

**Finding 2's mechanism is unconfirmed, and the fix deliberately does not depend
on knowing it.** RN `Text` is an accessibility element by default, `Numeral`
carries its own label, and this app is New Architecture only; any of those could
be the cause, and the React Native docs do not settle it. Rather than diagnose
and hope, the parent keeps `accessible` + `accessibilityLabel` **and** every
direct child is hidden outright with `accessibilityElementsHidden` +
`importantForAccessibility="no-hide-descendants"`. Applied to `LeaderboardRow`,
`StatBar`, `GoalBar`, `StreakCard`'s two figures and `Diorama`'s figure. Both
halves are load-bearing — neither is redundant.

**Finding 3 is a decision, not an oversight.** A relaunch clears it, so nothing
is persisted: this is React Native not re-measuring existing views when iOS's
content size category changes at runtime — font sizes update, the boxes laid out
around them do not. There is no supported RN subscription for
`UIContentSizeCategoryDidChangeNotification`, so a fix means a native module or
a global remount hack, both more risk than the bug. Exposure is limited to a
user who changes text size with Kairo open and does not relaunch, and finding
1's fix makes the mis-sized intermediate state far less destructive.

**A regression from the same pass, reverted.** `StatCoin` was given `accessible`
+ `accessibilityLabel`. Its only call site is `StatRail`, which is one
`Pressable` whose label already speaks all four ratings — its own comment says
so — making the change either a no-op or a split of one control into four.
Strictly wrong either way. This was the second instance of that mistake in one
pass, after `GoalBar`'s pace marker (correctly left alone, because
`statusLine()` already says "behind pace"), so the rule is now stated in
`CLAUDE.md`: **before adding an accessible name, read what is already spoken
around it.**

**The standing process change:** finding 2 cost a full TestFlight build to
discover and would have cost another to confirm. It did not need to — both
findings reproduce on the simulator. Accessibility *structure* is verified in
Xcode's Accessibility Inspector before a build is cut. This qualifies, and does
not replace, "UI is verified by hand on device".

**Verified in the inspector 2026-08-14, then confirmed on hardware 2026-08-15**
from a TestFlight install. The inspector reported **one element per leaderboard
row**, which is the gate the whole approach rested on: the other four groups use
the identical mechanism, so one passing check covers all five. The new process
did what it was adopted for — the grouping fix was proven before a build was
cut, not after.

One practical note for whoever runs this next: **the agent could not perform the
simulator half.** Synthetic input does not work on this machine — `System
Events` clicks are delivered 60–120s late under the same Endpoint Security
posture that blocks USB pairing, and PyObjC, `idb` and `cliclick` are all
absent. Dynamic Type needs no GUI at all
(`xcrun simctl ui booted content_size …` plus `xcrun simctl io booted
screenshot`, size set **before** relaunch), but taps and the Accessibility
Inspector have to be driven by hand.

## End-to-end QA findings (2026-08-11)

Full report and root-cause addendum: `docs/qa/kairo-end-to-end-qa-report.md`. It
scored the build **4/10** for wider-MVP readiness. Most of what it found was
real; two claims did not survive checking, and one whole class of finding was
grading against a stale brief rather than against v1.4.

**The headline is that three separate findings were one bug.** `sync-health` had
been deployed since 7 August and the 9th's `remove_sabotage` migration dropped a
column it still wrote. Its bucket upsert commits before its score upsert, so
health data kept landing while nothing scored — for two days, silently, with all
916 tests passing throughout because they exercise the source and nothing
checked the deployed artifact.

| QA # | Finding | Status |
|---|---|---|
| Q1 | **Release exposes no sign-in provider.** `availableProviders()` returns `[]` outside `__DEV__`, so a TestFlight build cannot acquire a session at all. | 🟨 **App side fixed 2026-08-12**, when enrolment came through. `availableProviders()` returns Apple unconditionally, and the sign-in screen renders Apple's branded button. Still open until the App ID capability and client secret are configured and it has run on a device — checklist in `docs/sign-in-with-apple.md`. |
| Q2 | **No in-app account deletion**, which App Store review requires. | ✅ **Done** — `20260811140000`, `app/delete-account.tsx`. See row 2 of the device-verification table above. |
| Q3 | **Raw totals, score, ability ratings and rank all contradicted each other** — 44,000 steps against a score of 0 and ratings of 1. | ✅ **Root-caused and fixed.** A stale Edge Function deployment, not a logic bug. Redeployed; guarded two ways since (see the process gap below). |
| Q4 | **Yesterday never finalized.** The report suspected the scheduler. | ✅ **Same bug as Q3, and the scheduler was healthy** — `cron.job_run_details` showed HTTP 200 hourly, returning `candidates: 0` because `finalizable_days()` can only finalize provisional rows that were never written. |
| Q5 | **New Health data appeared only after a cold launch.** | ✅ **Fixed** — `useHealthSync` invalidated the score, profile and boards but not `todayBucketsKey`/`todayVitalsKey`, and the TODAY panel reads `health_buckets` back off the server. |
| Q6 | **Sync failure was invisible.** Two days of 500s produced no signal to any user. | ✅ **Fixed** — `SyncState.lastError`/`lastSyncedAt` were persisted the whole time and reached no UI, as their own comment admitted. Now a status strip under the TODAY panel with a manual retry. |
| Q7 | **The permission disclosure named four HealthKit types; the app requested eight.** | ✅ **Fixed, and test-locked.** `disclosure.ts` is derived from `read-types.ts` and `disclosure.test.ts` fails in both directions. `NSHealthShareUsageDescription` had the same defect and is the one half no test can lock. |
| Q8 | **The invite loop stops at a plain-text code**; empty seats are not actionable. | ✅ **Fixed** — Share row plus tappable seats. Universal links deliberately deferred; they need a domain and the associated-domains entitlement. |
| Q9 | **Xcode Run fails at the Hermes phase.** | ✅ **Fixed** — `NODE_BINARY` resolved absolutely by `scripts/write-xcode-env.mjs`, wired into `postinstall`/`postprebuild` because `ios/` is generated and gitignored. |
| Q10 | **Notification revocation is silent**, with no status or route back. | ✅ **Status row done.** Delivery itself is still unproven end to end — see the risks below. |
| Q11 | **"On pace" at 0 of 1,000 on day one.** | ✅ **Fixed** — `not started` where the verdict was unearned; a real shortfall still says behind. |
| Q12 | **"Needs everyone" reads oddly.** Reported as wrong for an aggregate target. | ⚠️ **Premise incorrect** — squad goals are per-member N-of-M, not a pooled total, so the framing is right. The genuine defect was narrower: a squad of *one* has no "everyone". Only that case changed. |
| Q13 | **Demo mode showed identical Today and Yesterday**, making it useless for manual regression. | ✅ **Fixed** — `DEMO_LEADERBOARD_COMPLETED` is its own finalized day with a different winner, ranked from its own totals. This was a deliberate choice with a comment defending it; it stopped being worth it once manual testing became the stated UI strategy. |
| Q14 | **Cold launch is a blank cream screen for 3–4s.** | ✅ **Measured, then fixed.** Two causes: `startSessionListener` ran in `Gate`, which does not mount until fonts resolve, so a Keychain read and token refresh were queued behind five font files; and nothing was drawn during font loading, with no splash plugin over it. |
| Q15 | **Too many progression concepts visible at once.** | ✅ **`app/progress.tsx`**, organised by the one thing that separates them — timescale. |
| Q16 | **Body metrics prefill invented values** a user could accidentally save. | ❌ **Not a defect.** Those are `placeholder` strings on empty inputs; `parseBodyMetric('')` returns `null`. Nothing invented can be saved. |
| Q17 | **The character is static; stat changes did not morph it.** | ❌ **Symptom of Q3.** `stage` (level bands) and `dominance` (§6 build) were already responding and were invisible because nothing had scored. The presence ring now also carries the ability rating (`aura.ts`) — the one progress signal the figure genuinely lacked. |
| Q18 | **Sabotage 1/10, referrals 1/10, monetization 1/10, gear 4/10.** | ❌ **Scope mismatch, not regressions.** The supplied brief was v1.3-era. `docs/mvp-scope.md` is now the IN/OUT contract QA briefs cite. |
| Q19 | **`deploy-sabotage` was still deployed and ACTIVE**, four days after the feature was deleted and its tables dropped. | ✅ **Deleted.** Not in the report — client-only testing cannot see an orphaned function. |

### The process gap this exposed

Nothing checked the deployed artifact against the repo, and the two layers of
test could not see each other: `sync-plan.test.ts` builds score rows and never
meets a database, while the schema suite writes `daily_scores` by hand and never
calls `planDay`. Two guards now close that, and both are load-bearing:

- **`supabase/tests/schema.test.ts`** inserts `planDay`'s *real* output into
  `daily_scores`, with the column list derived from the row rather than
  restated — so drift fails at commit time. Verified against the real
  regression before being trusted.
- **`supabase/scripts/smoke-sync.mjs`** runs a real sync through the *deployed*
  function and asserts buckets, score and rollups agree — so drift fails at
  deploy time. Run it after every `functions deploy`.

The rule, now in `CLAUDE.md` and `README.md`: **a migration touching a table an
Edge Function writes ships with that function's redeploy.**

### Still unproven, and honest about it

| Risk | Why it is still open |
|---|---|
| **Push delivery end to end** | Planner tests are green, but nothing has proven APNs registration → server dispatch → device receipt → tap routing. A green planner is not a delivered notification. The Profile status row addresses visibility, not delivery. |
| **Invite redemption with two accounts** | Sharing works; joining, attribution, live reordering and rejoin have never been exercised with two real identities on two devices. |
| **Sign in with Apple** | Built and fully configured 2026-08-12; exercised by nobody. The simulator generally throws `ERR_REQUEST_UNKNOWN`, so the first real signal comes from a device signed into an Apple ID — and **there is no earlier one**. The obvious pre-check is a trap: posting a bogus code to Apple's token endpoint returns `invalid_grant` for a correct secret, a wrong Team ID, a wrong Key ID and the literal string `garbage` alike, because Apple validates the code before the credentials. A check built on it reports success for a secret that cannot work. Measured 2026-08-12; the finding is recorded in `docs/sign-in-with-apple.md` and in the script, so it does not get re-added. |
| **Cron schedules** | All three `pg_cron` migrations sit in `UNSUPPORTED_MIGRATIONS` — no test covers them, by construction. They were verified by hand once. `net._http_response` is the only place their true outcome is visible, since `cron.job_run_details` reports only that the request was enqueued. |
| **Physical-device pass** | Offline and poor network, background overnight, permission subsets, reinstall/upgrade, Dynamic Type, VoiceOver order, memory and battery. None run. |

### Activation and measurement (2026-08-16) — closes the §1.3 gap

An outside review graded the beta in an investor frame and recommended a
six-week retention test with a hard kill signal: **under 25% of a cohort
engaged at day 21, kill the loop.** That review is checked in full in
`docs/superpowers/specs/2026-08-15-activation-and-measurement-design.md` §1 —
most of its findings held, three did not survive checking, and one gap it
never named made its own headline recommendation impossible to run: there
was no activation funnel, and `first_sync_seen` — the single most important
activation event in the vocabulary — was declared in `AppEventType` and
fired nowhere.

Deviation #34 above is the fix. `docs/beta-measurement.md` is the resulting
runbook: the five-step funnel, squad activation, the D1/D7/D21/D42 retention
query with the kill signal restated in full, recovery-after-a-missed-day, and
squad survival — plus what is structurally unmeasurable (HealthKit decline,
anything before first launch) so a future review does not re-file those as
oversights. This closes design §1.3; it does not answer the retention
question itself, which needs a cohort that has not been recruited yet.

## Phase 1 follow-ups (deferred, not blocking)

Findings from the Phase 1 reviews that were deliberately deferred rather than
fixed. Recorded here because the review artifacts were scratch and are gone;
these are decisions, not forgotten work.

| # | Item | Why deferred |
|---|---|---|
| 1 | ~~**No telemetry anywhere in the client.**~~ **Closed 2026-08-08** (workstream D2). `timezone_sync_failed` and `health_permission_failed` now land in `app_events`. The permission path was worse than "swallows": `ask()` was `try`/`finally` with no `catch`, so the rejection went unhandled *and* the `finally` dismissed the sheet — a failed connect was indistinguishable from a successful one. It now closes only on success. | The original deferral reasoning holds and is why this was safe to defer: both retry on the next foreground, so transient failures self-heal. `track()` is fire-and-forget and never throws, so neither call site can be made worse by adding it. |
| 2 | ~~**`STAT_MAX = 900` in `StatBar.tsx` duplicates `TIER_POINTS.gold`**~~ — **closed 2026-08-10 by deviation #23.** The bar no longer sizes against a tier ceiling at all: it fills from one ability rating's floor to the next, via the mirrored `ratingForStatPoints` / `statPointsForRating` pair, so there is no duplicated constant left to drift. `statFraction()` and its tests were deleted with their last caller. | — |
| 3 | ~~**`useTodayScore` builds its query key inline**~~ — **done (2026-08-01).** `todayScoreKey()` is exported and `useHealthSync` invalidates it after every successful sync, alongside `profileKey()` and `squadKeys.allBoards()`. | — |
| 4 | **Midnight rollover only re-derives the local date on re-render.** It works today *incidentally*: foregrounding triggers `startAutoRefresh()` → token refresh → `onAuthStateChange` → new session object → re-render. | Nothing deliberate guarantees it. Do not "optimize" session-object identity without replacing this path. |
| 5 | **No unit test for the error-code mapping in `create-profile.ts`** (`23505` → success, `42501` → mapped copy). | The repo has no pattern for mocking the Supabase client inside a mutation hook. Straight-line code, outside the scoring/day-boundary logic TDD targets here. |
| 6 | **Cold start renders `(tabs)` for one frame before redirecting.** `app/index.tsx` was deleted, so `/` resolves to the tab group and mounts before the redirect effect fires. | The `cancelled` guard in `HealthPermissionSheet` is what stops the HealthKit sheet flashing over sign-in — it is load-bearing, not defensive. A `<Redirect>` in the render pass would remove the flash. Unverified: nobody has run the simulator. |
| 7 | **`resolveRoute` has no test for `profileError` and `profileLoading` both true.** The ordering comment claims `profileError` wins; TanStack v5 makes the states mutually exclusive, so it is unreachable today. | Low risk, but the defensive ordering it argues for is untested. |
| 8 | ~~**`Profile` and `TodayScore` select columns no screen reads**~~ — **closed (2026-08-01).** The TODAY card shows an "includes +N for consistency and recovery" line, so the bars reconcile with the total; and `tiers` now colours the stat bars. Found by hand-verification: the character screen painted every bar one colour while the squad screen showed gold/silver pills for the same stats. `tierColors`/`tierColor()` moved from inside `LeaderboardRow.tsx` into `src/theme.ts` so the two screens cannot drift. | **`has_wearable` finally has a reader (2026-08-10, deviation #24):** it gates the Strain and Sleep rows on the TODAY panel, which is §5's "the REC row simply doesn't appear" made literal. `tierColors`/`tierColor()` are gone with the medals — what survives is `earnedColor`, named for its two remaining jobs (the squad leader's edge, the All-Rounder's ring), neither of which was ever about a tier. `class`, `sabotage_delta` and `status` remain selected and unrendered. |

---

## Phase 4 backend follow-ups (deferred, not blocking)

From the reviews of `squad_leaderboard`'s completed-day mode and `seed-health`.
Recorded here because the review artifacts were scratch.

| # | Item | Why deferred |
|---|---|---|
| 1 | ~~**`MAX_DAILY_SCORE_PHONE_ONLY = 4_400` is the un-featured maximum**~~ — **the UI half is fixed.** `STAT_POINTS_MAX`, `STAT_POINTS_MAX_FEATURED` and the two `*_FEATURED` daily ceilings are now exported and `StatBar` sizes against the right one, so a featured Gold no longer renders identically to an ordinary Gold. | **What remains:** the daily constants are still *unenforced* — nothing clamps a score to them, and their only consumers are tests. That is fine (scores are replayed, not clamped), so this is documentation accuracy rather than a defect. `STAT_POINTS_MAX` is now derived from `TIER_POINTS.gold`, so the original drift risk is gone. |
| 2 | **`current_streak` is joined un-scoped to the leaderboard's mode.** In `'completed'` mode the row shows *today's* streak beside *yesterday's* score. | **Decided in the squad UI:** the client renders `current_streak` only on the live (`'current'`) board, which removes the mismatch at zero cost. The SQL is still un-scoped, so any *future* surface that wants a streak alongside a completed day must fix it there — the client's answer does not generalise. |
| 3 | **`seed-health` skips the OPTIONS/405 handling its sibling functions use.** A non-POST request falls through to `req.json()` and returns a generic `invalid JSON body` 400. | No security impact — it is curl-only and secret-gated. Pattern drift worth matching if the function is ever scripted. |
| 4 | **`assertAllowlisted` returns 403 when the allowlist *lookup itself* fails.** "We could not check" is reported as "you are not allowed". | Cosmetic; a 500 would be more accurate. |
| 5 | **`seed-days` has no cap on `userIds.length`** (unlike `create-users`, capped at 20). With `MAX_SEED_DAYS = 90` and a sequential user × date loop doing a bucket upsert plus a 4-query rescore each iteration, a careless call risks an Edge Function timeout. | Squads cap at 6 members and this is a manual tool. Worth a cap if seeding gets scripted. |
| 6 | **`create-users` partial failure returns no list of already-created ids.** | Recovery depends on where it failed: a user that reached the allowlist insert is findable in `seed_test_users`, but one that failed at the `profiles` insert is findable only by querying `auth.users` for the `seed-%@kairo.test` email pattern. |
| 7 | **Unreachable defensive code in `seed-plan.ts`** — the 60-minute clamp and `Math.max(0, steps)` cannot fire with current constants (peak is ~19 minutes against a cap of 60). | Cheap insurance if `HOUR_WEIGHTS` or the jitter band change later. Their active paths have no test coverage. |
| 8 | **Realtime is now wired to the squad screen** — verified live against the hosted project: a broadcast reorders the board with no interaction, and reconnect/foreground refetches cover the events Realtime drops. **What remains:** membership changes still do not broadcast, so a new member appears on the next refetch rather than instantly. | Broadcasting membership changes is a separate, smaller follow-up — the trigger only fires on `daily_scores`, and joins/leaves would need their own trigger and topic wiring. |
| 9 | ~~**Leaving a squad has no UI.** The `squad_members_delete_self` policy makes it client-possible today.~~ **Done 2026-08-07** (workstream B), and that policy was the bug rather than the head start: it granted a raw `DELETE` with no succession, so a *leader* could leave and strand `squads.leader_id` on a non-member. `20260807110100_leave_squad.sql` drops it, extracts `succeed_squad_leadership()` out of the account-deletion trigger so both callers share one inheritance rule, and adds `leave_squad()` as the only exit. | The client now holds no write grant on `squad_members` at all. The remaining open items from this row are answered: leaving is confirmed via `Alert.alert` naming what is lost, and `app/(tabs)/squad.tsx` resets its `pane` on leave success. Succession was verified against the hosted `auth` schema in a rolled-back transaction, which is the half PGlite cannot prove. |

---

## Phase 3 follow-ups (deferred, not blocking)

From building the client ingest pipeline on 2026-08-01. All are known and
deliberate; none blocks simulator verification.

| # | Item | Why deferred |
|---|---|---|
| 1 | ~~**Background delivery does not survive termination**~~ — **plugin written 2026-08-01.** `plugins/withHealthKitBackgroundObservers.js` injects the AppDelegate call the library's own plugin omits. **What remains:** the *behaviour* is unverified. Being woken after termination needs a physical device and the HealthKit capability on the App ID. | The native observer calls iOS's completion handler as soon as JS is notified, not when the sync finishes, so the process can be suspended mid-request. Background delivery is best-effort by design; the foreground flush is the guarantee and the product must never depend on the wake-up. |
| 2 | ~~**`profiles.has_wearable` is never written**~~ — **closed in two halves.** Written since 2026-08-07: `observesWearable()` in `sync-plan.ts` flips it on the first payload carrying sleep, sticky by construction, and `20260807100000` removed it from the client write grants so capability is observed rather than asserted. **Read since 2026-08-10** (deviation #24): it gates the Strain and Sleep rows on the TODAY panel, which is the wearable affordance this row was waiting for. | — |
| 3 | **A downward revision on a day outside the sync window is never corrected.** Whole-day emission fixes revisions for dates in the window (today, yesterday, anything dirty), but nothing dirties an older date when Apple silently revises it. | The observer fires on change without saying *which* date changed, so catching this would mean re-reading far more than 2 days on every sync. The day is `final` by then and only XP would move. |
| 4 | **No telemetry on a permission-granted-but-no-data user.** Someone who taps "Connect Apple Health" and then unchecks every toggle is indistinguishable from a sedentary user, forever, silently. **Still open after workstream D2**, deliberately: `health_permission_failed` covers the *throw* path, and this is not one. HealthKit refuses to disclose read denials by design, so `requestAuthorization` resolves normally for someone who granted nothing. | Distinguishing the two needs a different signal — a granted-permission user whose buckets stay empty across several syncs — which is an inference over `health_buckets`, not a client event. Phase 9's `app_events` instrumentation is the place for it. |
| 5 | **The sync sends no `app_events` from the client, and `sync-health` writes one row per request.** | Phase 9 owns `app_events` instrumentation. Worth knowing the row count scales with sync frequency, not user activity. |

---

## Phase 7 follow-ups (deferred, not blocking)

From building solo mode, the profile screen and dominant-stat evolution on
2026-08-01.

| # | Item | Why deferred |
|---|---|---|
| 1 | **The All-Rounder is not visible to the squad.** §6 is explicit that it should be ("visible to entire squad… creates a long-term goal visible on others' characters"), but `squad_leaderboard`'s projection carries no such field. | Adding one widens the §5 privacy surface — dominance is derived from per-stat points, which squadmates are deliberately never shown — so it deserves its own review rather than riding along with a visual. Note it is also *derived*, so the projection would have to compute it server-side or the client would need other people's `daily_scores`. |
| 2 | **Dominance is measured over a 14-day window, not lifetime.** §6 implies lifetime ("which stats they grinded"). | No lifetime per-stat rollup exists: `profiles.total_xp` rolls up `xp_awarded`, not per-stat points. Adding one is a table plus a trigger for a visual. `DOMINANCE_WINDOW_DAYS` in `src/features/character/queries.ts` is one edit to change. |
| 3 | **`FREE_SQUAD_MAX_MEMBERS` is duplicated in SQL.** The number 6 lives in `squads.max_members`'s default and in `create_squad`, as well as in `packages/kairo-core/src/squad.ts`. | Migrations cannot import TypeScript. All three sites now carry cross-reference comments, so the duplication is deliberate; nothing enforces it. |
| 4 | **`profiles.sex` is selected but never editable.** `useProfile` reads it (the column-level UPDATE grant covers it) but `BodyMetricsCard` edits only height, weight and birth year. | §5's soft prompt names height and weight; nothing in MVP scoring reads `sex`. Adding a picker for an unused column is UI for its own sake. |
| 5 | ~~**The unlock reveal is unverified on the simulator.**~~ **Verified on hardware 2026-08-14.** | Done via `supabase/scripts/rehearse-squad-join.mjs --join-only`, which exists because the first attempt proved nothing: a scored join fires the reveal and re-ranks the board **on the same broadcast**, since membership has no broadcast of its own and `useSquadRealtime.refetch()` invalidates the member count alongside the board. The reveal was invisible inside the reorder. Joining with *no* score isolates it — nothing can change but the seat — and the foreground refetch is what moves the count. Confirmed animating on a 2→3 change. The "animates once and does not re-fire" half remains covered by `slots.test.ts` (`shouldRevealUnlock` requires `next > previous`) rather than separately observed. |
| 7 | **Nothing stops a third `<Modal>` being added somewhere else.** The permission collision is fixed by convention plus one host, not by a mechanism — a future sheet mounted on a screen would reintroduce exactly the same failure, and the symptom (a silently suppressed sheet, or a wedged tab bar) does not point at its cause. | No cheap enforcement exists: RN has no "one modal" primitive and lint cannot see presentation semantics. The mitigation is that `PermissionAsks` is now the obvious place to add an ask, and both former sheets carry a comment saying why they no longer own a `<Modal>`. Worth a second look if V1 adds any full-screen interstitial. |
| 6 | **`BodyMetricsCard` seeds its drafts once and never re-syncs.** If the profile row changes on another device while the screen is mounted, the fields keep the stale values until remount. | Deliberate: re-syncing on every refetch would yank characters out from under someone mid-edit. Single-device MVP, so the race is theoretical. |
