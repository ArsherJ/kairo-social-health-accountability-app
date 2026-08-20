# Three-Stat Model — Phase 3: Deploy, Replay, Contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the three-stat switch — make the server actually apply normalization and the STR shift, make the leaderboard count MND, retire the END/VIT/REC columns, replay all history, and deploy the whole thing in one ordered window.

**Architecture:** Phase 2 changed `@kairo/core` and left the server, the SQL projections and the live database untouched. Phase 3 closes that gap in three movements: first the schema gains the two columns the model needs, then the write paths learn the two inputs they were never given (`earnableStats`, `verifiedWorkoutMinutes`) and the read paths learn MND and normalization, then a single deploy window applies the migrations, redeploys the Edge Functions, replays history and validates the deferred constraint. Tasks 1–6 leave the repo green with nothing deployed; Task 7 is the deploy and is owner-gated.

**Tech Stack:** TypeScript (`packages/kairo-core`, zero-dependency), Deno (Supabase Edge Functions), Postgres 15 (Supabase), PGlite + Vitest (schema harness), Expo/React Native (client).

**Spec:** `docs/superpowers/specs/2026-08-18-three-stat-attribute-model-design.md`

**Prior phases:** `docs/superpowers/plans/2026-08-18-three-stat-model-phase-1-engine-primitives.md`, `docs/superpowers/plans/2026-08-18-three-stat-model-phase-2-the-switch.md`. Phase 2's ledger — including the final review's findings that this plan inherits — is `.superpowers/sdd/2026-08-18-three-stat-model-phase-2-the-switch/progress.md`.

## Global Constraints

