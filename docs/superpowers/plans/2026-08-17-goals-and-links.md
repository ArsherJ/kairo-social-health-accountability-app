# Goals and Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop goals asking for a unit nothing else on screen shows, and make an invite a link instead of a six-character code typed by hand.

**Architecture:** A goal gains a second metric — the Daily Walk — expressed as a boolean already stored in `daily_scores.tiers` and already visible to squadmates, so nothing new crosses the privacy projection. Universal links need a free static site serving one file, plus a four-step entitlement chain that Xcode Cloud will not do for us.

**Tech Stack:** TypeScript, `packages/kairo-core` (pure, zero-dependency), Postgres via PGlite for schema tests, Expo Router, React Native, a static site on a free host.

**Spec:** `docs/superpowers/specs/2026-08-15-activation-and-measurement-design.md` — §10 and §11. Plan 1 (`2026-08-16-measurement.md`, §4) is merged. Plan 2 (`2026-08-17-the-first-run.md`, §5–§9) covers progressive disclosure and the first-run flow.

## Read this before Task 1

Three facts that contradict the spec's own §10.1, discovered by reading the schema. **The code wins.**

1. **`goals.metric` already exists.** `supabase/migrations/20260810100000_goals.sql:41` declares `metric text not null default 'daily_score' check (metric = 'daily_score')`. The spec says to add the column. Do not add it — **widen the check constraint** to allow a second value. Note the existing value is `'daily_score'`, *not* `'points'` as the spec's kairo-core snippet assumed; match the database.
2. **`goal_window_scores`'s current definition lives in `supabase/migrations/20260810130000_goal_description_and_open_ended.sql:206`**, not in the file named after it. It has been redefined three times. Read that one.
3. **Changing its return type requires `drop function` then `create function`** — Postgres will not `create or replace` a function whose `returns table` shape changed. The existing migrations already do exactly this; follow their pattern, including re-issuing the `revoke`/`grant` afterwards.

## Global Constraints

