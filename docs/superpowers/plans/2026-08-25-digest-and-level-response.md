# The Daily Digest and the Level Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse three scheduled pushes a day into **one digest at 08:00 local**, capped by a server-side ledger; snapshot each day's race so the digest has a result to carry; and make the character's response to levelling loud enough to see without two screenshots.

**Architecture:** `race_results` is written once by `finalize-days`, when the **last** member of a squad finalizes that date — because days are per-user local, a squad's race for date *D* is not final until every member's *D* is. The row is service-role-only and reaches clients through `race_result()`, which applies plan 1's reciprocal consent gate the same way `squad_leaderboard()` does. `dispatch-notifications` stops planning three triggers and plans one, selected by a single RPC that does the timezone arithmetic **and** the already-sent exclusion in one query — a client-side cap is not a cap, it is a race between devices. The figure's response moves out of `CharacterFigure.tsx` into a tested pure module so the bands can be widened against assertions rather than by eye.

**Tech Stack:** TypeScript (zero-dependency `@kairo/core`), Postgres/Supabase (plpgsql, `security definer`, partial unique indexes), Deno Edge Functions, React Native / Expo, Vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-08-25-digest-and-level-response-design.md` — this subsystem's design, which carries the decisions taken while planning it.
**Parent spec:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md` — authoritative for everything cross-cutting. Read both.

## This is plan 5 of 5

| Plan | Scope | Depends on |
|---|---|---|
| 1. The Race | `race.ts`, widened projection, consent gate, lanes on the Squad tab, solo ghost race | — |
| 2. Body · Motion · Mind | `STAT_NAMES` and every surface reading it | — |
| 3. The Today tab | Fourth tab, quests, disclosure change, race hero card | 1 |
| 4. Goals → Events + Battle | Table reshape, `create_event()`, `event_progress()`, pooled grading | — |
| **5. Digest + level response** (this plan) | One push a day, `race_results`, louder level bands on the figure | 1, 3, 4 |

**Depends on all three.** `race_results` snapshots plan 1's `rankRacers` output
and reads plan 1's widened projection; the digest routes to plan 3's `/today`
and reports plan 4's Event progress. Do this plan last.

**This plan also carries deviation #44** — the pivot itself, and the retention
instrumentation re-pointed at the new loop (Task 7). It is here rather than in
plan 1 because #44 is only true once every part has shipped, and a roadmap row
claiming a pivot that is four-fifths built is a row that misleads.

## Global Constraints

- **`packages/kairo-core` stays pure and zero-dependency.** No I/O, no clock reads, no randomness. Every function takes what it needs as an argument.
- **Imports use explicit `.ts` extensions.**
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`. `allowFontScaling={false}` appears nowhere in this codebase and must not start.
- **The notification cap is enforced server-side, in the dispatch query.** A client-side cap is not a cap — it is a race between devices, and the same user on a phone and a tablet would get two.
- **Never `create or replace` a function whose signature changes.** Drop by exact argument list first.
- **A migration touching a table an Edge Function writes ships with that function's redeploy**, and `supabase/scripts/smoke-sync.mjs` runs after.
- **Applying a migration on this machine** means `./supabase/scripts/remote-sql.sh -f <file>` (port 5432 is blocked, Docker unavailable), wrapped in `begin; … commit;`, then inserting the `supabase_migrations.schema_migrations` row by hand.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node.
- **`race_results` is written once and never changed.** A later Apple revision does not retract anyone's win — the same §19 rule `goal_completions` and challenge completions already follow.
- **No new runtime dependency.** `react-native-svg`, Rive and Reanimated all stay uninstalled. Task 6 is a tuning pass on primitives, not an animation build (spec §5.4).
- **`__DEV__` must not gate anything that needs to work on TestFlight.** The digest and the figure both ship in Release.

## One refinement of the spec, decided here

**`race_results` carries the full snapshot and is read through an RPC, not
selected directly.** Spec §7.3 defines the table and says `standings` holds
"the snapshotted rank, capped steps and species per member". Plan 1 put raw
steps behind a reciprocal consent gate, and a stored historical row cannot carry
a per-viewer gate inside itself — the same JSON is read by six different people.

So the table stores everything and **grants `authenticated` nothing at all**;
`race_result(squad_id, local_date)` is a `security definer` function applying
exactly the gate `squad_leaderboard()` applies, returning `NULL` capped steps
for a member either side has not consented for. Rank and species are returned
unconditionally — a rank is not a health figure, and species is already in two
projections (deviation #40). The checkable invariant is stronger than a policy:
**no client role holds SELECT on `race_results`**, and a schema test pins it.

---

### Task 1: `race_results` and its gated read

**Files:**
- Create: `supabase/migrations/20260829090000_race_results.sql`
- Modify: `supabase/tests/schema.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `profiles.squad_data_consent_at` (plan 1, Task 2).
- Produces: `public.race_results(squad_id, local_date, standings jsonb, finalized_at)` and `public.race_result(uuid, date)`. Tasks 2 and 5 consume these.

- [ ] **Step 1: Write the failing schema test**

Add to `supabase/tests/schema.test.ts`:

```ts
describe('race_results (deviation #46, spec §7.3)', () => {
  const standings = [
    { user_id: null, rank: 1, capped_steps: 10_000, species: 'eagle' },
    { user_id: null, rank: 2, capped_steps: 6_400, species: 'tamaraw' },
  ];

  it('grants no client role SELECT — the row is read through race_result()', async () => {
    // Stronger than a policy and easier to check: the table is invisible to
    // every client session, so a per-viewer consent gate cannot be bypassed by
    // selecting the JSON directly.
    const { rows } = await db.query(
      `select privilege_type from information_schema.role_table_grants
        where table_name = 'race_results' and grantee in ('anon', 'authenticated')`,
    );
    expect(rows).toEqual([]);
  });

  it('is written once per squad per date', async () => {
    await db.query(
      `insert into public.race_results (squad_id, local_date, standings)
       values ($1, $2, $3::jsonb)`,
      [squadId, today, JSON.stringify(standings)],
    );
    await expect(
      db.query(
        `insert into public.race_results (squad_id, local_date, standings)
         values ($1, $2, $3::jsonb)`,
        [squadId, today, JSON.stringify(standings)],
      ),
    ).rejects.toThrow();
  });

  it('returns rank and species to a squadmate without any consent', async () => {
    await db.query(
      `insert into public.race_results (squad_id, local_date, standings)
       values ($1, $2, $3::jsonb)`,
      [squadId, today, JSON.stringify([{ user_id: bob, rank: 1, capped_steps: 9_100, species: 'eagle' }])],
    );
    const result = await asUser(alice, (sql) =>
      sql(`select * from public.race_result($1, $2)`, [squadId, today]),
    );
    expect(result.rows[0].rank).toBe(1);
    expect(result.rows[0].species).toBe('eagle');
    expect(result.rows[0].capped_steps).toBeNull();
  });

  it('returns capped steps only when both sides have consented', async () => {
    await db.query(
      `insert into public.race_results (squad_id, local_date, standings)
       values ($1, $2, $3::jsonb)`,
      [squadId, today, JSON.stringify([{ user_id: bob, rank: 1, capped_steps: 9_100, species: 'eagle' }])],
    );
    await consent(alice);
    await consent(bob);
    const result = await asUser(alice, (sql) =>
      sql(`select * from public.race_result($1, $2)`, [squadId, today]),
    );
    expect(result.rows[0].capped_steps).toBe(9_100);
  });

  it('refuses a caller who is not in the squad', async () => {
    await db.query(
      `insert into public.race_results (squad_id, local_date, standings)
       values ($1, $2, $3::jsonb)`,
      [squadId, today, JSON.stringify(standings)],
    );
    await expect(
      asUser(carol, (sql) => sql(`select * from public.race_result($1, $2)`, [squadId, today])),
    ).rejects.toThrow();
  });

  it('returns nothing for a day with no result yet, rather than raising', async () => {
    // The common case for today and for any day where one member is still
    // living in it. An empty set is what the digest reads as "no result".
    const result = await asUser(alice, (sql) =>
      sql(`select * from public.race_result($1, $2)`, [squadId, '2020-01-01']),
    );
    expect(result.rows).toHaveLength(0);
  });
});
```

