# Seed Data and the Completed-Day Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `squad_leaderboard` a per-member completed-day mode, and add a development-only `seed-health` function that populates realistic activity for fake squadmates — so the squad UI can be built against a leaderboard that actually has people on it.

**Architecture:** `seed-health` writes hourly `health_buckets` and then rescores through the same `rescoreDay` helper the other Edge Functions use, so seeded scores are produced by the real scoring engine rather than fabricated. Every decision lives in a pure `seed-plan.ts` tested in plain Node; the handler only authenticates, plans, writes and rescores. The leaderboard's completed-day date is computed once in a CTE and kept honest against `kairo-core` by a differential test.

**Tech Stack:** Postgres 17 (Supabase) · Deno Edge Functions · `@kairo/core` (pure TS) · Vitest + PGlite

## Global Constraints

- **Spec source of truth:** `Kairo_Master_Summary.md` v1.3. `§` references point there. Deviations belong in `docs/roadmap.md`'s table.
- **Design source of truth:** `docs/superpowers/specs/2026-07-29-seed-data-and-completed-day-board-design.md`.
- **`seed-health` writes `health_buckets` only, never `daily_scores` directly.** Scores are always replayed from stored buckets via `rescoreDay`. Writing totals directly would make every seeded leaderboard a fiction.
- **`packages/kairo-core` is pure and zero-dependency**: no I/O, no clock reads, **no randomness**. The seeded PRNG lives in `seed-health`, never in core.
- **`*.deno.ts` marks modules importing Deno-only specifiers** (`npm:`, Deno globals). Excluded from `tsc`, checked by `deno check`. Everything else under `supabase/functions/_shared/` stays pure so Vitest can exercise it.
- **Edge Function handlers stay thin.** Decisions live in `*-plan.ts` modules tested in plain Node.
- Imports use explicit `.ts` extensions.
- **Migrations cannot be pushed with the CLI** (port 5432 blocked, direct host IPv6-only, no Docker). Apply with `./supabase/scripts/remote-sql.sh -f <file>`, then insert the `supabase_migrations.schema_migrations` row by hand. Wrap multi-statement migrations in `begin; ... commit;`.
- **A recreated `SECURITY DEFINER` function starts with `EXECUTE` granted to `PUBLIC`.** Re-granting after a drop is mandatory, not tidiness.
- No new npm dependencies.
- Stage only the files a task names, by explicit path. Never `git add -A`.
- Comments explain *why*, not *what*.
- `active_minutes` has a DB `CHECK` of `between 0 and 60`. `steps`, `distance_m`, `active_kcal` all `>= 0`.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260729100000_leaderboard_completed_mode.sql` | Drops, recreates and re-grants `squad_leaderboard` with `p_mode` |
| `supabase/migrations/20260729110000_seed_test_users.sql` | The `seed_test_users` allowlist table |
| `supabase/functions/_shared/seed-plan.ts` | Pure: PRNG, personas, day shape, date range, allowlist diff |
| `supabase/functions/_shared/seed-plan.test.ts` | Node tests for the above |
| `supabase/functions/seed-health/index.ts` | Thin handler: three actions, `SEED_SECRET`, writes, rescores |

**Modified:** `supabase/tests/schema.test.ts` · `docs/roadmap.md`

---

## Task 1: `squad_leaderboard` completed-day mode

**Files:**
- Create: `supabase/migrations/20260729100000_leaderboard_completed_mode.sql`
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `squad_leaderboard(p_squad_id uuid, p_local_date date default null, p_mode text default 'current')`. `p_mode` accepts `'current'` or `'completed'`. Task 5 calls it live.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/tests/schema.test.ts`, at the end of the file:

```ts
describe('squad_leaderboard completed-day mode', () => {
  /** Creates a squad owned by `ownerId` and returns its id and invite code. */
  async function createSquad(ownerId: string, name: string) {
    // asUser's signature is (userId, sql, params) — the user id comes first.
    const created = await h.asUser<{ id: string }>(
      ownerId,
      `select (public.create_squad($1)).id as id`,
      [name],
    );
    const squadId = created[0]!.id;
    const codes = await h.asService<{ invite_code: string }>(
      'select invite_code from public.squads where id = $1',
      [squadId],
    );
    return { squadId, inviteCode: codes[0]!.invite_code };
  }

  it('ranks each member on their OWN yesterday', async () => {
    const manila = await h.createUser({ characterName: 'Aeon', timezone: 'Asia/Manila' });
    const newYork = await h.createUser({ characterName: 'Bex', timezone: 'America/New_York' });

    const { squadId, inviteCode } = await createSquad(manila, 'Zone Test');
    await h.asUser(newYork, `select public.join_squad($1)`, [inviteCode]);

    const rows = await h.asUser<{ user_id: string; local_date: string }>(
      manila,
      `select user_id, local_date::text as local_date
       from public.squad_leaderboard($1, null, 'completed')`,
      [squadId],
    );

    const expected = await h.asService<{ mnl: string; nyc: string }>(
      `select ((now() at time zone 'Asia/Manila')::date - 1)::text as mnl,
              ((now() at time zone 'America/New_York')::date - 1)::text as nyc`,
    );

    const byUser = new Map(rows.map((r) => [r.user_id, r.local_date]));
    expect(byUser.get(manila)).toBe(expected[0]!.mnl);
    expect(byUser.get(newYork)).toBe(expected[0]!.nyc);
  });

  it('rejects an unknown mode rather than silently defaulting', async () => {
    const user = await h.createUser();
    const { squadId } = await createSquad(user, 'Mode Test');

    await rejects(
      h.asUser(
        user,
        `select * from public.squad_leaderboard($1, null, 'yesterdayish')`,
        [squadId],
      ),
      /unknown leaderboard mode/i,
    );
  });

  it('still defaults to each member’s current day', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    const { squadId } = await createSquad(user, 'Current Test');

    const rows = await h.asUser<{ local_date: string }>(
      user,
      `select local_date::text as local_date
       from public.squad_leaderboard($1)`,
      [squadId],
    );
    const today = await h.asService<{ d: string }>(
      `select (now() at time zone 'Asia/Manila')::date::text as d`,
    );

    expect(rows[0]!.local_date).toBe(today[0]!.d);
  });

  it('lets an explicit pinned date override the mode', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    const { squadId } = await createSquad(user, 'Pin Test');

    const rows = await h.asUser<{ local_date: string }>(
      user,
      `select local_date::text as local_date
       from public.squad_leaderboard($1, '2026-01-15'::date, 'completed')`,
      [squadId],
    );
    expect(rows[0]!.local_date).toBe('2026-01-15');
  });

  it('is not executable by anon after the function was recreated', async () => {
    // A dropped SECURITY DEFINER function comes back with EXECUTE granted to
    // PUBLIC. If the migration forgets to re-revoke, this passes silently in
    // every test that runs as `authenticated`.
    const granted = await h.asService<{ has: boolean }>(
      `select has_function_privilege('anon',
         'public.squad_leaderboard(uuid, date, text)', 'execute') as has`,
    );
    expect(granted[0]!.has).toBe(false);

    const authed = await h.asService<{ has: boolean }>(
      `select has_function_privilege('authenticated',
         'public.squad_leaderboard(uuid, date, text)', 'execute') as has`,
    );
    expect(authed[0]!.has).toBe(true);
  });
});

describe('completed-day date agrees with kairo-core', () => {
  // The SQL expression and mostRecentlyCompletedLocalDate() are two
  // implementations of one rule. A single captured instant is passed to both,
  // so this cannot flake by straddling a midnight between the two reads.
  it('matches mostRecentlyCompletedLocalDate across zones', async () => {
    const now = new Date();
    const zones = [
      'Asia/Manila',
      'America/New_York',
      'Europe/London',
      'Pacific/Kiritimati',
      'Pacific/Niue',
      'Australia/Adelaide',
    ];

    for (const zone of zones) {
      const rows = await h.asService<{ d: string }>(
        `select (($1::timestamptz at time zone $2)::date - 1)::text as d`,
        [now.toISOString(), zone],
      );
      expect(rows[0]!.d).toBe(mostRecentlyCompletedLocalDate(now, zone));
    }
  });
});
```

Add `mostRecentlyCompletedLocalDate` to the existing `kairo-core` import at the top of the file:

```ts
import { addDays, isFinalizable, mostRecentlyCompletedLocalDate } from '../../packages/kairo-core/src/day.ts';
```

**Harness reminder:** `h.asUser<T>(userId, sql, params?)` runs as the `authenticated` role with `auth.uid()` bound — the user id comes **first**. `h.asService<T>(sql, params?)` runs as the table owner and bypasses RLS, so it cannot be used to call `squad_leaderboard` (`auth.uid()` is null there and the function raises). `h.createUser({ characterName, timezone })` creates an auth user and a profile together.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "completed"
```

Expected: FAIL — `squad_leaderboard` has no third parameter, so the calls error with "function does not exist".

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260729100000_leaderboard_completed_mode.sql`:

```sql
-- squad_leaderboard gains a per-member completed-day mode (§2; roadmap
-- deviation #6 recorded it as owed).
--
-- Recreated rather than replaced. Adding a defaulted parameter creates a
-- SECOND overload rather than replacing the first, and two near-identical
-- leaderboard functions is exactly how the privacy projection drifts apart.
--
-- Dropping has a consequence that must not be missed: the new function starts
-- with Postgres's default of EXECUTE to PUBLIC. On a SECURITY DEFINER function
-- that hands the projection to every role, so the revoke/grant at the bottom
-- is load-bearing rather than tidiness.
--
-- The member's date is also computed ONCE now, in a CTE. The previous version
-- computed it twice — in the select list and again in the join condition — and
-- two copies of the rule deciding which day you are ranked on can drift, which
-- would attach a score to a different date than the row reports.

begin;

drop function if exists public.squad_leaderboard(uuid, date);

create function public.squad_leaderboard(
  p_squad_id uuid,
  p_local_date date default null,
  p_mode text default 'current'
)
returns table (
  rank bigint,
  user_id uuid,
  character_name text,
  class text,
  level integer,
  local_date date,
  total integer,
  tiers jsonb,
  contributing_stats smallint,
  has_rec boolean,
  flagged boolean,
  status public.day_status,
  current_streak integer,
  is_self boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Raise rather than fall back to 'current': a typo must not silently rank
  -- people on the wrong day.
  if p_mode not in ('current', 'completed') then
    raise exception 'unknown leaderboard mode: %', p_mode using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and squad_members.user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  return query
  with member_day as (
    select
      p.id             as uid,
      p.character_name as cname,
      p.class          as pclass,
      p.level          as plevel,
      -- Per-user local days (§2). 'completed' is each member's OWN yesterday,
      -- so a Manila member and a New York member legitimately land on
      -- different dates in the same result set. That is the mode's purpose,
      -- and local_date is returned per row so the UI can say which day each
      -- score belongs to.
      case
        when p_local_date is not null then p_local_date
        when p_mode = 'completed' then ((now() at time zone p.timezone)::date - 1)
        else (now() at time zone p.timezone)::date
      end as ldate
    from public.squad_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.squad_id = p_squad_id
  ),
  scored as (
    select
      md.uid, md.cname, md.pclass, md.plevel, md.ldate,
      coalesce(ds.total, 0)                                 as dtotal,
      coalesce(ds.tiers, '{}'::jsonb)                       as dtiers,
      coalesce(ds.contributing_stats, 0::smallint)          as dcontrib,
      coalesce(ds.has_rec, false)                           as drec,
      coalesce(ds.flagged, false)                           as dflag,
      coalesce(ds.status, 'provisional'::public.day_status) as dstatus,
      coalesce(st.current_streak, 0)                        as streak
    from member_day md
    left join public.daily_scores ds
      on ds.user_id = md.uid and ds.local_date = md.ldate
    left join public.streaks st on st.user_id = md.uid
  )
  select
    row_number() over (order by s.dtotal desc, s.cname asc),
    s.uid, s.cname, s.pclass, s.plevel, s.ldate,
    s.dtotal, s.dtiers, s.dcontrib, s.drec, s.dflag, s.dstatus, s.streak,
    s.uid = v_user
  from scored s
  order by s.dtotal desc, s.cname asc;
end;
$$;

comment on function public.squad_leaderboard(uuid, date, text) is
  'Tiers and scores only. p_mode is current (each member''s today) or completed (each member''s own yesterday). No argument exposes raw steps or hourly movement.';

-- Mandatory after a drop. See the header comment.
revoke execute on function public.squad_leaderboard(uuid, date, text) from public, anon;
grant  execute on function public.squad_leaderboard(uuid, date, text) to authenticated;

commit;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts
```

Expected: PASS, whole file. Run all of it — the function is recreated, so every existing leaderboard test sits on top of this change.

- [ ] **Step 5: Apply to the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260729100000_leaderboard_completed_mode.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version, name) values ('20260729100000', 'leaderboard_completed_mode')"
```

- [ ] **Step 6: Verify the live grants**

```bash
./supabase/scripts/remote-sql.sh "select has_function_privilege('anon', 'public.squad_leaderboard(uuid, date, text)', 'execute') as anon_can, has_function_privilege('authenticated', 'public.squad_leaderboard(uuid, date, text)', 'execute') as authed_can"
```

Expected: `anon_can` false, `authed_can` true.

```bash
./supabase/scripts/remote-sql.sh "select count(*) as overloads from pg_proc where proname = 'squad_leaderboard'"
```

Expected: exactly `1`. More than one means the drop did not take and two leaderboard functions now coexist.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260729100000_leaderboard_completed_mode.sql supabase/tests/schema.test.ts
git commit -m "Add a completed-day mode to squad_leaderboard

Each member is ranked on their own yesterday, so a mixed-timezone squad
compares like with like. Recreated rather than replaced because a
defaulted parameter would create a second overload, and re-granted
because a dropped SECURITY DEFINER function returns with EXECUTE to
PUBLIC."
```

---

## Task 2: The `seed_test_users` allowlist