- **`packages/kairo-core` stays pure.** No I/O, no clock reads, no randomness, no dependencies. Every function takes what it needs as an argument.
- **One implementation of scoring.** The Expo app imports `@kairo/core`; Edge Functions import `supabase/functions/_shared/core.ts`, a relative re-export of the same files. Never add a second.
- **Scores are replayed, never adjusted in place.** `daily_scores` is always recomputed from stored `health_buckets`. Goal progress is a read-time projection and stores no number of its own.
- **A migration touching a table an Edge Function writes ships with that function's redeploy.** Applying one without the other took scoring down for two days in August 2026.
- **`daily_scores` per-stat columns are base points** — pre-featured-stat-multiplier and program-independent (deviation #11). All program weighting happens at read time in `squad_leaderboard()`.
- **The Daily Walk baseline is a public-health number that must never scale with the user.** `DAILY_STEP_BASELINE` is derived from `THRESHOLDS.AGI.gold`; the walk reads `tiers->>'AGI_base'`, the **unshifted** ladder, never `tiers->>'AGI'`.
- **`workout_sessions` is owner-readable only and appears in no projection.** A schema test asserts no `public` function's body mentions the table. Task 3 must not break this.
- **This machine cannot reach Postgres directly.** Migrations go through `./supabase/scripts/remote-sql.sh -f`, and their `supabase_migrations.schema_migrations` row is inserted by hand. Wrap multi-statement migrations in `begin; … commit;`.
- **`npm test` runs TWO vitest suites** (`test:core && test:schema`) and only the second summary prints in the tail. Baseline entering this plan: **core 413 / 18 files, schema 931 / 53 files**, typecheck clean.
- Roadmap deviation number for the three-stat model is **#41**.

## Inherited obligations

Every item below came out of Phase 2 and is owned by a task here. Nothing else is outstanding.

| From | What | Task |
|---|---|---|
| Review C2 | `squad_leaderboard()` never passes `mind_points`; `program_weighted_total` has no `p_mind`. MND counts **zero on every board on every program**, and normalization never reaches the board at all. | 3 |
| Review I2 | `DayPlanInput` declares neither `earnableStats` nor `verifiedWorkoutMinutes`, so **both** server write paths score every day at factor 1.0 with STR shift 0. | 1 |
| Review I1 | `hasSleepCapability`'s `today` must be the date being scored; undocumented, and the 6,200 breach is reachable on a backfill. | 2 |
| Review I3 | `daily_scores_xp_rollup()`'s skip guard omits `mind_points`. | 2 |
| Review m1 | `replay-dry-run.mjs`'s rank half models a board that does not exist. | 6 |
| Review m3 | Demo fixture arithmetic is true only of `daily_scores.total`. | 6 |
| Task 4 concern #1 | `nextTierFor` reports **unshifted** bands, so a hint can say "1,240 more steps" while Gold arrives at 7,500. | 6 |
| Task 5 | The ±10% replay criterion is unmet and **deferred, not waived**. | 6 |
| Task 5 | Phase 3 must pass `earnableStats` into `rescoreDay` — omitting it fails silently. | 3 |
| Task 4 C1 | `daily_scores_contributing_stats_check` is `not valid`; 2 live rows still exceed 3. | 7 |
| Phase 2 ledger | `mind_total` (`app/(tabs)/index.tsx:266`) vs `mnd_total` (`SoloBoard.tsx:61`) — the mnd/mind split already produced one live bug. | 4 |

---

### Task 1: `normalization_factor`, `mnd_total`, and one spelling

Three schema additions that Tasks 1 and 3 already write against, plus the naming decision the Phase 2 ledger flagged.

**The spelling:** the stat id is `MND`; the score column is `mind_points`; the client already contains **both** `mind_total` (`app/(tabs)/index.tsx:266`) and `mnd_total` (`SoloBoard.tsx:61`) for a column that does not exist yet. That split already produced one live bug — `useDominantStat` built `mnd_points` by string against a `mind_points` column and MND could never be dominant. **Pick `mnd_total`**, matching `agi_total`/`str_total` and the stat id, and fix `index.tsx`. Add a comment on the column recording that `mind_points` is the odd one out and is not being renamed, because renaming a column an Edge Function writes is a deploy-ordering hazard for no gain.

**Files:**
- Create: `supabase/migrations/20260819130000_normalization_and_mnd_total.sql`
- Modify: `app/(tabs)/index.tsx:266`
- Modify: `supabase/tests/schema.test.ts` (extend the column-presence tests)

**Interfaces:**
- Consumes: nothing.
- Produces: `daily_scores.normalization_factor numeric(4,3) not null default 1.000`, `profiles.mnd_total integer not null default 0`, and `recalculate_user_xp` maintaining it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260819130000_normalization_and_mnd_total.sql`:

```sql
-- Normalization becomes readable, and Mind gets its lifetime rollup.
--
-- `normalization_factor` is stored rather than derived because
-- squad_leaderboard() re-sums the per-stat columns to weight them and has no
-- other route to the figure — and because DailyScore already reports it for
-- exactly this reason: it is the one number that explains why two users with
-- identical steps and kcal scored differently.
--
-- Default 1.000 is the honest reading for every row written before deviation
-- #41: nothing was normalized then, and the replay in Task 7 rewrites them all
-- anyway. numeric(4,3) holds 1.000 and 1.500 exactly; a float would make the
-- SQL/TS differential test depend on platform rounding.
--
-- `mnd_total` matches agi_total/str_total and the CoreStat id. The score column
-- stays `mind_points` and is NOT renamed: renaming a column an Edge Function
-- writes is a deploy-ordering hazard, and the mnd/mind split has already cost
-- one silent bug (useDominantStat building `mnd_points` by string).

begin;

alter table public.daily_scores
  add column if not exists normalization_factor numeric(4,3) not null default 1.000;

comment on column public.daily_scores.normalization_factor is
  'What stat points were multiplied by (§2): 3.0 / earnable stats. 1.000 for a wearable user, 1.500 phone-only. Stored because squad_leaderboard() re-sums the per-stat columns and cannot otherwise reach it. Rows predating deviation #41 carry the 1.000 default, which is what they were actually scored at.';

alter table public.profiles
  add column if not exists mnd_total integer not null default 0;

comment on column public.profiles.mnd_total is
  'Lifetime sum of daily_scores.mind_points, maintained by recalculate_user_xp(). Spelled mnd_ to match agi_total/str_total and the CoreStat id; the score column is mind_points and is deliberately not renamed.';

commit;
```

Then extend `recalculate_user_xp()` to maintain `mnd_total` alongside the others — fetch its live body first and add the one `sum(mind_points)` term and the one assignment. Do **not** touch `end_total`/`vit_total` here; Task 5 owns their removal.

- [ ] **Step 2: Run the schema suite**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts`
Expected: PASS. `normalization_factor` and `mnd_total` now exist; nothing reads them yet, so this task only has to prove the columns, comments and the widened `recalculate_user_xp()` are in place.

- [ ] **Step 3: Fix the client spelling**

In `app/(tabs)/index.tsx:266`, change `mind_total` to `mnd_total`. Grep for both spellings across `app/` and `src/` and confirm exactly one survives:

Run: `grep -rn "mind_total\|mnd_total" app/ src/`
Expected: only `mnd_total`.

- [ ] **Step 4: Run everything**

Run: `npm test` — Expected: core 413 unchanged, schema up by roughly 3. Both suites green.
Run: `npm run typecheck` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/ app/
git commit -m "feat(db): normalization_factor, mnd_total, and one spelling for Mind

normalization_factor is stored because squad_leaderboard() re-sums the
per-stat columns to weight them and has no other route to it. numeric(4,3)
rather than a float, so the SQL/TS differential does not depend on platform
rounding.

mnd_total matches agi_total/str_total and the CoreStat id. The client held
BOTH spellings for a column that did not exist yet; index.tsx is corrected.
The score column stays mind_points and is deliberately not renamed —
renaming a column an Edge Function writes is a deploy-ordering hazard, and
the mnd/mind split has already cost one silent bug.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `hasSleepCapability`'s contract, and the rollup guard that will not see sleep

Two small hardenings that share a theme: both are places where the code is correct today and silently wrong after a later, reasonable-looking change.

**Files:**
- Modify: `packages/kairo-core/src/capability.ts:45-51`
- Modify: `packages/kairo-core/src/types.ts` (`DailyScoreInput.earnableStats` doc)
- Test: `packages/kairo-core/src/capability.test.ts`, `packages/kairo-core/src/scoring.test.ts`
- Create: `supabase/migrations/20260819135000_rollup_reads_mind_points.sql`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. Both changes are documentation plus one migration.

- [ ] **Step 1: Write the failing test for the capability contract**

The existing ceiling test passes the same date for both arguments, so the "cannot be reached" property is pinned only in the coincident case. Add to `packages/kairo-core/src/scoring.test.ts`, in the ceiling describe block:

```ts
it('holds when the scored date is not today — the backfill case', () => {
  // The breach that hides here: score 2026-08-01, where sleep exists ON that
  // date (so MND scores) but no scoring sleep falls in the 14 days ending at
  // wall-clock today. earnableStats reads 2, MND still scores, and the day
  // pays 6,200 — with contributing_stats at 3, so the check constraint waves
  // it through. The fix is contractual, not arithmetic: `today` must be the
  // date being scored.
  const scored = '2026-08-01';
  const scoringSleepDates = [scored];

  const day = computeDailyScore({
    buckets: goldTwoStatDay(),
    sleepMinutes: 7 * 60,
    earnableStats: earnableStats(hasSleepCapability(scoringSleepDates, scored)),
  });

  expect(day.healthTotal).toBe(MAX_DAILY_SCORE_WITH_WEARABLE);
  expect(day.healthTotal).toBe(4_400);
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: PASS immediately — the arithmetic is already right. This test does not catch a current bug; it pins the contract the docs are about to state, so that narrowing `today` to wall-clock later fails here. Say so in the ledger rather than pretending it was red first.

- [ ] **Step 3: Document the contract at both ends**

In `packages/kairo-core/src/capability.ts`, on `hasSleepCapability`:

```ts
 * `today` is **the date being scored**, not wall-clock today. On a live sync
 * they are the same and the distinction is invisible; on a backfill or a
 * replay they are not, and using wall-clock today is a real breach rather
 * than an approximation: sleep on the scored date still makes MND score,
 * while an empty recent window drops `earnableStats` to 2, and the day pays
 * 6,200 against a 4,400 ceiling. `contributing_stats` is 3, so the check
 * constraint passes it. Nothing downstream would notice.
```

In `packages/kairo-core/src/types.ts`, on `DailyScoreInput.earnableStats`, add one line: `Derived from `hasSleepCapability` against **the date being scored** — see the note there.`

- [ ] **Step 4: Write the rollup migration**

`daily_scores_xp_rollup()` returns early when `xp_awarded`, `agi_points`, `str_points`, `end_points` and `vit_points` are all unchanged. It has never known about `mind_points`. Harmless until something reads it — and the moment `mnd_total` (Task 1) starts being maintained, a rescore that moves only sleep (a night arriving late, an Apple revision) skips the recompute entirely and the Mind rating freezes with no error. That is verbatim the failure the guard was last widened to fix.

Close it now, while it is still a no-op. Create `supabase/migrations/20260819135000_rollup_reads_mind_points.sql`:

```sql
-- The XP/stat rollup guard learns about mind_points.
--
-- `daily_scores_xp_rollup()` skips the recompute when every column it reads is
-- unchanged. That set was last widened in 20260810150000, when a same-tier
-- rescore (5,200 steps -> 8,000, both Silver) was found to move the raw points
-- and not the XP — so a guard on `xp_awarded` alone missed it silently.
--
-- `mind_points` is the same hole reopened by deviation #41. A night arriving
-- late, or an Apple revision to a sleep sample, moves only that column. With
-- the guard as it stands the rollup would skip, `mnd_total` would never move,
-- and the Mind ability rating would freeze behind the days that earned it —
-- no error, no log, exactly as before.
--
-- Applied BEFORE mnd_total exists, deliberately: it is a no-op today, which is
-- the cheapest moment to get it right.

begin;

create or replace function public.daily_scores_xp_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_user_xp(old.user_id);
    return old;
  end if;

  -- Every column the rollup reads. Score rows are rewritten on every sync, so
  -- the "did anything actually move" check is worth keeping — it just has to
  -- stay honest about what "anything" means. Add a column to the rollup and
  -- you add it here, or the drift is invisible.
  if tg_op = 'UPDATE'
     and new.xp_awarded = old.xp_awarded
     and new.agi_points = old.agi_points
     and new.str_points = old.str_points
     and new.mind_points = old.mind_points
     and new.end_points = old.end_points
     and new.vit_points = old.vit_points then
    return new;
  end if;

  perform public.recalculate_user_xp(new.user_id);
  return new;
end;
$$;

commit;
```

Note `end_points`/`vit_points` stay in the guard here. Task 5 drops those columns and removes them from this function in the same migration — dropping a column referenced by a trigger body is a runtime failure on the next write, not a migration-time one.

- [ ] **Step 5: Write the schema test**

In `supabase/tests/schema.test.ts`, beside the existing rollup tests:

```ts
it('recomputes when only mind_points moved', async () => {
  // A night arriving late moves this column and nothing else. Before
  // deviation #41 widened the guard, that skipped the rollup silently.
  const user = await h.createUser();
  await h.asService(
    `insert into public.daily_scores (user_id, local_date, agi_points, mind_points, total, xp_awarded, status)
     values ($1, '2026-09-10', 500, 0, 500, 10, 'provisional')`,
    [user],
  );
  await h.asService(
    `update public.daily_scores set mind_points = 1200
     where user_id = $1 and local_date = '2026-09-10'`,
    [user],
  );

  const rows = await h.asService<{ mnd_total: number }>(
    `select mnd_total from public.profiles where id = $1`,
    [user],
  );
  expect(rows[0]?.mnd_total).toBe(1200);
});
```

`mnd_total` and the widened `recalculate_user_xp()` already exist from Task 1, so this test runs for real here — it should fail before the migration in Step 4 and pass after it.

- [ ] **Step 6: Run the suites**

Run: `npm test` — Expected: core 414 (+1), schema up by 1. Both suites green.
Run: `npm run typecheck` — Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/kairo-core/ supabase/migrations/ supabase/tests/
git commit -m "fix(core,db): pin hasSleepCapability's date contract, teach the rollup guard about sleep

Two places that are correct today and silently wrong after a reasonable-
looking later change.

hasSleepCapability's \`today\` must be the date being scored. On a live sync
that is invisible; on a backfill, wall-clock today makes a day score MND
while counting two earnable stats, paying 6,200 against a 4,400 ceiling
with contributing_stats at 3 — which the check constraint passes.

daily_scores_xp_rollup's skip guard never knew about mind_points. Applied
while it is still a no-op, because once mnd_total exists a sleep-only
rescore would freeze the Mind rating with no error.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The write paths learn `earnableStats` and `verifiedWorkoutMinutes`

This is the largest correctness gap in the branch. `planDay` is the only place a `daily_scores` row is computed, and it currently passes neither field — so **every day scored on the server has `normalizationFactor` 1.0 and STR shift 0**, on both `sync-health` (the primary path) and `rescore` (the replay path). No test can fail on it, because the parameters do not exist to be forgotten.

Wiring only `rescoreDay` — which is what the Phase 2 ledger originally recorded — would be worse than wiring neither: replayed history would be normalized and every subsequent day would not, a permanent silent divergence.

**Files:**
- Modify: `supabase/functions/_shared/sync-plan.ts` (`DayPlanInput` at :384-396, `planDay` at :463-474)
- Modify: `supabase/functions/_shared/rescore.deno.ts:73` (the `planDay` call)
- Modify: `supabase/functions/sync-health/index.ts:240` (the `planDay` call)
- Test: `supabase/functions/_shared/sync-plan.test.ts`

**Interfaces:**
- Consumes: `hasSleepCapability(scoringSleepDates, today)`, `earnableStats(hasSleep)`, `workoutVerified(origin, allowlist)`, `SLEEP_CAPABILITY_WINDOW_DAYS` — all from `@kairo/core` via `core.ts`.
- Produces: `DayPlanInput.earnableStats: number` and `DayPlanInput.verifiedWorkoutMinutes: number`, both **required**, not optional. Task 6's re-run of the dry run depends on both being wired.

**Why required and not optional:** `DailyScoreInput` makes them optional with a sensible default, which is right for a pure function whose callers include tests. `DayPlanInput` is different — it has exactly two callers, both of them write paths, and a default there is precisely the silent failure this task exists to remove. Make the compiler ask.

- [ ] **Step 1: Write the failing tests**

Add to `supabase/functions/_shared/sync-plan.test.ts`, inside the `planDay` describe block:

```ts
it('normalizes a phone-only day, and does not normalize a wearable day', () => {
  // The whole point of §2's normalization, at the only place that writes a
  // score row. Two earnable stats means stat points scale by 3/2.
  const phoneOnly = planDay({ ...input(), earnableStats: 2 });
  const wearable = planDay({ ...input(), earnableStats: 3 });

  expect(phoneOnly.row.total).toBeGreaterThan(wearable.row.total);
});

it('reports the factor it applied, so the row can be explained', () => {
  const { row } = planDay({ ...input(), earnableStats: 2 });
  expect(row.normalization_factor).toBeCloseTo(1.5, 5);
});

it('applies the STR threshold shift from verified workout minutes', () => {
  // 60 verified minutes earns the 25% cap, so STR's Gold band falls from
  // 400 kcal to 300. A 300-kcal day is Silver without the shift and Gold
  // with it — which is the whole difference this field makes.
  const base = { ...input(), earnableStats: 3 };
  const unverified = planDay({ ...base, verifiedWorkoutMinutes: 0 });
  const verified = planDay({ ...base, verifiedWorkoutMinutes: 60 });

  expect(verified.row.str_points).toBeGreaterThan(unverified.row.str_points);
});
```

Adjust `input()` so the fixture's `activeKcal` sits at 300 for the third test — read the existing helper before editing and keep the other tests' expectations intact. If 300 collides with an existing assertion, add a dedicated local fixture rather than moving the shared one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/sync-plan.test.ts`
Expected: FAIL — TypeScript rejects `earnableStats` and `verifiedWorkoutMinutes` as unknown properties of `DayPlanInput`, and `row.normalization_factor` does not exist.

- [ ] **Step 3: Widen `DayPlanInput` and thread both fields through `planDay`**

In `supabase/functions/_shared/sync-plan.ts`, add to `DayPlanInput`:

```ts
  /**
   * How many of the three stats this user can earn today (§2). Two for a
   * phone-only user, three once sleep is arriving.
   *
   * **Required, deliberately.** `DailyScoreInput` defaults it, which is right
   * for a pure function. Here it is not: `planDay` has exactly two callers and
   * both are write paths, so a default is the silent failure this field exists
   * to prevent — every stored row scoring at factor 1.0 with nothing to notice.
   */
  earnableStats: number;
  /**
   * Minutes of workout on this date that passed `workoutVerified` — an
   * allowlisted source AND heart-rate evidence (§3). Drives STR's threshold
   * shift. Zero is a real answer; absent is not, for the same reason as above.
   */
  verifiedWorkoutMinutes: number;
```

Pass both into `computeDay`:

```ts
  const result = computeDay({
    localDate: input.localDate,
    timeZone: input.timeZone,
    now: input.now,
    buckets: input.buckets,
    sleepMinutes: input.sleepMinutes,
    earnableStats: input.earnableStats,
    verifiedWorkoutMinutes: input.verifiedWorkoutMinutes,
    // Deviation #11: stored per-stat points are **base** — pre-multiplier and
    // program-independent. All weighting happens at read time in
    // squad_leaderboard(). Never pass a featuredStat from a write path.
    featuredStat: null,
  });
```

Add `normalization_factor` to the score row, beside `total`:

```ts
      // What stat points were multiplied by (§2). Stored rather than derived
      // because squad_leaderboard() re-sums the per-stat columns and has no
      // other way to reach it — and because the update note has to be able to
      // say why two users with identical steps scored differently.
      normalization_factor: score.normalizationFactor,
```

and to the row's TypeScript interface: `normalization_factor: number;`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/sync-plan.test.ts`
Expected: PASS. `daily_scores.normalization_factor` already exists from Task 1, so the schema suite stays green too.

- [ ] **Step 5: Compute both fields in `rescore.deno.ts`**

Before the `planDay` call in `supabase/functions/_shared/rescore.deno.ts`, add the two lookups. Read the file's existing `admin.from(...)` calls and match their error handling exactly.

```ts
// §3's capability window: has any sleep that SCORED landed in the 14 days
// ending on the date being scored? Note `localDate`, never `new Date()` —
// on a backfill those differ, and using wall-clock today makes a day score
// MND while counting only two earnable stats, which is the 6,200 breach.
const windowStart = addDays(localDate, -(SLEEP_CAPABILITY_WINDOW_DAYS - 1));
const sleepHistory = await admin
  .from('daily_sleep')
  .select('local_date')
  .eq('user_id', userId)
  .gte('local_date', windowStart)
  .lte('local_date', localDate)
  .gt('minutes', 0);

const scoringSleepDates = (sleepHistory.data ?? []).map(
  (r) => r.local_date as string,
);

// Verified workout minutes for this date. The allowlist is applied here,
// server-side, on purpose (§3) — a pure function could not do it, and a
// client that decided its own verification would be deciding its own score.
const sessions = await admin
  .from('workout_sessions')
  .select('duration_minutes, source_bundle_id, was_user_entered, has_heart_rate_evidence')
  .eq('user_id', userId)
  .eq('local_date', localDate);

let verifiedWorkoutMinutes = 0;
for (const s of sessions.data ?? []) {
  const verified = workoutVerified(
    {
      wasUserEntered: Boolean(s.was_user_entered),
      sourceBundleId: (s.source_bundle_id as string | null) ?? null,
      hasHeartRateEvidence: Boolean(s.has_heart_rate_evidence),
    },
    WORKOUT_SOURCE_ALLOWLIST,
  );
  if (verified) verifiedWorkoutMinutes += Number(s.duration_minutes);
}
```

Then pass both into the existing `planDay({ … })` call:

```ts
    earnableStats: earnableStats(hasSleepCapability(scoringSleepDates, localDate)),
    verifiedWorkoutMinutes,
```

Import `addDays`, `earnableStats`, `hasSleepCapability`, `SLEEP_CAPABILITY_WINDOW_DAYS`, `workoutVerified` and `WORKOUT_SOURCE_ALLOWLIST` from `./core.ts`. If `WORKOUT_SOURCE_ALLOWLIST` does not exist yet, define it in `supabase/functions/_shared/` — **not** in `kairo-core`, which must stay pure and must not encode a policy list.

- [ ] **Step 6: Do the same in `sync-health/index.ts`**

The identical two lookups and the identical two arguments, at the `planDay` call site (`:240`). `sync-health` scores every date in the payload, so both lookups go **inside** the per-date loop with that date's `localDate` — not hoisted out of it. Hoisting is the same class of bug as using wall-clock today.

Because this logic is now in two files, extract it into one exported helper in `supabase/functions/_shared/` (e.g. `scoring-inputs.deno.ts`) and call it from both. Two copies of a rule this subtle is how they drift.

- [ ] **Step 7: Verify the whole suite except the known schema gap**

Run: `npm run test:core` — Expected: PASS, 413.
Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/` — Expected: PASS.
Run: `npm run typecheck` — Expected: clean.

Run: `npm test` — Expected: both suites green.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/
git commit -m "fix(functions): the write paths apply normalization and the STR shift

planDay passed neither earnableStats nor verifiedWorkoutMinutes, so every
day scored on the server — on sync-health, the primary path, as well as on
rescore — was computed at factor 1.0 with STR's threshold shift at zero.
No test could fail on it because the parameters did not exist.

Both are required rather than defaulted on DayPlanInput: it has exactly two
callers and both are write paths, so a default is the silent failure this
change removes. The capability window is computed against the date BEING
SCORED, never wall-clock today, which on a backfill is the 6,200 breach.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---


### Task 3b: The client sends sample origin, and hand-typed sleep stops scoring

**Added mid-flight, 2026-08-19.** Task 3's implementer found — and the controller
confirmed at the source — that this plan wired the server to *read* three
`workout_sessions` origin columns and `daily_sleep.was_user_entered`, and gave
nothing the job of *writing* them. `IncomingWorkoutSession` and `IncomingSleep`
carry no such fields and `sync-health`'s upserts set none, so `workoutVerified`
is false for every session forever and STR's threshold shift is structurally 0 —
a spec §3 mechanism, resolved and implemented server-side, dead on arrival.

Task 3's review then found the second half: `sampleTrust` and `scoresAtAll` have
**zero production consumers**, so nothing stops a hand-typed night from scoring
MND. Combined with Task 3's capability filter, the moment sleep origin arrives a
manual night scores 1,200 while being excluded from capability — `earnableStats`
2, factor 1.5, `(1200 × 3) × 1.5 + 800 = 6,200` against the 4,400 ceiling, waved
through by the check constraint at `contributing_stats` 3. The two halves must
ship together, which is why they are one task.

Full brief: `.superpowers/sdd/2026-08-19-three-stat-model-phase-3-deploy-replay-contract/task-3b-brief.md`
(Part A reads the metadata, Part B gates hand-typed sleep, Part C adds a
two-sided guard so the PostgREST select list cannot silently drift.)

It runs after Task 3 and before Task 4, and it must land before Task 6's dry run
and Task 7's replay: a replay run before the transport exists bakes shift-0 into
every historical row and has to be re-run.

---

### Task 4: The leaderboard counts MND, and normalization reaches the board

The review's C2, at its corrected width. `squad_leaderboard()` does not rank on `daily_scores.total` — it re-sums the per-stat columns so it can apply program weights. It passes `agi, str, end, vit, consistency, rec` and **never `mind_points`**, and `program_weighted_total` has no `p_mind` parameter.

Two consequences, both new on this branch and neither previously recorded:

1. **A wearable user's MND points count zero on every board, on every program** — not only on `recovery`. A Gold night is 1,200 stored points the ranking number cannot see, and `rec_points`, which used to carry sleep, is now written 0.
2. **Normalization does not reach the board at all.** A phone-only maxed day is `total` 4,400 and ranks as 3,200. §2's stated purpose is removing a permanent leaderboard gradient; it survives on the exact surface §2 names.

**Files:**
- Create: `supabase/migrations/20260819140000_board_counts_mind.sql`
- Modify: `packages/kairo-core/src/program.ts` (`weightedBoardTotal` at :156-165, and the stale note at :17-23)
- Modify: `supabase/tests/schema.test.ts` (the differential test at ~:2245-2270)
- Test: `packages/kairo-core/src/program.test.ts`

**Interfaces:**
- Consumes: `daily_scores.normalization_factor` and `profiles.mnd_total` (Task 1, migration `20260819130000`); `planDay` writing a real factor (Task 3). This task's migration is `20260819140000` and must sort after both — if you renumber anything, keep that order.
- Produces: `program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer, numeric)` — the `p_mind` and `p_factor` parameters appended last. `weightedBoardTotal(input)` gains `normalizationFactor: number` on `WeightedBoardInput`.

**A signature change, not an overload.** Postgres resolves `program_weighted_total` by argument list; adding parameters creates a second function rather than replacing the first, and `squad_leaderboard()` would keep calling the old one. **Drop the old signature explicitly** before creating the new one — the same trap `create_goal` hit with `p_metric`, recorded in CLAUDE.md.

- [ ] **Step 1: Write the failing TypeScript test**

In `packages/kairo-core/src/program.test.ts`:

```ts
it('counts MND on every program, not only recovery', () => {
  // The board is the surface §2's normalization exists for. A stat the
  // ranking number cannot see is a stat that does not exist competitively.
  const withSleep = weightedBoardTotal({
    program: 'running',
    statPoints: { AGI: 1_200, STR: 1_200, MND: 1_200 },
    consistencyBonus: 800,
    recBonus: 0,
    normalizationFactor: 1,
  });
  const withoutSleep = weightedBoardTotal({
    program: 'running',
    statPoints: { AGI: 1_200, STR: 1_200, MND: 0 },
    consistencyBonus: 800,
    recBonus: 0,
    normalizationFactor: 1,
  });

  expect(withSleep - withoutSleep).toBe(1_200);
});

