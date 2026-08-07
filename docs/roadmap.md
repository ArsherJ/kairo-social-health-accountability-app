# Kairo — MVP Implementation Roadmap

Target: **TestFlight closed beta** per `Kairo_Master_Summary.md` §15 — 5–6 squads × 6 weeks, measuring D21.

The beta exists to answer four risk questions: week-3 competitive stamina, sabotage → fun vs. resentment, stranger-squad validity, and score fairness perception. Scope decisions get graded against those, not against feature completeness.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

**Remaining work is sequenced and specified in `docs/mvp-completion-plan.md`**
(approved 2026-08-07, with an implementation spec per workstream under
`docs/superpowers/specs/`). That document covers the four unblocked workstreams
between here and feature-complete — sabotage UI, leaving a squad, the
notification engine, and polish — plus the verification pass the Apple Developer
Program unlocks. The phase list below stays the status index; the plan does not
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
| 13 | One free item granted per day, deploy cap 2/day (§8) | **`DAILY_ITEM_GRANT_FREE = 2`**, equal to `DEPLOY_CAP_FREE`, and both constants moved into `packages/kairo-core/src/sabotage.ts` | Plan decision #1 (2026-08-07). At a grant of 1 the *grant* bound and the §8 cap was unreachable, so the beta would have measured sabotage sentiment at one hit per person per day — too quiet, in a 6-person squad, to answer "fun or resentment?" either way. Two consequences: the §8 cap becomes the real constraint, and `SAME_ITEM_COOLDOWN_MS` stops being dead code (a free user can now hit the same person twice in a day, so "You already hit them recently" is copy the beta will see — tested in `sabotage-plan.test.ts`). `no_items_remaining` becomes unreachable for free users in exchange, which is fine: `deploy_cap_reached` is the more informative message. The constants live in core because the client must render the remaining count *before* the first deploy materialises the ledger row. |
| 14 | No notifications between 10 PM and 7 AM local **except sabotage** (§14) | **Three exempt triggers** — `sabotaged`, `day_ending_soon`, `day_ends` — expressed as `QUIET_HOURS_EXEMPT`, a set, and kept separate from `BUDGET_EXEMPT` | Plan decision #2 (2026-08-07). §14 forbids the window and then schedules "Day ending soon" at 23:00 and "Day ends" at 00:00 *inside* it, so read literally the rule suppresses the two notifications that drive the evening loop — leaving an engine that only sends V1 triggers. Those two are the core loop, not discretionary, so they are exempt on the same footing rather than as an exception to an exception. The two lists stay separate because the rules are independent in §14: merging them would make the day-boundary pair budget-exempt as a side effect of a quiet-hours decision, and `countsAgainstBudget()` is the one predicate both the planner and the `sentToday` query use. |
| 12 | Squads are untyped (§7) | **`squads.program`** — same-focus squads (`all_around` default · `running` · `gym` · `walking`), fixed at creation for MVP | Founder decision 2026-08-07. Weight mapping, UX and rationale in `docs/assessments/2026-08-06-onboarding-and-program-selection.md` (Part 2). |

**OS constraint that validates the design:** iOS caps HealthKit background delivery for cumulative types like step count at *hourly*. That is exactly the bucket granularity §11 chose.

---

## Scope addition (2026-08-07) — squad programs + focus onboarding

Decided in `docs/assessments/2026-08-06-onboarding-and-program-selection.md`
(Part 2; all three open confirmations closed 2026-08-07). In one paragraph:
squads carry a **program** — `all_around` (default), `running`, `gym`,
`walking` — that boosts exactly one stat ×1.5 **at read time only**
(Running→AGI, Gym→STR, Walking→VIT; END is never boosted because of the
`AppleExerciseTime` risk). Tiers, XP, sabotage and the consistency bonus stay
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