**Files:**
- Create: `supabase/migrations/20260729110000_seed_test_users.sql`
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `public.seed_test_users (user_id uuid pk → auth.users on delete cascade, label text not null, created_at timestamptz)`. Task 4 reads and writes it with the service role.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/tests/schema.test.ts`:

```ts
describe('seed_test_users allowlist', () => {
  it('is unreachable by an authenticated client', async () => {
    const user = await h.createUser();

    await rejects(
      h.asUser(user, 'select * from public.seed_test_users'),
      /permission denied/i,
    );
    await rejects(
      h.asUser(
        user,
        `insert into public.seed_test_users (user_id, label) values ($1, 'self')`,
        [user],
      ),
      /permission denied/i,
    );
  });

  it('accepts a service-role insert and cascades on user deletion', async () => {
    const user = await h.createUser();

    await h.asService(
      `insert into public.seed_test_users (user_id, label) values ($1, 'squadmate-1')`,
      [user],
    );
    const before = await h.asService<{ n: string }>(
      'select count(*)::text as n from public.seed_test_users where user_id = $1',
      [user],
    );
    expect(before[0]!.n).toBe('1');

    await h.asService(`set local kairo.allow_purge = 'on'`);
    await h.asService('delete from auth.users where id = $1', [user]);

    const after = await h.asService<{ n: string }>(
      'select count(*)::text as n from public.seed_test_users where user_id = $1',
      [user],
    );
    expect(after[0]!.n).toBe('0');
  });

  it('rejects a blank label', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.seed_test_users (user_id, label) values ($1, '   ')`,
        [user],
      ),
      /check constraint/i,
    );
  });
});
```

**If the cascade test fails** because `set local` does not persist across the harness's separate `asService` calls, wrap the purge in a single call instead:

```ts
await h.asService(`
  begin;
  set local kairo.allow_purge = 'on';
  delete from auth.users where id = '${user}';
  commit;
`);
```

Report which form you used and why.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "seed_test_users"
```

Expected: FAIL — relation `public.seed_test_users` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260729110000_seed_test_users.sql`:

```sql
-- Allowlist for seed-health, the development-only data generator.
--
-- A table rather than a naming convention because a convention depends on
-- nobody ever registering a matching address, whereas a row is a fact. This is
-- what makes a leaked SEED_SECRET survivable: seed-health refuses to write for
-- any user absent from this table, so it cannot reach a real player's scores.
--
-- Empty in production. seed-health is never deployed there.

begin;

create table public.seed_test_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now()
);

comment on table public.seed_test_users is
  'Development-only allowlist for seed-health. Service role only; no client has any reason to read or write it.';

-- RLS with zero policies denies everything; service_role bypasses RLS. The
-- revoke below is the belt to that pair of braces.
alter table public.seed_test_users enable row level security;

revoke all on public.seed_test_users from anon, authenticated;

commit;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts
```

Expected: PASS, whole file.

- [ ] **Step 5: Apply to the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260729110000_seed_test_users.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version, name) values ('20260729110000', 'seed_test_users')"
```

- [ ] **Step 6: Verify the live grants**

```bash
./supabase/scripts/remote-sql.sh "select grantee, privilege_type from information_schema.table_privileges where table_name='seed_test_users' order by 1,2"
```

Expected: no rows for `anon` or `authenticated`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260729110000_seed_test_users.sql supabase/tests/schema.test.ts
git commit -m "Add the seed_test_users allowlist

The guard that makes a leaked SEED_SECRET survivable: seed-health
refuses to write for any user not listed here, so it cannot reach a
real player's scores."
```

---

## Task 3: The pure seed planner

**Files:**
- Create: `supabase/functions/_shared/seed-plan.ts`
- Create: `supabase/functions/_shared/seed-plan.test.ts`

**Interfaces:**
- Consumes: nothing (pure; no imports)
- Produces:
  - `type Persona = 'sedentary' | 'average' | 'active' | 'athlete'`
  - `PERSONAS: readonly Persona[]`
  - `interface SeedBucket { hour: number; steps: number; distanceM: number; activeKcal: number; activeMinutes: number }`
  - `makeRng(seed: number): () => number`
  - `hashSeed(...parts: string[]): number`
  - `generateDay(persona: Persona, seed: number): SeedBucket[]`
  - `expandDateRange(from: string, to: string): string[]`
  - `findUnlistedUsers(requested: string[], allowlisted: string[]): string[]`
  - `MAX_SEED_DAYS: 90`

  Task 4 imports all of these.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/seed-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_SEED_DAYS,
  PERSONAS,
  expandDateRange,
  findUnlistedUsers,
  generateDay,
  hashSeed,
  makeRng,
  type Persona,
} from './seed-plan.ts';

function totalSteps(persona: Persona, seed = 1): number {
  return generateDay(persona, seed).reduce((sum, b) => sum + b.steps, 0);
}

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs across seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it('stays within [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is stable for the same parts', () => {
    expect(hashSeed('user-a', '2026-07-29')).toBe(hashSeed('user-a', '2026-07-29'));
  });

  it('separates users and dates', () => {
    expect(hashSeed('user-a', '2026-07-29')).not.toBe(hashSeed('user-b', '2026-07-29'));
    expect(hashSeed('user-a', '2026-07-29')).not.toBe(hashSeed('user-a', '2026-07-30'));
  });
});