it('applies normalization, so a phone-only day ranks at its real total', () => {
  // Two Gold stats at factor 1.5 must rank level with three Gold stats at
  // factor 1 — the gradient §2 removes, on the surface §2 names.
  const phoneOnly = weightedBoardTotal({
    program: 'all_around',
    statPoints: { AGI: 1_200, STR: 1_200, MND: 0 },
    consistencyBonus: 800,
    recBonus: 0,
    normalizationFactor: 1.5,
  });
  const wearable = weightedBoardTotal({
    program: 'all_around',
    statPoints: { AGI: 1_200, STR: 1_200, MND: 1_200 },
    consistencyBonus: 800,
    recBonus: 0,
    normalizationFactor: 1,
  });

  expect(phoneOnly).toBe(4_400);
  expect(wearable).toBe(4_400);
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:core -- --run src/program.test.ts`
Expected: FAIL — `normalizationFactor` is not a property of `WeightedBoardInput`.

- [ ] **Step 3: Apply the factor in `weightedBoardTotal`**

Add `normalizationFactor: number` to `WeightedBoardInput` with a doc comment, and change the arithmetic so the factor multiplies the **weighted sum before rounding**, matching `computeDailyScore`'s round-at-the-end shape:

```ts
export function weightedBoardTotal(input: WeightedBoardInput): number {
  let weighted = 0;
  for (const stat of CORE_STATS) {
    weighted += input.statPoints[stat] * programWeight(input.program, stat);
  }

  // Normalization multiplies the weighted sum and is rounded once, at the
  // end — the same shape as computeDailyScore, so the board and the stored
  // total cannot drift by a rounding step. The consistency bonus is outside
  // it for the same reason it is outside normalization in scoring:
  // breadthBonus already accounts for earnable stats.
  const total =
    Math.round(weighted * input.normalizationFactor) +
    input.consistencyBonus +
    input.recBonus;

  return Math.max(0, total);
}
```

Delete the stale note at `program.ts:17-23` that says `recovery` is "unweighted, wrong in the same direction as `all_around`" — it describes a narrower gap than the one that existed, and leaving it would mislead the next reader.

- [ ] **Step 4: Run it**

Run: `npm run test:core -- --run src/program.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/20260819140000_board_counts_mind.sql`. It must, in order:

1. `drop function if exists public.program_weighted_total(text, integer, integer, integer, integer, integer, integer);` — the old seven-argument signature. Adding parameters would create an overload `squad_leaderboard()` does not call.
2. `create or replace function public.program_weighted_total(p_program text, p_agi integer, p_str integer, p_mind integer, p_end integer, p_vit integer, p_consistency integer, p_rec integer, p_factor numeric)` returning integer, `immutable`, `set search_path = ''`.
3. Body — mirror `weightedBoardTotal` exactly, keeping the existing comments about `greatest(0, …)`, `round()` tie-breaking and the literal `1.5` forcing numeric arithmetic:

```sql
  select greatest(
    0,
    round(
      (
          p_agi  * (case when p_program in ('running', 'walking') then 1.5 else 1 end)
        + p_str  * (case when p_program = 'strength' then 1.5 else 1 end)
        + p_mind * (case when p_program = 'recovery' then 1.5 else 1 end)
        -- Retired columns, summed at weight 1 until Task 5 drops them.
        -- Historical rows still hold values and a board that stopped
        -- counting them would silently rewrite the past.
        + p_end  * 1
        + p_vit  * 1
      ) * p_factor
    )::integer
    + p_consistency
    + p_rec
  );
```

4. `create or replace function public.squad_leaderboard(...)` — fetch the live definition first with `./supabase/scripts/remote-sql.sh "select pg_get_functiondef('public.squad_leaderboard'::regproc) d;"` and change **only** the `program_weighted_total(...)` call, adding `coalesce(ds.mind_points, 0)` in third position and `coalesce(ds.normalization_factor, 1)` last. Signature, row shape and grants stay identical — a schema test pins the row shape literally.
5. Re-`comment on function` both, and re-`revoke`/`grant` execute on `program_weighted_total`, since `drop` takes the grants with it.

Wrap the whole file in `begin; … commit;`.

- [ ] **Step 6: Update the differential test**

In `supabase/tests/schema.test.ts` at ~:2245, the fixture hard-codes `MND: 0` and carries **two** stacked stale comments explaining why. Replace both with real MND values and a `normalizationFactor`, so the differential actually exercises the stat:

```ts
            statPoints: { AGI: f.agi, STR: f.str, MND: f.mind },
            consistencyBonus: f.consistency,
            recBonus: f.rec,
            normalizationFactor: f.factor,
```

Add `mind` and `factor` to every fixture row, including at least one row with `factor: 1.5` and one `recovery` row with non-zero `mind`. Pass both new arguments in the SQL call alongside the others.

- [ ] **Step 7: Run everything**

Run: `npm test`
Expected: both suites green. If the differential test fails on a rounding difference, the two expressions have genuinely diverged; fix the SQL to match TS rather than loosening the assertion.

- [ ] **Step 8: Commit**

```bash
git add packages/kairo-core/ supabase/migrations/ supabase/tests/
git commit -m "fix(db,core): the board counts MND and applies normalization

squad_leaderboard() re-sums the per-stat columns so it can weight them by
program, and it never passed mind_points — so a Gold night was 1,200 stored
points the ranking number could not see, on every program, not only
recovery. Normalization never reached the board either: a phone-only maxed
day is total 4,400 and ranked as 3,200, which is the permanent gradient §2
exists to remove, surviving on the surface §2 names.

program_weighted_total gains p_mind and p_factor. The old signature is
DROPPED first, not replaced — appending parameters creates an overload and
squad_leaderboard would keep calling the old function. Same trap create_goal
hit with p_metric.

The differential test hard-coded MND: 0 with two stacked stale comments
explaining why; it now exercises the stat and the factor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Retire `end_points`, `vit_points`, `rec_points`, `end_total`, `vit_total`

The contract half of expand/contract. Nothing has written these since Phase 2; `20260819110000` already marked them deprecated in comments. This drops them and removes every remaining reader.

**This task's migration must not be applied until the replay in Task 7 has run** — historical rows still hold values in these columns, and `program_weighted_total` sums them at weight 1 precisely so the board does not rewrite the past. Dropping them before the replay silently deletes points from every historical board. The migration file is written here; Task 7 applies it, in order.

**Files:**
- Create: `supabase/migrations/20260819150000_three_stat_contract_drop.sql`
- Modify: `supabase/functions/_shared/sync-plan.ts` (the row interface)
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: `program_weighted_total(…, p_mind, p_factor)` from Task 4.
- Produces: `program_weighted_total(text, integer, integer, integer, integer, integer, numeric)` — `p_end` and `p_vit` removed, so the signature is now `(program, agi, str, mind, consistency, rec, factor)`. Any later caller uses this.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260819150000_three_stat_contract_drop.sql`, ordered:

1. A boxed `ORDERING:` header block stating plainly that this file **must run after** the history replay, and why: the columns still hold points that `program_weighted_total` sums, so dropping them first rewrites every historical board.
2. `create or replace function public.daily_scores_xp_rollup()` — the Task 2 body with `end_points`/`vit_points` removed from the skip guard. **Before** the drop: a trigger body referencing a dropped column fails on the next write, not at migration time.
3. `create or replace function public.recalculate_user_xp()` without `end_total`/`vit_total`.
4. `drop function if exists public.program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer, numeric);` then create the six-argument form without `p_end`/`p_vit`.
5. `create or replace function public.squad_leaderboard(...)` with those two arguments removed from the call. Signature and row shape unchanged.
6. `alter table public.daily_scores drop column end_points, drop column vit_points, drop column rec_points;`
7. `alter table public.profiles drop column end_total, drop column vit_total;`
8. `alter table public.daily_scores validate constraint daily_scores_contributing_stats_check;` — the deferred validation from Phase 2's Task 4. It can only run once the replay has brought every row to 3 or fewer contributing stats.
9. Re-comment and re-grant everything touched.

Wrap in `begin; … commit;`.

- [ ] **Step 2: Update the row interface**

In `supabase/functions/_shared/sync-plan.ts`, remove `end_points`, `vit_points` and `rec_points` from the score row's TypeScript interface if any remain. Grep the whole repo:

Run: `grep -rn "end_points\|vit_points\|rec_points\|end_total\|vit_total" --include=*.ts --include=*.tsx --include=*.mjs app/ src/ packages/ supabase/functions/ supabase/tests/ scripts/`
Every surviving hit must be either a historical comment or a line this step deletes. Deal with each explicitly; do not leave one because it "looks inert".

- [ ] **Step 3: Update the schema tests**

The Phase 2 test asserting `rec_points`/`end_points`/`vit_points` **survive** the expand migration now has its real job: it guarded this drop. Invert it — assert the columns are gone, and that `agi_points`, `str_points` and `mind_points` remain. Update the `convalidated` assertion for `daily_scores_contributing_stats_check` from `false` to `true`.

- [ ] **Step 4: Run everything**

Run: `npm test` — Expected: both suites green.
Run: `npm run typecheck` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat(db): retire END, VIT and REC's columns

The contract half of expand/contract. Nothing has written these since
Phase 2. The trigger and function bodies are rewritten BEFORE the drop —
a trigger referencing a dropped column fails on the next write, not at
migration time — and the deferred contributing_stats validation runs last.

NOT APPLIED BY THIS COMMIT. The columns still hold points that
program_weighted_total sums at weight 1, so dropping them before the
history replay would silently rewrite every historical board. Ordering is
in the migration header and in Task 7's runbook.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The dry run, the demo fixtures, and the hint that reports the wrong band

Three loose ends, none of which touch the deploy.

**Files:**
- Modify: `scripts/replay-dry-run.mjs` (:178-180, :328-332, :374-388)
- Modify: `src/features/demo/fixtures.ts:54-58, 72-73, 115-119`
- Modify: `packages/kairo-core/src/scoring.ts` (`nextTierFor` at :247-275) and its callers
- Test: `packages/kairo-core/src/scoring.test.ts`

**Interfaces:**
- Consumes: `weightedBoardTotal` with `normalizationFactor` (Task 4); `spreadShift`/`workoutShift` (Phase 1).
- Produces: `nextTierFor(stat, raw, shift)` — a third parameter, defaulted to 0 so existing callers compile, but every real caller passes the day's actual shift.

- [ ] **Step 1: Fix the dry run's two wrong claims**

At `:178-180` the script says the workout bias *"disappears on its own once the client populates those columns."* It does not — Task 3 is what makes `verifiedWorkoutMinutes` reach `planDay`. Correct the sentence to name Task 3.

At `:374-388` the rank half builds each board total from pre-normalization `score.stats[stat].points` through `weightedBoardTotal`, while production's board did neither. Task 4 changed production; update the script to pass `normalizationFactor` so both halves model the same board, and correct the docstring at `:328-332`.

- [ ] **Step 2: Re-derive the demo fixtures**

`src/features/demo/fixtures.ts:54-58` claims every total "is the real arithmetic of its own tier row". The rows carry `program: 'running'` and the totals are unweighted sums including MND — so Ramon's 3,850 (`:72-73`) and Trina's 2,150 (`:115-119`) are not what `squad_leaderboard()` would return. Recompute each against the Task 4 expression and update both the numbers and the claim.

- [ ] **Step 3: Write the failing test for the hint**

`nextTierFor` reports **unshifted** bands, so on a spread day the character sheet says "1,240 more steps" while Gold actually arrives at 7,500. In `packages/kairo-core/src/scoring.test.ts`:

```ts
it('reports the distance to the band the day will actually be judged against', () => {
  // Eight active hours earns the 25% cap, so AGI Gold is at 7,500. A hint
  // computed off the unshifted 10,000 overstates the gap by 2,500 steps —
  // and the user then hits Gold early, which reads as a bug in the score.
  const shift = spreadShift(8);
  expect(nextTierFor('AGI', 7_000, shift)).toEqual({
    tier: 'gold',
    remaining: 500,
  });
});
```

Match the existing return shape — read `nextTierFor` before writing the assertion and mirror whatever it already returns.

- [ ] **Step 4: Run it**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: FAIL — `nextTierFor` takes two parameters.

- [ ] **Step 5: Thread the shift through**

Add `shift = 0` as `nextTierFor`'s third parameter and compare against `shiftedThreshold(threshold, shift)`. Keep the MND branch that refuses to answer past the oversleep threshold. Then update every caller to pass the day's real shift — grep for `nextTierFor(`; `resolveStatDetail` in `app/(tabs)/index.tsx` is the main one, and it already has the day's buckets in scope.

The default of 0 is for tests and for callers with no day in hand. A caller that **has** a day and passes nothing is the bug this step fixes; check each one rather than relying on the default.

- [ ] **Step 6: Record what re-running the deferred criterion requires**

Phase 2's ±10% acceptance criterion is **unmet and deferred, not waived**. It
could not be evaluated because the cohort it ran against was 14 of 15 fixtures,
since purged — the real cohort was one user over eight days, one of which was a
corrupt row.

Do not attempt to re-run it here; there is still one user. Instead, add a short
`## Re-running this` section to the top of `scripts/replay-dry-run.mjs` stating
the three conditions under which the number means something:

1. At least ~20 users with ≥14 scored days each, so per-user medians have a
   window to sit in and `hasSleepCapability` has history to read.
2. The run happens **before** any further change to `TIER_POINTS`,
   `CONSISTENCY_BONUS` or the shift constants — the criterion measures this
   model against the four-stat one, and a third model in between makes the
   delta unattributable.
3. Both halves model the deployed board, which is true only after Task 4.

Also state the finding that made the original run unusable, so nobody repeats
it: **identical daily totals across users are a fixture signature**, and the
script should say so rather than averaging them into a median.

- [ ] **Step 6: Run everything and commit**

Run: `npm test` and `npm run typecheck` — Expected: green.

```bash
git add scripts/ src/ packages/ 
git commit -m "fix: the hint names the band the day is judged against

nextTierFor reported unshifted thresholds, so a spread day's character
sheet said '1,240 more steps' while Gold arrived at 7,500 — and hitting
Gold early reads as a bug in the score, not a gift.

Also corrects two claims that stopped being true: the dry run's rank half
modelled a board without normalization or MND (production now has both),
and it said the workout bias would resolve itself, which needed Task 3.
Demo fixture totals re-derived against the real board expression.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The deploy window — OWNER-GATED

**Do not dispatch this to a subagent.** Every step touches the live project or is irreversible. Run it interactively with the owner, one step at a time, confirming each before the next.

**The app build must not be cut until step 2 has applied `20260819130000`.** The branch
already cannot run against pre-Phase-3 live — `character/queries.ts` has selected
`daily_scores.mind_points` since `3c5fb80`, which is on `main`, and that column
arrives in `20260819100000`. Task 5 added a second instance of the same
dependency, and it is the one with the larger blast radius: `mind_points` failing
degrades one query, but `profiles.mnd_total` failing breaks `useProfile`, which
`app/_layout.tsx` feeds to `resolveRoute` — and `resolveRoute` reports a query
with no data as `'loading'`, so a 400 there parks **every** user behind the
profile gate with no error surface. That is the 2026-08-14 permanent-hold shape.
Ship the schema first, then cut the build.

The ordering below is the whole point of the task. Kairo's characteristic failure is a migration applied without its Edge Function redeploy: in August 2026 `remove_sabotage` dropped `daily_scores.sabotage_delta`, the deployed `sync-health` kept sending it, and because its bucket upsert commits *before* the score upsert, health data kept landing while nothing scored — for two days, with every test passing throughout.

**Pre-flight:**
- [ ] `npm test` green, `npm run typecheck` clean, working tree clean, on `main`.
- [ ] `./supabase/scripts/remote-sql.sh "select max(version) from supabase_migrations.schema_migrations;"` reports `20260818130000`.
- [ ] Confirm with the owner that the one real user is not mid-session.
- [ ] **Capture the four-stat baseline — here, before step 1. It is unobtainable
      later.** Run the *pre-Phase-3* dry run out of git history:
      `git show 310695c:scripts/replay-dry-run.mjs > /tmp/replay-four-stat.mjs && node /tmp/replay-four-stat.mjs`.
      Step 6's replay rewrites `daily_scores` into the three-stat model, and the
      stored four-stat totals are gone with it. Reconstructable in principle —
      `health_buckets` and `daily_sleep` are untouched by the replay, so the
      four-stat engine out of history would regenerate them — but that is strictly
      more work and not a thing to discover mid-window.
      **Do not try to capture this at step 5, or anywhere else inside the window.**
      Before step 5 the live `program_weighted_total` is the pre-Phase-3
      `(text, int × 6)` form and the call passes a numeric `normalization_factor`
      into an integer position; numeric→integer is an *assignment* cast, not
      implicit, so it does not resolve. After step 5 live holds the nine-argument
      form and the arity is wrong. The current script's `BOARD_TOTAL_SQL` first
      resolves at step 8 — by which point the replay has already run.
      Two caveats on that historical build, so its output is read for what it is:
      its cache is **not loadable by the current version** (a missing `mind_points`
      becomes 0 via `num()` rather than erroring — confidently wrong numbers, not
      a failure), and its rank half carries the `normalizationFactor`-missing NaN
      defect Task 6 fixed, so its printed *rank movement* is meaningless. The
      **totals** are what you are capturing.

**The window, in order:**

- [ ] **1. Apply the expand migration** — `20260819100000_three_stat_expand.sql`. Additive only: `mind_points`, the `daily_sleep`/`workout_sessions` origin columns, widened checks. Safe while the old functions are still deployed, because nothing reads the new columns yet.
- [ ] **2. Apply `20260819130000`** — `normalization_factor`, `mnd_total`, *and* the widened `daily_scores_xp_rollup()` skip guard, which lives in this same file rather than one of its own. Additive. Still safe. **This is the step the app build waits on** (see above).
- [ ] **3. Redeploy the Edge Functions.** `supabase functions deploy sync-health --project-ref zniopywbwenrzxezolwv` and the same for `finalize-days`. **This is the step that must not be skipped or reordered** — from here the deployed code writes `mind_points` and `normalization_factor`.
- [ ] **4. Smoke-test the deploy.** `node supabase/scripts/smoke-sync.mjs`. A real sync against the deployed function; this is the guard that catches source/artifact drift, which no test can. **If it fails, stop and fix before continuing** — do not proceed to the replay.
- [ ] **5. Apply `20260819110000`** (contract checks, `not valid`) and **`20260819120000`** (walk reads unshifted AGI) and **`20260819140000`** (board counts MND). The board migration reads `normalization_factor`, which step 2 added and step 3's functions now populate.
- [ ] **6. Replay all history.** Every `(user_id, local_date)` in `daily_scores` through `rescoreDay`. Verify first that the replay path carries Task 3's two fields — `earnableStats` omitted fails silently and moved p10 to −52.8% in the dry run. With one real user over 8 days this is seconds; still, run it and read the output rather than assuming.
- [ ] **7. Verify the replay before dropping anything.** `select max(contributing_stats), count(*) filter (where contributing_stats > 3) from public.daily_scores;` — must report **3 and 0**. Two rows exceeded 3 before the replay. If either number is wrong, **stop**: step 8 validates that constraint and will abort, and the columns it drops are the evidence.
- [ ] **8. Apply `20260819150000`** — the drops plus `validate constraint`. Irreversible. Confirm with the owner explicitly.
- [ ] **9. Re-run the smoke test** and confirm the app still scores: `./supabase/scripts/remote-sql.sh "select local_date, agi_points, str_points, mind_points, normalization_factor, total, contributing_stats from public.daily_scores order by local_date;"`.
- [ ] **10. Insert the `schema_migrations` rows** for all **six** Phase 3 migrations — `20260819100000`, `110000`, `120000`, `130000`, `140000`, `150000` — or the CLI re-applies them later. There is no `20260819135000`; earlier drafts of this runbook named one.

**Rollback position:** through step 7 everything is additive or replayable — the old columns still hold their values and `program_weighted_total` still sums them. Step 8 is the one-way door.

---

### Task 8: Documentation, and the deviation that records all of this

Documentation updates are part of the change, not a follow-up (CLAUDE.md).

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/roadmap.md`, `docs/user-journey.md`, `docs/mvp-scope.md`, `Kairo_Master_Summary.md`

- [ ] **Step 1: Add roadmap deviation #41**

Following the table's established shape — spec claim, what shipped instead, and the reasoning with what the build found. It must record at minimum: the fold (END→STR, VIT→AGI as threshold shifts, sleep promoted to MND); modifiers are **threshold shifts, never point multipliers**, because a stored multiplier would stack with the read-time program weight (deviation #10's trap); the 4,400 ceiling and why normalization exists; that a Challenge stays derived; **the walk baseline fix and why the old guard could not catch it**; and that the ±10% replay criterion was **unmet and deferred**, with the fixture-cohort purge as the reason.

- [ ] **Step 2: Rewrite CLAUDE.md's stat sections**

Every four-stat reference is now stale. Specifically: the `profiles.total_xp` rollup paragraph names `agi_total`/`str_total`/`end_total`/`vit_total` — update to the three. Add a short block, in the file's established voice, covering the three things easiest to break by accident:

- The Daily Walk reads `tiers->>'AGI_base'`, never `tiers->>'AGI'`, and a guard written through `tierFor` cannot catch the difference because `tierFor` **is** the zero-shift path.
- `planDay` requires `earnableStats` and `verifiedWorkoutMinutes` and neither is defaulted, because both callers are write paths.
- The board re-sums per-stat columns rather than reading `total`, so a new stat must be added to `program_weighted_total` **and** `squad_leaderboard` **and** `weightedBoardTotal`, or it is competitively invisible.

- [ ] **Step 3: Update the remaining docs**

`docs/user-journey.md` — the character screen, stat rail and leaderboard now speak three stats. `docs/mvp-scope.md` — confirm nothing in IN/OUT contradicts the model. `README.md` — any stat list. `Kairo_Master_Summary.md` §5/§6 — mark the four-stat sections as superseded by deviation #41 rather than rewriting the spec's history.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md docs/ Kairo_Master_Summary.md
git commit -m "docs: deviation #41 — the three-stat model

Records the fold, the shift-not-multiplier rule and why it matters, the
4,400 ceiling, the walk baseline fix and the reason its guard was blind,
and the replay criterion as unmet-and-deferred rather than met.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