- **`packages/kairo-core` is pure: no I/O, no clock reads, no randomness.** Every function takes what it needs as an argument. Do not add dependencies to this package, and do not add a second implementation of goal arithmetic anywhere — the SQL side returns rows, all arithmetic lives here (deviation #18).
- **A migration touching a table an Edge Function writes ships with that function's redeploy.** `goal_window_scores` is read by the client *and* by `finalize-days`. Applying one without the other took scoring down for two days in August 2026.
- **Squad goal progress must never carry raw metrics.** `goal_window_scores` has no argument that returns steps, hourly movement or per-stat points, and it must stay that way. `walk_cleared` is derived from `daily_scores.tiers`, which `squad_leaderboard()` already returns to squadmates — no new exposure. Reading `health_buckets` here instead would breach spec §5 while producing an identical screen.
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`.
- **A decorative or duplicative element is hidden** (`accessibilityElementsHidden`); **the group that means something is one element with a composed label.** Check what is already spoken beside a control before adding a label.
- **`ios/` is committed** (deviation #28). `app.config.ts` is *not* the source of truth for native config — the committed `Info.plist` and `Kairo.entitlements` are what ship. Any native config change needs `npm run prebuild` **and a commit of the regenerated `ios/`**, or it silently never reaches the build.
- Imports use explicit `.ts`/`.tsx` extensions. Deno-only modules are `*.deno.ts`.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Environment constraints — read before debugging connection errors

This machine cannot reach Postgres directly: port 5432 is blocked, Supabase's direct host is IPv6-only with no route, and Docker is unavailable. So `supabase db push`, `psql` and `supabase start` all fail. What works, all over HTTPS:

- `./supabase/scripts/remote-sql.sh "select ..."` and `-f file.sql`
- `supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv`
- the PGlite test harness (`supabase/tests/harness.ts`)

**Applying a migration therefore means:** run it via `remote-sql.sh -f`, then insert its row into `supabase_migrations.schema_migrations` yourself, or the CLI will try to re-apply it later.

**This machine also cannot pair an iPhone** — corporate CrowdStrike blocks `usbmuxd`. Device builds go through Xcode Cloud → TestFlight.

---

### Task 1: The Daily Walk as a goal metric

**Files:**
- Modify: `packages/kairo-core/src/goal.ts`
- Modify: `packages/kairo-core/src/goal.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type GoalMetric = 'daily_score' | 'daily_walk'`
  - `Goal` gains `metric: GoalMetric`
  - `GoalDay` gains `walkCleared: boolean`

- [ ] **Step 1: Write the failing tests**

Append to `packages/kairo-core/src/goal.test.ts`, following the file's existing fixture idiom (read a nearby `describe` first and reuse its helpers rather than inventing new ones):

```typescript
describe('daily_walk metric', () => {
  const walkGoal: Goal = {
    id: 'g1',
    metric: 'daily_walk',
    kind: 'consistency',
    // Ignored for a daily_walk consistency goal — the bar is "cleared the
    // walk", not a number. It is 1 because the database requires target > 0.
    target: 1,
    requiredDays: 2,
    startsOn: '2026-08-01',
    endsOn: '2026-08-05',
  };

  function day(localDate: string, walkCleared: boolean, total = 0): GoalDay {
    return { localDate, total, walkCleared, status: 'final' };
  }

  it('counts a day that cleared the walk', () => {
    const p = evaluateGoal(walkGoal, [day('2026-08-01', true)], '2026-08-03');

    expect(p.progress).toBe(1);
    expect(p.target).toBe(2);
  });

  // The whole point of the metric: a huge step count that fell short of the
  // baseline is not a cleared walk, and a modest day that reached it is.
  it('ignores the score entirely', () => {
    const p = evaluateGoal(
      walkGoal,
      [day('2026-08-01', false, 9_999), day('2026-08-02', true, 1)],
      '2026-08-03',
    );

    expect(p.progress).toBe(1);
  });

  it('is met once enough days cleared it', () => {
    const p = evaluateGoal(
      walkGoal,
      [day('2026-08-01', true), day('2026-08-02', true)],
      '2026-08-03',
    );

    expect(p.met).toBe(true);
  });

  it('counts walks toward a cumulative target', () => {
    const cumulative: Goal = {
      ...walkGoal,
      kind: 'cumulative',
      target: 3,
      requiredDays: null,
    };
    const p = evaluateGoal(
      cumulative,
      [day('2026-08-01', true), day('2026-08-02', false), day('2026-08-03', true)],
      '2026-08-04',
    );

    expect(p.progress).toBe(2);
    expect(p.target).toBe(3);
    expect(p.met).toBe(false);
  });

  // A scoreless participant arrives as a null-extended row from the LEFT JOIN
  // in goal_window_scores. It must read as "did not clear", never as cleared.
  it('treats a scoreless day as not cleared', () => {
    const p = evaluateGoal(walkGoal, [day('2026-08-01', false)], '2026-08-03');

    expect(p.progress).toBe(0);
  });
});

describe('daily_score metric is unchanged', () => {
  it('still sums totals for a cumulative goal', () => {
    const goal: Goal = {
      id: 'g2',
      metric: 'daily_score',
      kind: 'cumulative',
      target: 1_000,
      requiredDays: null,
      startsOn: '2026-08-01',
      endsOn: '2026-08-05',
    };
    const days: GoalDay[] = [
      { localDate: '2026-08-01', total: 400, walkCleared: true, status: 'final' },
      { localDate: '2026-08-02', total: 300, walkCleared: false, status: 'final' },
    ];

    expect(evaluateGoal(goal, days, '2026-08-03').progress).toBe(700);
  });
});
```

Then add `metric: 'daily_score'` to every existing `Goal` fixture in the file and `walkCleared: false` to every existing `GoalDay` fixture — both fields are required, and the existing tests all describe score-metric goals.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:core -- --run src/goal.test.ts`

Expected: FAIL — type errors on `metric` and `walkCleared`.

- [ ] **Step 3: Extend the types and the contribution rule**

In `packages/kairo-core/src/goal.ts`, add above the `Goal` interface:

```typescript
/**
 * What a goal is measured in.
 *
 * `daily_score` is the original: a goal's target is a number of points, which
 * the user typed. That was defensible while points were the app's vocabulary
 * and stopped being defensible when they left every other surface — a target
 * you cannot translate into behaviour makes the goal arbitrary and its failure
 * feel like the algorithm's fault.
 *
 * `daily_walk` measures the same days against the Daily Walk instead: 10,000
 * steps, the number already on the home shelf with a streak beside it. A user
 * can answer "is 25 out of 30 realistic for me" by looking at their own streak,
 * which is the question the score metric had no answer to.
 *
 * **It reaches no raw data.** The boolean comes from `daily_scores.tiers`,
 * which `squad_leaderboard()` already projects to squadmates. This file's
 * original note — "there is deliberately no goal metric that would reach raw
 * steps" — still holds; only the mechanism widened. Reading `health_buckets`
 * here would breach spec §5 while producing an identical screen.
 */
export type GoalMetric = 'daily_score' | 'daily_walk';
```

Add to `Goal`:

```typescript
  /**
   * Mirrors `goals.metric`. Existing rows default to `'daily_score'`, so this
   * is additive for every goal already set.
   */
  metric: GoalMetric;
```

Add to `GoalDay`:

```typescript
  /**
   * Whether this day cleared the Daily Walk — `tiers->>'AGI' = 'gold'`, which
   * is exactly `DAILY_STEP_BASELINE` steps.
   *
   * False for a day with no score at all: `goal_window_scores` LEFT JOINs so a
   * participant with nothing yet still appears, and a null there must read as
   * "did not clear", never as cleared.
   */
  walkCleared: boolean;
```

Change `contribution` — this is the only arithmetic that moves:

```typescript
function contribution(goal: Goal, day: GoalDay): number {
  // Checked before `kind`: for a walk goal both kinds count cleared days, and
  // only `requirement()` below distinguishes them.
  if (goal.metric === 'daily_walk') return day.walkCleared ? 1 : 0;
  if (goal.kind === 'cumulative') return day.total;
  return day.total >= goal.target ? 1 : 0;
}
```

`requirement()` is unchanged and needs no metric branch — cumulative still reads `target` (a number of walks), consistency still reads `requiredDays` (a number of days).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:core -- --run src/goal.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify the whole suite**

Run: `npm run typecheck && npm test`

Expected: FAIL in `supabase/tests/schema.test.ts` and in `src/features/goals/standings.test.ts`, because both build `Goal`/`GoalDay` objects that now need the new fields. Fix those fixtures — add `metric: 'daily_score'` and `walkCleared: false` — and re-run until green. Do not change any assertion.

- [ ] **Step 6: Commit**

```bash
git add packages/kairo-core/src/goal.ts packages/kairo-core/src/goal.test.ts src/features/goals/standings.test.ts supabase/tests/schema.test.ts
git commit -m "$(cat <<'EOF'
feat: the Daily Walk as a goal metric

A goal target in points asked the user for a unit no other surface shows,
so the number was arbitrary and missing it felt like the algorithm's
fault. A walk goal is answerable from the streak already on screen.

It reaches no raw data: the boolean comes from daily_scores.tiers, which
squad_leaderboard() already projects to squadmates. The rule that there is
no goal metric reaching raw steps still holds; only the mechanism widened.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The migration and its schema test

**Files:**
- Create: `supabase/migrations/20260818100000_goal_daily_walk_metric.sql`
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (SQL side is independent).
- Produces: `goals.metric` accepts `'daily_walk'`; `public.goal_window_scores(uuid, uuid)` returns a sixth column `walk_cleared boolean`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260818100000_goal_daily_walk_metric.sql`:

```sql
-- Goals can be measured in Daily Walks (design 2026-08-15 §10).
--
-- `goals.metric` already existed with `check (metric = 'daily_score')` — pinned
-- to one value "widenable at V1 without a type change", which is exactly what
-- this is. A check rather than an enum for that reason, so this is an ordinary
-- transactional migration.
--
-- The new value reaches no raw data. `walk_cleared` below is derived from
-- `daily_scores.tiers`, which `squad_leaderboard()` already returns to
-- squadmates — so a squad goal's projection carries nothing it did not carry
-- before. Reading `health_buckets` here would produce an identical screen and
-- breach §5; do not.

begin;

alter table public.goals drop constraint goals_metric_check;

alter table public.goals
  add constraint goals_metric_check
  check (metric in ('daily_score', 'daily_walk'));

comment on column public.goals.metric is
  'What the goal is measured in. daily_score sums daily_scores.total; daily_walk counts days that cleared the Daily Walk (tiers->>''AGI'' = ''gold''). Mirrored as GoalMetric in packages/kairo-core/src/goal.ts.';

-- goal_window_scores gains walk_cleared.
--
-- DROP then CREATE, not CREATE OR REPLACE: Postgres refuses to replace a
-- function whose `returns table` shape changed. The grants go with it and have
-- to be re-issued below, which is why they are repeated rather than assumed.
drop function public.goal_window_scores(uuid, uuid);

create function public.goal_window_scores(p_goal_id uuid, p_as_user uuid default null)
returns table (
  user_id uuid,
  character_name text,
  local_date date,
  total integer,
  status public.day_status,
  walk_cleared boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- `auth.uid()` first, `p_as_user` only as the fallback. The order is
  -- load-bearing: a signed-in caller must never be able to name somebody else.
  v_user uuid := coalesce((select auth.uid()), p_as_user);
  v_goal public.goals;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_goal from public.goals where id = p_goal_id;
  if not found then
    raise exception 'no such goal' using errcode = '42501';
  end if;

  if not public.can_see_goal(p_goal_id, v_user) then
    raise exception 'not a participant in this goal' using errcode = '42501';
  end if;

  return query
  select
    gp.user_id,
    p.character_name,
    ds.local_date,
    ds.total,
    ds.status,
    -- coalesce, not a bare comparison: the LEFT JOIN below null-extends a
    -- participant with no scored day, and `null` there would arrive at
    -- kairo-core as a missing boolean rather than as "did not clear".
    coalesce(ds.tiers->>'AGI' = 'gold', false) as walk_cleared
  from public.goal_participants gp
  join public.profiles p on p.id = gp.user_id
  left join public.daily_scores ds
    on ds.user_id = gp.user_id
   and ds.local_date >= v_goal.starts_on
   -- An open-ended goal has no upper bound; every day from the start counts.
   and (v_goal.ends_on is null or ds.local_date <= v_goal.ends_on)
  where gp.goal_id = p_goal_id
  order by gp.user_id, ds.local_date;
end;
$$;

comment on function public.goal_window_scores(uuid, uuid) is
  'Per-participant, per-day score totals inside a goal window, plus whether each day cleared the Daily Walk. Rows only — all goal arithmetic lives in kairo-core (deviation #18). LEFT JOIN so a scoreless participant still appears (deviation #20). walk_cleared is derived from the stored tier, the same figure squad_leaderboard() already projects; no argument exposes raw steps, hourly movement or per-stat points.';

revoke execute on function public.goal_window_scores(uuid, uuid) from public, anon;
grant execute on function public.goal_window_scores(uuid, uuid) to authenticated;

commit;
```

- [ ] **Step 2: Write the failing schema tests**

Append to `supabase/tests/schema.test.ts`. The harness API is `h.createUser(opts?)`, `h.asService<T>(sql, params?)` and `h.asUser<T>(userId, sql, params?)`, all returning rows directly; there is a local `rejects(promise, pattern)` helper. **The harness shares one PGlite instance with no per-test reset**, so pick dates and users that cannot collide with other tests.

```typescript
describe('goal_window_scores walk_cleared', () => {
  async function goalFor(userId: string, metric: string) {
    const rows = await h.asService<{ id: string }>(
      `insert into public.goals
         (created_by, title, kind, metric, target, required_days, starts_on, ends_on)
       values ($1, 'walk it', 'consistency', $2, 1, 2, '2026-09-01', '2026-09-30')
       returning id`,
      [userId, metric],
    );
    const goalId = rows[0]!.id;
    await h.asService(
      `insert into public.goal_participants (goal_id, user_id) values ($1, $2)`,
      [goalId, userId],
    );
    return goalId;
  }

  it('is true for a day that reached gold AGI', async () => {
    const user = await h.createUser();
    const goalId = await goalFor(user, 'daily_walk');
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total, tiers)
       values ($1, '2026-09-02', 3000, '{"AGI":"gold"}'::jsonb)`,
      [user],
    );

    const rows = await h.asUser<{ walk_cleared: boolean }>(
      user,
      `select walk_cleared from public.goal_window_scores($1) where local_date = '2026-09-02'`,
      [goalId],
    );

    expect(rows[0]?.walk_cleared).toBe(true);
  });

  it('is false for a day that only reached silver', async () => {
    const user = await h.createUser();
    const goalId = await goalFor(user, 'daily_walk');
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total, tiers)
       values ($1, '2026-09-03', 8000, '{"AGI":"silver"}'::jsonb)`,
      [user],
    );

    const rows = await h.asUser<{ walk_cleared: boolean }>(
      user,
      `select walk_cleared from public.goal_window_scores($1) where local_date = '2026-09-03'`,
      [goalId],
    );

    expect(rows[0]?.walk_cleared).toBe(false);
  });

  // The LEFT JOIN keeps a scoreless participant on the roster. Their row must
  // say false, not null — kairo-core's GoalDay.walkCleared is a boolean.
  it('is false, not null, for a participant with no scored day', async () => {
    const user = await h.createUser();
    const goalId = await goalFor(user, 'daily_walk');

    const rows = await h.asUser<{ walk_cleared: boolean; local_date: string | null }>(
      user,
      `select walk_cleared, local_date from public.goal_window_scores($1)`,
      [goalId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.local_date).toBeNull();
    expect(rows[0]?.walk_cleared).toBe(false);
  });
});

describe('goals.metric', () => {
  it('accepts daily_walk', async () => {
    const user = await h.createUser();
    await expect(
      h.asService(
        `insert into public.goals
           (created_by, title, kind, metric, target, required_days, starts_on, ends_on)
         values ($1, 'ok', 'consistency', 'daily_walk', 1, 2, '2026-09-01', '2026-09-30')`,
        [user],
      ),
    ).resolves.toBeDefined();
  });

  it('still rejects an unknown metric', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.goals
           (created_by, title, kind, metric, target, required_days, starts_on, ends_on)
         values ($1, 'no', 'consistency', 'distance', 1, 2, '2026-09-01', '2026-09-30')`,
        [user],
      ),
      /goals_metric_check/i,
    );
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "walk_cleared"`

Expected: FAIL — `column walk_cleared does not exist`, before the migration file is picked up.

- [ ] **Step 4: Run them to verify they pass**

The harness applies migrations from disk automatically.

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "walk_cleared"` and again with `-t "goals.metric"`

Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm run typecheck && npm test`

Expected: PASS. If an existing `goal_window_scores` test asserts a column count or destructures a five-column row, update it — the shape changed by design.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260818100000_goal_daily_walk_metric.sql supabase/tests/schema.test.ts
git commit -m "$(cat <<'EOF'
feat: goal_window_scores reports whether each day cleared the Daily Walk

goals.metric already existed, pinned to one value and documented as
widenable — so this widens the check rather than adding a column.

walk_cleared is coalesced to false because the LEFT JOIN null-extends a
participant with no scored day, and a null would arrive in kairo-core as a
missing boolean rather than as "did not clear".

DROP then CREATE because the returns-table shape changed; grants re-issued.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: STOP — deployment is the user's call**

This migration changes a function `finalize-days` reads. Applying one without the other is what took scoring down for two days in August 2026.

**Do not run any of this yourself.** Report to the user that the migration is ready and needs, in this order:

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260818100000_goal_daily_walk_metric.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260818100000')"
supabase functions deploy finalize-days --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs
```

