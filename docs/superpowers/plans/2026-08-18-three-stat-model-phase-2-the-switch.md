# Three-Stat Model, Phase 2: The Switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `CoreStat` from four stats to three (`AGI` / `STR` / `MND`),
wire in Phase 1's primitives, and tune the constants against the real beta
cohort — leaving the database additively migrated and the Edge Functions
dual-writing, so Phase 3 can contract and deploy.

**Architecture:** The union change breaks ~35 files at once, so the repo cannot
stay green across it unless each *task* spans every file its change touches.
The sequence is therefore expand-then-contract at the type level, mirroring
what Phase 3 does at the schema level: add `MND` as a fifth stat (Task 3),
then retire `END` and `VIT` (Task 4). Every task ends with a green
`npm test` and `npm run typecheck`; no task leaves the tree uncompilable.

**Tech Stack:** TypeScript (strict), Vitest, PGlite schema harness, Supabase
Edge Functions (Deno), `remote-sql.sh` for read-only live queries.

**Spec:** `docs/superpowers/specs/2026-08-18-three-stat-attribute-model-design.md`

**Prior phase:** `docs/superpowers/plans/2026-08-18-three-stat-model-phase-1-engine-primitives.md`
(merged). Phase 1 shipped `mind.ts`, `shifts.ts`, `capability.ts`, `trust.ts` —
all pure, all tested, none wired up.

## Global Constraints

- **`packages/kairo-core` takes no dependencies, ever.** Pure TypeScript: no
  I/O, no clock reads, no randomness.
- **One implementation of scoring.** Everything goes through
  `computeDailyScore`. Do not add a parallel engine, not even for the replay —
  Task 5's tool calls the real one.
- **Every task ends green.** `npm test` and `npm run typecheck` both pass
  before the commit. A task that cannot compile is not finished.
- **No migration is applied to the live project in this phase**, and no Edge
  Function is deployed. Phase 2 changes source and schema *files*; Phase 3
  applies and deploys them. This is deliberate: applying a migration without
  its function redeploy took scoring down for two days in August 2026.
- **Tier points (verbatim from spec §2):** Bronze 250, Silver 650, Gold 1,200.
  Derived from `4 x 900 = 3 x 1,200`.
- **Bands (verbatim from spec §2):** AGI 1,000 / 5,000 / 10,000 steps;
  STR 50 / 200 / 400 kcal; MND 5h / 6h / 7h, above 9h scores Bronze.
- **Breadth (verbatim from spec §2):** `CONSISTENCY_BONUS` re-indexes to
  `[0, 0, 400, 800]`; full breadth means all stats available to you.
- **Normalization (verbatim from spec §2):** stat points scale by
  `3 / earnable stats`. Ceiling is **4,400** either way.
- **Flagged sleep counts toward capability (spec §3, resolved 2026-08-18).**
  If it scores, it counts. The allowlist survives only as the `flagged` social
  signal.
- **A workout is verified when its source is allowlisted AND the session
  carries heart-rate evidence (spec §3, resolved 2026-08-18).** Both.
