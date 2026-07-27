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

### ⬜ Phase 0 — Foundation · 20–30h
- Root npm workspace, `packages/kairo-core`, vitest in node
- Expo prebuild app + EAS dev client running on the physical iPhone
- Supabase schema + RLS migrations
- Firebase project + APNs auth key verified
- **Blocked on:** bundle identifier, Supabase project ref + anon key, `GoogleService-Info.plist`

### ⬜ Phase 1 — Auth + onboarding · 35–45h
- Apple Sign-In (Google optional — see open questions)
- Character-first flow: name + Hunter on screen inside 60 seconds (§5)
- HealthKit permission framed as "power your character with real life"
- Body metrics deferred to the soft prompt, never a gate

### ⬜ Phase 2 — Scoring engine (TDD) · 25–35h
- `kairo-core` complete and fully tested: tiers, consistency bonus, REC, weekly multiplier, sabotage replay, local-day boundaries, anti-cheat
- **No UI, no device, no network.** Fully unblocked — start here.

### ⬜ Phase 3 — HealthKit ingest · 50–70h
- Observer queries + background delivery, anchored reads with persisted anchors
- Local-tz hourly bucketing, MMKV offline queue, foreground flush on every app open
- `sync-health` Edge Function

### ⬜ Phase 4 — Squads + leaderboard · 45–60h
- Create/join by 6-digit code, `squad_leaderboard` RPC, Realtime broadcast
- Tiers + score UI only (§5)

### ⬜ Phase 5 — Sabotage + push · 40–55h
- Banana, immutable event log, deploy caps, real-time FCM push, squad feed
- **Start beta recruitment during this phase** — stranger squads have a long lead time

### ⬜ Phase 6 — Day lifecycle · 40–55h
- `finalize-days` cron, provisional → final, XP/level
- Personal streak + N-of-M squad streak, Streak Shield

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

---

## Open questions

| Question | Default if unanswered |
|---|---|
| Google Sign-In in the beta? | Apple-only. Apple requires Apple Sign-In anyway; Google adds work for little beta value. |
| Streak milestones (§19) pay coins, but the beta has no coin economy (§15) | Milestones award **XP + badges only** in MVP; coins arrive at V1 with the shop. |
