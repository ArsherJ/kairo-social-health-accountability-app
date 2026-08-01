# HealthKit ingest on the client

Status: approved 2026-08-01. Closes the two outstanding Phase 3 bullets and
Phase 1 follow-ups #3 and #8.

## Goal

Real health data reaches the server. Today every score the app has displayed was
fabricated by `seed-health`; after this, the character screen shows a number the
real engine computed from the user's real steps, and the squad board, sabotage
and the finalizer are all fed by it for the first time.

## What already exists — do not rebuild it

- **`sync-health` is deployed and verified live.** It upserts hourly buckets,
  re-reads the *whole* day, rescores through `@kairo/core`, runs the anti-cheat
  cross-check and honours the §19 backfill freeze. Its request contract is
  validated by `supabase/functions/_shared/sync-plan.ts` (31 tests).
- **Native config is done.** `app.config.ts` carries the HealthKit plugin with
  `background: true`; `ios/Kairo/Kairo.entitlements` has both the `healthkit`
  and `healthkit.background-delivery` entitlements.
- **Permission is done.** `src/features/health/permission.ts` exports
  `KAIRO_READ_TYPES`, `readHealthPermissionState()` and
  `requestHealthPermission()`, and `HealthPermissionSheet.tsx` presents the
  in-context ask over the character screen (§5).
- **Day math is done.** `packages/kairo-core/src/day.ts` has `currentLocalDate`,
  `localHourFor`, `dayStartUtc`, `dayEndUtc` and `addDays`, all DST-correct and
  table-tested.

This spec adds **no migration**. It is client work.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Read mechanism | **Hourly statistics-collection queries over a bounded window** | Deviation #8. See below — this is the load-bearing one. |
| Persisted anchors | **None** | Replaced by a dirty-date set. Anchor staleness is silent data loss. |
| Observer queries | **Kept, as a bare signal** | Same role broadcasts play for the squad board. The payload is not read. |
| Payload granularity | **Whole days, all 24 hours, zeros included** | Makes Apple's *downward* revisions self-correcting. |
| Persisted state | **Dirty dates, not queued payloads** | HealthKit is the source of truth; queued numbers go stale. |
| Timezone authority | **`profiles.timezone`** | Already reconciled on foreground by `timezone-sync.ts`. |

---

### Deviation #8 — window reads, not persisted anchors

`docs/roadmap.md` Phase 3 said *"anchored reads with persisted anchors"*. We use
`queryStatisticsCollectionForQuantity` over a bounded window instead.

**1. Source deduplication is free, and otherwise expensive.** iPhone and Apple
Watch both write `HKQuantityTypeIdentifierStepCount`. Summing raw samples
double-counts. `HKStatisticsCollectionQuery` with `cumulativeSum` applies
Apple's own cross-source dedup. Anchored sample reads would mean reimplementing
it, and getting it wrong inflates scores on exactly the users most likely to be
competitive — which is §15 risk question 4, score-fairness perception, failing
for a reason we chose.

**2. Hourly bucketing falls out of the query.** `anchorDate` is the user's local
midnight and `intervalComponents` is `{ hour: 1 }`, so the returned intervals
are already aligned to the local day. With raw samples a walk from 8:50 to 9:10
needs proportional splitting across two buckets — new logic, new bugs, no gain.

**3. Retroactive revisions are free.** Re-reading a window returns corrected
totals, and `sync-health` already upserts on `(user_id, local_date, hour)` and
rescores the whole day from stored buckets. Anchors hand you new samples but you
must still re-derive every affected hour and separately process
`deletedSamples`.

**4. Anchor staleness is silent data loss.** A corrupt or stale anchor skips
data forever with no symptom. A window high-water mark cannot: the worst case is
re-reading data already sent, which the idempotent upsert absorbs.

The cost is re-reading data that has not changed. That cost is bounded by the
window and paid on a query HealthKit answers from an index, against a server
endpoint built to be replayed. It buys away the two failure modes above.

### Whole days, zeros included

Sending only non-empty hours has a hole: if Apple revises an hour *downward* to
zero, omitting it leaves the old nonzero bucket in place and the day scores too
high forever. So a dirty day is sent as all 24 of its hours.

This is what sizes the window. 31 days × 24 hours = 744 buckets, just under the
server's existing `MAX_BUCKETS_PER_SYNC = 750`. The cap is therefore not
arbitrary — it is the largest window that can always be expressed as complete
days in one request.

### The dirty set is dates, not payloads

The obvious offline queue stores the payload that failed to send. That queue has
a classic bug: a retry can POST numbers that a later, successful sync has
already superseded.

Storing *which local dates need re-reading* avoids it entirely. HealthKit is the
source of truth and re-reading is cheap, so a retry always sends current data.
The persisted state is small:

```ts
type SyncState = {
  dirtyDates: string[];      // local dates awaiting a successful sync
  lastSyncedAt: number | null;
  lastError: string | null;  // for the Phase 7 profile screen; unrendered today
  lastErrorAt: number | null;
};
```

Keyed per user (`sync-state.v1.<userId>`) and cleared on sign-out. The dates are
local dates in *that* user's timezone, so a second account on the same device
must not inherit them.

**Yesterday rides along with today on every sync.** Nothing marks yesterday
dirty at the midnight rollover, and a watch or phone that syncs late writes into
hours that have already passed — so without a two-day routine window those steps
would only ever reach the server by accident, and `finalize-days` closes the day
~2h after local midnight.