- Commands: `npm test` (everything), `npm run test:core`, `npm run test:schema`,
  `npm run typecheck`, `./supabase/scripts/remote-sql.sh "select ..."`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260819100000_three_stat_expand.sql` | Additive schema: `mind_points`, sleep/workout origin columns, widened checks | 1 |
| `supabase/tests/schema.test.ts` | Modify: assert the new columns and widened checks | 1 |
| `packages/kairo-core/src/capability.ts` | Modify: takes scoring sleep dates, not trusted-only | 2 |
| `packages/kairo-core/src/trust.ts` | Modify: `WorkoutOrigin` + `workoutVerified()` | 2 |
| `packages/kairo-core/src/types.ts` | Modify: `CoreStat` union, `CORE_STATS` | 3, 4 |
| `packages/kairo-core/src/scoring.ts` | Modify: thresholds, `rawFor`, `computeDailyScore` | 3, 4 |
| `packages/kairo-core/src/{day,dominance,program,compute}.ts` | Modify: follow the union | 3, 4 |
| `src/features/character/*`, `src/features/squad/*`, `src/ui/Stat*.tsx` | Modify: `Record<CoreStat, …>` literals and copy | 3, 4 |
| `supabase/functions/_shared/sync-plan.ts` | Modify: write `mind_points`; later stop writing `end`/`vit` | 3, 4 |
| `scripts/replay-dry-run.mjs` | Create: read-only replay of both models over live data | 5 |

**Files that must NOT change in this phase:** any `ios/` file, `app.config.ts`,
`src/features/health/read-types.ts` (the HealthKit type list is unchanged —
spec §1), and no migration may be applied to the live project.

---

### Task 1: Additive migration and schema tests

**Files:**
- Create: `supabase/migrations/20260819100000_three_stat_expand.sql`
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `daily_scores.mind_points integer not null default 0`;
  `daily_sleep.was_user_entered boolean`; `daily_sleep.source` (already exists,
  now documented as the origin bundle id);
  `workout_sessions.source_bundle_id text`,
  `workout_sessions.was_user_entered boolean`,
  `workout_sessions.has_heart_rate_evidence boolean`.

**Why this task is first:** Task 3 makes `computeDailyScore` emit MND points,
and the schema suite inserts `planDay`'s **real output** into `daily_scores`.
Without the column, Task 3 cannot end green.

- [ ] **Step 1: Write the failing schema test**

In `supabase/tests/schema.test.ts`, add a new `describe` block. Match the
existing file's style for obtaining the client and the `authenticated` role —
read the neighbouring tests first and follow them exactly.

```typescript
describe('three-stat expand migration', () => {
  it('adds mind_points to daily_scores, defaulted and non-negative', async () => {
    const { rows } = await db.query(`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_scores'
        and column_name = 'mind_points'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');
  });

  it('keeps rec_points during the expand phase, so a rollback needs no restore', async () => {
    const { rows } = await db.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_scores'
        and column_name in ('rec_points', 'end_points', 'vit_points')
    `);
    expect(rows).toHaveLength(3);
  });

  it('records sleep origin for the trust layers', async () => {
    const { rows } = await db.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_sleep'
        and column_name in ('source', 'was_user_entered')
    `);
    expect(rows.map((r) => r.column_name).sort()).toEqual(['source', 'was_user_entered']);
  });

  it('records workout origin including heart-rate evidence', async () => {
    const { rows } = await db.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'workout_sessions'
        and column_name in ('source_bundle_id', 'was_user_entered', 'has_heart_rate_evidence')
    `);
    expect(rows).toHaveLength(3);
  });

  // MND must be storable as a featured stat before Task 3 can emit it.
  it('accepts MND as a featured stat', async () => {
    const { rows } = await db.query(`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.daily_scores'::regclass
        and pg_get_constraintdef(oid) like '%featured_stat%'
    `);
    expect(rows[0].def).toContain('MND');
  });

  // Transitional: five stats can contribute until Task 4 retires END and VIT.
  it('allows up to five contributing stats during the transition', async () => {
    const { rows } = await db.query(`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.daily_scores'::regclass
        and conname like '%contributing_stats%'
    `);
    expect(rows[0].def).toContain('5');
  });
});
```

- [ ] **Step 2: Run the schema suite and verify the new tests fail**

Run: `npm run test:schema`
Expected: FAIL — the six new assertions fail; every pre-existing test passes.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260819100000_three_stat_expand.sql`:

```sql
-- Three-stat model (roadmap deviation #41), expand phase.
--
-- Additive only. `rec_points`, `end_points` and `vit_points` all survive this
-- migration on purpose: the four-step expand/contract in spec §4 exists
-- because renaming a column out from under a deployed Edge Function is the
-- August 2026 outage in miniature — the bucket upsert commits before the score
-- upsert, so health data keeps landing while nothing scores, silently.
--
-- Phase 3 drops them, after the functions writing both shapes are deployed.

begin;

alter table public.daily_scores
  add column mind_points integer not null default 0 check (mind_points >= 0);

comment on column public.daily_scores.mind_points is
  'MND tier points (§5). Promoted from rec_points, which is retained until the contract migration so a function rollback needs no schema restore.';

-- Contributing stats is transitionally 0..5: MND joins in Task 3, END and VIT
-- leave in Task 4, and the window between them is a real state the check must
-- permit. Phase 3 tightens this to 0..3.
alter table public.daily_scores
  drop constraint if exists daily_scores_contributing_stats_check;

alter table public.daily_scores
  add constraint daily_scores_contributing_stats_check
    check (contributing_stats between 0 and 5);

alter table public.daily_scores
  drop constraint if exists daily_scores_featured_stat_check;

alter table public.daily_scores
  add constraint daily_scores_featured_stat_check
    check (featured_stat is null or featured_stat in ('AGI', 'STR', 'END', 'VIT', 'MND'));

-- Sleep origin. `source` already existed and was never populated; it now
-- carries the origin bundle identifier. The client sends the bundle id and the
-- user-entered flag and never a verdict — the allowlist lives server-side, so
-- a forged client cannot promote itself past a list it does not hold.
alter table public.daily_sleep
  add column was_user_entered boolean;

comment on column public.daily_sleep.source is
  'sourceRevision.source.bundleIdentifier of the sample the night was attributed from. Null for rows written before the three-stat model.';

comment on column public.daily_sleep.was_user_entered is
  'Apple HKWasUserEntered. True means hand-typed: the night is discarded, never scored. Null for rows predating the three-stat model.';

-- Workout origin. Three signals, because a verified workout needs its source
-- allowlisted AND heart-rate evidence present (spec §3, resolved 2026-08-18).
alter table public.workout_sessions
  add column source_bundle_id text,
  add column was_user_entered boolean,
  add column has_heart_rate_evidence boolean;

comment on column public.workout_sessions.has_heart_rate_evidence is
  'Whether the session carried heart-rate samples, from a per-workout getStatistic call. Manual entry never does. Required for STR''s threshold shift.';

commit;
```

- [ ] **Step 4: Run the schema suite and verify it passes**

Run: `npm run test:schema`
Expected: PASS, including the six new assertions.

- [ ] **Step 5: Verify everything and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add supabase/migrations/20260819100000_three_stat_expand.sql supabase/tests/schema.test.ts
git commit -m "feat(db): expand-phase migration for the three-stat model

Additive only. rec_points, end_points and vit_points all survive so a
function rollback needs no schema restore. Not applied to the live
project — Phase 3 applies and deploys together.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Close the two resolved spec decisions in `kairo-core`

**Files:**
- Modify: `packages/kairo-core/src/capability.ts`
- Modify: `packages/kairo-core/src/capability.test.ts`
- Modify: `packages/kairo-core/src/trust.ts`
- Modify: `packages/kairo-core/src/trust.test.ts`

**Interfaces:**
- Consumes: Phase 1's `SampleTrust`, `SampleOrigin`, `sampleTrust`,
  `scoresAtAll`, `hasSleepCapability`.
- Produces: `hasSleepCapability(scoringSleepDates, today)` — **semantics
  changed, signature unchanged**; `interface WorkoutOrigin extends SampleOrigin
  { hasHeartRateEvidence: boolean }`; `workoutVerified(origin, allowlist): boolean`.

**Why:** Phase 1 shipped a docstring on `capability.ts` saying *"Untrusted
nights must not be passed here"*, written against the unresolved version of the
spec. The spec now resolves the opposite way. This is the one place Phase 1's
code is knowingly wrong, and it must be corrected before anything consumes it.

- [ ] **Step 1: Write the failing tests**

In `packages/kairo-core/src/capability.test.ts`, add to the
`hasSleepCapability` describe block:

```typescript
  // Resolved 2026-08-18: if it scores, it counts. Layer 3 says an unknown
  // source scores, so it must also make MND earnable — otherwise a user
  // scores MND *and* is normalized as a two-stat user, which spec §3 shows
  // reaching 6,200 against a 4,400 ceiling.
  it('counts a flagged night, because a flagged night still scores', () => {
    expect(hasSleepCapability(['2026-08-17'], '2026-08-18')).toBe(true);
  });
```

In `packages/kairo-core/src/trust.test.ts`, add:

```typescript
import { workoutVerified } from './trust.ts';

describe('workoutVerified', () => {
  const ALLOW = ['com.apple.health.watch'];

  it('verifies an allowlisted session carrying heart-rate evidence', () => {
    expect(
      workoutVerified(
        { wasUserEntered: false, sourceBundleId: 'com.apple.health.watch', hasHeartRateEvidence: true },
        ALLOW,
      ),
    ).toBe(true);
  });

  // Both signals, not either. STR's shift is worth up to 25% of a band, which
  // is too much to hand to an unverified claim.
  it('refuses an allowlisted session with no heart-rate evidence', () => {
    expect(
      workoutVerified(
        { wasUserEntered: false, sourceBundleId: 'com.apple.health.watch', hasHeartRateEvidence: false },
        ALLOW,
      ),
    ).toBe(false);
  });

  it('refuses an unknown source even with heart-rate evidence', () => {
    expect(
      workoutVerified(
        { wasUserEntered: false, sourceBundleId: 'com.unknown.app', hasHeartRateEvidence: true },
        ALLOW,
      ),
    ).toBe(false);
  });

  it('refuses a hand-typed session outright', () => {
    expect(
      workoutVerified(
        { wasUserEntered: true, sourceBundleId: 'com.apple.health.watch', hasHeartRateEvidence: true },
        ALLOW,
      ),
    ).toBe(false);
  });

  // The specific hole the Phase 1 final review identified: scoresAtAll is the
  // sleep rule and treats a flagged sample as scoring. A workout must not
  // inherit it.
  it('is stricter than scoresAtAll, which flagged samples pass', () => {
    const unknown = {
      wasUserEntered: false,
      sourceBundleId: 'com.unknown.app',
      hasHeartRateEvidence: true,
    };
    expect(scoresAtAll(sampleTrust(unknown, ALLOW))).toBe(true);
    expect(workoutVerified(unknown, ALLOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test:core -- --run src/trust.test.ts src/capability.test.ts`
Expected: FAIL — `workoutVerified` is not exported. The new
`hasSleepCapability` case may already pass, since the change there is
documentation and parameter naming rather than logic; that is expected and
fine.

- [ ] **Step 3: Correct `capability.ts`**

Replace the `hasSleepCapability` docstring and parameter name:

```typescript
/**
 * `scoringSleepDates` are local dates (`YYYY-MM-DD`) on which sleep data that
 * **scores** arrived — trusted or flagged, per `scoresAtAll`. Only nights
 * rejected as hand-typed are excluded.
 *
 * **This was resolved the other way in Phase 1 and corrected here.** If a
 * night scores MND, it must also make MND earnable. Excluding flagged nights
 * from capability while still scoring them lets a user earn three stats and be
 * normalized as a two-stat user: (1,200 x 3) x 1.5 + 800 = 6,200, against a
 * stated ceiling of 4,400. The consequence is deliberate — the allowlist no
 * longer affects score at all, and survives as the `flagged` social signal
 * (§20) it was always documented to be.
 *
 * Lexicographic comparison is exact for this format.
 */