Then continue to Task 3 — the remaining tasks do not depend on the deployment.

---

### Task 3: Carry the metric through the client

**Files:**
- Modify: `src/features/goals/standings.ts`
- Modify: `src/features/goals/standings.test.ts`
- Modify: `src/features/goals/queries.ts`
- Modify: `src/features/goals/mutations.ts`

**Interfaces:**
- Consumes: `GoalMetric` from `@kairo/core` (Task 1); `walk_cleared` from the RPC (Task 2).
- Produces: `GoalRow` gains `metric: GoalMetric`; `WindowScore` gains `walk_cleared: boolean`; `NewGoal` gains `metric: GoalMetric`.

- [ ] **Step 1: Widen the row types**

In `src/features/goals/standings.ts`:

- Add `metric: GoalMetric;` to `GoalRow`, importing the type from the same relative path the file already uses for `evaluateGoal` (this file imports from `'../../../packages/kairo-core/src/goal.ts'` because root Vitest has no `@/` alias — match that, do not switch it to `@kairo/core`).
- Add `walk_cleared: boolean;` to `WindowScore`.
- Wherever the file builds a `Goal` for `evaluateGoal`, pass `metric: row.metric`.
- Wherever it builds a `GoalDay`, pass `walkCleared: score.walk_cleared`.

