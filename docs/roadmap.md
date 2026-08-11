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
| 27 | §6 ships "one class only (Hunter)" with a single character; §5's onboarding collects name only | **Two character bodies, chosen on a new first onboarding screen.** New nullable `profiles.character_body`; onboarding is two screens with the profile still committing once | Founder decision 2026-08-11. §6's premise is that "two people in the same squad look different"; one character made everyone identical. Stored on a **new** column rather than the existing `profiles.sex` — that column's documented purpose is physiological (HealthKit calorie estimate) and this question is cosmetic, and merging the two is what deviation #22 dropped `focus` for. Nullable so existing rows read as *never asked* rather than as having chosen. The choice is asked **before** the name specifically so the single INSERT stays at the end: deviation #22 deleted the `finishingOnboarding` flag when onboarding went back to one step, and asking after the commit would have required resurrecting it. `CHARACTER_ART` stays at 24 empty keys rather than doubling to 48 — the body axis joins the key only when per-dominance art actually exists. |

**OS constraint that validates the design:** iOS caps HealthKit background delivery for cumulative types like step count at *hourly*. That is exactly the bucket granularity §11 chose.

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
- ⬜ **Enable HealthKit capability on the App ID** at developer.apple.com
- ⬜ Firebase `GoogleService-Info.plist` + APNs auth key

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
- ⬜ Sign in with Apple (blocked on the Apple Developer Program). **Spec'd in full: `docs/sign-in-with-apple.md`** — enrolment is the only slow part left, everything after it is written down, including the client-secret JWT's six-month expiry and the fact that name/email arrive exactly once.
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

### 🟨 Phase 9 — TestFlight + beta · 20–30h
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
| 7 | Apple/Google sign-in (§15) | **Anonymous sign-in in development builds only** | The Apple Developer Program is not yet purchased, so Sign in with Apple cannot be enabled on the App ID. Anonymous is one tap with no form — the same shape Apple's flow will have — so onboarding is rehearsed against the flow that ships. `availableProviders()` returns an empty list outside `__DEV__`, so it cannot reach TestFlight. **Disable anonymous sign-ins on the project when Apple lands.** |

---

## Device-verification findings (2026-08-11)

Found by hand on the simulator while verifying the character body choice
(deviation #27). Neither was introduced by that work; both predate it.

| # | Item | Status |
|---|---|---|
| 1 | **`app_events` and `device_tokens` referenced `public.profiles`**, which does not exist until onboarding commits it — so every telemetry write and token registration between sign-in and profile creation failed `23503`. The real cost was not the dropped row but that the **sign-in → abandon funnel was structurally unmeasurable**: a user who never names a character produced no events by construction, so the drop-off §15's beta most wants to count could not be counted. | ✅ **Fixed** — `20260811130000_account_scoped_telemetry_fks.sql` repoints both at `auth.users`, which exists from sign-in. Delete actions unchanged (`set null` / `cascade`); erasure unaffected because `profiles.id` already cascaded from `auth.users`. `track()` now reports whether the row landed, so a failed `app_open` no longer poisons the per-session dedupe marker and cost a whole day. |
| 2 | ~~**There is no account-deletion path.** `delete_account()` does not exist — verified against the live project; `leave_squad` is the only routine of its kind, and `handle_profile_deletion` is a trigger. There is no delete-account UI in the client either.~~ **Done 2026-08-11**, `20260811140000_account_deletion.sql` plus `app/delete-account.tsx`. | The cascade underneath was already right — `profiles_handle_deletion` hands squad leadership on before the FK cascade fires — so the RPC and the screen were most of the work. The audit for it surfaced a real gap the QA pass had not: `goals.created_by` cascaded, so erasing an author destroyed a squad goal other members were part-way through. Now **SET NULL**, because that column confers only the `goals_update_own` title edit — succeeding it the way squad leadership succeeds would hand someone editorial control they never had. A new AFTER DELETE trigger, `profiles_collect_orphaned_goals`, sweeps goals left with neither creator nor participant; it must stay AFTER, since `goal_completions_xp_rollup` updates `profiles` and reaching a completion from a BEFORE trigger aborts the statement. Verified end-to-end against the live project with a throwaway account, not just in PGlite. |

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
| 5 | **The unlock reveal is unverified on the simulator.** The count comparison is unit-tested (`slots.test.ts`), but nobody has watched the animation fire — it needs a second account joining a non-full squad. **Now testable** (workstream D4): Takbo Manila has spare seats, so the blocker below is gone. | ~~The live test squad is at 6 of 6, and emptying a seat to test it would mutate real squad data.~~ What to check, since membership changes do not broadcast: with the board open, add a member via `seed-health`/`remote-sql.sh`, foreground the app, and confirm the reveal animates **once** on the refetch riding `useSquadRealtime`'s `refetch()` and does not re-fire on subsequent refetches. |
| 7 | **Nothing stops a third `<Modal>` being added somewhere else.** The permission collision is fixed by convention plus one host, not by a mechanism — a future sheet mounted on a screen would reintroduce exactly the same failure, and the symptom (a silently suppressed sheet, or a wedged tab bar) does not point at its cause. | No cheap enforcement exists: RN has no "one modal" primitive and lint cannot see presentation semantics. The mitigation is that `PermissionAsks` is now the obvious place to add an ask, and both former sheets carry a comment saying why they no longer own a `<Modal>`. Worth a second look if V1 adds any full-screen interstitial. |
| 6 | **`BodyMetricsCard` seeds its drafts once and never re-syncs.** If the profile row changes on another device while the screen is mounted, the fields keep the stale values until remount. | Deliberate: re-syncing on every refetch would yank characters out from under someone mid-edit. Single-device MVP, so the race is theoretical. |