`consent` is the helper plan 1 added; `carol` is a user in no squad.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "race_results"`
Expected: FAIL — `relation "public.race_results" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260829090000_race_results.sql`:

```sql
-- The race, snapshotted (spec §7.3, deviation #46).
--
-- Written ONCE by finalize-days, when the LAST member of a squad finalizes that
-- local date. Because days are per-user local (§2), a squad spans several
-- calendar dates at any instant, so a squad's race for date D is not final
-- until every member's D is — and a result written before that would crown
-- whoever's timezone happens to be furthest west.
--
-- After it is written the row never changes: a later Apple revision does not
-- retract anyone's win. That is the same §19 rule goal completions and
-- challenge completions already follow, and it is why the standings are
-- snapshotted at all — the underlying projection can no longer answer "who won
-- on 14 March" once the buckets behind it have been revised.
--
-- **No client role holds SELECT on this table.** A stored row is read by every
-- member of the squad, so it cannot carry a per-viewer consent gate inside
-- itself; race_result() below applies exactly the gate squad_leaderboard()
-- applies. The absent grant is the invariant, and a schema test pins it.

begin;

create table public.race_results (
  squad_id uuid not null references public.squads (id) on delete cascade,
  -- The date every member of the squad has now finished. Per-user local dates
  -- agree on the *label* even when they end at different instants, which is
  -- what makes one row per squad per date coherent at all.
  local_date date not null,
  -- [{ user_id, rank, capped_steps, species }] — snapshotted, not projected.
  standings jsonb not null,
  finalized_at timestamptz not null default now(),
  primary key (squad_id, local_date)
);

comment on table public.race_results is
  'One squad-day of the race, snapshotted when the LAST member finalizes that date. Write-once: a later Apple revision never retracts a win (§19 rule). Service-role writes only, and NO client SELECT grant — read it through race_result(), which applies the reciprocal consent gate from deviation #47.';

comment on column public.race_results.standings is
  'Array of { user_id, rank, capped_steps, species }. capped_steps is min(steps, DAILY_STEP_BASELINE) as rankRacers() computed it — the race cap, not the raw figure. Stored ungated because one row serves every viewer; race_result() withholds it per viewer.';

create index race_results_squad_idx on public.race_results (squad_id, local_date desc);

alter table public.race_results enable row level security;

-- No policy and no grant. Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new
-- public tables to `authenticated`, and ALL includes TRUNCATE, which RLS does
-- not restrict — so the revoke is not decorative.
revoke all on public.race_results from anon, authenticated;

-- ---------------------------------------------------------------------------
-- race_result — the gated read
-- ---------------------------------------------------------------------------

create function public.race_result(p_squad_id uuid, p_local_date date)
returns table (
  user_id uuid,
  character_name text,
  species text,
  rank integer,
  capped_steps integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- auth.uid() wins whenever it exists, exactly as in squad_leaderboard().
  -- There is no p_as_user here on purpose: the digest reads the table directly
  -- with the service role, so no JWT-less client path needs one, and a
  -- parameter naming the viewer is one bug away from reading as somebody else.
  v_user uuid := (select auth.uid());
  v_viewer_consent boolean;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and squad_members.user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  select p.squad_data_consent_at is not null
    into v_viewer_consent
    from public.profiles p
   where p.id = v_user;

  return query
  select
    (s->>'user_id')::uuid,
    p.character_name,
    s->>'species',
    (s->>'rank')::integer,
    -- Rank and species are returned unconditionally: a rank is not a health
    -- figure, and species is already in two projections (deviation #40).
    -- Capped steps are the disclosure, and they carry the same reciprocal gate
    -- squad_leaderboard()'s raw totals do.
    case
      when v_viewer_consent and p.squad_data_consent_at is not null
      then (s->>'capped_steps')::integer
    end
  from public.race_results r
  cross join lateral jsonb_array_elements(r.standings) s
  left join public.profiles p on p.id = (s->>'user_id')::uuid
  where r.squad_id = p_squad_id and r.local_date = p_local_date
  order by (s->>'rank')::integer;
end;
$$;

comment on function public.race_result(uuid, date) is
  'One finalized squad-day of the race. Rank and species unconditionally; capped steps only when the viewer AND the member have both consented (deviation #47). Returns no rows for a date with no result yet, which is the normal case for today and for any date a member is still living in — the caller reads an empty set as "no result", never as an error.';

revoke all on function public.race_result(uuid, date) from public, anon;
grant execute on function public.race_result(uuid, date) to authenticated;

commit;
```

- [ ] **Step 4: Run the whole schema suite and confirm it passes**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Apply against the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260829090000_race_results.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260829090000')"
./supabase/scripts/remote-sql.sh "select grantee, privilege_type from information_schema.role_table_grants where table_name = 'race_results'"
```

Expected: the grant listing shows no `anon` and no `authenticated` row. Anything
else means the default privileges won and the consent gate is bypassable.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260829090000_race_results.sql supabase/tests/schema.test.ts
git commit -m "feat(db): snapshot each squad-day of the race behind a gated read"
```

---

### Task 2: `finalize-days` writes the result

**Files:**
- Create: `supabase/functions/_shared/race-result-plan.ts`
- Create: `supabase/functions/_shared/race-result-plan.test.ts`
- Modify: `supabase/functions/finalize-days/index.ts`

**Interfaces:**
- Consumes: `rankRacers` from `@kairo/core` (plan 1) via `_shared/core.ts`; `race_results` from Task 1.
- Produces: `squadDayIsComplete()`, `buildStandings()`. Nothing later consumes them directly; Task 5 reads the rows they write.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/race-result-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildStandings, squadDayIsComplete } from './race-result-plan.ts';

describe('squadDayIsComplete', () => {
  it('is true only when every member has a final row for that date', () => {
    // Days are per-user local, so a squad spans several calendar dates at any
    // instant. Writing the result when the first member finalizes would crown
    // whoever's timezone happens to be furthest west.
    expect(
      squadDayIsComplete({
        members: ['a', 'b', 'c'],
        finalUserIds: ['a', 'b', 'c'],
      }),
    ).toBe(true);
  });

  it('is false while one member is still living in that date', () => {
    expect(
      squadDayIsComplete({ members: ['a', 'b', 'c'], finalUserIds: ['a', 'b'] }),
    ).toBe(false);
  });

  it('is false for an empty squad rather than vacuously true', () => {
    // `every` over an empty list is true, which would write an empty standings
    // row for a squad nobody is in and permanently occupy the primary key.
    expect(squadDayIsComplete({ members: [], finalUserIds: [] })).toBe(false);
  });

  it('ignores a final row from somebody who has since left', () => {
    expect(
      squadDayIsComplete({ members: ['a', 'b'], finalUserIds: ['a', 'b', 'gone'] }),
    ).toBe(true);
  });
});

describe('buildStandings', () => {
  const rows = [
    { user_id: 'slow', character_name: 'Tala', species: 'tamaraw', steps: 4_000, total: 1_800 },
    { user_id: 'fast', character_name: 'Bayani', species: 'eagle', steps: 40_000, total: 3_100 },
    { user_id: 'broad', character_name: 'Diwa', species: 'carabao', steps: 12_000, total: 4_000 },
  ];

  it('ranks by CAPPED steps, so a 40,000-step day does not out-rank a 12,000 one', () => {
    // The finish line is the anti-cheat. Both of these are past it, so the tie
    // falls through to the daily score — which is the whole point of the cap.
    const standings = buildStandings(rows);
    expect(standings.map((s) => s.user_id)).toEqual(['broad', 'fast', 'slow']);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('stores the capped figure, never the raw one', () => {
    const standings = buildStandings(rows);
    expect(standings.find((s) => s.user_id === 'fast')!.capped_steps).toBeLessThan(40_000);
  });

  it('carries species, and null for anyone predating the choice', () => {
    const standings = buildStandings([
      { user_id: 'old', character_name: 'Ana', species: null, steps: 100, total: 10 },
    ]);
    expect(standings[0]!.species).toBeNull();
  });

  it('treats a withheld step count as zero rather than dropping the member', () => {
    // A member who has not consented still ran the race and still belongs in
    // the history. Dropping them would make the stored result disagree with
    // the board everybody watched all day.
    const standings = buildStandings([
      { user_id: 'quiet', character_name: 'Noel', species: null, steps: null, total: 900 },
      { user_id: 'loud', character_name: 'Rey', species: null, steps: 5_000, total: 800 },
    ]);
    expect(standings).toHaveLength(2);
    expect(standings.find((s) => s.user_id === 'quiet')!.capped_steps).toBe(0);
  });

  it('returns nothing for an empty board', () => {
    expect(buildStandings([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/race-result-plan.test.ts`
Expected: FAIL — cannot resolve `./race-result-plan.ts`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/race-result-plan.ts`:

```ts
import { rankRacers } from './core.ts';

/**
 * The race-snapshot half of `finalize-days`, kept free of I/O so it can be
 * tested in plain Node with no Deno, no Docker and no database.
 *
 * Nothing here re-implements the ranking — `rankRacers()` in `@kairo/core` is
 * the single implementation, and the client's live track calls the same
 * function. A second ordering here would mean the history disagreed with the
 * board everybody watched all day, which is the one thing a snapshot exists to
 * prevent.
 */

export interface StandingRow {
  user_id: string;
  rank: number;
  capped_steps: number;
  species: string | null;
}

/**
 * Whether every member of the squad has finalized that local date.
 *
 * Days are per-user local (§2), so a squad spans several calendar dates at any
 * instant and its race for date *D* is not final until every member's *D* is.
 * Writing on the first member's finalization would crown whoever's timezone
 * happens to be furthest west.
 *
 * An empty roster is **false**, not vacuously true: `every` over an empty list
 * is true, which would write an empty standings row and permanently occupy the
 * primary key for a squad nobody is in — and the row is write-once, so nothing
 * would ever correct it.
 */
export function squadDayIsComplete(input: {
  members: readonly string[];
  finalUserIds: readonly string[];
}): boolean {
  if (input.members.length === 0) return false;
  const final = new Set(input.finalUserIds);
  return input.members.every((id) => final.has(id));
}

/**
 * The board, as a stored standing.
 *
 * `steps` may be null — that is a member who has not consented, as
 * `squad_leaderboard()` withholds it. They read as **zero rather than absent**:
 * a member who has not shared their figure still ran the race and still belongs
 * in the history, and dropping them would make the stored result disagree with
 * the board their squad watched. Their stored `capped_steps` of 0 is then
 * withheld again on the way out by `race_result()`, so nothing is disclosed by
 * the substitution.
 */
export function buildStandings(
  rows: readonly {
    user_id: string;
    character_name: string;
    species: string | null;
    steps: number | null;
    total: number;
  }[],
): StandingRow[] {
  return rankRacers(
    rows.map((r) => ({
      userId: r.user_id,
      characterName: r.character_name,
      species: r.species,
      steps: r.steps ?? 0,
      total: r.total,
      isSelf: false,
    })),
  ).map((racer) => ({
    user_id: racer.userId,
    rank: racer.rank,
    capped_steps: racer.cappedSteps,
    species: racer.species,
  }));
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/race-result-plan.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Wire it into the handler**

In `supabase/functions/finalize-days/index.ts`, add the import and this function:

```ts
import { buildStandings, squadDayIsComplete } from '../_shared/race-result-plan.ts';

/**
 * Snapshot the squad's race for this date, if the squad has now finished it.
 *
 * **Last member wins the write, not the first.** Days are per-user local, so
 * this runs on every member's finalization and does nothing until the final
 * one. The `on conflict do nothing` is what makes that safe under overlapping
 * cron runs and under two members finalizing in the same second.
 *
 * The board is read with `p_as_user` set to the member whose day just closed,
 * so a member who has not consented arrives with `steps: null` —
 * `buildStandings` reads that as zero and keeps them in the standing, and
 * `race_result()` withholds it again on the way out.
 */
async function settleRace(
  candidate: { user_id: string; local_date: string },
): Promise<void> {
  const { data: mySquads } = await admin
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', candidate.user_id);

  for (const { squad_id } of mySquads ?? []) {
    // Cheap early exit: a result already written is never rewritten.
    const { data: existing } = await admin
      .from('race_results')
      .select('squad_id')
      .eq('squad_id', squad_id)
      .eq('local_date', candidate.local_date)
      .maybeSingle();
    if (existing) continue;

    const [{ data: memberRows }, { data: finalRows }] = await Promise.all([
      admin.from('squad_members').select('user_id').eq('squad_id', squad_id),
      admin
        .from('daily_scores')
        .select('user_id')
        .eq('local_date', candidate.local_date)
        .eq('status', 'final'),
    ]);

    const members = (memberRows ?? []).map((r: { user_id: string }) => r.user_id);
    const finalUserIds = (finalRows ?? []).map((r: { user_id: string }) => r.user_id);
    if (!squadDayIsComplete({ members, finalUserIds })) continue;

    const { data: board, error } = await admin.rpc('squad_leaderboard', {
      p_squad_id: squad_id,
      p_local_date: candidate.local_date,
      p_mode: 'current',
      p_as_user: candidate.user_id,
    });
    if (error) throw new Error(`race board read failed: ${error.message}`);

    const standings = buildStandings((board ?? []) as Parameters<typeof buildStandings>[0]);
    if (standings.length === 0) continue;

    // Write-once. `ignoreDuplicates` rather than an upsert of the values: two
    // members finalizing in the same second must produce one row, and the
    // first one written is as good as the second — they are computed from the
    // same finalized days.
    const { error: writeError } = await admin
      .from('race_results')
      .upsert(
        [{ squad_id, local_date: candidate.local_date, standings }],
        { onConflict: 'squad_id,local_date', ignoreDuplicates: true },
      );
    if (writeError) throw new Error(`race result write failed: ${writeError.message}`);
  }
}
```

Call it from the per-candidate loop, **after** the streak fold and **before** the
events section:

```ts
    // ---- race ------------------------------------------------------------
    //
    // After the streak fold, because the day must be final in the database
    // before squad_leaderboard() reads it. Before events for no reason beyond
    // ordering — the two are independent.
    try {
      await settleRace(candidate);
    } catch (error) {
      // Wrapped separately: a failed snapshot must never stop a day from
      // becoming final. The day is the durable thing; the standing can be
      // written by the next member's finalization, and if nobody's is left,
      // the squad simply has no history row for that date — which the digest
      // and the history screen both already read as "no result".
      console.error('[finalize-days] race settle failed', candidate.user_id, error);
    }
```

- [ ] **Step 6: Deploy and smoke**

The migration in Task 1 created a table this function writes, so **the two ship
together**.

```bash
npx vitest run --config vitest.config.ts supabase/functions/
npm run typecheck
supabase functions deploy finalize-days --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs
```

Then, after the next hourly run, confirm a row appeared:

```bash
./supabase/scripts/remote-sql.sh "select squad_id, local_date, jsonb_array_length(standings) from public.race_results order by local_date desc limit 5"
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/race-result-plan.ts supabase/functions/_shared/race-result-plan.test.ts supabase/functions/finalize-days/index.ts
git commit -m "feat(finalize-days): snapshot a squad's race when its last member closes the day"
```

---

### Task 3: One trigger, one hour, one sentence

**Files:**
- Modify: `packages/kairo-core/src/notifications.ts`, `notifications.test.ts`
- Modify: `supabase/functions/_shared/notification-plan.ts`, `notification-plan.test.ts`
- Modify: `supabase/functions/_shared/notification-copy.ts`, `notification-copy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `'daily_digest'` as a `NotificationTrigger`; `DIGEST_HOUR`, `planDigest()`; `digestCopy()`. Tasks 4 and 5 consume these.

- [ ] **Step 1: Write the failing tests**

Replace the `DISPATCH_HOURS` and `planHourlyDispatch` cases in
`supabase/functions/_shared/notification-plan.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { DIGEST_HOUR, planDigest, type DispatchUser } from './notification-plan.ts';

const user = (over: Partial<DispatchUser> = {}): DispatchUser => ({
  userId: 'u1',
  localDate: '2026-08-26',
  timeZone: 'Asia/Manila',
  ...over,
});

describe('DIGEST_HOUR', () => {
  it('is the morning, not the finalization moment', () => {
    // Results finalize roughly two hours after each user's local midnight, so
    // a digest carrying the finalized result would fire at about 2am. The two
    // are decoupled deliberately (spec §4.2): finalize-days writes the result
    // when the day closes, and this sends it when the user is awake.
    expect(DIGEST_HOUR).toBe(8);
  });
});

describe('planDigest', () => {
  it('carries yesterday as the result and today as the standing', () => {
    const [candidate] = planDigest({ hour: DIGEST_HOUR, users: [user()] });
    expect(candidate!.trigger).toBe('daily_digest');
    expect(candidate!.data.resultDate).toBe('2026-08-25');
    expect(candidate!.data.standingDate).toBe('2026-08-26');
    expect(candidate!.data.sendDate).toBe('2026-08-26');
  });

  it('emits nothing on the other twenty-three hours', () => {
    // The cron still fires on all of them, so this is the normal path, not an
    // error.
    expect(planDigest({ hour: 9, users: [user()] })).toEqual([]);
    expect(planDigest({ hour: 0, users: [user()] })).toEqual([]);
  });

  it('emits one candidate per user and no more', () => {
    const candidates = planDigest({
      hour: DIGEST_HOUR,
      users: [user({ userId: 'a' }), user({ userId: 'b' })],
    });
    expect(candidates).toHaveLength(2);
  });

  it('emits nothing for nobody', () => {
    expect(planDigest({ hour: DIGEST_HOUR, users: [] })).toEqual([]);
  });
});
```

Add to `packages/kairo-core/src/notifications.test.ts`:

```ts
describe('the digest budget', () => {
  it('admits one digest a day', () => {
    const [admitted] = planNotifications({
      candidates: [{ trigger: 'daily_digest', userId: 'u1', data: {} }],
      sentToday: 0,
      localNow: { hour: 8, minute: 0 },
    });
    expect(admitted).toBeDefined();
  });

  it('is not quiet-hours exempt, because 08:00 is never in quiet hours', () => {
    // The exemptions the retired evening pair needed were for 23:00 and 00:00.
    // A digest that fired inside quiet hours would be a scheduling bug, and an
    // exemption would hide it.
    expect(QUIET_HOURS_EXEMPT).not.toContain('daily_digest');
  });

  it('spends budget, so nothing can slip a second one past the cap', () => {
    expect(countsAgainstBudget('daily_digest')).toBe(true);
  });
});
```

- [ ] **Step 2: Run both and confirm they fail**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/notification-plan.test.ts && npm run test:core -- --run src/notifications.test.ts`
Expected: FAIL — `DIGEST_HOUR` and `planDigest` do not exist, and
`'daily_digest'` is not a `NotificationTrigger`.

- [ ] **Step 3: Widen the trigger**

In `packages/kairo-core/src/notifications.ts`:

```ts
export type NotificationTrigger =
  /**
   * The one scheduled push (roadmap deviation #52). 08:00 in the recipient's
   * own timezone, carrying yesterday's final race result and today's live
   * standing.
   */
  | 'daily_digest'
  /**
   * **Historical, all three.** The §14 evening loop — 23:00, 00:00 and the
   * mid-morning nudge — was retired on 2026-08-25 when three pushes a day
   * became one. They stay in the union because `notification_log.kind` is free
   * text with no check constraint: rows already say them, `countsAgainstBudget`
   * reads them, and a historical value matching no case is a tap that goes
   * nowhere. Nothing emits them any more.
   */
  | 'day_ending_soon'
  | 'day_ends'
  | 'day_starts'
  | 'event_completed'
  /** Historical. Retired 2026-08-25 with Goals — see deviation #45. */
  | 'goal_completed'
  | 'challenge_cleared';
```

Leave `MAX_NOTIFICATIONS_PER_DAY` at 3 and say why in a comment: the budget is
the *ceiling*, and the digest plus an event completion plus a challenge clear is
still three. Deviation #52 caps the **scheduled** pushes at one; it does not
remove the budget that bounds the event-driven ones.

Leave `QUIET_HOURS_EXEMPT` naming the two retired triggers — they are historical
values and the list is read by `countsAgainstBudget`'s sibling — and add a
comment saying `daily_digest` is deliberately absent because 08:00 is never in
quiet hours, so needing an exemption would mean the schedule was wrong.

- [ ] **Step 4: Rewrite the planner**

In `supabase/functions/_shared/notification-plan.ts`, replace `DISPATCH_HOURS`,
`ScheduledTrigger` and `planHourlyDispatch`:

```ts
/**
 * The one local hour the app dispatches on (roadmap deviation #52).
 *
 * **08:00, and deliberately not the finalization moment.** Results finalize
 * roughly two hours after each user's local midnight, so a digest carrying the
 * finalized result would fire at about 2am. The two are decoupled:
 * `finalize-days` writes the result when the day closes, and this sends it when
 * the recipient is awake to read it.
 *
 * The cron still fires hourly and twenty-three of those hours produce nothing.
 * That is the normal path, not an error — every hour of the day is somebody's
 * 08:00, and the same run that greets a Manila player greets a New York one
 * thirteen hours later.
 */
export const DIGEST_HOUR = 8;

export type ScheduledTrigger = Extract<NotificationTrigger, 'daily_digest'>;

export interface DispatchUser {
  userId: string;
  /** The date the user is currently living in. */
  localDate: string;
  timeZone: string;
}

export type DispatchData = {
  /** The date whose *result* the digest carries — yesterday. */
  resultDate: string;
  /** The date whose *standing* it carries — today, still being run. */
  standingDate: string;
  /** The local date the budget ledger records. Always today. */
  sendDate: string;
  timeZone: string;
};

export interface DispatchCandidate extends Candidate {
  trigger: ScheduledTrigger;
  data: DispatchData;
}

/**
 * Turn "these users are at local hour H" into the one thing that may be sent.
 *
 * Note there is no `now` parameter. The local date arrives from SQL, where the
 * timezone arithmetic already happened; re-deriving it here from a UTC instant
 * would be a second implementation of the thing this function is downstream of.
 *
 * **It does not enforce the once-a-day cap and must not try.** The cap is a
 * server-side ledger applied in the selection query (`users_needing_digest`),
 * because a cap applied after selection is a cap this function cannot see
 * across two invocations of the cron.
 */
export function planDigest(input: {
  hour: number;
  users: readonly DispatchUser[];
}): DispatchCandidate[] {
  if (input.hour !== DIGEST_HOUR) return [];

  return input.users.map((user) => ({
    trigger: 'daily_digest' as const,
    userId: user.userId,
    data: {
      resultDate: previousDay(user.localDate),
      standingDate: user.localDate,
      sendDate: user.localDate,
      timeZone: user.timeZone,
    },
  }));
}
```

- [ ] **Step 5: Write the digest copy**

In `supabase/functions/_shared/notification-copy.ts`, add `digestCopy` and keep
`notificationCopy`'s exhaustive switch working by routing `daily_digest` to it.

The digest has four states and each needs its own sentence, because a single
template with holes reads as a template:

```ts
export interface DigestFacts {
  /** Yesterday's finished race, if the squad has one. */
  result?: { rank: number; racers: number } | null;
  /** Today's live standing, if the user is in a squad. */
  standing?: { rank: number; racers: number } | null;
  /** A live Event's pooled progress, 0–1. */
  eventFraction?: number | null;
  inSquad: boolean;
}

/**
 * The one push a day.
 *
 * Four states, four sentences. A single template with holes ("You were {rank}.
 * You are {rank}.") reads as a template on the second morning, and this is the
 * only push most users will ever see — so it carries the whole relationship the
 * app has with somebody who has not opened it yet.
 *
 * **A solo user gets a digest too**, and it never mentions rank: they are
 * racing their own past days (spec §5.1) and "1st of 4" against three ghosts
 * would be a claim about other people that is not true.
 */
export function digestCopy(facts: DigestFacts): { title: string; body: string } {
  if (!facts.inSquad) {
    return {
      title: 'A new day. 🌤',
      body: 'Your track is clear. Beat yesterday.',
    };
  }

  if (facts.result && facts.result.rank === 1) {
    return {
      title: 'You won yesterday. 🏁',
      body: 'The flag resets this morning. Line up again.',
    };
  }

  if (facts.result) {
    return {
      title: `${ordinal(facts.result.rank)} yesterday.`,
      body: 'Everyone starts level this morning.',
    };
  }

  if (facts.standing) {
    return {
      title: 'The race is on. 🏁',
      body: `You are ${ordinal(facts.standing.rank)} of ${facts.standing.racers} so far today.`,
    };
  }

  return {
    title: 'A new day. 🌤',
    body: 'Your squad is lining up.',
  };
}
```

Add an `ordinal` helper if the file has none, and add cases to
`notification-copy.test.ts` pinning each of the five branches plus the
`eventFraction` clause you choose to append.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/ && npm run test:core`
Expected: PASS. Some existing `notification-plan.test.ts` cases assert the three
retired hours; delete those cases rather than adapting them — the behaviour they
pin no longer exists.

- [ ] **Step 7: Commit**

```bash
npm run typecheck
git add packages/kairo-core/src/notifications.ts packages/kairo-core/src/notifications.test.ts supabase/functions/_shared/notification-plan.ts supabase/functions/_shared/notification-plan.test.ts supabase/functions/_shared/notification-copy.ts supabase/functions/_shared/notification-copy.test.ts
git commit -m "feat(notifications): plan one digest a day instead of three pushes"
```

---

### Task 4: The server-side cap

**Files:**
- Create: `supabase/migrations/20260829100000_digest_ledger.sql`
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: `notification_log`, `profiles.timezone`.
- Produces: a partial unique index on `notification_log`, and `public.users_needing_digest(p_hour integer)`. Task 5 consumes the function.

Spec §4.2: the cap is enforced **server-side, in the dispatch query**, not by
client suppression. One row per user per local date in a sent-digest ledger; the
query excludes anyone already sent.

`notification_log` already **is** that ledger — it records `(user_id, kind,
local_date)` for every successful send. A second table would be a second thing
to keep in step, so this adds a partial unique index instead and puts the
exclusion in the selection query.

- [ ] **Step 1: Write the failing schema test**

Add to `supabase/tests/schema.test.ts`:

```ts
describe('the digest ledger (deviation #52)', () => {
  it('refuses a second digest for the same user on the same local date', async () => {
    await db.query(
      `insert into public.notification_log (user_id, kind, local_date) values ($1, 'daily_digest', $2)`,
      [alice, today],
    );
    await expect(
      db.query(
        `insert into public.notification_log (user_id, kind, local_date) values ($1, 'daily_digest', $2)`,
        [alice, today],
      ),
    ).rejects.toThrow();
  });

  it('leaves every other kind free to repeat', async () => {
    // The budget in kairo-core bounds those; this index is only about the one
    // scheduled push, and constraining the rest here would move a rule out of
    // the module that owns it.
    await db.query(
      `insert into public.notification_log (user_id, kind, local_date) values ($1, 'event_completed', $2)`,
      [alice, today],
    );
    await db.query(
      `insert into public.notification_log (user_id, kind, local_date) values ($1, 'event_completed', $2)`,
      [alice, today],
    );
    const { rows } = await db.query(
      `select count(*)::int as n from public.notification_log where user_id = $1 and kind = 'event_completed'`,
      [alice],
    );
    expect(rows[0].n).toBe(2);
  });

  it('excludes anyone already sent from the selection query', async () => {
    const before = await db.query(`select * from public.users_needing_digest(8)`);
    const listed = before.rows.map((r: any) => r.user_id);
    if (listed.length > 0) {
      await db.query(
        `insert into public.notification_log (user_id, kind, local_date)
         select user_id, 'daily_digest', local_date from public.users_needing_digest(8)`,
      );
      const after = await db.query(`select * from public.users_needing_digest(8)`);
      expect(after.rows).toHaveLength(0);
    }
  });

  it('is not reachable from a client session', async () => {
    await expect(
      asUser(alice, (sql) => sql(`select * from public.users_needing_digest(8)`)),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "digest ledger"`
Expected: FAIL — the duplicate insert succeeds and `users_needing_digest` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260829100000_digest_ledger.sql`:

```sql
-- One digest per user per local day, capped in the database (deviation #52).
--
-- **A client-side cap is not a cap** — it is a race between devices, and the
-- same account on a phone and a tablet would get two. The rule lives in two
-- places here and both are load-bearing:
--
--   1. A PARTIAL UNIQUE INDEX, so a second insert fails even if the selection
--      query is wrong. This is the guarantee.
--   2. An exclusion inside users_needing_digest(), so the ordinary path never
--      attempts the second send at all. This is the behaviour.
--
-- notification_log already IS the ledger spec §4.2 asks for: it records
-- (user_id, kind, local_date) for every successful send. A second table would
-- be a second thing to keep in step with it.

begin;

create unique index notification_log_one_digest_per_day
  on public.notification_log (user_id, local_date)
  where kind = 'daily_digest';

comment on index public.notification_log_one_digest_per_day is
  'Deviation #52: at most one daily_digest per recipient per local date. Partial, so every other kind stays free to repeat — those are bounded by MAX_NOTIFICATIONS_PER_DAY in kairo-core, and moving that rule here would take it out of the module that owns it.';

-- ---------------------------------------------------------------------------
-- users_needing_digest
-- ---------------------------------------------------------------------------
--
-- Replaces the three-hour users_at_local_hour() sweep. The timezone arithmetic
-- stays in SQL, next to the data, and the already-sent exclusion joins it — one
-- query, so there is no window between deciding and checking.
--
-- users_at_local_hour() is NOT dropped: replay-scores and any future scheduled
-- push still want it, and dropping a general helper because one caller stopped
-- using it is how the next feature ends up reimplementing it.

create function public.users_needing_digest(p_hour integer)
returns table (
  user_id uuid,
  local_date date,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    (now() at time zone p.timezone)::date,
    p.timezone
  from public.profiles p
  where extract(hour from (now() at time zone p.timezone)) = p_hour
    and not exists (
      select 1 from public.notification_log n
      where n.user_id = p.id
        and n.kind = 'daily_digest'
        and n.local_date = (now() at time zone p.timezone)::date
    );
$$;

comment on function public.users_needing_digest(integer) is
  'Recipients living at local hour p_hour who have not already had today''s digest. The exclusion is the cap (deviation #52) and notification_log_one_digest_per_day is its backstop. Cron-only: EXECUTE is revoked from anon and authenticated, because it enumerates every user.';

-- Creating a function grants EXECUTE to PUBLIC by default. This enumerates
-- every user in the system, so it must never be reachable from a client
-- session — the same posture kairo_retention() takes.
revoke all on function public.users_needing_digest(integer) from public;
revoke all on function public.users_needing_digest(integer) from anon, authenticated;

commit;
```

- [ ] **Step 4: Run the schema suite and confirm it passes**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply against the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260829100000_digest_ledger.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260829100000')"
./supabase/scripts/remote-sql.sh "select count(*) from public.users_needing_digest(extract(hour from now() at time zone 'Asia/Manila')::integer)"
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260829100000_digest_ledger.sql supabase/tests/schema.test.ts
git commit -m "feat(db): cap the daily digest server-side"
```

---

### Task 5: `dispatch-notifications` sends one thing

**Files:**
- Modify: `supabase/functions/dispatch-notifications/index.ts`

**Interfaces:**
- Consumes: `DIGEST_HOUR`, `planDigest` (Task 3); `digestCopy` (Task 3); `users_needing_digest` (Task 4); `race_result` / `race_results` (Task 1); `challenge_events` and `event_progress` (plan 4).
- Produces: nothing consumed later.

- [ ] **Step 1: Replace the hour sweep**

In `supabase/functions/dispatch-notifications/index.ts`, replace the three-hour
loop and `usersWhoOpenedToday` with one call:

```ts
  const now = new Date();
  const localHour = Number(new Date().getUTCHours()); // see below — do NOT use this

  // The hour is decided in SQL, not here. `users_needing_digest` compares each
  // recipient's own local hour against the argument, so the handler passes the
  // constant and the database does the arithmetic — the same division
  // `users_at_local_hour` already used, and the reason there is no timezone
  // library in this function.
  const { data: userRows, error: userError } = await admin.rpc('users_needing_digest', {
    p_hour: DIGEST_HOUR,
  });
  if (userError) return fail(`digest lookup failed: ${userError.message}`, 500);

  const candidates = planDigest({
    hour: DIGEST_HOUR,
    users: (userRows ?? []).map((row: Record<string, unknown>) => ({
      userId: row.user_id as string,
      localDate: row.local_date as string,
      timeZone: row.timezone as string,
    })),
  });
```

Delete the `localHour` line above once you have read this comment — it is here
only to be deleted. Computing an hour from a UTC instant in the handler is the
mistake `users_at_local_hour` was built to avoid, and it would send every user
the digest at 08:00 UTC.

Delete `usersWhoOpenedToday` and the `openedApp` plumbing entirely: it existed
for `day_starts`'s "only if the app hasn't been opened yet" rule, and that
trigger is retired. A morning digest is worth sending to somebody who is already
looking at the screen, because it carries yesterday's *result*, which the screen
does not show.

- [ ] **Step 2: Gather the facts**

Replace `standingFor` with a `digestFactsFor` that reads three things:

```ts
/**
 * What the digest has to say, for one recipient.
 *
 * Three reads, each of which may legitimately come back empty — and every empty
 * has its own copy branch rather than a placeholder. A user with no squad, a
 * squad whose race for yesterday is not final because one member is still
 * living in it, and a squad with no live Event are all ordinary states, not
 * errors.
 *
 * The race result is read from `race_results` **directly** rather than through
 * `race_result()`: this runs with the service role and no JWT, so `auth.uid()`
 * is null and that function would raise. Reading the table is correct here and
 * is why the table has no client grant rather than an RLS policy — the service
 * role is the only reader that is not a viewer.
 */
async function digestFactsFor(
  candidate: DispatchCandidate,
  squadId: string | undefined,
): Promise<DigestFacts> {
  if (!squadId) return { inSquad: false };

  const [resultRow, standingRows, eventRows] = await Promise.all([
    admin
      .from('race_results')
      .select('standings')
      .eq('squad_id', squadId)
      .eq('local_date', candidate.data.resultDate)
      .maybeSingle(),
    admin.rpc('squad_leaderboard', {
      p_squad_id: squadId,
      p_local_date: candidate.data.standingDate,
      p_mode: 'current',
      p_as_user: candidate.userId,
    }),
    admin
      .from('challenge_events')
      .select('id, kind, metric, target, starts_on, ends_on')
      .eq('squad_id', squadId)
      .is('closed_at', null)
      .lte('starts_on', candidate.data.standingDate)
      .gte('ends_on', candidate.data.standingDate)
      .limit(1),
  ]);

  // The live Event's pooled fraction, through the same two functions the client
  // and finalize-days use — `pooledDays()` takes each date once (event_progress
  // repeats the pooled figure on every participant's row) and `evaluateEvent()`
  // is the single implementation of the arithmetic. A third reading of a bar
  // three surfaces already draw is exactly what deviation #18 forbids.
  let eventFraction: number | null = null;
  const liveEvent = eventRows.data?.[0];
  if (liveEvent) {
    const { data: progressRows } = await admin.rpc('event_progress', {
      p_event_id: liveEvent.id,
      p_as_user: candidate.userId,
    });
    eventFraction = evaluateEvent(
      eventRowToEvent(liveEvent as EventRow),
      pooledDays((progressRows ?? []) as ProgressRow[]),
      candidate.data.standingDate,
    ).fraction;
  }

  const standings = (resultRow.data?.standings ?? []) as Array<{
    user_id: string;
    rank: number;
  }>;
  const mine = standings.find((s) => s.user_id === candidate.userId);

  // Today's standing is ranked by the RPC's weighted total, not by capped
  // steps — the race re-ranks on the client (deviation #46). At 08:00 almost
  // nobody has moved, so the two orderings agree in practice and re-ranking
  // here would mean a second implementation of rankRacers on the server for a
  // difference nobody can observe. Stated so it is a decision rather than an
  // oversight.
  const board = (standingRows.data ?? []) as Array<{ user_id: string; rank: number }>;
  const myRow = board.find((r) => r.user_id === candidate.userId);

  return {
    inSquad: true,
    result: mine ? { rank: mine.rank, racers: standings.length } : null,
    standing: myRow ? { rank: myRow.rank, racers: board.length } : null,
    eventFraction,
  };
}
```

`pooledDays` and `ProgressRow` are plan 4's, in
`src/features/events/progress.ts` — a client module an Edge Function cannot
import. **Move them to `supabase/functions/_shared/event-plan.ts`** (which
already has `daysForEvent`, the ungrouped sibling) and re-export from the client
module, rather than writing a second copy here. The whole point of `pooledDays`
is that summing `pooled_value` naively multiplies every day by the squad size,
and a duplicate is a second chance to get that wrong.

If the copy branch you wrote in Task 3 does not use `eventFraction`, **delete
the field from `DigestFacts` and delete this whole block** rather than
computing a number nothing reads — an unused field is one that gets wired
wrongly later.

- [ ] **Step 3: Send**

Replace the `notificationCopy(candidate.trigger, …)` call with
`digestCopy(await digestFactsFor(candidate, squadByUser.get(candidate.userId)))`,
and keep the existing `planNotifications` budget check, the `sendToUser` call and
the `notification_log` insert exactly as they are — the budget still bounds the
event-driven pushes, and the log insert is what the partial unique index guards.

The push payload's `screen` becomes `'today'`, which plan 3's fourth tab
provides. Add the case to `src/features/notifications/routing.ts`:

```ts
    case 'today':
      return '/today';
```

and a test case for it in `routing.test.ts`.

- [ ] **Step 4: Deploy and verify**

```bash
npx vitest run --config vitest.config.ts supabase/functions/
npm run typecheck
supabase functions deploy dispatch-notifications --project-ref zniopywbwenrzxezolwv
```

Then force one run and read the log:

```bash
./supabase/scripts/remote-sql.sh "select kind, count(*) from public.notification_log where sent_at > now() - interval '2 hours' group by kind"
```

Expected: only `daily_digest`, `event_completed` and `challenge_cleared` appear.
A `day_starts`, `day_ends` or `day_ending_soon` row after the deploy means the
old artifact is still live — **redeploy, do not debug the code**, which is the
August 2026 lesson.

On a device, confirm the push arrives at 08:00 local, that tapping it lands on
the Today tab, and that a second cron run in the same local day sends nothing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/dispatch-notifications/index.ts src/features/notifications/
git commit -m "feat(notifications): send one morning digest per recipient per day"
```

---

### Task 6: The figure answers to levelling

**Files:**
- Create: `src/features/character/level-response.ts`
- Create: `src/features/character/level-response.test.ts`
- Modify: `src/features/character/CharacterFigure.tsx`

**Interfaces:**
- Consumes: `evolutionStageForLevel` from `@kairo/core`; `AuraStrength` from `./aura.ts`.
- Produces: `figureResponse(input): FigureResponse`. Only `CharacterFigure` consumes it.

Spec §5.4: with no cosmetics and no coins, **the figure itself is the reward.**
The three responses already exist — ground shadow by level band, build
proportions by dominant stat, presence ring by ability rating. They become
substantially more legible: wider bands, larger deltas, **and a visible change at
each level-up** rather than only at the three band boundaries.

That last clause is the part the current code cannot do at all: `stage` changes
only at levels 6, 11 and 21, so levelling from 12 to 13 changes nothing. The
module below adds a within-band component, which is the honest way to get "a
change at each level-up" without an animation runtime.

- [ ] **Step 1: Write the failing test**

Create `src/features/character/level-response.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evolutionStageForLevel } from '@kairo/core';
import { figureResponse } from './level-response.ts';

const at = (level: number, aura: 'none' | 'present' | 'strong' = 'none') =>
  figureResponse({
    level,
    stage: evolutionStageForLevel(level),
    aura,
    shadowWeight: 0,
    height: 220,
  });

describe('figureResponse', () => {
  it('grows the shadow at every single level-up, not only at band boundaries', () => {
    // The whole point of the change. `stage` moves at 6, 11 and 21 only, so
    // levelling 12 → 13 used to change nothing at all — and a reward you need
    // two screenshots to see is not a reward.
    for (const level of [2, 7, 13, 24]) {
      expect(at(level + 1).shadowWidth).toBeGreaterThan(at(level).shadowWidth);
    }
  });

  it('makes a band boundary a bigger jump than an ordinary level', () => {
    const ordinary = at(8).shadowWidth - at(7).shadowWidth;
    const boundary = at(11).shadowWidth - at(10).shadowWidth;
    expect(boundary).toBeGreaterThan(ordinary * 2);
  });

  it('is substantially louder across the whole range than it used to be', () => {
    // The old curve was (128 + stage * 18): 146 at level 1 and 200 at level 21,
    // a 37% span across the entire game. Pin a much wider one so a later tuning
    // pass cannot quietly flatten it back.
    expect(at(30).shadowWidth / at(1).shadowWidth).toBeGreaterThan(1.7);
  });

  it('deepens the shadow with the band and clamps it before it becomes a hole', () => {
    expect(at(21).shadowOpacity).toBeGreaterThan(at(1).shadowOpacity);
    expect(at(99).shadowOpacity).toBeLessThanOrEqual(0.45);
  });

  it('stops growing past the last band, so a year-old account is not a poster', () => {
    // Unbounded growth would eventually push the figure out of the diorama.
    expect(at(200).shadowWidth).toBe(at(120).shadowWidth);
  });

  it('gives no ring without an aura, and a bigger one with a strong aura', () => {
    expect(at(10, 'none').ringSize).toBeNull();
    expect(at(10, 'strong').ringSize!).toBeGreaterThan(at(10, 'present').ringSize!);
  });

  it('thickens the ring by band, so the ring reads level as well as rating', () => {
    expect(at(25, 'present').ringWidth).toBeGreaterThan(at(2, 'present').ringWidth);
  });

  it('scales everything with the figure\'s box', () => {
    const small = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0, height: 110 });
    const large = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0, height: 220 });
    expect(large.shadowWidth).toBeCloseTo(small.shadowWidth * 2);
  });

  it('lets a heavy build sit in a denser contact patch', () => {
    const heavy = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0.07, height: 220 });
    const light = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: -0.05, height: 220 });
    expect(heavy.shadowOpacity).toBeGreaterThan(light.shadowOpacity);
  });

  it('survives a level of 0 or NaN from an unloaded profile', () => {
    expect(Number.isFinite(at(0).shadowWidth)).toBe(true);
    expect(Number.isFinite(at(Number.NaN).shadowWidth)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts src/features/character/level-response.test.ts`
Expected: FAIL — cannot resolve `./level-response.ts`.

- [ ] **Step 3: Write the module**

Create `src/features/character/level-response.ts`:

```ts
import type { EvolutionStage } from '@kairo/core';
import type { AuraStrength } from './aura.ts';

/**
 * How much the character has visibly become.
 *
 * **Extracted from `CharacterFigure.tsx` so the bands could be widened against
 * assertions rather than by eye.** The old arithmetic was three expressions
 * inline — `(128 + stage * 18) * scale`, `0.14 + stage * 0.03 + weight`, and a
 * ring at 1.35 or 1.5 — and it was correct, tasteful and almost invisible: 146
 * points of shadow at level 1 against 200 at level 21 is a 37% span across the
 * entire game, and the QA pass reported the character "did not morph".
 *
 * Two things change here and only one of them is a number.
 *
 * **The bands are wider.** A shadow that spans 1.7× rather than 1.37× is the
 * difference between a change you can see and one you can measure.
 *
 * **Levelling does something every time.** `stage` moves at levels 6, 11 and 21
 * and nowhere else, so 12 → 13 used to change nothing at all. A within-band term
 * now nudges the shadow at every level, with the band boundary still the bigger
 * jump — so the four artworks stay the milestone and each level in between is
 * still a reward.
 *
 * No new dependency. `react-native-svg`, Rive and Reanimated all stay
 * uninstalled; this is a tuning pass on the primitives that already draw
 * (spec §5.4), not an animation build.
 *
 * Pure and tested in Node — it imports only types.
 */

/** The reference box every figure is drawn against. */
const REFERENCE_HEIGHT = 220;

/** Shadow width at stage 0, before any level is added. */
const SHADOW_BASE = 104;
/** Added per evolution stage — the milestone step. */
const SHADOW_PER_STAGE = 34;
/** Added per level inside a band — the every-level step. */
const SHADOW_PER_LEVEL = 2.6;

/**
 * The level past which nothing grows any further.
 *
 * Unbounded growth eventually pushes the figure out of the diorama, and a
 * two-year-old account should not render as a poster. 40 is roughly a year of
 * strong daily play, so the ceiling is reached by almost nobody and is there
 * for the case where it is.
 */
const LEVEL_CEILING = 40;

const OPACITY_BASE = 0.15;
const OPACITY_PER_STAGE = 0.055;
/** Past this the contact patch stops reading as a shadow and starts as a hole. */
const OPACITY_MAX = 0.45;

/** Ring diameter as a multiple of the shadow's width. Null means no ring. */
const RING_SCALE: Record<AuraStrength, number | null> = {
  none: null,
  present: 1.34,
  strong: 1.58,
};

export interface FigureResponse {
  shadowWidth: number;
  shadowOpacity: number;
  /** Null when there is no ring to draw. */
  ringSize: number | null;
  ringWidth: number;
}

export function figureResponse(input: {
  /** `profiles.level`. 0 or NaN while the profile loads. */
  level: number;
  stage: EvolutionStage;
  aura: AuraStrength;
  /** The build's contribution to shadow density, from `BUILDS[dominance].weight`. */
  shadowWeight: number;
  /** The figure's box. The diorama stands them taller than a card does. */
  height: number;
}): FigureResponse {
  const scale = input.height / REFERENCE_HEIGHT;

  // `|| 1` catches NaN and 0 together: an unloaded profile renders a level-1
  // character rather than a collapsed one, which is the same thing a brand-new
  // account sees and therefore never looks like a bug.
  const level = Math.min(LEVEL_CEILING, Math.max(1, Math.floor(input.level) || 1));

  const width =
    (SHADOW_BASE + input.stage * SHADOW_PER_STAGE + level * SHADOW_PER_LEVEL) * scale;

  const opacity = Math.min(
    OPACITY_MAX,
    OPACITY_BASE + input.stage * OPACITY_PER_STAGE + input.shadowWeight,
  );

  const ringScale = RING_SCALE[input.aura];

  return {
    shadowWidth: width,
    shadowOpacity: opacity,
    ringSize: ringScale === null ? null : width * ringScale,
    // The ring reads the ability rating through `aura`; thickening it by band
    // lets it read level too, so the one earned device on the figure answers to
    // both axes rather than to one.
    ringWidth: 2 + input.stage,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts src/features/character/level-response.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Wire it in**

In `src/features/character/CharacterFigure.tsx`, replace the three inline
expressions:

```tsx
import { figureResponse } from './level-response.ts';
```

```tsx
  const aura = auraStrength({ lifetimePoints, balanced: dominance === 'balanced' });

  // One place decides how loudly the figure answers to progress, and it is
  // tested (spec §5.4). The three expressions this replaced were inline,
  // correct, and almost invisible.
  const response = figureResponse({
    level,
    stage,
    aura,
    shadowWeight: build.weight,
    height,
  });
```

`CharacterFigure` does not currently take `level` — it takes `stage`, which is
`evolutionStageForLevel(level)`. Add `level: number` to its props and pass it
from both call sites (`Diorama.tsx` and wherever else the figure is mounted;
`npm run typecheck` enumerates them). Passing the level rather than deriving it
here keeps the figure a pure function of what it is given, like everything else
in this file.

Then use `response.shadowWidth`, `response.shadowOpacity`, `response.ringSize`
and `response.ringWidth` in place of the local `shadowWidth`, `shadowOpacity` and
the two ring multipliers. `PresenceRing` takes `size` and `color` — add a
`width` prop to it in `src/ui/GroundShadow.tsx`, defaulting to 2 so nothing else
that draws a ring changes.

Render the ring on `response.ringSize !== null` rather than on
`aura !== 'none'`: one condition, in the module that decides it.

- [ ] **Step 6: Verify by hand**

Levelling on demand is the hard part of checking this. Use the dev seeder:

```bash
npm run ios
# then, against the live project, set a test account's XP to each band and
# screenshot between each:
./supabase/scripts/remote-sql.sh "update public.profiles set total_xp = 0    where id = '<test-user>'"
./supabase/scripts/remote-sql.sh "update public.profiles set total_xp = 625  where id = '<test-user>'"   -- level 6
./supabase/scripts/remote-sql.sh "update public.profiles set total_xp = 2500 where id = '<test-user>'"   -- level 11
./supabase/scripts/remote-sql.sh "update public.profiles set total_xp = 10000 where id = '<test-user>'"  -- level 21
```

`recalculate_user_xp` is a rollup and will overwrite a hand-set `total_xp` on the
next scoring write, which is fine for a look — but **set it back to the real
figure when finished**, or the next sync will report a level drop:

```bash
./supabase/scripts/remote-sql.sh "select public.recalculate_user_xp('<test-user>')"
```

Confirm across the four screenshots: the shadow visibly widens and deepens at
each band; a single level inside a band moves it a little; the ring appears and
thickens; nothing escapes the diorama at stage 4 on the tallest figure; and at
`accessibility-extra-extra-extra-large` the HUD above the figure still flows
rather than overlapping — **the HUD is one flowing column and no child may gain
a `top`**, and a larger figure is exactly the pressure that invites one.

- [ ] **Step 7: Commit**

```bash
npm run typecheck
npm test
git add src/features/character/level-response.ts src/features/character/level-response.test.ts src/features/character/CharacterFigure.tsx src/ui/GroundShadow.tsx src/features/character/Diorama.tsx
git commit -m "feat(character): make levelling visible at every level, not every band"
```

---

### Task 7: Re-point the retention instrumentation

**Files:**
- Modify: `src/features/telemetry/events.ts`
- Modify: `src/features/squad/consent.ts` (plan 1), `src/features/events/mutations.ts` (plan 4), `app/(tabs)/today.tsx` (plan 3)
- Modify: `docs/beta-measurement.md`

**Interfaces:**
- Consumes: nothing.
- Produces: new `AppEventType` values. Nothing consumes them in code — they are read by SQL through `remote-sql.sh`.

Spec §1: the TestFlight build stops being the thing measured; `kairo_retention()`
and the milestone events are re-pointed at the loop described here.

- [ ] **Step 1: Decide what actually needs re-pointing, and record it**

`public.kairo_retention(p_day)` measures whether a `daily_scores` row exists on
cohort day + N. **That needs no change and must not be changed**: the pivot
redefined what the app *shows*, not what counts as an active day, and rewriting
the denominator would make every measurement taken before 2026-08-25
incomparable to every one after — which is the opposite of what a pivot's
instrumentation is for.

What is genuinely stale is the **funnel vocabulary**: `goal_created` names a
surface that no longer exists, and nothing records that a user saw a race,
cleared a quest, consented to sharing, or started a Battle. Those are the four
moments the new loop turns on.

- [ ] **Step 2: Update the event union**

In `src/features/telemetry/events.ts`:

```ts
export type AppEventType =
  // …existing values…
  /**
   * **Historical.** Goals were removed on 2026-08-25 (deviation #45). Kept in
   * the union because `app_events` rows already carry it and the analytics
   * queries in `docs/beta-measurement.md` still read the pre-pivot funnel.
   * Nothing emits it any more.
   */
  | 'goal_created'
  /** The four moments the post-pivot loop turns on (deviation #44). */
  | 'squad_data_consent_granted'
  | 'race_seen'
  | 'quest_cleared'
  | 'event_created';
```

Give each new value the same style of comment the existing ones carry — where it
fires and what question it answers. `race_seen` in particular needs one: it fires
**once per local day**, gated on the same MMKV once-ever-per-day marker style
`milestone-store.ts` uses, not on every render, or the count measures scroll
behaviour rather than engagement.

- [ ] **Step 3: Emit them**

- `squad_data_consent_granted` — in plan 1's `useGrantSquadDataConsent`
  `onSuccess`. This is the funnel step spec §13 flags as the highest risk: if
  join conversion falls materially, the fallback is steps and distance only, and
  this event is how that is measured rather than guessed.
- `race_seen` — in plan 3's `app/(tabs)/today.tsx`, when `RaceCard` first renders
  with a non-empty racer list on a given local date.
- `quest_cleared` — in plan 3's Today tab, when a quest's `state.met` first
  becomes true in a session. Payload: `{ tier }`, never the quest id — a tier
  answers "are the bars set right", and an id would make the table a per-quest
  leaderboard nobody asked for.
- `event_created` — in plan 4's `useCreateEvent` `onSuccess`. Payload:
  `{ kind, difficulty }`, never the target — a boss's HP is the squad's own
  number, the same rule `goal_created` followed.

- [ ] **Step 4: Update the runbook**

In `docs/beta-measurement.md`:
- State that `kairo_retention()` is unchanged and **why** — the definition of an
  active day did not move, and changing it would break comparability across the
  pivot.
- Replace the goal funnel query with one over the four new events.
- Add the one question the pivot exists to answer, with the SQL to answer it:
  **does a user who saw a race come back tomorrow more often than one who did
  not?** That is a cohort split on `race_seen` against `kairo_retention`'s
  denominator, and it is the measurement that decides whether the pivot worked.
- Note the date the pivot shipped, so every chart can be split on it.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
npm test
git add src/features/telemetry/events.ts src/features docs/beta-measurement.md "app/(tabs)/today.tsx"
git commit -m "feat(telemetry): measure the race loop instead of the goal funnel"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/user-journey.md`
- Modify: `docs/Kairo_Master_Summary.md` (in-place supersede notes only)

Documentation updates are part of the change, not a follow-up. **This is the last
plan of five, so this task also closes the pivot out** — after it, no doc should
describe the app as a leaderboard with goals.

- [ ] **Step 1: Add deviations #44 and #52**

In `docs/roadmap.md`'s approved-deviations table, add two rows in the table's
existing style.

**#44 — the pivot itself.** Spec says the app converts activity into a score and
ranks it (§5, §6, §8). We build: your real life powers your character and your
character races your friends. Record that this is a **pre-launch pivot decided
deliberately** — the TestFlight build stops being the thing measured — and that
**no user data was destroyed**: `daily_scores`, XP, ability ratings, streaks,
species, invites and challenge completions all survive, and banked goal XP is
kept by the `closed_at` mechanism in #45. Record that the scoring engine is
**untouched**: `tierFor`, `shiftedTierFor`, `TIER_POINTS`, `THRESHOLDS`,
`computeDailyScore`, the `3 / earnable stats` scaling, `planDay`,
`finalizable_days()` and the streak all behave exactly as before, and the race
reads raw units *alongside* them. Record that **`kairo_retention()` was
deliberately not re-pointed** — the definition of an active day did not move, and
changing the denominator would make measurements either side of the pivot
incomparable, which is the opposite of what a pivot's instrumentation is for —
while the funnel vocabulary was, with the four new events named. Link the spec
and the five plans by filename.

**#52 — one notification digest per user per local day, capped server-side.**
Record that `DISPATCH_HOURS`' three triggers collapse to `DIGEST_HOUR = 8`, and
**why 08:00 and not finalization**: results finalize about two hours after local
midnight, so a digest carrying the result would fire at 2am. Record that the cap
lives in **two** places and both are load-bearing — the exclusion inside
`users_needing_digest()` is the behaviour and
`notification_log_one_digest_per_day` is the guarantee — and that a client-side
cap is not a cap but a race between devices. Record that
`MAX_NOTIFICATIONS_PER_DAY` **stays 3**, because the budget bounds the
event-driven pushes and #52 caps only the scheduled one. Record that the three
retired triggers stay in the TypeScript union as historical values because
`notification_log.kind` is free text and a push sent before the deploy can be
tapped after it, and that `users_at_local_hour()` was deliberately **not**
dropped.

Also record, under #46, the `race_results` half deferred out of plan 1: written
once by `finalize-days` when the **last** member finalizes that date, because
days are per-user local; write-once so a later revision never retracts a win;
**no client SELECT grant at all**, with `race_result()` applying the reciprocal
consent gate — rank and species unconditional, capped steps gated.

Numbers #45–#51 belong to the other four plans. Do not claim them here.

- [ ] **Step 2: Update `CLAUDE.md`**

Add the closing block, and this one is the important one — it is what a future
session reads first:

- **Kairo is a race as of 2026-08-25** (deviation #44). Your real life powers
  your character; your character races your friends. The scoring engine is
  untouched and still decides every day exactly as §5/§6 specify — the race
  reads **raw units alongside it**, never instead of it. If a doc describes the
  app as a leaderboard with goals, it is stale.
- **One push a day** (deviation #52): `daily_digest` at `DIGEST_HOUR` (08:00
  local), capped by `users_needing_digest()`'s exclusion **and**
  `notification_log_one_digest_per_day`. Both halves. A client-side cap is a
  race between devices. `MAX_NOTIFICATIONS_PER_DAY` stays 3 — it bounds the
  event-driven pushes, which #52 did not touch.
- **`race_results` has no client grant.** Read it through `race_result()`, which
  gates capped steps reciprocally and returns rank and species to anyone in the
  squad. Written once, by the **last** member of a squad to finalize that date —
  `squadDayIsComplete` returns false for an empty roster on purpose, because
  `every` over an empty list is true and would occupy the write-once key
  forever.
- **`figureResponse()` owns how loudly the character answers to progress.** It
  is tested, and the test pins a 1.7× span across the level range **and** a
  visible change at every single level — the old inline arithmetic only moved at
  levels 6, 11 and 21, which is why the QA pass said the character did not
  morph. Tune the constants there, never inline in `CharacterFigure.tsx`.
- **`kairo_retention()` is deliberately unchanged across the pivot.** The
  definition of an active day did not move; the funnel events did.

Then sweep `CLAUDE.md` for the blocks the five plans made stale — the Goals
block (deviation #45 replaced it), the disclosure block's list of gated surfaces
(#50 shrank it), and the `STAT_NAMES` sentence in the accessibility block (#51
moved the file).

- [ ] **Step 3: Update `docs/mvp-scope.md`**

This file is the IN/OUT contract and every QA brief cites it. Bring it fully in
line with spec §11: **IN** — the race, the Today tab with quests, Body/Motion/
Mind, the widened projection with its consent gate, `challenge_events`, Battle,
the digest, the louder level response. **OUT, each with its stated reason** —
Adventure, coins, cosmetics/equipment/slots, animation, the solo world map, more
species, squads past six, public racing.

- [ ] **Step 4: Update `docs/user-journey.md`**

Walk the whole end-to-end flow as it now is: onboarding → the Today tab → the
race → the character → the squad → a Battle. Delete the goal path. This file is
supposed to describe what is *built* rather than what is spec'd, so verify each
step against the running app rather than against this plan.

- [ ] **Step 5: Mark the spec superseded in place**

In `docs/Kairo_Master_Summary.md`, add in-place notes — **do not renumber
sections** — to §8 (Goals are Events, deviation #45) and §14 (three scheduled
pushes are one digest, deviation #52). §5 and §6 already carry their notes from
#41 and #51.

- [ ] **Step 6: Run everything and commit**

```bash
npm test
npm run typecheck
git add docs/ CLAUDE.md
git commit -m "docs: close out the character race pivot"
```

Expected: both PASS. If `npm test` fails, fix the code — not the test.

---

## Definition of done

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes (all three checks — tsc, workspace tsc, deno check).
- [ ] `node supabase/scripts/smoke-sync.mjs` passes against the deployed `finalize-days`.
- [ ] `./supabase/scripts/remote-sql.sh "select grantee, privilege_type from information_schema.role_table_grants where table_name = 'race_results'"` returns no `anon` and no `authenticated` row.
- [ ] `./supabase/scripts/remote-sql.sh "select squad_id, local_date, jsonb_array_length(standings) from public.race_results order by local_date desc limit 5"` shows rows appearing one per squad per completed date.
- [ ] `./supabase/scripts/remote-sql.sh "select kind, count(*) from public.notification_log where sent_at > now() - interval '24 hours' group by kind"` shows no `day_starts`, `day_ends` or `day_ending_soon` after the deploy.
- [ ] A single account receives exactly one push in a local day, at 08:00 local, and tapping it lands on `/today`.
- [ ] Four screenshots at levels 1, 6, 11 and 21 show a visibly different figure, and a fifth at level 12 differs from the level-11 one.
- [ ] At `accessibility-extra-extra-extra-large`, taken after a relaunch, the character HUD still flows and nothing overlaps the enlarged figure.
- [ ] `grep -rn "DISPATCH_HOURS\|planHourlyDispatch" supabase src` returns nothing.
- [ ] `docs/mvp-scope.md`, `docs/user-journey.md` and `CLAUDE.md` describe a race, and no doc outside `docs/archive/` describes the app as a leaderboard with goals.