- [ ] **Step 2: Update the standings tests**

In `src/features/goals/standings.test.ts`, add `metric: 'daily_score'` to every `GoalRow` fixture and `walk_cleared: false` to every `WindowScore` fixture, then add one case proving a walk goal groups correctly:

```typescript
it('scores a daily_walk goal from walk_cleared, not from totals', () => {
  const goal: GoalRow = {
    ...baseGoal,
    metric: 'daily_walk',
    kind: 'consistency',
    target: 1,
    required_days: 2,
  };
  const scores: WindowScore[] = [
    { user_id: 'u1', character_name: 'A', local_date: '2026-08-01', total: 50, status: 'final', walk_cleared: true },
    { user_id: 'u1', character_name: 'A', local_date: '2026-08-02', total: 9_999, status: 'final', walk_cleared: false },
  ];

  const [standing] = standingsFor(goal, scores, [], 'u1', '2026-08-03');

  // One cleared walk, despite the second day scoring two hundred times more.
  expect(standing?.progress.progress).toBe(1);
});
```

Adapt the fixture names and the function call to whatever this file already uses — read a neighbouring test first.

- [ ] **Step 3: Select the new columns**

In `src/features/goals/queries.ts`, add `metric` to the column list selected from `goals`, and confirm the `goal_window_scores` call maps `walk_cleared` through — if it selects specific fields rather than `*`, add it there too.