### Sleep needs the deduplication that quantities get for free

There is no statistics query for category types, so `HKStatistics`' cross-source
dedup does not apply to sleep. A watch and a third-party sleep app both
recording the same night would report twice the minutes — and because
`recBonusFor` pays *less* above nine hours, double-counting turns a healthy
eight-hour night into an oversleep penalty. Sleep segments are therefore merged
into a union of intervals before any minutes are counted.

Only `asleepUnspecified`, `asleepCore`, `asleepDeep` and `asleepREM` count.
`inBed` and `awake` do not — counting `inBed` would hand REC's bonus to someone
who read in bed for nine hours. Attribution is by wake time (`endMs - 1`), so a
session ending exactly at local midnight lands on the day that just ended.

### DST is handled by the existing day math, not by counting

`health_buckets` constrains `hour` to 0–23 with a PK on
`(user_id, local_date, hour)`, but a local day has 23 or 25 hours across a DST
transition. The Philippines has no DST; §4 explicitly targets OFWs in Europe and
the US, so this is real rather than theoretical.

The rule is: **never derive the hour index by counting intervals.** Map each
interval's `startDate` through the functions that already exist and are already
tested:

```ts
const localDate = currentLocalDate(interval.startDate, tz);
const hour      = localHourFor(interval.startDate, tz);
```

A fall-back day then yields two intervals landing on the same `(date, hour)` —
they are **summed**, not overwritten, because both really happened during that
wall-clock hour. A spring-forward day simply has no interval for the missing
hour, and nothing shifts. Both behaviours fall out of the mapping rather than
being special-cased, which is the same property that makes `finalizable_days()`
and `isFinalizable()` agree.

### The pure/impure boundary

`hourly-buckets.ts` never imports the healthkit package. `read.ts` flattens
HealthKit's responses into plain `{ metric, startDate, value }` objects, and
everything that makes a decision operates on those.

This is the same discipline `supabase/functions/_shared/*-plan.ts` applies to
the Edge Functions, and for the same reason: root Vitest runs in plain Node with
no `@/` alias and cannot parse React Native's Flow syntax, so anything with a
test beside it must import only relative paths and `@kairo/core`. What cannot be
tested in Node is effectively untested, so the boundary is drawn to leave as
little as possible on the untestable side.

## What this deliberately does not do

- **No background-delivery verification.** Registration is now wired end to end
  — entitlement, `configureBackgroundTypes`, and the AppDelegate call — but
  being *woken after termination* cannot be observed on a simulator, and needs
  the HealthKit capability on the App ID. Phase 3 stays 🟨 with that bullet open
  rather than being ticked on faith.
- **No retry UI.** A failed sync leaves the date dirty and retries on the next
  foreground. `lastError` is persisted for the Phase 7 profile screen to surface;
  nothing renders it yet.
- **No sleep source attribution.** `daily_sleep.source` stays null. REC is a
  wearable bonus and never a penalty (§5), so an unattributed reading is
  harmless.

## Verified during design

- `queryStatisticsCollectionForQuantity(identifier, statistics, anchorDate,
  intervalComponents, options)` exists in `@kingstinct/react-native-healthkit`
  14.0.2 and returns `{ sumQuantity?: {unit, quantity}, startDate?, endDate?,
  sources }` per interval.
- **`unit` must always be passed.** It is optional, and when omitted HealthKit
  returns the user's *preferred* unit, which is locale-dependent — on a
  US-locale device `distanceWalkingRunning` comes back in **miles** and lands in
  a column named `distance_m`. That breaks the anti-cheat stride check
  (`distanceM >= steps * 0.4`) in the direction that flags honest runners, which
  §5 calls the expensive error.
- **The date predicate must always be passed.** The native side returns the
  whole statistics collection, not an enumerated range, so without a filter the
  query returns every hour since the user's first ever sample.
- `limit` is a **required** field on the sample query options; a non-positive
  value means "all".
- `react-native-mmkv` 4.x exports `createMMKV(config)`, not a `MMKV` class, and
  the delete method is `remove(key)`.
- **`configureBackgroundTypes` alone does not survive termination.** It persists
  its configuration and registers observers for the *running* process, but the
  library's Expo plugin runs only `withEntitlementsPlist` and `withInfoPlist` —
  it never patches the AppDelegate — and nothing in the pod self-registers.
  `BackgroundDeliveryManager.swift` documents that `setupBackgroundObservers()`
  must be called from `didFinishLaunchingWithOptions`, and the generated
  `AppDelegate.swift` had no HealthKit reference at all.

  **Closed by `plugins/withHealthKitBackgroundObservers.js`**, which injects the
  import and the call. Calling it unconditionally at launch is safe: it bails
  out when HealthKit is unavailable and reads its type list from UserDefaults,
  which is empty until JS has called `configureBackgroundTypes()` after the user
  granted permission — so it never triggers a permission prompt at launch.
- Even once wired, the native observer calls iOS's completion handler as soon as
  JS is notified rather than when the sync finishes, so the process can be
  suspended mid-request. **Background delivery is best-effort; the foreground
  flush is the guarantee.**
- `@kairo/core` resolves in root Vitest via the `node_modules/@kairo/core`
  symlink to `packages/kairo-core/src/index.ts`, so pure modules under `src/`
  may import it. The `@/` alias still does not resolve.
- Simulator builds are unsigned, so the missing HealthKit capability on the App
  ID does not block simulator verification. It *will* block the first device
  build, silently — `app.config.ts` already warns about this.