export function hasSleepCapability(
  scoringSleepDates: readonly string[],
  today: string,
): boolean {
  const windowStart = addDays(today, -(SLEEP_CAPABILITY_WINDOW_DAYS - 1));
  return scoringSleepDates.some((date) => date >= windowStart && date <= today);
}
```

- [ ] **Step 4: Add `workoutVerified` to `trust.ts`**

Append to `packages/kairo-core/src/trust.ts`:

```typescript
export interface WorkoutOrigin extends SampleOrigin {
  /**
   * Whether the session carried heart-rate samples, from a per-workout
   * `getStatistic('HKQuantityTypeIdentifierHeartRate')` call. Manual entry
   * never does.
   */
  hasHeartRateEvidence: boolean;
}

/**
 * Whether a workout may shift STR's thresholds.
 *
 * **Deliberately stricter than `scoresAtAll`, and deliberately a separate
 * function.** Sleep's rule lets a flagged night score, because a legitimate
 * obscure sleep app scoring zero is indistinguishable from Kairo being broken.
 * A workout's shift is worth up to 25% of a band, which is too much to hand to
 * an unverified claim — so a workout needs its source allowlisted *and*
 * heart-rate evidence present. Reusing `scoresAtAll` here is the specific
 * defect the Phase 1 final review identified.
 *
 * Known consequence: a real workout from an app that records no heart rate
 * shifts nothing.
 */