In `src/features/goals/mutations.ts`, add `metric: GoalMetric` to `NewGoal` and include it in the INSERT.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/goals/standings.ts src/features/goals/standings.test.ts src/features/goals/queries.ts src/features/goals/mutations.ts
git commit -m "$(cat <<'EOF'
feat: carry the goal metric through the client projection

GoalRow gains metric, WindowScore gains walk_cleared, and standings builds
both into the kairo-core types. A walk goal now scores off cleared days
rather than totals.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The goal form leads with the Daily Walk

**Files:**
- Modify: `src/features/goals/CreateGoalForm.tsx`

**Interfaces:**
- Consumes: `NewGoal.metric` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Restructure the form**

`src/features/goals/CreateGoalForm.tsx` currently asks "How it counts" (A total / Most days) and then "Points to reach" with a `60000` placeholder. Change it so the metric is the first choice and points are the advanced path:

- Add `const [metric, setMetric] = useState<GoalMetric>('daily_walk');` — walk is the default, because it is the one a user can evaluate.
- Add a "What counts" row above "How it counts", using the existing `Choice` component already defined at the bottom of this file:
  - **"Daily Walks"** — note: `Days you clear 10,000 steps`
  - **"Points"** — note: `Advanced`
- When `metric === 'daily_walk'`:
  - Under "Most days", the target field disappears entirely — the bar is "cleared the walk". Keep the "Days you need to clear it" field.
  - Under "A total", the field is labelled **"Daily Walks to reach"** with placeholder `20`.
