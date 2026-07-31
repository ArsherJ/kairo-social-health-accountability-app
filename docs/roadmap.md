# Kairo — MVP Implementation Roadmap

Target: **TestFlight closed beta** per `Kairo_Master_Summary.md` §15 — 5–6 squads × 6 weeks, measuring D21.

The beta exists to answer four risk questions: week-3 competitive stamina, sabotage → fun vs. resentment, stranger-squad validity, and score fairness perception. Scope decisions get graded against those, not against feature completeness.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

---

## Approved deviations from the spec

Recorded here so they aren't re-litigated. Propose changes against this table.

| # | Spec says | We build | Why |
|---|---|---|---|
| 1 | `react-native-health` (§12) | **`@kingstinct/react-native-healthkit`** | **Blocking.** `react-native-health`'s Expo config plugin does not support background processing. §12/§15 require background delivery for *all* users. Kingstinct's plugin takes `background: true`, registers observer queries in `didFinishLaunchingWithOptions` per Apple's guidance, is TypeScript-first and Nitro-based (New Architecture). |
| 2 | React Navigation v6 + Zustand (§12) | **Expo Router + TanStack Query + Zustand** | Expo Router *is* React Navigation underneath; typed routes and deep-link handling cover §14's eight notification deep-links. TanStack Query owns server cache, Zustand owns session/UI/sync-queue. |
| 3 | Buckets as `(user, date, hour, metric)` rows (§11) | **One row per hour, four metric columns** | 24 rows/user/day instead of 96. One upsert statement, no metric-name typos, VIT is `count(*) where steps >= 250`. Idempotency against Apple's retroactive revisions is identical. |
| 4 | "Squadmates see tiers and scores only" (§5) | **`SECURITY DEFINER` RPC**, not client filtering | Makes the privacy rule structural — squadmates cannot reach raw buckets even with a forged client. |

**OS constraint that validates the design:** iOS caps HealthKit background delivery for cumulative types like step count at *hourly*. That is exactly the bucket granularity §11 chose.

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

### ✅ Phase 1 — Auth + onboarding · 35–45h
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

### ✅ Phase 2 — Scoring engine (TDD) · 25–35h
- `kairo-core` complete and tested: tiers, consistency bonus, REC, weekly multiplier, sabotage replay, local-day boundaries, anti-cheat
- 143 tests. The spec's three worked scenarios (§5) are fixtures and land on 2,900 / 1,300 / 0.

### 🟨 Phase 3 — HealthKit ingest · 50–70h
- ✅ `sync-health` Edge Function — deployed and verified end-to-end against the
  live project: idempotent re-sync, whole-day rescoring from a partial payload,
  §19 backfill freeze, anti-cheat flag with false-positive control
- ✅ XP rollup and level derivation
- ⬜ Observer queries + background delivery, anchored reads with persisted anchors
- ⬜ Local-tz hourly bucketing, MMKV offline queue, foreground flush on app open

### 🟨 Phase 4 — Squads + leaderboard · 45–60h
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

### 🟨 Phase 5 — Sabotage + push · 40–55h
- ✅ `deploy-sabotage` — deployed and verified live: caps, cooldown, squad
  membership, self-target, and replay of a hit that predates the target's data
- ⬜ Real-time FCM push (needs Firebase credentials), squad feed UI
- **Start beta recruitment during this phase** — stranger squads have a long lead time

### 🟨 Phase 6 — Day lifecycle · 40–55h
- ✅ `finalize-days` cron — hourly at `5 * * * *`, per-user grace window,
  provisional → final, XP/level, personal streak + Streak Shield
- ✅ Account deletion / right-to-erasure with leadership succession
- ⬜ N-of-M squad streak (needs a `squad_streaks` table)
- ⬜ Coin awards — deferred with the coin economy to V1

### ⬜ Phase 7 — Solo mode + polish · 35–50h
- Locked squad slots, profile screen, notification budget engine (§14)
- AI placeholder Hunter art, visual evolution by dominant stat

### ⬜ Phase 8 — TestFlight + beta · 20–30h
- `app_events` instrumentation, privacy nutrition labels
- Internal → external testers, beta ops
- ⬜ **Undeploy `seed-health` before external testers join** — it fabricates
  activity, and the beta measures real behaviour

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
| 3 | **`useTodayScore` builds its query key inline**; there is no `todayScoreKey()` twin to `profileKey()`. Phase 3's `sync-health` will need to invalidate it and would hand-reconstruct the shape. | Cheap to fix; do it when Phase 3 needs the invalidation. |
| 4 | **Midnight rollover only re-derives the local date on re-render.** It works today *incidentally*: foregrounding triggers `startAutoRefresh()` → token refresh → `onAuthStateChange` → new session object → re-render. | Nothing deliberate guarantees it. Do not "optimize" session-object identity without replacing this path. |
| 5 | **No unit test for the error-code mapping in `create-profile.ts`** (`23505` → success, `42501` → mapped copy). | The repo has no pattern for mocking the Supabase client inside a mutation hook. Straight-line code, outside the scoring/day-boundary logic TDD targets here. |
| 6 | **Cold start renders `(tabs)` for one frame before redirecting.** `app/index.tsx` was deleted, so `/` resolves to the tab group and mounts before the redirect effect fires. | The `cancelled` guard in `HealthPermissionSheet` is what stops the HealthKit sheet flashing over sign-in — it is load-bearing, not defensive. A `<Redirect>` in the render pass would remove the flash. Unverified: nobody has run the simulator. |
| 7 | **`resolveRoute` has no test for `profileError` and `profileLoading` both true.** The ordering comment claims `profileError` wins; TanStack v5 makes the states mutually exclusive, so it is unreachable today. | Low risk, but the defensive ordering it argues for is untested. |
| 8 | **`Profile` and `TodayScore` select columns no screen reads** (`class`, `has_wearable`, `rec_points`, `consistency_points`, `sabotage_delta`, `tiers`, `status`). | Not a privacy hole — owner-only rows. But from Phase 3 the displayed `total` will include REC and consistency points that appear in no stat bar, so the bars will visibly not sum to the total. Decide the UI answer then. |

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
| 9 | **Leaving a squad has no UI.** The `squad_members_delete_self` policy makes it client-possible today. | The policy is the easy half. The decisions are not: what happens to a squad when its *leader* leaves (the account-deletion path already implements succession — leaving should reuse it, not invent a second rule), and whether a leave is confirmable or undoable. Also note `app/(tabs)/squad.tsx` keeps its create/join pane in local state, which would need resetting once a board can disappear. |