**`packages/kairo-core` is the keystone.** Scoring, sabotage replay, local-day math and anti-cheat are pure functions — no I/O, no dependencies, no clock reads. Supabase Edge Functions (Deno) import them by relative path; the Expo app imports them via a `@kairo/core` alias. One implementation, tested once in plain node, running identically on server and client. This is what makes §12's "server-authoritative, client only displays" cheap instead of a duplicated-logic tax.

**All writes are server-authoritative.** Clients have `SELECT` on their own rows and **zero write access** to `health_buckets`, `daily_scores` or `sabotage_events`. Three Edge Functions own every mutation:

- **`sync-health`** — the only door health data enters through. Upserts hourly buckets (idempotent), recomputes the day via `kairo-core`, runs the anti-cheat cross-check, and honours the §19 backfill rule: a finalized day still stores buckets and credits XP/streak, but `total`, rank and coins stay frozen.
- **`deploy-sabotage`** — validates deploy cap, cooldown, same-squad and target-day-not-final, then appends an immutable event. Nothing ever mutates a score directly.
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
- ✅ Character-first flow: name + Hunter on screen inside 60 seconds (§5)
- ✅ HealthKit permission asked as a sheet over the character screen, using
  `getRequestStatusForAuthorization` since HealthKit never reveals read authorization
- ✅ Device timezone captured at profile creation and reconciled on foreground
- ✅ Pure decision logic (route gate, permission state, timezone rule) unit-tested in Node; native and rendering code kept thin
- ✅ `profiles` INSERT grant column-scoped — RLS constrains rows, not columns
- ⬜ Sign in with Apple (blocked on the Apple Developer Program)
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
- `kairo-core` complete and tested: tiers, consistency bonus, REC, weekly multiplier, sabotage replay, local-day boundaries, anti-cheat
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
  **Still owed: deploy `sync-health` and rescore or reseed the live dev
  `daily_scores` rows** — stored rows hold post-multiplier points until then,
  and the Phase 4 board reads per-stat columns.
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
  board total = round(Σ per-stat points × weight) + consistency + rec +
  sabotage_delta, floored at 0; ranked in both `'current'` and `'completed'`
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

### 🟨 Phase 5 — Sabotage + push · 40–55h
- ✅ `deploy-sabotage` — deployed and verified live: caps, cooldown, squad
  membership, self-target, and replay of a hit that predates the target's data