- When `metric === 'daily_score'`, the existing points fields render exactly as they do now.
- On submit, send `metric`, and for a `daily_walk` consistency goal send `target: 1` — the database requires `target > 0` and the value is unused for that combination. Put that in a comment at the call site; a bare `1` is otherwise unexplainable.

- [ ] **Step 2: Update the disabled-button explanations**

The `blocker` chain currently says "Add a points target." / "Add the points to clear each day." Those are wrong for a walk goal. Extend it so:

- `daily_walk` + cumulative with no target → `'Say how many Daily Walks.'`
- `daily_walk` + consistency → the target check does not apply at all; only `daysOk` can block.
- `daily_score` → unchanged wording.

Keep the `targetOk` validation for the `daily_score` path and for `daily_walk` cumulative; skip it for `daily_walk` consistency, or the button never enables.

- [ ] **Step 3: Update the window line**

The line under the window chips reads "Starts today, ends …". Leave it. But where the form previously implied points, make sure no remaining copy says "points" while `metric === 'daily_walk'`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/goals/CreateGoalForm.tsx
git commit -m "$(cat <<'EOF'
feat: goals are set in Daily Walks, with points as the advanced path

"60000 points" was a target the user could not evaluate before typing it,
so the number was arbitrary and missing it read as the algorithm's fault.
"Clear the Daily Walk 25 days out of 30" is answerable from the streak
already on the home shelf.

A daily_walk consistency goal sends target: 1 because the column requires
a positive value and the bar is a boolean.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The copy speaks days

**Files:**
- Modify: `src/features/goals/goal-copy.ts`
- Modify: `src/features/goals/goal-copy.test.ts`

**Interfaces:**
- Consumes: `GoalMetric`.
- Produces: whatever the existing exported functions are — they gain a metric parameter rather than new names.

- [ ] **Step 1: Write the failing tests**

Read `src/features/goals/goal-copy.test.ts` first and follow its shape. Add cases asserting that for a `daily_walk` goal the strings read in walks and days — "12 of 20 walks", "8 of 25 days" — and **never contain the word "points"**. Assert the existing `daily_score` strings are unchanged, so this is provably additive.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --config vitest.config.ts src/features/goals/goal-copy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement**

Thread the metric through the exported functions and branch the unit noun. Keep one function per string — do not add a parallel `walkCopy` module, which would drift from this one exactly as `standings.ts`'s header warns two renderers of one row would.

- [ ] **Step 4: Run to verify they pass, then the full suite**

Run: `npx vitest run --config vitest.config.ts src/features/goals/goal-copy.test.ts && npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/goals/goal-copy.ts src/features/goals/goal-copy.test.ts
git commit -m "$(cat <<'EOF'
feat: goal copy speaks walks and days

Threaded through the existing functions rather than a parallel module —
two renderers of one string drift, which is the reason standings.ts exists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The apple-app-site-association site

Universal links need one file on an HTTPS domain. This task builds it; deploying is the user's call.

**Files:**
- Create: `web/.well-known/apple-app-site-association`
- Create: `web/vercel.json`
- Create: `web/index.html`
- Create: `web/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a deployable static site. The app ID is `8C53KVSFWK.com.arsherj.kairo` — `appleTeamId` and `bundleIdentifier` from `app.config.ts`.

- [ ] **Step 1: Write the association file**

Create `web/.well-known/apple-app-site-association` — **no file extension**, valid JSON:

```json
{
  "applinks": {
    "details": [
      {
        "appID": "8C53KVSFWK.com.arsherj.kairo",
        "paths": ["/join/*"]
      }
    ]
  }
}
```

Only `/join/*`. A broader pattern would make every path on the domain open the app, including the landing page that exists to be read in a browser by someone who has not installed it.

- [ ] **Step 2: Set the content type**

Create `web/vercel.json`:

```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [{ "key": "Content-Type", "value": "application/json" }]
    }
  ]
}
```

The file is extensionless, so a static host will otherwise serve it as `application/octet-stream`. **This is why GitHub Pages cannot host this** — it allows no custom MIME types or redirects, and a project-path repo cannot satisfy Apple's domain-root requirement either.

- [ ] **Step 3: Write the landing page**

Create `web/index.html` — a plain page for anyone who opens an invite link without the app installed. It needs no framework and no external requests. Name the squad generically ("You've been invited to a Kairo squad"), explain in a sentence what Kairo is, and link to the App Store listing once one exists — until then, say the beta is invite-only via TestFlight. **Do not attempt to read the invite code out of the URL and display it**; the page is static and the code belongs to the app.

- [ ] **Step 4: Write the README**

Create `web/README.md` recording: what this directory is, why it exists (universal links need an HTTPS domain serving one file), that the `appID` must match `appleTeamId` + `bundleIdentifier` in `app.config.ts` and will silently break links if it drifts, that GitHub Pages cannot host it and why, and that changing the domain later breaks every invite link already shared.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "$(cat <<'EOF'
feat: the apple-app-site-association site

