# HealthKit Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real steps from Apple Health reach `sync-health`, and the character screen shows a score the real engine computed from them.

**Architecture:** The server half is already live. This is client work: three pure modules that decide *what window to read*, *how to bucket it* and *when to flush*, plus a thin I/O layer that talks to HealthKit and Supabase. `read.ts` is the only new file that imports the healthkit package.

**Tech Stack:** Expo SDK 57 · React Native 0.86 · `@kingstinct/react-native-healthkit` 14.0.2 · `react-native-mmkv` 4.3.2 · TanStack Query · Vitest

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-01-healthkit-ingest-design.md`. `§` references point to `Kairo_Master_Summary.md` v1.3.
- **Read `CLAUDE.md` first.** Architecture, environment constraints, invariants.
- **No new npm dependencies.** `react-native-mmkv` is already in `package.json`, imported by nothing.
- **This plan adds no migration.** `health_buckets`, `daily_sleep` and `daily_scores` all already exist.
- **Any file with a `*.test.ts` beside it must import only relative paths and `@kairo/core`.** Root Vitest has no `@/` alias and cannot parse React Native's Flow syntax. `@kairo/core` resolves via the `node_modules/@kairo/core` symlink; `@/` and `react-native` do not. This has blocked a task before — take it literally.
- **Never derive an hour index by counting intervals.** Always `localHourFor(startDate, tz)`. DST is the reason.
- Imports use explicit `.ts` / `.tsx` extensions. `@/*` maps to `./src/*` in app code.
- Comments explain *why*, not *what*.
- Stage only the files a task names, by explicit path. Never `git add -A`.
- Theme tokens live in `src/theme.ts`.

---

## Context a fresh session does not have

### The server contract, already deployed

`POST` to `sync-health` with the session bearer token. Validated by `supabase/functions/_shared/sync-plan.ts`:

```ts
{ timezone: string;                    // must parse in Intl.DateTimeFormat
  buckets: Array<{ localDate: string;  // ^\d{4}-\d{2}-\d{2}$, the USER'S local date
                   hour: number;       // integer 0-23 local
                   steps: number; distanceM: number;
                   activeKcal: number; activeMinutes: number;   // finite, >= 0
                   hadWorkout?: boolean; elevatedHeartRate?: boolean }>;
  sleep?: Array<{ localDate: string; minutes: number }> }        // integer 0..1440
```

`buckets` is required (may be empty) and capped at `MAX_BUCKETS_PER_SYNC = 750`. Server rounds `steps` and clamps `activeMinutes` to 60. Response `{ days: [{localDate, total, frozen}] }`, or `{days: [], message: 'nothing to sync'}` when both arrays are empty. Validation failures are 400 with a message string.

**Partial payloads are correct by design** — the function re-reads the whole day before rescoring, and upserts key on `(user_id, local_date, hour)`. Retries and Apple's retroactive revisions are both safe. `frozen: true` means the day was already `final` and only XP/flagged moved (§19).

### Why whole days

Sending only non-empty hours leaves a stale bucket when Apple revises an hour *downward*. Every dirty day is sent as all 24 hours, zeros included. 31 × 24 = 744 ≤ 750 — that is what sizes the window.

### Environment constraints

Port 5432 blocked, Supabase's direct host IPv6-only here, Docker unavailable. `supabase db push`, `psql` and `supabase start` all fail; none of that indicates a broken project. What works, all HTTPS: `./supabase/scripts/remote-sql.sh`, `supabase functions deploy`, `npm run test:schema`.

**Simulator only.** No paid Apple Developer Program, no dev client on a physical iPhone. Simulator builds are unsigned so the missing App ID capability does not block them, and the simulator's Health app accepts hand-entered data. Background delivery and observer wake-ups from a terminated state **cannot** be verified — Task 8 is written but not verified, and Phase 3's background-delivery bullet stays ⬜.

---

## File Structure

**Created**

| Path | Pure? | Responsibility |
|---|---|---|
| `src/features/health/sync-state.ts` | pure | Persisted state shape + reducer over the dirty-date set |
| `src/features/health/sync-state.test.ts` | — | |
| `src/features/health/sync-window.ts` | pure | Which local dates to re-read, and the UTC span covering them |
| `src/features/health/sync-window.test.ts` | — | |
| `src/features/health/hourly-buckets.ts` | pure | Flattened readings → `IncomingBucket[]` |
| `src/features/health/hourly-buckets.test.ts` | — | |
| `src/features/health/sync-policy.ts` | pure | When to flush; coalesce, throttle, backoff |
| `src/features/health/sync-policy.test.ts` | — | |
| `src/features/health/storage.ts` | impure | MMKV instance; `SyncState` load/save |
| `src/features/health/read.ts` | impure | The only new importer of the healthkit package |
| `src/features/health/sync.ts` | impure | Orchestrator: state → window → read → POST → invalidate |
| `src/features/health/useHealthSync.ts` | impure | AppState + observer subscription, decisions delegated |
| `src/features/health/background.ts` | impure | `configureBackgroundTypes` — **device-only verification** |

**Modified**

| Path | Change |
|---|---|
| `src/features/character/queries.ts` | Extract `todayScoreKey()` (Phase 1 follow-up #3) |
| `app/(tabs)/index.tsx` | Mount `useHealthSync`; break out consistency/REC so the bars visibly add up (Phase 1 follow-up #8) |
| `src/features/health/HealthPermissionSheet.tsx` | Fire the first sync when the ask resolves |
| `docs/roadmap.md` | Deviation #8; tick the Phase 3 bullets that are genuinely done |

---

## Tasks

- [ ] **Task 1 — `sync-state.ts`, TDD.** `SyncState`, `initialSyncState`, `markDirty(state, dates)`, `markSynced(state, dates, at)`, `markFailed(state, at, message)`, `MAX_DIRTY_DATES = 31`. Dirty dates deduped, sorted, capped by dropping the oldest. `markSynced` clears only the dates the server confirmed, so a partial success leaves the rest dirty. Zero imports.
- [ ] **Task 2 — `sync-window.ts`, TDD.** `resolveSyncWindow(state, now, timeZone)` → `{ dates, fromUtc, toUtc }`. Union of `state.dirtyDates` and today, sorted, clamped to `MAX_DIRTY_DATES`, dropping dates older than the clamp rather than truncating the span. Imports `@kairo/core` only. Cases: fresh install (today alone); midnight rollover adds a date; over-long dirty set clamps; timezone change re-derives today.
- [ ] **Task 3 — `hourly-buckets.ts`, TDD.** `toBuckets(readings, dates, timeZone)` where a reading is `{ metric: 'steps'|'distanceM'|'activeKcal'|'activeMinutes'|'hadWorkout'|'elevatedHeartRate', startDate: Date, value: number }`. Emits exactly `dates.length * 24` buckets, zeros included, sorted by `(localDate, hour)`. Sums DST fall-back duplicates. Rounds steps, clamps `activeMinutes` to 60, floors negatives at 0. Drops readings whose local date is outside `dates`. Imports `@kairo/core` only. Cases: normal day = 24 buckets; fall-back day sums the repeated hour; spring-forward day leaves a zero hour without shifting; `activeMinutes` > 60 clamped; 250-step VIT boundary preserved; 31 dates stays ≤ 750.
- [ ] **Task 4 — `sync-policy.ts`, TDD.** Modelled on `src/features/squad/realtime-policy.ts`. Inputs `mount` / `foreground` / `observer` / `permission-granted` / `sync-succeeded` / `sync-failed`, each with `at`. Commands `none` / `sync-now` / `sync-after {delayMs}`. Observer bursts coalesce; foreground throttles; failure backs off and resets on success; no sync issued while one is in flight. Zero imports.
- [ ] **Task 5 — `storage.ts` + `read.ts`.** MMKV under key `health.sync.v1`, tolerating a corrupt value by returning `initialSyncState`. `read.ts` runs four `queryStatisticsCollectionForQuantity` calls with `['cumulativeSum']`, `anchorDate = fromUtc`, `{ hour: 1 }`; plus `queryCategorySamples` for sleep and workout/heart-rate reads for the two anti-cheat booleans. Returns flattened readings. **Verify on the simulator:** enter steps in Health, log the readings, confirm hour alignment against the wall clock.
- [ ] **Task 6 — `sync.ts` + `todayScoreKey()`.** Orchestrate and POST via `supabase.functions.invoke('sync-health')`. Invalidate `todayScoreKey` and the squad board keys on success. **Verify live:** `./supabase/scripts/remote-sql.sh "select local_date, hour, steps from health_buckets where user_id = '<uid>' order by hour"` and the matching `daily_scores` row. Re-run and confirm row count and total are unchanged.
- [ ] **Task 7 — `useHealthSync.ts` + wiring.** Hook mounted from `app/(tabs)/index.tsx`; `HealthPermissionSheet` fires `permission-granted`. Add the consistency/REC breakdown line. **Verify on the simulator:** background, add steps in Health, foreground — the score updates with no interaction, and the squad board reorders.
- [ ] **Task 8 — `background.ts` + `plugins/withHealthKitBackgroundObservers.js`.** `configureBackgroundTypes(KAIRO_OBSERVED_TYPES, UpdateFrequency.hourly)` called once after permission, plus a config plugin injecting `BackgroundDeliveryManager.shared.setupBackgroundObservers()` into `didFinishLaunchingWithOptions` — the library's own plugin only writes plists, so without this the entitlement grants nothing. Follow `plugins/withIosBuildWarningFixes.js`: idempotent marker, and throw loudly rather than silently skipping if an anchor moves. **Verify with `expo prebuild --platform ios`** and read the generated `AppDelegate.swift`. Wake-after-termination stays ⬜ — it needs a device.
- [ ] **Task 9 — roadmap.** Add deviation #8 to the implementation-deviations table. Tick the Phase 3 bullets that are genuinely done. Close Phase 1 follow-ups #3 and #8.

## Verification

- `npm test` — core + schema green.
- `npm run typecheck` — tsc, workspace tsc, `deno check`.
- `npm run ios` — simulator, real steps in, real score out, buckets confirmed via `remote-sql.sh`.
- Idempotency by hand: sync twice, one set of rows, unchanged total.