- ✅ **Sabotage client (workstream A, 2026-08-07)** — a 🍌 on every squadmate's
  row opens a one-step confirm sheet; the caller's remaining count rides in
  their own row's meta line; `squad_feed()` (`20260807110000`) is a new
  `SECURITY DEFINER` projection returning **names and item only**, because
  `sabotage_events_select_involved` hides exactly the hits between two *other*
  people that make the mechanic social; the TODAY card finally renders
  `sabotage_delta`, which was selected and unrendered since Phase 1 (closes the
  other half of follow-up #8). The feed rides the existing `daily_scores`
  broadcast — a hit always rescores its target — so no second trigger or topic.
  **Still owed:** hand verification on the simulator, and the two-client check
  that a hit's broadcast actually reaches a subscriber.
- ✅ **Notification engine (workstream C, 2026-08-07)** — three triggers, not
  §14's eight (§15 scopes MVP push to sabotage + day end + conditional day
  start). `planNotifications` in `@kairo/core` owns the §14 rules: quiet hours
  as a **wrapping** window, and two separate exempt lists, because quiet-hours
  exemption and budget exemption are independent rules and collapsing them
  would make the day-boundary pair budget-exempt as a side effect (deviation
  #14). `dispatch-notifications` is a **second hourly cron**, not a branch in
  `finalize-days`: that function's window is local midnight *plus two hours*,
  so riding it would fire "Day ends" at 02:00 local, two hours late and inside
  quiet hours. Sabotage fires inline from `deploy-sabotage`, wrapped so a
  failed push can never fail a deploy that has already spent the item.
  `users_at_local_hour()` and `register_device_token()` in `20260807110200`;
  `squad_leaderboard` gains `p_as_user` (`20260807110400`) so the JWT-less cron
  reads rank through the *same* projection the screen does, honoured only when
  `auth.uid()` is null.
  **Still owed:** hand verification on the simulator, and the last hop — see
  the FCM-vs-APNs token note in `_shared/push.deno.ts`.
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
- ⬜ N-of-M squad streak (needs a `squad_streaks` table)
- ⬜ Coin awards — deferred with the coin economy to V1

### 🟨 Phase 7 — Solo mode + polish · 35–50h (+4–6h [SP])
- ✅ **Solo mode + locked squad slots (§7)** — `SoloBoard` renders the caller's
  own day beside five locked slots; slots also show under a real board, since
  §7 wants them visible every day. Slot counts come from a `squad_members`
  count, never from `squad_leaderboard`'s rows — the RPC returns only members
  who have *scored*, so a squadmate who has not moved yet would otherwise
  render as an empty seat. The old `{rows.length} of {max_members}` header had
  the same bug and is fixed with it. `SquadEmptyState` is absorbed.
- ✅ **"Squad slot unlocked" reveal** — an `Animated` fade + scale fired when a
  refetch observes the member count rise. Not Realtime: membership changes do
  not broadcast (Phase 4 follow-up #8), so it lands on the next foreground or
  pull rather than instantly.
- ✅ **Profile screen (§15)** — level with an XP progress bar, current/longest
  streak and whether a Streak Shield is banked, editable body metrics behind
  §5's soft prompt, timezone read-only, `__DEV__` seeder kept.
- ✅ **Visual evolution by dominant stat (§6)** — `dominantStat()` in
  `@kairo/core` owns the All-Rounder predicate (all within 20%); the Hunter
  varies frame, aura and stance by it, with a label on the character screen.
- ✅ **Notification budget engine (§14)** — `packages/kairo-core/src/notifications.ts`,
  pure and TDD'd. See Phase 5 for the delivery half.
- ⬜ AI-generated placeholder Hunter art — still plain `View` primitives (§15)
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

### ⬜ Phase 8 — TestFlight + beta · 20–30h
- `app_events` instrumentation, privacy nutrition labels
- Internal → external testers, beta ops
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

- **`packages/kairo-core`** — vitest in node. Every tier boundary (999/1,000, 9,999/10,000…), all consistency-bonus permutations, REC's over-9-hours penalty, the weekly multiplier, the §5 worked scenarios as fixtures, sabotage replay ordering, and the jog-must-never-flag anti-cheat case.
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

## Phase 1 follow-ups (deferred, not blocking)

Findings from the Phase 1 reviews that were deliberately deferred rather than
fixed. Recorded here because the review artifacts were scratch and are gone;
these are decisions, not forgotten work.

| # | Item | Why deferred |
|---|---|---|
| 1 | **No telemetry anywhere in the client.** The timezone reconcile swallows its write error (`timezone-sync.ts`), and `HealthPermissionSheet.ask()` swallows a rejected `requestAuthorization`. A persistent failure of either would never surface. | Both retry on next foreground, so transient failures self-heal. `app_events` already exists with a client INSERT policy — one follow-up should cover both, plus the HealthKit device path, which currently fails silently when the App ID lacks the capability. |
| 2 | **`STAT_MAX = 900` in `StatBar.tsx` duplicates `TIER_POINTS.gold`**, which `kairo-core` does not export. Changing the gold tier would silently mis-scale every stat bar with no test failure. | Harmless while all values are zero. Fix by exporting `TIER_POINTS` or a `STAT_POINTS_MAX` from core. Note a featured gold stat stores 1350 and pins the bar at 100%, so featured and non-featured gold look identical. |
| 3 | ~~**`useTodayScore` builds its query key inline**~~ — **done (2026-08-01).** `todayScoreKey()` is exported and `useHealthSync` invalidates it after every successful sync, alongside `profileKey()` and `squadKeys.allBoards()`. | — |
| 4 | **Midnight rollover only re-derives the local date on re-render.** It works today *incidentally*: foregrounding triggers `startAutoRefresh()` → token refresh → `onAuthStateChange` → new session object → re-render. | Nothing deliberate guarantees it. Do not "optimize" session-object identity without replacing this path. |
| 5 | **No unit test for the error-code mapping in `create-profile.ts`** (`23505` → success, `42501` → mapped copy). | The repo has no pattern for mocking the Supabase client inside a mutation hook. Straight-line code, outside the scoring/day-boundary logic TDD targets here. |
| 6 | **Cold start renders `(tabs)` for one frame before redirecting.** `app/index.tsx` was deleted, so `/` resolves to the tab group and mounts before the redirect effect fires. | The `cancelled` guard in `HealthPermissionSheet` is what stops the HealthKit sheet flashing over sign-in — it is load-bearing, not defensive. A `<Redirect>` in the render pass would remove the flash. Unverified: nobody has run the simulator. |
| 7 | **`resolveRoute` has no test for `profileError` and `profileLoading` both true.** The ordering comment claims `profileError` wins; TanStack v5 makes the states mutually exclusive, so it is unreachable today. | Low risk, but the defensive ordering it argues for is untested. |
| 8 | ~~**`Profile` and `TodayScore` select columns no screen reads**~~ — **closed (2026-08-01).** The TODAY card shows an "includes +N for consistency and recovery" line, so the bars reconcile with the total; and `tiers` now colours the stat bars. Found by hand-verification: the character screen painted every bar one colour while the squad screen showed gold/silver pills for the same stats. `tierColors`/`tierColor()` moved from inside `LeaderboardRow.tsx` into `src/theme.ts` so the two screens cannot drift. | `class`, `has_wearable`, `sabotage_delta` and `status` remain selected and unrendered — harmless on owner-only rows, and `has_wearable` is Phase 3 follow-up #2. |

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
| 2 | **`profiles.has_wearable` is never written.** Nothing in any Edge Function sets it; only `src/features/profile/queries.ts` reads it. `sync-health` receiving a `sleep` entry is the natural signal. | A server change outside this phase's scope. `MAX_DAILY_SCORE_WITH_WEARABLE` and any wearable affordance on the leaderboard both depend on it, so do it before REC matters. |
| 3 | **A downward revision on a day outside the sync window is never corrected.** Whole-day emission fixes revisions for dates in the window (today, yesterday, anything dirty), but nothing dirties an older date when Apple silently revises it. | The observer fires on change without saying *which* date changed, so catching this would mean re-reading far more than 2 days on every sync. The day is `final` by then and only XP would move. |
| 4 | **No telemetry on a permission-granted-but-no-data user.** Someone who taps "Connect Apple Health" and then unchecks every toggle is indistinguishable from a sedentary user, forever, silently. | Phase 1 follow-up #1's territory — one `app_events` type would cover this, the timezone reconcile and the permission path together. |
| 5 | **The sync sends no `app_events` from the client, and `sync-health` writes one row per request.** | Phase 8 owns `app_events` instrumentation. Worth knowing the row count scales with sync frequency, not user activity. |

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
| 5 | **The unlock reveal is unverified on the simulator.** The count comparison is unit-tested (`slots.test.ts`), but nobody has watched the animation fire — it needs a second account joining a non-full squad. | The live test squad is at 6 of 6, and emptying a seat to test it would mutate real squad data. Verify when a squad with spare capacity next exists. |
| 6 | **`BodyMetricsCard` seeds its drafts once and never re-syncs.** If the profile row changes on another device while the screen is mounted, the fields keep the stale values until remount. | Deliberate: re-syncing on every refetch would yank characters out from under someone mid-edit. Single-device MVP, so the race is theoretical. |