One JSON file on an HTTPS domain, plus a vercel.json that forces its
content type — the file is extensionless and would otherwise be served as
octet-stream. GitHub Pages cannot host this: no custom MIME types, and a
project-path repo cannot satisfy Apple's domain-root requirement.

Scoped to /join/* so the landing page still opens in a browser for
somebody who has not installed the app.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: STOP — deploying is the user's call**

Deploying publishes to the public internet under a domain that will be baked into every invite link. Report to the user that `web/` is ready and needs:

1. A deploy of `web/` to a free static host (Vercel, Netlify or Cloudflare Pages).
2. The resulting domain, which Task 7 needs.
3. A check that `curl -I https://<domain>/.well-known/apple-app-site-association` returns `200` with `content-type: application/json` and **no redirect** — Apple follows none.

Ask for the domain before starting Task 7.

---

### Task 7: The entitlement chain

Expo's documentation says to build with EAS Build, "which ensures the entitlement is registered with Apple automatically." **Kairo does not use EAS.** It builds on Xcode Cloud against a committed `ios/`, which ships exactly as it is found. All four steps below are manual and omitting any one fails silently — the same failure class as `aps-environment`, already recorded in CLAUDE.md.

**Files:**
- Modify: `app.config.ts`
- Modify: `ios/` (regenerated)

**Interfaces:**
- Consumes: the deployed domain from Task 6.
- Produces: `ios.associatedDomains` in config and `com.apple.developer.associated-domains` in the committed entitlements.

- [ ] **Step 1: Confirm the domain**

Do not proceed on a guess. If the user has not given you the deployed domain from Task 6, ask for it and wait.

- [ ] **Step 2: Declare it in the config**

In `app.config.ts`, inside the `ios` block beside `usesAppleSignIn`:

```typescript
    // Universal links (design §11). No `https://` prefix — Apple's format is
    // `applinks:<host>`, and including the scheme is the documented common
    // mistake that makes links silently fall back to Safari.
    //
    // Declaring it here is not sufficient. Because `ios/` is committed
    // (deviation #28) Xcode Cloud ships the entitlements file as it finds it,
    // so this needs `npm run prebuild` and a commit of the regenerated `ios/`.
    // And the Associated Domains capability must be enabled on the App ID in
    // the Developer portal — without it the entitlement is present, the link
    // resolves to Safari, and nothing reports an error.
    associatedDomains: ['applinks:<DOMAIN FROM TASK 6>'],
```

- [ ] **Step 3: Regenerate and commit `ios/`**

```bash
npm run prebuild
git diff --stat ios/
```

Confirm `ios/Kairo/Kairo.entitlements` now contains `com.apple.developer.associated-domains` with the `applinks:` entry. Confirm `ios/ci_scripts/` still exists — `expo prebuild --clean` deletes it and `postprebuild` is supposed to reinstall it from `scripts/ci/`. If it is missing, stop and report; a build without those scripts fails in CI.

```bash
git add app.config.ts ios/
git commit -m "$(cat <<'EOF'
feat: declare the associated domain for universal links

Xcode Cloud ships the committed ios/ as it finds it, so app.config.ts
alone would never reach the build — the same failure class as
aps-environment. Regenerated and committed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: STOP — the portal step is the user's**

Report that the last link in the chain is outside the repository and cannot be verified from here: **enable the Associated Domains capability on the App ID `com.arsherj.kairo` in the Apple Developer portal.** Without it, the entitlement is present, links open Safari instead of the app, and nothing anywhere reports an error.

---

### Task 8: `/join/<code>`

**Files:**
- Create: `app/join/[code].tsx`
- Modify: `src/features/squad/JoinSquadForm.tsx`

**Interfaces:**
- Consumes: `normalizeInviteCode`, `isValidInviteCode` from `src/features/squad/invite-code.ts`.
- Produces: `JoinSquadForm` gains an optional `initialCode?: string` prop.

- [ ] **Step 1: Accept a prefilled code**

In `src/features/squad/JoinSquadForm.tsx`, add `initialCode` to the props and seed the existing code state from it:

```typescript
export function JoinSquadForm({
  userId,
  onCancel,
  initialCode,
}: {
  userId: string | undefined;
  onCancel: () => void;
  /**
   * Prefilled from a `/join/<code>` universal link. Seeded rather than
   * submitted automatically: a link can be stale, wrong, or tapped by someone
   * who did not mean to join, and a form the user confirms is the difference
   * between an accelerator and a trap.
   */
  initialCode?: string;
}) {
```

Seed with `useState(() => initialCode ?? '')` — a lazy initialiser, not a `useEffect`, so a re-render never resets what the user has typed over it.

- [ ] **Step 2: Build the route**

Create `app/join/[code].tsx`. It reads the code from the route param, normalises it, and renders `JoinSquadForm` with it prefilled.

Three cases it must handle, because a link arrives from outside the app and none of them are unusual:

- **Signed out.** The gate in `app/_layout.tsx` redirects to `/sign-in`, and the code is lost. Store it before that happens and read it back after — the simplest correct place is the same MMKV the app already uses. Do not add a query parameter round-trip through the auth flow.
- **Malformed code.** `isValidInviteCode` already exists and is tested. On a failure, render the join form with an empty field and a line saying the link did not carry a usable code — never a blank screen and never a crash.
- **Already in a squad.** The free tier allows one. Redirect to `/squad` rather than presenting a form whose submission the server will refuse.

Use `useLocalSearchParams` from `expo-router` for the param.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/join src/features/squad/JoinSquadForm.tsx
git commit -m "$(cat <<'EOF'
feat: /join/<code> prefills the invite form

The code is seeded, never auto-submitted: a link can be stale, wrong, or
tapped by accident, and a form the user confirms is the difference between
an accelerator and a trap.

Code entry stays — somebody who gets a code by text with no app installed
still needs the manual path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/mvp-scope.md`
- Modify: `docs/user-journey.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: `docs/mvp-scope.md`**

Move **universal links** out of the "Out of scope" table — its stated reason ("needs a domain, a hosted `apple-app-site-association`, the associated-domains entitlement and route handling") is now satisfied. Under Goals, record that they are set in Daily Walks by default with points as an advanced path.

- [ ] **Step 2: `docs/user-journey.md`**

Add the invite-link path alongside the code path, and update the goal-setting flow.

- [ ] **Step 3: `docs/roadmap.md`**

Deviation rows for the Daily Walk goal metric (D32/D33) and universal links (D37), each pointing at the design spec.

- [ ] **Step 4: `CLAUDE.md`**

A short paragraph recording the four things easiest to get wrong here:

- **`goals.metric` was widened, not added** — it existed pinned to `'daily_score'`, which is the value name, not `'points'`.
- **`walk_cleared` comes from `daily_scores.tiers`, never `health_buckets`** — the tier is already projected to squadmates, the buckets are not, and both produce an identical screen.
- **A `daily_walk` consistency goal stores `target: 1`** as a sentinel, because the column requires a positive value and the bar is a boolean.
- **The universal-links entitlement chain is four steps and fails silently** — config, committed entitlements, prebuild-and-commit, and the portal capability. Same class as `aps-environment`.

- [ ] **Step 5: `README.md`**

Add a line to the setup notes: the `web/` directory hosts the association file, and the deployed domain must match `ios.associatedDomains` or every invite link falls back to Safari.

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm test`

```bash
git add docs/mvp-scope.md docs/user-journey.md docs/roadmap.md CLAUDE.md README.md
git commit -m "$(cat <<'EOF'
docs: goals in Daily Walks, and universal invite links

Universal links leave the out-of-scope table — the hosting cost that put
them there turned out not to exist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test` and `npm run typecheck` pass.
- A new goal defaults to Daily Walks and never shows the word "points" unless the user chose the advanced path.
- A `daily_walk` goal's progress moves on days that cleared 10,000 steps and ignores the score entirely.
- An existing `daily_score` goal behaves exactly as before — every prior test still passes unmodified.
- `web/.well-known/apple-app-site-association` serves as `application/json` over HTTPS with no redirect.
- Tapping `https://<domain>/join/AB12CD` on a device with the app installed opens the join form with `AB12CD` filled in.

## Three things this plan hands back to the user

Each is outside the repository or outside this machine, and each fails silently if skipped.

1. **The migration deployment** (Task 2, Step 7) — `remote-sql.sh -f`, the `schema_migrations` row, `supabase functions deploy finalize-days`, then `smoke-sync.mjs`. The redeploy is not optional: this migration changes a function `finalize-days` reads.
2. **The static site deploy** (Task 6, Step 6) — and the domain it produces, which Task 7 cannot proceed without.
3. **The Associated Domains capability on the App ID** (Task 7, Step 4) — the one link in the chain that lives in Apple's portal. Without it the entitlement is present, links open Safari, and nothing reports an error.

Universal links cannot be verified on this machine at all: it cannot pair an iPhone (CrowdStrike blocks `usbmuxd`), and the simulator does not exercise Apple's CDN fetch of the association file. Verification is a TestFlight build with a real tap on a real link.

## Deliberately not in this plan

- **Cumulative distance goals** — "walk 1,000 km by March". Personal-only is feasible (your own data, no squad projection, no privacy conflict) but needs a second aggregation path off `health_buckets` that goals do not have. Staged after the cohort; spec §12.
- **Squad program timing** — the program is chosen when a squad has one member. Real, recorded at spec §7.4, deliberately unscoped.
- **Android App Links.** iOS first; `assetlinks.json` would sit beside the association file when Android arrives.
- **A real domain.** `<project>.vercel.app` is fine for a beta, but moving later breaks every link already shared — decide before any public launch, not after.
