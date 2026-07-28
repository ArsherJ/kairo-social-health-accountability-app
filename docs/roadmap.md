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
- ✅ Schema deployed to `lplmsagrtxbvpcywvyzm` (ap-south-1), all 7 migrations recorded
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

### ⬜ Phase 1 — Auth + onboarding · 35–45h
- Apple Sign-In (Google optional — see open questions)
- Character-first flow: name + Hunter on screen inside 60 seconds (§5)
- HealthKit permission framed as "power your character with real life"
- Body metrics deferred to the soft prompt, never a gate

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

### ⬜ Phase 4 — Squads + leaderboard · 45–60h
- Create/join by 6-digit code, `squad_leaderboard` RPC, Realtime broadcast
- Tiers + score UI only (§5)

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
| Database region | 🔴 **Moving to Singapore.** Project currently sits in `ap-south-1` (Mumbai), ~90–120ms from Manila vs ~35ms to `ap-southeast-1`. Supabase cannot relocate a project, so this means a new project. Cheap now (DB verified empty), painful after beta users have history. Blocked on the free-tier 2-project limit — one existing project must go first. |

### Deviations introduced during implementation

Both are live and deliberate. Flagged here so they are decisions, not drift.

| # | Spec says | We do | Why |
|---|---|---|---|
| 5 | "Coins + XP distributed at finalization" (§12) | XP accrues **live** as the day progresses; only coins would wait for finalization | XP within a day is monotonic — more activity only ever adds — so live accrual has no downside and makes the character respond while you walk. `profiles.total_xp` is a rollup of `sum(xp_awarded)`, so it self-corrects. One-line change if you want strict spec behaviour: filter the rollup to `status = 'final'`. |
| 6 | "the squad leaderboard compares most-recently-completed days" (§2) | `squad_leaderboard()` defaults to each member's **current** local day | This is the live in-progress board the app shows all day, which §2 also implies ("1 hour left. You're in Nth place"). The settled cross-timezone view is a second mode the RPC does not have yet — **owed in Phase 4.** |
