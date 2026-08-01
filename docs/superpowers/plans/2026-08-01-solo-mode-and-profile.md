# Solo Mode + Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 7. The app is worth opening before your barkada joins; the profile screen shows who you are; the Hunter reflects what you grind.

**Architecture:** Three independent parts, shippable separately and in this order — A solo mode, B profile screen, C dominant-stat evolution. Pure decisions (slot maths, dominant stat) go in tested modules; screens stay thin.

**Tech Stack:** Expo SDK 57 · React Native 0.86 · TanStack Query · Vitest

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-01-solo-mode-and-profile-design.md`. `§` references point to `Kairo_Master_Summary.md` v1.3.
- **Read `CLAUDE.md` first.** Architecture, environment constraints, invariants.
- **No new npm dependencies.** No `react-native-svg`, no Rive, no Reanimated — RN's built-in `Animated` only.
- **This plan adds no migration.** Every grant and policy it needs already exists (see the design's "Verified during design").
- **Any file with a `*.test.ts` beside it must import only relative paths and `@kairo/core`.** Root Vitest has no `@/` alias and cannot parse React Native's Flow syntax. This has blocked tasks before — take it literally.
- **Privacy is a projection (§5).** Never read another user's `profiles`, `daily_scores` or `health_buckets` row. Everything about a squadmate comes through `squad_leaderboard`.
- Imports use explicit `.ts` / `.tsx` extensions. `@/*` maps to `./src/*`.
- Theme tokens live in `src/theme.ts` — including `tierColor()`. No ad-hoc colours.
- Comments explain *why*, not *what*.
- Stage only the files a task names, by explicit path. Never `git add -A`.

---

## Context a fresh session does not have

### Phase 3 landed; the data is real now

As of 2026-08-01 the client HealthKit pipeline is verified end to end on the
simulator: real samples → `health_buckets` → `daily_scores` → the character
screen, landing a predicted 3,200. **A squadless user already scores
correctly** — solo mode is a rendering problem, not a scoring one.

To put data on the simulator, use the `__DEV__` seeder: Profile tab → **Seed
Apple Health (dev)** (`src/features/health/dev-seed.ts`). Ten hours at 1,100
steps gives AGI gold / STR silver / VIT gold / END 0 and a total of 3,200.

**END is always 0 on a simulator.** `HKQuantityTypeIdentifierAppleExerciseTime`
is Apple-derived and absent from HealthKit's writeable list, so nothing can seed
it. Do not treat a zero END as a bug, and do not design UI that assumes four
non-zero stats.

### The locked-slot trap — the one thing most likely to be got wrong

`squad_leaderboard` returns one row per **scored** member. Its `member_day` CTE
joins `daily_scores`, so a member who joined but has logged nothing is absent
from the board.

Therefore `max_members - rows.length` is **wrong** — it renders a real
squadmate as an empty slot and invites them again. Locked slots must come from a
real `squad_members` count, which `squad_members_select_visible` already permits.

`Leaderboard.tsx` currently renders `{rows.length} of {squad.max_members}`,
which has the same bug and gets fixed in Task A2.

### Environment constraints

Port 5432 blocked, Supabase's direct host IPv6-only here, Docker unavailable.
`supabase db push`, `psql` and `supabase start` all fail; none of it means the
project is broken. What works, all HTTPS: `./supabase/scripts/remote-sql.sh`,
`supabase functions deploy`, `npm run test:schema`.

**Simulator only** — no paid Apple Developer Program, no device. Everything in
this plan is simulator-verifiable by design.

Useful during verification:
- `npx expo start --dev-client`, then `xcrun simctl launch booted com.arsherj.kairo`
- `xcrun simctl io booted screenshot out.png` — reading the screenshot is the
  acceptance check for UI work; there is no `idb` on this machine, so taps are
  the human's job.
- `./supabase/scripts/remote-sql.sh "select …"` for the data side.

### Existing pieces to reuse, not reinvent

| Need | Use |
|---|---|
| Own score for today | `useTodayScore(userId, timeZone)` — `src/features/character/queries.ts` |
| Own profile | `useProfile(userId)` — `src/features/profile/queries.ts` |
| Level / XP maths | `levelForXp`, `xpForLevel`, `evolutionStageForLevel` — `@kairo/core` |
| Tier colours | `tierColor()` — `src/theme.ts` |
| Squad + capacity | `useMySquad(userId)` returns `max_members` |
| Row visual language | `LeaderboardRow.tsx` — pills, rank, self-highlight |
| Pure-reducer + thin-hook pattern | `realtime-policy.ts` + `useSquadRealtime.ts` |

---

## Part A — Solo mode and locked slots (§7)

- [ ] **Task A1 — `FREE_SQUAD_MAX_MEMBERS` in `@kairo/core`, TDD-lite.** Export from `packages/kairo-core/src/profile.ts` (or a new `squad.ts`) with a comment noting §7's Free=6 / Legendary=15 table. Replace the hardcoded "six" in `src/features/squad/SquadEmptyState.tsx:21`. **Do not** change the SQL — migrations cannot import TypeScript; instead add a comment in the migration and in the constant pointing at each other, so the duplication is deliberate rather than accidental.

- [ ] **Task A2 — real member count.** Add `useSquadMemberCount(squadId)` to `src/features/squad/queries.ts` (`select count` on `squad_members`, RLS already permits). Fix `Leaderboard.tsx`'s `{rows.length} of {squad.max_members}` to use it. Add a `squadKeys` entry so the count invalidates alongside the board.

- [ ] **Task A3 — `slots.ts`, pure, TDD.** `resolveSlots({ memberCount, maxMembers })` → `{ filled, locked }`, clamped so a full squad yields zero locked and an over-full squad never yields negative. Zero imports beyond `@kairo/core`. Cases: solo (1 member → 5 locked), partial, exactly full, `maxMembers` 15 (Legendary), defensive `memberCount > maxMembers`.

- [ ] **Task A4 — `LockedSlot.tsx`.** One placeholder row matching `LeaderboardRow`'s shape and rhythm — muted, dashed or low-contrast border, copy along the lines of "Empty slot · invite your barkada". No tier pills. Theme tokens only.

- [ ] **Task A5 — `SoloBoard.tsx`.** Shown on the squad tab when `useMySquad` resolves to `null`. Renders the caller's own row from `useTodayScore` in `LeaderboardRow`'s visual language (rank 1, YOU badge, tier pills, total), then `FREE_SQUAD_MAX_MEMBERS - 1` locked slots, then the create/join affordances. **Keep create and join reachable** — `app/(tabs)/squad.tsx` currently swaps between `SquadEmptyState`, `CreateSquadForm` and `JoinSquadForm` via local `pane` state; preserve that, with `SoloBoard` replacing the `'choose'` pane. `SquadEmptyState.tsx` is likely absorbed — delete it if nothing renders it.

- [ ] **Task A6 — locked slots on a real squad too.** §7 wants them visible *every day*, not only when solo. Render `locked` slots under the board in `Leaderboard.tsx` using A3.

- [ ] **Task A7 — the unlock reveal.** When the member count increases between refetches, animate the newly filled slot in with RN `Animated` (fade + slight scale). Keep the previous count in a ref; do not fire on first load. No Realtime — see the design.

**Verify A:** simulator. With no squad, the squad tab shows your real score and five locked slots; create a squad and the slots persist at 5 remaining; use `seed-health` or a second account to add a member and confirm the count is right and the reveal fires. Confirm a member who has *not* scored still counts as filled, not as a locked slot — this is the trap.

## Part B — Profile screen (§15 "basic profile screen")

- [ ] **Task B1 — widen `useProfile`.** Add `height_cm`, `weight_kg`, `birth_year`, `sex` to the select and the `Profile` type. All are owner-only columns; no policy change.

- [ ] **Task B2 — `useStreak(userId)`.** New query in `src/features/profile/queries.ts` over `streaks` (`current_streak`, `longest_streak`, `last_scored_date`, `shield_available_on`). `streaks_select_own` already permits it. Note there may be **no row** for a user who has never scored — render zeros, do not error.

- [ ] **Task B3 — `xp-progress.ts`, pure, TDD.** `xpProgress(totalXp)` → `{ level, intoLevel, neededForNext, fraction }` built on `levelForXp` / `xpForLevel`. Cases: zero XP, exactly on a boundary, mid-level, and a very large value (the curve is quadratic — assert it does not go negative or exceed 1).

- [ ] **Task B4 — profile screen body.** Rebuild `app/(tabs)/profile.tsx`: character name, level with an XP progress bar (B3), current/longest streak and whether a Streak Shield is banked (`shield_available_on` null means banked — see the column comment), timezone as read-only with a one-line explanation that it follows the device, then sign out. **Keep the `__DEV__` seed control.**

- [ ] **Task B5 — body metrics + the §5 soft prompt.** An editable section for height, weight and birth year, with §5's copy when they are missing: *"Add your height and weight in Settings for more accurate STR tracking."* Write via a `useUpdateProfile` mutation (column grants exist), invalidate `profileKey`. Validate ranges client-side; the columns have their own CHECKs, so mirror them rather than inventing new limits — read the constraints in `20260727120000_init_core.sql` first.

**Verify B:** simulator screenshot. Level and XP bar match `total_xp`; streak matches `remote-sql.sh "select * from streaks where user_id = …"`; editing weight persists across a relaunch and shows in the DB.

## Part C — Dominant-stat evolution (§6)

- [ ] **Task C1 — `dominance.ts` in `@kairo/core`, TDD.** `dominantStat(points: Record<CoreStat, number>)` → `CoreStat | 'balanced' | null`, plus `BALANCED_TOLERANCE = 0.2`. Rules: all zero → `null` (a new character is not "balanced", it is unstarted); all four within 20% of each other → `'balanced'`; otherwise the max. Cases: clear winner, exact tie, all zero, one non-zero stat, values straddling the 20% edge on both sides, and END permanently zero (the simulator's normal state) — which must *not* read as balanced.

- [ ] **Task C2 — `useDominantStat(userId, timeZone)`.** Sums the caller's own recent `daily_scores` per stat over a named `DOMINANCE_WINDOW_DAYS` constant and feeds C1. Own rows only.

- [ ] **Task C3 — `HunterSilhouette` by dominant stat.** Replace the aura-brightness-only placeholder. Its current docblock already says Phase 7 owns this. Vary the existing `View` primitives per §6's table — AGI leaner, STR broader, END a planted stance, VIT a recovery glow, balanced a distinct All-Rounder treatment — and keep `stage` (1–4) driving overall presence. No new dependencies; this is deliberately a placeholder (§15).

- [ ] **Task C4 — surface it.** Show the dominant stat as a small label near the Hunter on the character screen so the visual difference is legible rather than mysterious.

**Verify C:** simulator. Seed, confirm the silhouette differs from the default and the label matches the seeded profile (AGI/VIT gold, STR silver, END zero → AGI or VIT dominant, never balanced).

## Wrap-up

- [ ] **Roadmap.** Tick the Phase 7 bullets delivered. Record any deviation taken. Add follow-ups for anything deferred — in particular the squad-visible All-Rounder (§6 wants it visible to the whole squad, which needs a new field in `squad_leaderboard`'s projection and therefore a privacy review).

## Verification

- `npm test` — core + schema green.
- `npm run typecheck` — tsc, workspace tsc, `deno check`.
- Simulator screenshots for each part; UI is verified by hand in this repo, not by test.

## Known gaps this plan does not close

Recorded so they are not mistaken for oversights — all are in `docs/roadmap.md`:

- **Leave-squad UI** (Phase 4 follow-up #9) — blocked on a leader-succession decision, not on UI.
- **Account deletion** — no client DELETE grant on `profiles`; needs an RPC. Apple requires it before submission (Phase 8).
- **`profiles.has_wearable` is never written** (Phase 3 follow-up #2) — REC arrives with sleep data but nothing sets the flag.
- **Background delivery behaviour** and **whether `AppleExerciseTime` works phone-only** — both need a physical device, deliberately parked.