export function workoutVerified(
  origin: WorkoutOrigin,
  allowlist: readonly string[],
): boolean {
  return origin.hasHeartRateEvidence && sampleTrust(origin, allowlist) === 'trusted';
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm run test:core -- --run src/trust.test.ts src/capability.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify everything and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add packages/kairo-core/src/capability.ts packages/kairo-core/src/capability.test.ts packages/kairo-core/src/trust.ts packages/kairo-core/src/trust.test.ts
git commit -m "feat(core): close the spec's two resolved decisions

Flagged sleep counts toward capability — excluding it while still
scoring it reaches 6,200 against a 4,400 ceiling. Workout verification
gets its own predicate requiring allowlist AND heart-rate evidence,
rather than inheriting sleep's more permissive scoresAtAll.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Add MND as a fifth stat (expand)

**Files:**
- Modify: `packages/kairo-core/src/types.ts`, `scoring.ts`, `scoring.test.ts`,
  `day.test.ts`, `dominance.test.ts`, `program.ts`, `program.test.ts`
- Modify: `src/features/character/stat-detail.ts`, `lane.ts`, `species.ts`,
  `species-label.ts`, and their tests
- Modify: `src/ui/StatIcon.tsx`
- Modify: `supabase/functions/_shared/sync-plan.ts` and `sync-plan.test.ts`

**Interfaces:**
- Consumes: `mindTierFor` from Task 1 of Phase 1.
- Produces: `CoreStat` including `'MND'`; `DailyScore.stats.MND`;
  `sync-plan` writing `mind_points`.

**Why expand before contract:** `CoreStat` is a union, so every
`Record<CoreStat, …>` literal and every exhaustive `switch` breaks the moment
it changes. Adding a member and removing two in one commit means one enormous
diff nobody can review. Adding first is mechanical and reviewable; removing
second is a separate, checkable deletion.

- [ ] **Step 1: Write the failing test**

In `packages/kairo-core/src/scoring.test.ts`, add:

```typescript
describe('MND as a core stat', () => {
  it('scores sleep through the MND bands', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: 7 * 60 });
    expect(score.stats.MND.tier).toBe('gold');
    expect(score.stats.MND.raw).toBe(7 * 60);
  });

  it('scores no MND when there is no sleep data at all', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: null });
    expect(score.stats.MND.tier).toBe('none');
  });

  // Oversleep is a promoted bonus, never a penalty.
  it('flattens an eleven-hour night to bronze', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: 11 * 60 });
    expect(score.stats.MND.tier).toBe('bronze');
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: FAIL — `Property 'MND' does not exist`.

- [ ] **Step 3: Widen the union**

In `packages/kairo-core/src/types.ts`:

```typescript
export type CoreStat = 'AGI' | 'STR' | 'END' | 'VIT' | 'MND';

export const CORE_STATS: readonly CoreStat[] = ['AGI', 'STR', 'END', 'VIT', 'MND'];
```

- [ ] **Step 4: Score MND in `scoring.ts`**

Add `MND` to the `THRESHOLDS` table, reading Phase 1's constants rather than
restating them:

```typescript
import { MIND_THRESHOLD_HOURS } from './mind.ts';

const THRESHOLDS: Record<CoreStat, Record<Exclude<Tier, 'none'>, number>> = {
  AGI: { bronze: 1_000, silver: 5_000, gold: 10_000 },
  STR: { bronze: 50, silver: 200, gold: 400 },
  END: { bronze: 10, silver: 30, gold: 60 },
  VIT: { bronze: 3, silver: 6, gold: 9 },
  // In minutes, to match the raw unit. Derived from mind.ts so the bands
  // cannot drift apart, exactly as DAILY_STEP_BASELINE derives from AGI gold.
  MND: {
    bronze: MIND_THRESHOLD_HOURS.bronze * 60,
    silver: MIND_THRESHOLD_HOURS.silver * 60,
    gold: MIND_THRESHOLD_HOURS.gold * 60,
  },
};
```

`rawFor` needs sleep, which is not in `DayTotals`. Change its signature and
give MND its own tier function, because the oversleep floor is not expressible
as a threshold table:

```typescript
function rawFor(stat: CoreStat, totals: DayTotals, sleepMinutes: number | null): number {
  switch (stat) {
    case 'AGI':
      return totals.steps;
    case 'STR':
      return totals.activeKcal;
    case 'END':
      return totals.activeMinutes;
    case 'VIT':
      return totals.activeHours;
    case 'MND':
      return sleepMinutes ?? 0;
  }
}
```

In `computeDailyScore`'s loop, MND's tier comes from `mindTierFor`, not
`tierFor` — the flattening above nine hours is a rule the threshold table
cannot express:

```typescript
  for (const stat of CORE_STATS) {
    const raw = rawFor(stat, totals, sleepMinutes);
    const tier = stat === 'MND' ? mindTierFor(raw) : tierFor(stat, raw);
```

Leave `recBonusFor` and the `recBonus` line exactly as they are for now —
Task 4 retires them. Both paying at once is transitional and expected.

- [ ] **Step 5: Make every consumer compile again**

Every `Record<CoreStat, …>` literal now needs an `MND` entry. Work through the
compiler's errors — `npm run typecheck` names every one. The literals needing
**real copy**, not a mechanical entry:

- `src/features/character/stat-detail.ts` — `STAT_UNITS`: `MND: 'hours slept'`;
  `STAT_UNITS_SINGULAR`: `MND: 'hour slept'`; `STAT_WHY`: `MND: 'Sleep is when
  training becomes strength. Seven hours reaches Gold.'`
- `src/features/character/lane.ts` — `LANE_EMPTY_COPY`:
  `MND: 'Rest is training too. Sleep tonight and Mind starts moving.'`
- `src/ui/StatIcon.tsx` — glyph `MND: 'brain'`, and `STAT_NAMES`:
  `MND: 'Mind'`.

Everything else is mechanical. Do not invent behaviour: if a literal maps
stats to something with no sensible MND value, mirror the least-surprising
neighbour and note it in your report.

- [ ] **Step 6: Write `mind_points` from `sync-plan.ts`**

In `supabase/functions/_shared/sync-plan.ts`, add `mind_points` to the row it
builds, from `score.stats.MND.points`. Keep `rec_points` written as it is —
dual-write is the whole point of the expand phase. Update
`sync-plan.test.ts`'s expected row shape to match.

- [ ] **Step 7: Verify everything and commit**

Run: `npm test && npm run typecheck`
Expected: PASS. The schema suite matters most here — it inserts `planDay`'s
real output, so it proves the engine and the migration agree.

```bash
git add -A
git commit -m "feat(core): MND joins as a fifth stat (expand phase)

Bands derive from mind.ts rather than restating it, and MND's tier comes
from mindTierFor because the oversleep floor is not expressible as a
threshold table. END, VIT and the REC bonus all still pay — Task 4
retires them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Retire END and VIT, and apply shifts, normalization and the re-tune (contract)

**Files:**
- Modify: `packages/kairo-core/src/types.ts`, `scoring.ts`, `scoring.test.ts`,
  `day.ts`, `dominance.ts`, `program.ts`, `compute.ts` and their tests
- Modify: every `Record<CoreStat, …>` literal touched in Task 3
- Modify: `supabase/functions/_shared/sync-plan.ts`
- Create: `supabase/migrations/20260819110000_three_stat_contract_checks.sql`

**Interfaces:**
- Consumes: `spreadShift`, `workoutShift`, `shiftedThreshold`,
  `normalizationFactor`, `earnableStats`, `hasSleepCapability` (Phase 1 + Task 2).
- Produces: `CoreStat = 'AGI' | 'STR' | 'MND'`; `DailyScore` with
  normalization applied; `recBonusFor` deleted.

- [ ] **Step 1: Write the failing tests**

In `packages/kairo-core/src/scoring.test.ts`:

```typescript
describe('the three-stat model', () => {
  const goldDay = () => ({
    buckets: fullGoldBuckets(), // reuse the existing helper in this file
    sleepMinutes: 7 * 60,
  });

  it('has exactly three stats', () => {
    expect(CORE_STATS).toEqual(['AGI', 'STR', 'MND']);
  });

  // TIER_POINTS is module-private and must stay that way; assert the re-tune
  // through behaviour and through the one figure that IS exported.
  it('pays the re-tuned gold figure', () => {
    expect(STAT_POINTS_MAX).toBe(1_200);
    const oneGoldStat = computeDailyScore({
      buckets: [],
      sleepMinutes: 7 * 60,
      earnableStats: 3,
    });
    expect(oneGoldStat.stats.MND.points).toBe(1_200);
  });

  // The parity claim from spec §2, as an executable assertion.
  it('reaches the same 4,400 ceiling with or without a wearable', () => {
    const wearable = computeDailyScore({ ...goldDay(), earnableStats: 3 });
    const phoneOnly = computeDailyScore({
      buckets: fullGoldBuckets(),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(wearable.healthTotal).toBe(4_400);
    expect(phoneOnly.healthTotal).toBe(4_400);
  });

  it('lowers AGI gold to 7,500 steps on a fully spread day', () => {
    const spread = computeDailyScore({
      buckets: bucketsWith({ steps: 7_500, activeHours: 8 }),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(spread.stats.AGI.tier).toBe('gold');
  });

  it('no longer exposes END or VIT', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: null, earnableStats: 2 });
    expect(Object.keys(score.stats).sort()).toEqual(['AGI', 'MND', 'STR']);
  });
});
```

**Implementer note:** `fullGoldBuckets` and `bucketsWith` may not exist under
those names. Read the existing helpers at the top of `scoring.test.ts` and use
whatever that file already provides; do not add a second helper that does the
same thing.

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: FAIL.

- [ ] **Step 3: Contract the union and re-tune**

In `types.ts`:

```typescript
export type CoreStat = 'AGI' | 'STR' | 'MND';

export const CORE_STATS: readonly CoreStat[] = ['AGI', 'STR', 'MND'];
```

In `scoring.ts`: drop `END` and `VIT` from `THRESHOLDS` and from `rawFor`;
delete `recBonusFor` and the `recBonus` field; set

```typescript
const TIER_POINTS: Record<Tier, number> = {
  none: 0,
  bronze: 250,
  silver: 650,
  gold: 1_200,
};

/** Indexed by contributing stats. Re-indexed for three stats. */
const CONSISTENCY_BONUS: readonly number[] = [0, 0, 400, 800];
```

`DAILY_STEP_BASELINE` stays `THRESHOLDS.AGI.gold` and `scoring.test.ts`'s
literal 10,000 pin stays — AGI's bands are unchanged, so both still hold.

- [ ] **Step 4: Apply the shifts and normalization**

`computeDailyScore` gains **two** new optional inputs. Declare both on
`DailyScoreInput` in `types.ts` first, or step 4 will not compile:

```typescript
export interface DailyScoreInput {
  // ... existing fields
  /** How many stats this user can earn today. Defaults to all of them. */
  earnableStats?: number;
  /** Minutes from workouts passing `workoutVerified`. Unverified sessions contribute 0. */
  verifiedWorkoutMinutes?: number;
}
```

Then apply both:

```typescript
  const spread = spreadShift(totals.activeHours);
  const workout = workoutShift(input.verifiedWorkoutMinutes ?? 0);

  for (const stat of CORE_STATS) {
    const raw = rawFor(stat, totals, sleepMinutes);
    const shift = stat === 'AGI' ? spread : stat === 'STR' ? workout : 0;
    const tier = stat === 'MND' ? mindTierFor(raw) : shiftedTierFor(stat, raw, shift);
    ...
  }

  const factor = normalizationFactor(input.earnableStats ?? CORE_STATS.length, CORE_STATS.length);
  const normalized = Math.round(statPoints * factor);
```

Add `shiftedTierFor(stat, raw, shift)` beside `tierFor`, applying
`shiftedThreshold` to each band before comparing. **Do not duplicate `tierFor`'s
comparison logic** — have `tierFor` delegate to `shiftedTierFor(stat, raw, 0)`.

`healthTotal` becomes `normalized + consistencyBonus`. The consistency bonus is
**not** normalized — spec §2 scales stat points, and the bonus already accounts
for earnable stats through its own full-breadth rule.

- [ ] **Step 5: Sweep the consumers and drop the columns from `sync-plan`**

Remove `END`/`VIT` entries from every `Record<CoreStat, …>` literal Task 3
touched. In `program.ts`, `BOOSTED_STAT.walking` becomes `'AGI'` and a new
`recovery` program boosts `'MND'`; update `SQUAD_PROGRAMS`, the SQL mirror
comment, and `program.test.ts`. In `sync-plan.ts`, stop writing `end_points`
and `vit_points` (the columns still exist and default to 0 — Phase 3 drops
them).

- [ ] **Step 6: Tighten the schema checks**

Create `supabase/migrations/20260819110000_three_stat_contract_checks.sql`:

```sql
-- Contract phase, part one: the checks only. The columns themselves are
-- dropped in Phase 3, after the dual-writing functions are deployed.
begin;

alter table public.daily_scores
  drop constraint if exists daily_scores_contributing_stats_check;

alter table public.daily_scores
  add constraint daily_scores_contributing_stats_check
    check (contributing_stats between 0 and 3);

alter table public.daily_scores
  drop constraint if exists daily_scores_featured_stat_check;

alter table public.daily_scores
  add constraint daily_scores_featured_stat_check
    check (featured_stat is null or featured_stat in ('AGI', 'STR', 'MND'));

commit;
```

Update the two transitional schema assertions from Task 1 to expect `3` and the
three-stat list.

- [ ] **Step 7: Verify everything and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add -A
git commit -m "feat(core): three stats — END and VIT retired, shifts and normalization applied

TIER_POINTS re-tuned to 250/650/1200 (4 x 900 = 3 x 1200), breadth
re-indexed, and the 4,400 ceiling pinned by an executable parity test.
END and VIT survive as threshold shifts. recBonusFor is deleted; MND
scores as a stat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Replay dry run against the live cohort, and tune

**Files:**
- Create: `scripts/replay-dry-run.mjs`
- Modify: `packages/kairo-core/src/scoring.ts` (constants only, if tuning demands it)

**Interfaces:**
- Consumes: `computeDailyScore` — **the real one**. The dry run must not
  reimplement scoring; that is the invariant the whole architecture rests on.
- Produces: a delta report, and either a confirmation that spec §2's constants
  meet the acceptance criterion or a tuned set that does.

**This task reads real user health data.** It is read-only, it runs locally via
`remote-sql.sh`, it writes nothing to the live project, and it must not print
per-user identifiers into any committed artifact.

- [ ] **Step 1: Write the dry-run script**

Create `scripts/replay-dry-run.mjs`. It must:

1. Pull, read-only, via `./supabase/scripts/remote-sql.sh`:
   `select user_id, local_date, agi_points, str_points, end_points, vit_points, rec_points, consistency_points, total from daily_scores`
   and the matching `health_buckets` and `daily_sleep` rows.
2. For each (user, date), recompute under the new model by calling
   `computeDailyScore` with the stored buckets — **never** by transforming the
   old total arithmetically.
3. Report, in aggregate: median per-user daily delta as a percentage, the
   p10/p90 of that distribution, and the count of users outside ±10%.
4. Report rank movement: for each past leaderboard date, the maximum number of
   places any user moves.
5. Print user ids only for outliers, and only to stdout — never into a file
   under version control.

- [ ] **Step 2: Run it and record the result**

Run: `node scripts/replay-dry-run.mjs`

Acceptance criterion, verbatim from spec §2: **median per-user daily delta
within ±10%, and no user's rank on any past leaderboard moving more than one
place.**

- [ ] **Step 3: Tune if it misses**

If the criterion fails, adjust **only** the constants in `scoring.ts`
(`TIER_POINTS`, `CONSISTENCY_BONUS`, the shift caps) and re-run. Do not change
the structure to hit a number. Every adjustment keeps the derivation intact:
`STAT_POINTS_MAX` from `TIER_POINTS.gold`, `DAILY_STEP_BASELINE` from
`THRESHOLDS.AGI.gold`, MND's bands from `mind.ts`.

If the criterion cannot be met without changing structure, **stop and report**
— that is a spec-level finding, not an implementation decision.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run typecheck`

```bash
git add scripts/replay-dry-run.mjs packages/kairo-core/src/scoring.ts
git commit -m "feat: replay dry run against the live cohort, and constant tuning

Calls the real computeDailyScore over stored buckets rather than
transforming old totals. Reports aggregate deltas and rank movement
against spec §2's acceptance criterion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase exit criteria

- `npm test` and `npm run typecheck` green.
- `CORE_STATS` is exactly `['AGI', 'STR', 'MND']`.
- The 4,400 parity is pinned by an executable test, not by prose.
- Two migrations exist and **neither has been applied to the live project**.
- No Edge Function has been deployed.
- The dry run's acceptance criterion is met, or its failure is reported as a
  spec-level finding.

## What Phase 3 inherits

The contract migration (dropping `rec_points`, `end_points`, `vit_points`), the
four-step deploy ordering from spec §4, the rollup-trigger guard update, the
real replay via `rescoreDay`, `smoke-sync.mjs` after every deploy step, the
frontend-design pass on the shifted-threshold hero copy, and the documentation
fallout including roadmap deviation #41.