describe('generateDay', () => {
  it('returns 24 buckets, hours 0..23 in order', () => {
    const day = generateDay('average', 1);
    expect(day).toHaveLength(24);
    expect(day.map((b) => b.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('is deterministic for a given seed', () => {
    expect(generateDay('active', 99)).toEqual(generateDay('active', 99));
  });

  it('differs across seeds, so two squadmates do not have identical days', () => {
    expect(generateDay('active', 1)).not.toEqual(generateDay('active', 2));
  });

  it('lands within 20% of each persona’s daily step target', () => {
    const targets: Record<Persona, number> = {
      sedentary: 2500,
      average: 7000,
      active: 12000,
      athlete: 18000,
    };
    for (const persona of PERSONAS) {
      const total = totalSteps(persona);
      const target = targets[persona];
      expect(total).toBeGreaterThan(target * 0.8);
      expect(total).toBeLessThan(target * 1.2);
    }
  });

  it('orders personas by activity', () => {
    expect(totalSteps('sedentary')).toBeLessThan(totalSteps('average'));
    expect(totalSteps('average')).toBeLessThan(totalSteps('active'));
    expect(totalSteps('active')).toBeLessThan(totalSteps('athlete'));
  });

  it('never exceeds the 60-minute cap the column enforces', () => {
    // active_minutes has a CHECK of between 0 and 60. An hour cannot hold more
    // than sixty minutes of movement however many steps land in it, and an
    // athlete is the case that would breach it.
    for (const bucket of generateDay('athlete', 3)) {
      expect(bucket.activeMinutes).toBeGreaterThanOrEqual(0);
      expect(bucket.activeMinutes).toBeLessThanOrEqual(60);
    }
  });

  it('emits only non-negative values, as every column requires', () => {
    for (const persona of PERSONAS) {
      for (const bucket of generateDay(persona, 5)) {
        expect(bucket.steps).toBeGreaterThanOrEqual(0);
        expect(bucket.distanceM).toBeGreaterThanOrEqual(0);
        expect(bucket.activeKcal).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives an athlete more VIT-qualifying active hours than a sedentary user', () => {
    // VIT counts hours with at least 250 steps (§5).
    const activeHours = (persona: Persona) =>
      generateDay(persona, 11).filter((b) => b.steps >= 250).length;
    expect(activeHours('athlete')).toBeGreaterThan(activeHours('sedentary'));
  });

  it('is quieter overnight than during commute hours', () => {
    const day = generateDay('average', 13);
    const overnight = day[3]!.steps;
    const commute = day[8]!.steps;
    expect(commute).toBeGreaterThan(overnight);
  });
});

describe('expandDateRange', () => {
  it('includes both endpoints', () => {
    expect(expandDateRange('2026-07-27', '2026-07-29')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
    ]);
  });

  it('handles a single day', () => {
    expect(expandDateRange('2026-07-29', '2026-07-29')).toEqual(['2026-07-29']);
  });

  it('crosses a month boundary', () => {
    expect(expandDateRange('2026-07-30', '2026-08-01')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ]);
  });

  it('rejects a reversed range rather than returning nothing', () => {
    expect(() => expandDateRange('2026-07-29', '2026-07-27')).toThrow(/before/i);
  });

  it('refuses a range that would write an unreasonable number of days', () => {
    expect(() => expandDateRange('2026-01-01', '2026-12-31')).toThrow(
      new RegExp(String(MAX_SEED_DAYS)),
    );
  });
});

describe('findUnlistedUsers', () => {
  it('returns the ids missing from the allowlist', () => {
    expect(findUnlistedUsers(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('returns empty when everything is allowlisted', () => {
    expect(findUnlistedUsers(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('treats an empty allowlist as nothing being permitted', () => {
    expect(findUnlistedUsers(['a'], [])).toEqual(['a']);
  });

  it('does not report a duplicate twice', () => {
    expect(findUnlistedUsers(['b', 'b'], [])).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts supabase/functions/_shared/seed-plan.test.ts
```

Expected: FAIL — cannot resolve `./seed-plan.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/seed-plan.ts`:

```ts
/**
 * Pure decisions for seed-health, the development-only data generator.
 *
 * No imports, no I/O, no clock reads — so it runs under plain Node in the same
 * suite as the other planners. The randomness lives here rather than in
 * `@kairo/core`, which stays deterministic by design.
 *
 * Nothing here fabricates a score. It produces hourly buckets; the real
 * scoring engine turns those into a total, which is what makes a seeded
 * leaderboard worth looking at.
 */

export type Persona = 'sedentary' | 'average' | 'active' | 'athlete';

export const PERSONAS: readonly Persona[] = [
  'sedentary',
  'average',
  'active',
  'athlete',
];

export interface SeedBucket {
  hour: number;
  steps: number;
  distanceM: number;
  activeKcal: number;
  activeMinutes: number;
}

/** Daily step totals the personas aim at. Jitter moves each run around these. */
const PERSONA_STEPS: Record<Persona, number> = {
  sedentary: 2500,
  average: 7000,
  active: 12000,
  athlete: 18000,
};

/**
 * Relative activity by hour, 0..23. Two commute humps and a lunch bump, close
 * to nothing overnight. Not normalised by hand — generateDay divides by the
 * sum, so these stay editable without arithmetic.
 */
const HOUR_WEIGHTS = [
  0.002, 0.001, 0.001, 0.001, 0.002, 0.010, 0.035, 0.090, 0.075, 0.045,
  0.040, 0.045, 0.070, 0.050, 0.040, 0.045, 0.060, 0.095, 0.080, 0.055,
  0.045, 0.035, 0.020, 0.008,
];

const STRIDE_M = 0.72;
const KCAL_PER_STEP = 0.04;
const STEPS_PER_ACTIVE_MINUTE = 110;

/** The column's CHECK. An hour cannot hold more than sixty minutes. */
const MAX_ACTIVE_MINUTES = 60;

/** A seeding run longer than this is a mistake, not an intention. */
export const MAX_SEED_DAYS = 90;

/**
 * mulberry32 — small, fast, and good enough for shaping fake step counts.
 * Deterministic so a seeded scenario can be re-run and compared.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the parts, so a user-day always seeds the same way. */
export function hashSeed(...parts: string[]): number {
  let hash = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export function generateDay(persona: Persona, seed: number): SeedBucket[] {
  const rng = makeRng(seed);
  const target = PERSONA_STEPS[persona];
  const weightSum = HOUR_WEIGHTS.reduce((sum, w) => sum + w, 0);

  return HOUR_WEIGHTS.map((weight, hour) => {
    // ±15%, so two squadmates on the same persona do not have identical days
    // while the daily total stays recognisably that persona.
    const jitter = 0.85 + rng() * 0.3;
    const steps = Math.max(0, Math.round(((target * weight) / weightSum) * jitter));

    return {
      hour,
      steps,
      distanceM: Math.round(steps * STRIDE_M * 100) / 100,
      activeKcal: Math.round(steps * KCAL_PER_STEP * 100) / 100,
      activeMinutes: Math.min(
        MAX_ACTIVE_MINUTES,
        Math.round(steps / STEPS_PER_ACTIVE_MINUTE),
      ),
    };
  });
}

/** Inclusive of both endpoints. Dates are `YYYY-MM-DD`. */
export function expandDateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`invalid date range: ${from}..${to}`);
  }
  if (end < start) {
    throw new Error(`range end ${to} is before start ${from}`);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((end - start) / dayMs) + 1;
  if (days > MAX_SEED_DAYS) {
    throw new Error(`range spans ${days} days, more than the ${MAX_SEED_DAYS} allowed`);
  }

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(new Date(start + i * dayMs).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Which requested ids are not on the allowlist.
 *
 * The caller refuses the whole request if this is non-empty — a partial write
 * that silently skipped the unlisted users would be harder to notice than an
 * outright rejection.
 */
export function findUnlistedUsers(
  requested: string[],
  allowlisted: string[],
): string[] {
  const allowed = new Set(allowlisted);
  return [...new Set(requested)].filter((id) => !allowed.has(id));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts supabase/functions/_shared/seed-plan.test.ts
```

Expected: PASS.

If the persona-target test fails, adjust `HOUR_WEIGHTS` or the jitter band — do **not** widen the test's tolerance to accommodate the implementation.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. `seed-plan.ts` is pure TypeScript with no Deno specifiers, so it is checked by `tsc` and must not be renamed `.deno.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/seed-plan.ts supabase/functions/_shared/seed-plan.test.ts
git commit -m "Add the pure seed planner

Personas shape a realistic day and the score falls out of the real
engine, rather than working backwards from a target score — which would
teach nothing about whether the tiers themselves feel right."
```

---

## Task 4: The `seed-health` handler

**Files:**
- Create: `supabase/functions/seed-health/index.ts`

**Interfaces:**
- Consumes: everything `seed-plan.ts` produces (Task 3); `seed_test_users` (Task 2); `rescoreDay` from `../_shared/rescore.deno.ts`; `json`/`fail` from `../_shared/http.ts`
- Produces: a deployed function with three actions. Task 5 calls it.

- [ ] **Step 1: Write the handler**

Create `supabase/functions/seed-health/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fail, json } from '../_shared/http.ts';
import { rescoreDay } from '../_shared/rescore.deno.ts';
import {
  PERSONAS,
  expandDateRange,
  findUnlistedUsers,
  generateDay,
  hashSeed,
  type Persona,
} from '../_shared/seed-plan.ts';

/**
 * seed-health — development-only. NEVER deploy this to a project with real
 * users.
 *
 * Without it, testing a leaderboard means physically walking 10,000 steps and
 * testing week-3 competitive stamina is impossible for one person.
 *
 * Three guards, deliberately independent:
 *   1. SEED_SECRET must be configured AND match. Unlike finalize-days, an
 *      unset secret refuses everything rather than disabling the check — a
 *      function that fabricates scores must fail closed.
 *   2. Every target user must appear in seed_test_users. This is what makes a
 *      leaked secret survivable: it cannot reach a real player's row.
 *   3. It is not deployed to production, which is why the other two exist
 *      rather than instead of them.
 *
 * It writes health_buckets and then rescores through the same helper as
 * deploy-sabotage and finalize-days. It never writes daily_scores directly:
 * a fabricated total would mean the UI is verified against numbers the
 * scoring engine never produced.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const seedSecret = Deno.env.get('SEED_SECRET');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface CreateUsersBody {
  action: 'create-users';
  count: number;
  timezone?: string;
  namePrefix?: string;
}

interface AddToSquadBody {
  action: 'add-to-squad';
  userIds: string[];
  inviteCode: string;
}

interface SeedDaysBody {
  action: 'seed-days';
  userIds: string[];
  from: string;
  to: string;
  persona: Persona;
}

type Body = CreateUsersBody | AddToSquadBody | SeedDaysBody;

/** Refuses the whole request if any target is not allowlisted. */
async function assertAllowlisted(userIds: string[]): Promise<string | null> {
  const { data, error } = await admin
    .from('seed_test_users')
    .select('user_id')
    .in('user_id', userIds);

  if (error) return `allowlist lookup failed: ${error.message}`;

  const unlisted = findUnlistedUsers(
    userIds,
    (data ?? []).map((row: { user_id: string }) => row.user_id),
  );
  if (unlisted.length > 0) {
    return `not seed test users: ${unlisted.join(', ')}`;
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Fail closed. A missing secret must not mean "no check".
  if (!seedSecret) {
    return fail('SEED_SECRET is not configured; seed-health refuses to run', 503);
  }
  if (req.headers.get('x-seed-secret') !== seedSecret) {
    return fail('forbidden', 403);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail('invalid JSON body', 400);
  }

  if (body.action === 'create-users') {
    const count = Math.trunc(body.count);
    if (!Number.isFinite(count) || count < 1 || count > 20) {
      return fail('count must be between 1 and 20', 400);
    }

    const timezone = body.timezone ?? 'Asia/Manila';
    const prefix = body.namePrefix ?? 'Seed';
    const created: Array<{ userId: string; characterName: string }> = [];

    for (let i = 0; i < count; i++) {
      const label = `${prefix}${i + 1}`;
      const { data, error } = await admin.auth.admin.createUser({
        email: `seed-${crypto.randomUUID()}@kairo.test`,
        password: crypto.randomUUID(),
        email_confirm: true,
      });
      if (error || !data.user) {
        return fail(`user creation failed: ${error?.message ?? 'no user'}`, 500);
      }

      const userId = data.user.id;

      const { error: profileError } = await admin.from('profiles').insert({
        id: userId,
        character_name: label,
        timezone,
      });
      if (profileError) {
        return fail(`profile insert failed: ${profileError.message}`, 500);
      }

      // Recorded before any data is written, so a user can never hold seeded
      // buckets without appearing on the allowlist.
      const { error: listError } = await admin
        .from('seed_test_users')
        .insert({ user_id: userId, label });
      if (listError) {
        return fail(`allowlist insert failed: ${listError.message}`, 500);
      }

      created.push({ userId, characterName: label });
    }

    return json({ created });
  }

  if (body.action === 'add-to-squad') {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return fail('userIds must be a non-empty array', 400);
    }

    const denied = await assertAllowlisted(body.userIds);
    if (denied) return fail(denied, 403);

    const { data: squad, error: squadError } = await admin
      .from('squads')
      .select('id')
      .eq('invite_code', body.inviteCode.trim().toUpperCase())
      .maybeSingle();

    if (squadError) return fail(`squad lookup failed: ${squadError.message}`, 500);
    if (!squad) return fail('invalid invite code', 404);

    // join_squad() resolves the joiner from auth.uid(), so it can only ever add
    // the caller. Seeding therefore inserts membership directly — the table's
    // triggers still enforce the per-user squad cap and squads.max_members.
    const { error } = await admin
      .from('squad_members')
      .upsert(
        body.userIds.map((userId) => ({ squad_id: squad.id, user_id: userId })),
        { onConflict: 'squad_id,user_id' },
      );
    if (error) return fail(`membership insert failed: ${error.message}`, 500);

    return json({ squadId: squad.id, added: body.userIds.length });
  }

  if (body.action === 'seed-days') {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return fail('userIds must be a non-empty array', 400);
    }
    if (!PERSONAS.includes(body.persona)) {
      return fail(`persona must be one of: ${PERSONAS.join(', ')}`, 400);
    }

    const denied = await assertAllowlisted(body.userIds);
    if (denied) return fail(denied, 403);

    let dates: string[];
    try {
      dates = expandDateRange(body.from, body.to);
    } catch (error) {
      return fail((error as Error).message, 400);
    }

    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, timezone')
      .in('id', body.userIds);
    if (profileError) return fail(`profile lookup failed: ${profileError.message}`, 500);

    const zones = new Map(
      (profiles ?? []).map((p: { id: string; timezone: string }) => [p.id, p.timezone]),
    );

    const now = new Date();
    const seeded: Array<{ userId: string; localDate: string; total: number }> = [];

    for (const userId of body.userIds) {
      const timeZone = zones.get(userId);
      if (!timeZone) return fail(`no profile for ${userId}`, 400);

      for (const localDate of dates) {
        const buckets = generateDay(body.persona, hashSeed(userId, localDate));

        const { error } = await admin.from('health_buckets').upsert(
          buckets.map((bucket) => ({
            user_id: userId,
            local_date: localDate,
            hour: bucket.hour,
            steps: bucket.steps,
            distance_m: bucket.distanceM,
            active_kcal: bucket.activeKcal,
            active_minutes: bucket.activeMinutes,
          })),
          { onConflict: 'user_id,local_date,hour' },
        );
        if (error) return fail(`bucket upsert failed: ${error.message}`, 500);

        const result = await rescoreDay(admin, { userId, localDate, timeZone, now });
        if ('error' in result) {
          return fail(`rescore failed for ${userId} ${localDate}: ${result.error}`, 500);
        }

        seeded.push({ userId, localDate, total: result.total });
      }
    }

    return json({ seeded });
  }

  return fail('unknown action', 400);
});
```

- [ ] **Step 2: Typecheck the Deno side**

```bash
npm run typecheck
```

Expected: 0 errors. This runs `deno check` over `supabase/functions/*/index.ts`, which now includes `seed-health`.

- [ ] **Step 3: Confirm the pure module is still Node-testable**

```bash
npm test
```

Expected: all suites pass. `seed-plan.ts` must remain importable by Vitest — if this fails with a parse error about `npm:` specifiers, a Deno-only import leaked into the pure module and belongs in `index.ts` instead.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/seed-health/index.ts
git commit -m "Add the seed-health Edge Function

Writes hourly buckets and rescores through the real engine rather than
writing daily_scores directly, so a seeded leaderboard reflects what
the scoring engine actually produces.

Fails closed: an unset SEED_SECRET refuses every request rather than
disabling the check."
```

---

## Task 5: Deploy, seed a real squad, and record it

**Files:**
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing consumed later

- [ ] **Step 1: Set the secret and deploy**

```bash
openssl rand -hex 32
```

Set the printed value as the function secret (substitute it for `<value>`):

```bash
supabase secrets set SEED_SECRET=<value> --project-ref zniopywbwenrzxezolwv
supabase functions deploy seed-health --project-ref zniopywbwenrzxezolwv
```

Record the secret wherever you keep the others. Do **not** commit it.

- [ ] **Step 2: Create five fake squadmates**

```bash
curl -s -X POST "https://zniopywbwenrzxezolwv.supabase.co/functions/v1/seed-health" \
  -H "Content-Type: application/json" \
  -H "x-seed-secret: <value>" \
  -d '{"action":"create-users","count":5,"timezone":"Asia/Manila","namePrefix":"Rival"}'
```

Expected: JSON with five `{userId, characterName}` entries. Keep the ids.

- [ ] **Step 3: Confirm the allowlist guard actually bites**

Pick any UUID that is not one of the five and try to seed it:

```bash
curl -s -X POST "https://zniopywbwenrzxezolwv.supabase.co/functions/v1/seed-health" \
  -H "Content-Type: application/json" \
  -H "x-seed-secret: <value>" \
  -d '{"action":"seed-days","userIds":["00000000-0000-4000-8000-000000000000"],"from":"2026-07-28","to":"2026-07-28","persona":"average"}'
```

Expected: HTTP 403 with `not seed test users: ...`. If this succeeds, stop and report it — the guard that makes the whole design safe is not working.

Also confirm a wrong secret is refused:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "https://zniopywbwenrzxezolwv.supabase.co/functions/v1/seed-health" \
  -H "Content-Type: application/json" -H "x-seed-secret: wrong" -d '{"action":"create-users","count":1}'
```

Expected: `403`.

- [ ] **Step 4: Seed a week of activity across mixed personas**

Run `seed-days` three times over the same date range, splitting the five ids across personas so the board is not a flat line — for example two `sedentary`, two `average`, one `athlete`. Use yesterday and the six days before it.

```bash
curl -s -X POST "https://zniopywbwenrzxezolwv.supabase.co/functions/v1/seed-health" \
  -H "Content-Type: application/json" \
  -H "x-seed-secret: <value>" \
  -d '{"action":"seed-days","userIds":["<id1>","<id2>"],"from":"<7 days ago>","to":"<yesterday>","persona":"average"}'
```

Expected: JSON listing each `{userId, localDate, total}`. **Sanity-check the totals against §6's tiers** — an `average` day should land in the low thousands, not at 0 and not at the 4,400 ceiling. A total of 0 across the board means buckets were written but the rescore did not see them.

- [ ] **Step 5: Put them in your squad and look at both modes**

Create a squad in the app (or reuse one), then:

```bash
curl -s -X POST "https://zniopywbwenrzxezolwv.supabase.co/functions/v1/seed-health" \
  -H "Content-Type: application/json" \
  -H "x-seed-secret: <value>" \
  -d '{"action":"add-to-squad","userIds":["<id1>","<id2>","<id3>","<id4>","<id5>"],"inviteCode":"<CODE>"}'
```

Then read both modes:

```bash
./supabase/scripts/remote-sql.sh "select rank, character_name, local_date, total, status from public.squad_leaderboard('<squad-uuid>'::uuid, null, 'completed')"
```

Note this runs as the table owner, so `auth.uid()` is null and the function will raise `authentication required` — that is correct behaviour. Verify the mode from the app instead, or pin the check to the SQL date expression:

```bash
./supabase/scripts/remote-sql.sh "select p.character_name, p.timezone, ((now() at time zone p.timezone)::date - 1) as completed_day, ds.total from public.profiles p left join public.daily_scores ds on ds.user_id = p.id and ds.local_date = ((now() at time zone p.timezone)::date - 1) where p.id in (select user_id from public.seed_test_users) order by ds.total desc nulls last"
```

Expected: five rows with descending totals, each on that member's own completed day.

- [ ] **Step 6: Full suite**

```bash
npm test
npm run typecheck
```

Expected: all passing, 0 typecheck errors.

- [ ] **Step 7: Update the roadmap**

In `docs/roadmap.md`, change the Phase 4 block to:

```markdown
### 🟨 Phase 4 — Squads + leaderboard · 45–60h
- ✅ `squad_leaderboard` **completed-day mode** — each member ranked on their own
  yesterday, so a mixed-timezone squad compares like with like (closes deviation #6)
- ✅ `seed-health` dev-only function — personas write hourly buckets, scores come
  from the real engine via `rescoreDay`, guarded by `SEED_SECRET` plus the
  `seed_test_users` allowlist
- ⬜ Create/join by 6-digit code (RPCs exist; no UI yet)
- ⬜ Leaderboard UI — tiers and scores only (§5)
- ⬜ Realtime broadcast wired to the squad screen
```

Update deviation row 6's "owed in Phase 4" note to say it is now delivered.

Add to the Phase 8 block:

```markdown
- ⬜ **Undeploy `seed-health` before external testers join** — it fabricates
  activity, and the beta measures real behaviour
```

- [ ] **Step 8: Commit**

```bash
git add docs/roadmap.md
git commit -m "Record the completed-day mode and seed-health in the roadmap

Closes deviation #6, and flags undeploying seed-health as a Phase 8
precondition."
```

---

## Notes for whoever executes this

**Things that will look wrong and are not:**

- Calling `squad_leaderboard` through `remote-sql.sh` raises `authentication required`. That is correct — the script runs as the owner, where `auth.uid()` is null. Verify the RPC from the app or via the underlying date expression.
- A Manila member and a New York member returning **different `local_date` values in one result set** is the completed-day mode working, not a bug.
- Seeded totals will not be round numbers. They come from the real tier curve applied to jittered step counts.

**If a seeded total comes back 0**, the buckets were written but the rescore did not read them. Check that `local_date` in `health_buckets` matches the date passed to `rescoreDay` exactly — they key off each other.

**Do not add npm dependencies**, and do not put the PRNG into `packages/kairo-core`. That package is deterministic by design, and both the Expo app and the Edge Functions import it unchanged.
