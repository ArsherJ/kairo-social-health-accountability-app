# Animal Character System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the male/female character body with one of four Philippine endemic species — chosen at onboarding, freely changeable after, cosmetic only.

**Architecture:** A zero-import registry (`species.ts`) is the single source for ids, names, hues, affinities and blurbs. `profiles.species` is a new nullable, CHECK-constrained column in the column-scoped INSERT and UPDATE grants; `squad_leaderboard()` gains a `species` column so squadmates can render each other's animal without touching the §5 privacy boundary. `CharacterFigure` swaps its `body` prop for `species` and nothing else about it changes — stage, dominance, aura and `GroundShadow` all keep working, which is why four artworks suffice. One `SpeciesPicker` component is mounted by two thin routes because the routing gate forbids a single one.

**Tech Stack:** TypeScript, Expo Router, React Native (no new dependencies), Supabase Postgres, Vitest (root + PGlite schema harness).

**Spec:** `docs/superpowers/specs/2026-08-18-animal-character-system-design.md`

## Global Constraints

- **No new dependencies.** `react-native-svg`, Rive and Reanimated stay uninstalled. Motion is React Native `Animated` only.
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`.
- **The profile row commits exactly once, on `/name`.** Every onboarding step stays *before* it. Adding a step after that INSERT resurrects deviation #22's deleted `finishingOnboarding` flag.
- **Species ids, verbatim:** `'pilandok' | 'tamaraw' | 'carabao' | 'eagle'`.
- **Affinities, verbatim:** Pilandok → AGI, Tamaraw → STR, Carabao → END, Eagle → VIT.
- **Display names, verbatim:** `Pilandok`, `Tamaraw`, `Carabao`, `Philippine Eagle`.
- **Species is cosmetic.** Nothing in this plan touches `packages/kairo-core`, `daily_scores`, `health_buckets`, or any Edge Function. If a task appears to, stop.
- **Column-level grants:** a column-level `REVOKE` against a table-level `GRANT` is silently a no-op. Revoke the table grant, then re-grant the full allowed column list.
- **Applying a migration on this machine:** port 5432 is blocked and Docker is unavailable. Use `./supabase/scripts/remote-sql.sh -f <file>`, then insert the migration's row into `supabase_migrations.schema_migrations` by hand or the CLI will re-apply it. Wrap multi-statement migrations in `begin; … commit;`.
- **Art is placeholder throughout this plan.** Real art arrives on the separate illustrator track and swaps in as files, with no code change. Nothing here is blocked on it.

---

## File Structure

**Created**
- `src/features/character/species.ts` — the registry. Zero imports. Ids, names, affinities, hues, blurbs, `parseSpecies`.
- `src/features/character/species.test.ts` — registry tests (root Vitest).
- `src/features/character/species-art.ts` — static `require` maps for figure and habitat art.
- `src/features/character/species-label.ts` — `speciesFigureLabel()`, pure.
- `src/features/character/species-label.test.ts` — label tests.
- `src/features/character/SpeciesPicker.tsx` — the picker UI, used by both routes.
- `app/species.tsx` — groupless stacked route: migration prompt + swap.
- `supabase/migrations/20260818120000_species.sql` — column, grants, RPC.
- `assets/character/species/*.png` — placeholder figure and habitat art.

**Modified**
- `src/features/character/CharacterFigure.tsx` — `body` → `species`; `ANCHORS` → species art.
- `src/features/character/Diorama.tsx` — `body` → `species`; habitat backdrop; the no-habitat comment.
- `src/features/profile/queries.ts` — `species` in the row type and the select list.
- `src/features/profile/create-profile.ts` — `species` in `NewProfile` and the INSERT.
- `app/(onboard)/character.tsx` — becomes the onboarding mount of `SpeciesPicker`.
- `app/(onboard)/name.tsx` — reads `species` from the route param.
- `app/(tabs)/index.tsx` — passes `species` to `Diorama`; pushes `/species` once when null.
- `app/(tabs)/profile.tsx` — a row that pushes `/species`.
- `app/(tabs)/squad.tsx` + the leaderboard row component — species icon.
- `supabase/tests/schema.test.ts` — new column, grants, RPC row shape.
- Docs: `docs/roadmap.md`, `CLAUDE.md`, `docs/user-journey.md`, `docs/mvp-scope.md`, `assets/character/README.md`.

**Left alone, deliberately:** `packages/kairo-core`, `aura.ts`, `GroundShadow.tsx`, `lane.ts`, `standing.ts`, every Edge Function.

---

### Task 1: The species registry

**Files:**
- Create: `src/features/character/species.ts`
- Test: `src/features/character/species.test.ts`

**Interfaces:**
- Consumes: `CoreStat` from `@kairo/core` — **as a type-only import**, so the module still loads under root Vitest with no alias resolution at runtime.
- Produces: `SPECIES_IDS: readonly SpeciesId[]`, `type SpeciesId`, `SPECIES: Record<SpeciesId, Species>`, `SPECIES_NAMES: Record<SpeciesId, string>`, `parseSpecies(raw: unknown): SpeciesId | null`, `interface Species { id, name, affinity, hue, blurb }`.

- [ ] **Step 1: Write the failing test**

Create `src/features/character/species.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_IDS, SPECIES_NAMES, parseSpecies } from './species.ts';

describe('SPECIES registry', () => {
  it('lists exactly the four values in the CHECK constraint, in order', () => {
    // Mirrors `check (species in ('pilandok','tamaraw','carabao','eagle'))`.
    // A value this accepts and the database rejects is a 23514 the user can
    // do nothing with — the discipline character-body.ts already applies.
    expect([...SPECIES_IDS]).toEqual(['pilandok', 'tamaraw', 'carabao', 'eagle']);
  });

  it('covers every id with a name, hue, affinity and blurb', () => {
    for (const id of SPECIES_IDS) {
      const s = SPECIES[id];
      expect(s.id).toBe(id);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      expect(s.hue).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('maps each core stat to exactly one species', () => {
    // Four species, four stats, no duplicates. A second AGI species would make
    // the affinity meaningless without anything failing.
    const affinities = SPECIES_IDS.map((id) => SPECIES[id].affinity);
    expect([...affinities].sort()).toEqual(['AGI', 'END', 'STR', 'VIT']);
  });

  it('derives SPECIES_NAMES from the registry rather than repeating it', () => {
    // STAT_NAMES' lesson: a second list of the same words drifts. This asserts
    // the two agree; species.ts must build one from the other.
    for (const id of SPECIES_IDS) expect(SPECIES_NAMES[id]).toBe(SPECIES[id].name);
  });

  it('gives every species a distinct hue', () => {
    const hues = SPECIES_IDS.map((id) => SPECIES[id].hue);
    expect(new Set(hues).size).toBe(hues.length);
  });
});

describe('parseSpecies', () => {
  it('accepts each id the column allows', () => {
    expect(parseSpecies('pilandok')).toBe('pilandok');
    expect(parseSpecies('tamaraw')).toBe('tamaraw');
    expect(parseSpecies('carabao')).toBe('carabao');
    expect(parseSpecies('eagle')).toBe('eagle');
  });

  it('returns null for a missing param rather than throwing', () => {
    // Deep-linking /name directly is legitimate. The column is nullable
    // precisely so this renders a default figure instead of a dead screen.
    expect(parseSpecies(undefined)).toBeNull();
    expect(parseSpecies(null)).toBeNull();
    expect(parseSpecies('')).toBeNull();
  });

  it('rejects a value outside the CHECK', () => {
    expect(parseSpecies('tarsier')).toBeNull();
    expect(parseSpecies('Eagle')).toBeNull();
    expect(parseSpecies('male')).toBeNull();
  });

  it('rejects a repeated query param', () => {
    // expo-router types a search param as `string | string[]`.
    // `?species=eagle&species=tamaraw` is an ambiguous answer, not a choice.
    expect(parseSpecies(['eagle', 'tamaraw'])).toBeNull();
    expect(parseSpecies(['eagle'])).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseSpecies(0)).toBeNull();
    expect(parseSpecies({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/character/species.test.ts`
Expected: FAIL — `Failed to resolve import "./species.ts"`.

- [ ] **Step 3: Write the registry**

Create `src/features/character/species.ts`:

```ts
import type { CoreStat } from '@kairo/core';

/**
 * Which animal the player's character is.
 *
 * Replaces `profiles.character_body` (deviation #27), which asked for an
 * identity declaration at the highest-attention moment in onboarding, bought
 * two assets that had to be maintained forever, and — as that screen's own
 * comment admitted — could not even promise the choice was changeable.
 *
 * **Cosmetic, and structurally so.** `affinity` is flavour: it decides which
 * stat the species is *about*, never what the player earns. §5's "no stat is
 * required daily" pillar is untouched, and nothing in `@kairo/core` imports
 * this file. If a mechanical bonus is ever added, note that `daily_scores` is
 * replayed from stored buckets, so a retroactive affinity rescores history —
 * that is a migration, not a tweak.
 *
 * **Zero runtime imports on purpose.** `CoreStat` is type-only, so root Vitest
 * — which has no `@/` alias and cannot parse React Native's Flow syntax — loads
 * and tests this directly. Same constraint that shaped `buffer.ts` and
 * `milestones.ts`. Do not import art, theme or anything from `@/ui` here; the
 * art map lives in `species-art.ts` for exactly this reason.
 */

/**
 * The order is the picker's reading order, and it mirrors the CHECK constraint
 * in `20260818120000_species.sql`. A test pins both.
 */
export const SPECIES_IDS = ['pilandok', 'tamaraw', 'carabao', 'eagle'] as const;

export type SpeciesId = (typeof SPECIES_IDS)[number];

export interface Species {
  id: SpeciesId;
  /** The in-app noun. "Your Philippine Eagle." */
  name: string;
  /** The stat this species is *about*. Flavour only — never read by scoring. */
  affinity: CoreStat;
  /**
   * The species' identity colour.
   *
   * Deliberately **not** in `theme.ts`'s `ramp`. That palette is semantic —
   * terracotta means *call to action*, sage means *your lane* — and a species
   * hue means neither. These are identity colours whose only requirements are
   * that they differ from each other and clear those two meanings, which is a
   * constraint on the illustrator brief and is why they live beside the brief's
   * other outputs rather than beside the app's semantics.
   */
  hue: string;
  /**
   * One line shown on the picker card. Endemic fact plus conservation status.
   *
   * Conservation is framing, not a claim: do not write copy implying a
   * partnership or a donation until one exists.
   */
  blurb: string;
}

export const SPECIES: Record<SpeciesId, Species> = {
  pilandok: {
    id: 'pilandok',
    name: 'Pilandok',
    affinity: 'AGI',
    hue: '#b98a4e',
    blurb: 'The Palawan mouse-deer — quick, small, and hard to catch. Vulnerable in the wild.',
  },
  tamaraw: {
    id: 'tamaraw',
    name: 'Tamaraw',
    affinity: 'STR',
    hue: '#5b6b78',
    blurb: 'Found only on Mindoro, and nowhere else on earth. Critically endangered.',
  },
  carabao: {
    id: 'carabao',
    name: 'Carabao',
    affinity: 'END',
    hue: '#8a8f7a',
    blurb: 'The national animal. Works all day and keeps going.',
  },
  eagle: {
    id: 'eagle',
    name: 'Philippine Eagle',
    affinity: 'VIT',
    hue: '#8c5a3c',
    blurb: 'The national bird, and one of the largest eagles alive. Critically endangered.',
  },
};

/**
 * Species words, for accessible labels and copy.
 *
 * **Built from `SPECIES`, never written out again.** This is `STAT_NAMES`'
 * lesson: a parallel table of the same words drifts the moment one of them
 * changes, and nothing fails when it does.
 */
export const SPECIES_NAMES: Record<SpeciesId, string> = Object.fromEntries(
  SPECIES_IDS.map((id) => [id, SPECIES[id].name]),
) as Record<SpeciesId, string>;

/**
 * An untrusted route param as a species, or `null`.
 *
 * `null` is a real answer — "never asked" — not a failure, matching the
 * nullable column. Takes `unknown` rather than expo-router's
 * `string | string[] | undefined` so the validation is total: this is the
 * boundary where a value off a URL stops being data.
 */
export function parseSpecies(raw: unknown): SpeciesId | null {
  if (typeof raw !== 'string') return null;
  return (SPECIES_IDS as readonly string[]).includes(raw) ? (raw as SpeciesId) : null;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/character/species.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/character/species.ts src/features/character/species.test.ts
git commit -m "feat: the species registry"
```

---

### Task 2: The migration

**Files:**
- Create: `supabase/migrations/20260818120000_species.sql`
- Modify: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: the species ids from Task 1 (as SQL literals — the CHECK and `SPECIES_IDS` are kept in step by Task 1's test, not by an import).
- Produces: `profiles.species text` nullable; `species` in the INSERT and UPDATE column grants; `squad_leaderboard()` returning an additional `species text` column, positioned last.

- [ ] **Step 1: Write the failing schema tests**

Append to `supabase/tests/schema.test.ts`:

```ts
describe('profiles.species', () => {
  it('exists and is nullable', async () => {
    const rows = await h.asService<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'species'`,
    );
    // NULL means "never asked", which every row predating this column is.
    // A not-null default would backfill an assertion nobody made — and the
    // one-time picker keys off exactly this null.
    expect(rows[0]!.is_nullable).toBe('YES');
    expect(rows[0]!.data_type).toBe('text');
  });

  it('accepts each of the four species', async () => {
    const user = await h.createUser();
    for (const s of ['pilandok', 'tamaraw', 'carabao', 'eagle']) {
      await h.asService(`update public.profiles set species = $2 where id = $1`, [user, s]);
      const rows = await h.asService<{ species: string }>(
        `select species from public.profiles where id = $1`,
        [user],
      );
      expect(rows[0]!.species).toBe(s);
    }
  });

  it('rejects a value outside the CHECK', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(`update public.profiles set species = 'tarsier' where id = $1`, [user]),
      /species/,
    );
  });

  it('lets a client set it on their own row', async () => {
    // The swap path: the profile screen UPDATEs directly under the
    // column-scoped grant, with no RPC in between.
    const user = await h.createUser();
    await h.asUser(user, `update public.profiles set species = 'eagle' where id = $1`, [user]);
    const rows = await h.asService<{ species: string }>(
      `select species from public.profiles where id = $1`,
      [user],
    );
    expect(rows[0]!.species).toBe('eagle');
  });

  it('is in the column-scoped INSERT grant', async () => {
    const rows = await h.asService<{ column_name: string }>(
      `select distinct column_name from information_schema.column_privileges
       where table_name = 'profiles' and grantee = 'authenticated'
         and privilege_type = 'INSERT' order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'birth_year',
      'character_body',
      'character_name',
      'class',
      'exclude_from_recap',
      'height_cm',
      'id',
      'sex',
      'species',
      'timezone',
      'weight_kg',
    ]);
  });

  it('is in the column-scoped UPDATE grant, and the rest survived the rebuild', async () => {
    const rows = await h.asService<{ column_name: string }>(
      `select distinct column_name from information_schema.column_privileges
       where table_name = 'profiles' and grantee = 'authenticated'
         and privilege_type = 'UPDATE' order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'birth_year',
      'character_body',
      'character_name',
      'class',
      'exclude_from_recap',
      'height_cm',
      'sex',
      'species',
      'timezone',
      'trains_run',
      'trains_strength',
      'weight_kg',
    ]);
  });

  it('still refuses server-awarded columns after the grant rebuild', async () => {
    // The rebuild rewrites the whole column list. This is the half a careless
    // rebuild gets wrong: widening the grant past what was intended.
    const user = await h.createUser();
    await rejects(
      h.asUser(user, `update public.profiles set level = 99 where id = $1`, [user]),
      /permission denied/i,
    );
  });

  it('keeps has_wearable out of both write grants', async () => {
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from information_schema.column_privileges
       where table_name = 'profiles' and grantee = 'authenticated'
         and column_name = 'has_wearable'
         and privilege_type in ('INSERT', 'UPDATE')`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('squad_leaderboard projects species', () => {
  it('returns species last, and the rest of the row shape is unchanged', async () => {
    // The row shape is pinned because this RPC *is* the §5 privacy boundary:
    // squadmates reach data only through it. Species is cosmetic and
    // non-sensitive, unlike steps or heart rate — but the pin is what makes
    // adding a column a decision rather than an accident.
    const rows = await h.asService<{ column_name: string; ordinal_position: number }>(
      `select p.column_name, p.ordinal_position
         from information_schema.parameters p
         join information_schema.routines r using (specific_name)
        where r.routine_schema = 'public' and r.routine_name = 'squad_leaderboard'
          and p.parameter_mode = 'TABLE'
        order by p.ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'rank',
      'user_id',
      'character_name',
      'class',
      'level',
      'local_date',
      'total',
      'tiers',
      'ratings',
      'contributing_stats',
      'has_rec',
      'flagged',
      'status',
      'current_streak',
      'is_self',
      'program',
      'species',
    ]);
  });

  it('shows a squadmate their squadmate species', async () => {
    const { squadId, leader, member } = await h.createSquadWithMembers();
    await h.asService(`update public.profiles set species = 'tamaraw' where id = $1`, [member]);
    const rows = await h.asUser<{ character_name: string; species: string | null }>(
      leader,
      'select character_name, species from public.squad_leaderboard($1)',
      [squadId],
    );
    expect(rows.some((r) => r.species === 'tamaraw')).toBe(true);
  });

  it('reports null for a squadmate who has never chosen', async () => {
    // Null is the pre-migration state and must reach the client as null, not
    // as a default — the client renders a neutral figure for it.
    const { squadId, leader } = await h.createSquadWithMembers();
    const rows = await h.asUser<{ species: string | null }>(
      leader,
      'select species from public.squad_leaderboard($1)',
      [squadId],
    );
    expect(rows.every((r) => r.species === null || typeof r.species === 'string')).toBe(true);
  });
});
```

**Note for the implementer:** `h.createSquadWithMembers()` is illustrative — use whatever squad fixture the surrounding `squad_leaderboard` describes already use (see `supabase/tests/schema.test.ts:1396`) and match its exact helper names and destructuring. Do not add a new fixture.

- [ ] **Step 2: Run the schema suite and verify it fails**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "species"`
Expected: FAIL — `column "species" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260818120000_species.sql`:

```sql
-- Which animal the player's character is: profiles.species.
--
-- Founder decision 2026-08-18, design
-- `docs/superpowers/specs/2026-08-18-animal-character-system-design.md`,
-- roadmap deviation #40. Replaces the male/female body choice (#27). §6 files
-- character appearance under "Cosmetic / Flavor Only — No Stat Advantage" and
-- this is that, stored.
--
-- **A new column rather than a widened `character_body`.** Widening would save
-- a migration and cost two things worth more: the column name would lie about
-- what it holds, and the existing 'male'/'female' rows would have to either be
-- migrated to a species nobody chose or left as values the picker can no longer
-- produce. `character_body` is left dead in place instead — the same
-- disposition, and for the same reason, as `profiles.sex`.
--
-- **Nullable on purpose, twice over.** NULL means *never asked*, the true state
-- of every existing row — and the client keys the one-time picker off exactly
-- that null, so a `not null default` would not merely backfill an assertion
-- nobody made, it would silently skip the prompt for every existing user.

begin;

alter table public.profiles
  add column species text
    check (species in ('pilandok', 'tamaraw', 'carabao', 'eagle'));

comment on column public.profiles.species is
  'Which animal the player chose. NULL = never asked. Cosmetic only (§6) — never read by scoring.';

comment on column public.profiles.character_body is
  'DEAD as of 2026-08-18 (deviation #40). Superseded by profiles.species. Never written, read by no surface. Kept rather than dropped for the same reason profiles.sex is: dropping a column is not free, and a comment costs nothing.';

-- ---------------------------------------------------------------------------
-- 1. Rebuild the column-scoped client grants to include it
-- ---------------------------------------------------------------------------
--
-- The usual Postgres caveat, for the seventh time in this repo: a column-level
-- REVOKE against a table-level GRANT is silently a no-op. Revoke the table
-- grant, then re-grant exactly the allowed columns.
--
-- INSERT because onboarding sets it in the single profile INSERT on /name.
-- UPDATE because the choice is changeable from the profile screen — unlike
-- `character_body`, which held an UPDATE grant no screen ever used.
--
-- `character_body` stays in both lists. It is dead, not revoked: pruning it
-- here would be a second behaviour in a migration that is already rebuilding
-- the grants, and a client writing a column nothing reads is inert.
--
-- `has_wearable` stays out of both, as 20260807100000 established: capability
-- is observed by `sync-health`, never asserted by a client.

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  character_name,
  character_body,
  species,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap
) on public.profiles to authenticated;

revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  character_body,
  species,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap,
  trains_run,
  trains_strength
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Project species to squadmates
-- ---------------------------------------------------------------------------
--
-- `squad_leaderboard()` is the §5 privacy boundary: squadmates reach data only
-- through it, and it deliberately has no argument that returns raw steps or
-- hourly movement. **Species is safe to add and that is not self-evident, so:**
-- it is a cosmetic choice the player makes about their own avatar, carries no
-- health signal, and reveals nothing about behaviour — unlike a tier, which is
-- already projected, or heart rate, which is not and must not be.
--
-- Added LAST in the returns table so existing positional consumers are
-- unaffected. A `create or replace` cannot change a function's return type, so
-- this is a drop and recreate; the grant is re-issued below because dropping
-- the function drops it.
--
-- **The definition being extended is 20260810150000_stat_rollups.sql, not
-- 20260809120000_remove_sabotage.sql.** The latter is an older version that
-- predates `ratings jsonb`, and because it uses `create or replace` while the
-- current one uses `create function`, a grep for `create or replace function
-- public.squad_leaderboard` finds the stale one. Extending it would drop
-- `ratings` — which `LeaderboardRow` in src/features/squad/queries.ts reads to
-- render every ability number on the board.

drop function if exists public.squad_leaderboard(uuid, date, text, uuid);

create or replace function public.squad_leaderboard(
  p_squad_id uuid,
  p_local_date date default null,
  p_mode text default 'current',
  p_as_user uuid default null
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
  ratings jsonb,
  contributing_stats smallint,
  has_rec boolean,
  flagged boolean,
  status public.day_status,
  current_streak integer,
  is_self boolean,
  program text,
  species text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- IMPLEMENTER: copy the body verbatim from
  -- supabase/migrations/20260810150000_stat_rollups.sql:205 onward — that is
  -- the CURRENT definition, **not** 20260809120000_remove_sabotage.sql, which
  -- is an older one that predates the `ratings` column and would silently drop
  -- it. `20260810150000` uses `create function`, not `create or replace`, which
  -- is why a grep for the latter finds the wrong file. Then make exactly two
  -- changes:
  --   1. add `p.species` to the final SELECT list, positioned last;
  --   2. add `species` to any explicit column list in the RETURN QUERY.
  -- Change nothing else. The auth check, the mode validation, the
  -- `coalesce((select auth.uid()), p_as_user)` ordering and the program
  -- weighting are all load-bearing and are not what this migration is about.
end;
$$;

revoke all on function public.squad_leaderboard(uuid, date, text, uuid) from public, anon;
grant execute on function public.squad_leaderboard(uuid, date, text, uuid) to authenticated;

commit;
```

- [ ] **Step 4: Run the schema suite and verify it passes**

Run: `npm run test:schema`
Expected: PASS — including the pre-existing `squad_leaderboard` describes, which must be unaffected. If any of them fail, the function body was not copied verbatim; fix that rather than the test.

- [ ] **Step 5: Apply to the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260818120000_species.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260818120000')"
./supabase/scripts/remote-sql.sh "select column_name from information_schema.columns where table_name='profiles' and column_name='species'"
```
Expected: the third command returns one row.

- [ ] **Step 6: Confirm no Edge Function redeploy is owed**

Run: `grep -rn "squad_leaderboard\|character_body" supabase/functions/`
Expected: no hits. A migration touching a table an Edge Function writes must ship with that function's redeploy — this one touches neither, and confirming that is cheaper than the two-day scoring outage that rule came from.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260818120000_species.sql supabase/tests/schema.test.ts
git commit -m "feat: profiles.species, granted and projected"
```

---

### Task 3: The profile row carries species

**Files:**
- Modify: `src/features/profile/queries.ts:20` (row type), `:71` (select list)
- Modify: `src/features/profile/create-profile.ts`

**Interfaces:**
- Consumes: `SpeciesId` from Task 1.
- Produces: `Profile.species: SpeciesId | null`; `NewProfile = { name: string; species: SpeciesId | null }`.

- [ ] **Step 1: Add species to the profile row type and select list**

In `src/features/profile/queries.ts`, add to the row type beside `character_body`:

```ts
  species: SpeciesId | null;
```

and add `species` to the select string at line 71 (append to the existing comma-separated list — do not reorder it).

Import the type:

```ts
import type { SpeciesId } from '@/features/character/species.ts';
```

- [ ] **Step 2: Widen NewProfile and the INSERT**

In `src/features/profile/create-profile.ts`:

```ts
import type { SpeciesId } from '@/features/character/species.ts';

export type NewProfile = {
  name: string;
  /** Null when the choice screen was bypassed — the column is nullable for it. */
  species: SpeciesId | null;
};
```

and in the insert object, replace `character_body: body,` with:

```ts
        species,
```

destructuring `{ name, species }` in `mutationFn`. **Leave the comment above the insert intact** — the column-scoped grant note still applies, and `level`/`total_xp`/`is_legendary` are still deliberately absent.

- [ ] **Step 3: Typecheck and see the expected breakage**

Run: `npm run typecheck`
Expected: FAIL in `app/(onboard)/name.tsx` and `app/(tabs)/index.tsx`, which still pass `body`. That is the correct blast radius; Tasks 4 and 5 fix it. Do not patch them here.

- [ ] **Step 4: Commit**

```bash
git add src/features/profile/queries.ts src/features/profile/create-profile.ts
git commit -m "feat: the profile row carries species"
```

---

### Task 4: Placeholder art, and the figure takes a species

**Files:**
- Create: `assets/character/species/{pilandok,tamaraw,carabao,eagle}.png`
- Create: `assets/character/species/habitat-{pilandok,tamaraw,carabao,eagle}.png`
- Create: `src/features/character/species-art.ts`
- Modify: `src/features/character/CharacterFigure.tsx`
- Modify: `src/features/character/Diorama.tsx`
- Modify: `app/(tabs)/index.tsx:281-285`

**Interfaces:**
- Consumes: `SpeciesId`, `SPECIES` from Task 1; `Profile.species` from Task 3.
- Produces: `SPECIES_FIGURES: Record<SpeciesId, ImageSourcePropType>`, `SPECIES_HABITATS: Record<SpeciesId, ImageSourcePropType>`; `CharacterFigure` and `Diorama` taking `species?: SpeciesId | null`.

- [ ] **Step 1: Generate placeholder art**

Eight flat PNGs, transparent, 512×1024 for figures and 1024×1024 for habitats, each a solid silhouette in the species' `hue` from Task 1. Any tool — these exist to make the layout real and to prove the swap path, and they are replaced file-for-file when the illustrator delivers.

**Two properties are load-bearing even for placeholders:** transparent background (`Panel` and `Diorama` draw the ground), and **no ground shadow baked in** — `GroundShadow` draws it, keyed to level stage, which is what lets one asset read correctly at all four stages.

- [ ] **Step 2: Write the art map**

Create `src/features/character/species-art.ts`:

```ts
import type { ImageSourcePropType } from 'react-native';
import type { SpeciesId } from './species.ts';

/**
 * Species art, keyed by id.
 *
 * **Written out literally rather than built from the id**, for the same reason
 * `CHARACTER_ART` and `ANCHORS` were: Metro resolves `require` statically, so a
 * computed path is not a path it can follow — a template string here is a
 * runtime miss, not a bundling error, and fails silently on device.
 *
 * Separate from `species.ts` because that module imports nothing at runtime so
 * root Vitest can test it; a `require` of a PNG would end that.
 *
 * Placeholder art as of 2026-08-18. Real art swaps in file-for-file with no
 * code change — the contract is: transparent, up to 2:1 portrait for a figure,
 * and **no ground shadow baked in**, because `GroundShadow` draws it keyed to
 * level stage. Baking one in is what would make a single asset read wrong at
 * three of the four stages.
 */
export const SPECIES_FIGURES: Record<SpeciesId, ImageSourcePropType> = {
  pilandok: require('../../../assets/character/species/pilandok.png'),
  tamaraw: require('../../../assets/character/species/tamaraw.png'),
  carabao: require('../../../assets/character/species/carabao.png'),
  eagle: require('../../../assets/character/species/eagle.png'),
};

export const SPECIES_HABITATS: Record<SpeciesId, ImageSourcePropType> = {
  pilandok: require('../../../assets/character/species/habitat-pilandok.png'),
  tamaraw: require('../../../assets/character/species/habitat-tamaraw.png'),
  carabao: require('../../../assets/character/species/habitat-carabao.png'),
  eagle: require('../../../assets/character/species/habitat-eagle.png'),
};
```

- [ ] **Step 3: Swap the figure's prop**

In `src/features/character/CharacterFigure.tsx`:

- Replace the `CharacterBody` import with `import type { SpeciesId } from './species.ts';` and `import { SPECIES_FIGURES } from './species-art.ts';`
- Delete the `ANCHORS` map and the `CHARACTER_ART` map with its `ArtKey` type and `artKey()` helper — the stage × dominance art matrix is superseded by one artwork per species (spec §4). The primitives fallback stays for a null species.
- Replace the `body` prop with:

```ts
  /**
   * Which animal. Null or undefined means the profile predates the choice, or
   * has not loaded — both render the primitives below, which is the neutral
   * figure the one-time picker exists to replace.
   */
  species?: SpeciesId | null;
```

- Replace line 145 with:

```ts
  const art = species ? SPECIES_FIGURES[species] : undefined;
```

Leave `build`, `scale`, `shadowWidth`, `shadowOpacity`, `auraStrength` and everything downstream **exactly as they are**. That they need no change is the point of "one artwork per species" — and if a diff here grows past the prop and the art lookup, stop and re-read spec §4.

- [ ] **Step 4: Give the diorama a habitat**

In `src/features/character/Diorama.tsx`:

- Same import swap; prop `body?: CharacterBody | null` becomes `species?: SpeciesId | null`; pass `species={species}` to `CharacterFigure` at line 131.
- Render the habitat behind the existing sage gradient and in front of nothing else:

```tsx
{species && (
  <Image
    source={SPECIES_HABITATS[species]}
    style={StyleSheet.absoluteFill}
    resizeMode="cover"
    // Decorative. The figure's own label already says where the character is
    // by naming the species, and a backdrop that announced itself would be a
    // second stop describing scenery.
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  />
)}
```

- Replace the "sky is sage rather than a literal outdoors" paragraph in the file's doc comment with:

```
 * The sky was sage rather than a literal outdoors until 2026-08-18, on the
 * reasoning that "a photographic landscape would date instantly and fight the
 * flat character art". Deviation #40 overrides that deliberately: the habitats
 * are flat vector in the same bold-outline language as the figure, so they are
 * neither photographic nor fighting it. The sage gradient stays underneath as
 * the ground for a character with no species yet.
```

- [ ] **Step 5: Update the home screen's call**

In `app/(tabs)/index.tsx:285`, replace `body={profile.data?.character_body}` with `species={profile.data?.species}`.

- [ ] **Step 6: Typecheck and run the app**

Run: `npm run typecheck` — expected FAIL only in `app/(onboard)/name.tsx` and `app/(onboard)/character.tsx`, which Task 5 fixes.
Run: `npm run ios`, sign in on an account with `species` set via SQL, and confirm the figure and habitat render.

- [ ] **Step 7: Commit**

```bash
git add assets/character/species src/features/character/species-art.ts \
        src/features/character/CharacterFigure.tsx src/features/character/Diorama.tsx \
        "app/(tabs)/index.tsx"
git commit -m "feat: the figure is a species, standing in its habitat"
```

---

### Task 5: The picker, and onboarding

**Files:**
- Create: `src/features/character/SpeciesPicker.tsx`
- Modify: `app/(onboard)/character.tsx` (replace its body)
- Modify: `app/(onboard)/name.tsx:33,39`

**Interfaces:**
- Consumes: `SPECIES`, `SPECIES_IDS`, `SpeciesId`, `parseSpecies` (Task 1); `SPECIES_FIGURES` (Task 4); `NewProfile` (Task 3).
- Produces: `SpeciesPicker({ title: string; help: string; cta: string; selected: SpeciesId | null; onSelect: (id: SpeciesId) => void; onConfirm: (id: SpeciesId) => void; busy?: boolean })`.

- [ ] **Step 1: Write the picker**

Create `src/features/character/SpeciesPicker.tsx`:

```tsx
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Label, Text } from '@/ui/index.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { SPECIES, SPECIES_IDS, type SpeciesId } from './species.ts';
import { SPECIES_FIGURES } from './species-art.ts';

/**
 * Choose an animal. Mounted by both routes — see `app/species.tsx` for why
 * there are two — with the commit behaviour supplied by the caller.
 *
 * **Vertical and scrolling, not the two-up row `/character` used.** That row
 * could not fit past ~1.3x Dynamic Type, and four cards each carrying art, a
 * name and a blurb is strictly worse. The three defences below are the ones
 * the permission sheet needed on 2026-08-17, and all three are load-bearing:
 * `Panel` and screens like this set `overflow: 'hidden'`, so oversized content
 * is not visibly spilled — it is silently clipped, and the control that lets
 * someone act disappears with no warning at any normal text size.
 */
export function SpeciesPicker({
  title,
  help,
  cta,
  selected,
  onSelect,
  onConfirm,
  busy = false,
}: {
  title: string;
  help: string;
  cta: string;
  selected: SpeciesId | null;
  onSelect: (id: SpeciesId) => void;
  onConfirm: (id: SpeciesId) => void;
  busy?: boolean;
}) {
  // An explicit point width for the text container. `width: '100%'` does NOT
  // work here: a percentage resolves against a ScrollView whose own size
  // depends on measuring this content, so direct Text children lay out wider
  // than the card and clip mid-word.
  const { width } = useWindowDimensions();
  const textWidth = width - space.lg * 2 - space.md * 2 - 72;

  return (
    <View style={styles.container}>
      <Label>CHOOSE YOUR COMPANION</Label>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.help}>{help}</Text>

      {/* flexGrow: 0 / flexShrink: 1 so the screen still hugs short content
          instead of always taking the full height. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>
        {SPECIES_IDS.map((id) => {
          const s = SPECIES[id];
          const chosen = selected === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${s.name}. ${s.blurb}`}
              onPress={() => onSelect(id)}
              style={[styles.card, chosen && { borderColor: s.hue, borderWidth: 2 }]}
            >
              {/* The card's own label already names the species. */}
              <Image
                source={SPECIES_FIGURES[id]}
                style={styles.art}
                resizeMode="contain"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ width: textWidth }}
              >
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.blurb} scale="prose">
                  {s.blurb}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Button
        label={cta}
        disabled={!selected || busy}
        onPress={() => selected && onConfirm(selected)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: space.lg, gap: space.sm },
  title: { ...font.display.md, color: ramp.neutral[900] },
  help: { ...font.body.body, color: ramp.neutral[700], marginBottom: space.sm },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollInner: { gap: space.sm, paddingBottom: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  art: { width: 72, height: 72 },
  name: { ...font.body.strong, color: ramp.neutral[900] },
  blurb: { ...font.body.body, fontSize: 14.5, color: ramp.neutral[700], marginTop: 2 },
});
```

**Adjust `font.*`, `space.*` and `radius.*` to the exact keys `theme.ts` exports** — the shapes above follow `app/(onboard)/character.tsx` and `app/(tabs)/profile.tsx`, but do not invent a token. The four properties that are not stylistic and must survive any adjustment:

- **Vertical and scrolling**, never a two-column row.
- **`flexGrow: 0, flexShrink: 1` on the `ScrollView`.**
- **An explicit point width on the text `View`**, never `width: '100%'`.
- **`Text` imported from `@/ui`**, never from `react-native`.

- [ ] **Step 2: Rewrite the onboarding screen**

Replace the body of `app/(onboard)/character.tsx` with a `SpeciesPicker` that pushes `` router.push(`/name?species=${chosen}`) ``.

Keep the file's existing doc comment about **why this screen writes nothing** — it is unchanged and load-bearing. Replace the "deliberately silent on whether this can be changed later" comment with:

```
        {/* The promise is now kept: `species` is in the UPDATE grant and the
            profile screen pushes /species to change it. This comment used to
            explain why the screen had to stay silent — a promise the app did
            not keep, made at the highest-attention moment in onboarding. */}
```

and set the help copy to: `You can change this any time.`

- [ ] **Step 3: Read the species param on the name screen**

In `app/(onboard)/name.tsx`, replace the `parseCharacterBody` import and line 33 with:

```ts
import { parseSpecies } from '@/features/character/species.ts';
…
  const species = parseSpecies(useLocalSearchParams().species);
```

and line 39's mutation argument with `{ name, species }`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. `character-body.ts` and its test are now unreferenced by any screen — **leave both in place**; Task 10 decides their fate with the docs, and deleting them here mixes a cleanup into a feature commit.

- [ ] **Step 5: Verify onboarding end to end on the simulator**

Run: `npm run ios`, then sign in as a new user and walk `/connect` → `/character` → `/name`. Confirm with:

```bash
./supabase/scripts/remote-sql.sh "select character_name, species, character_body from public.profiles order by created_at desc limit 1"
```
Expected: the chosen species, and `character_body` null.

- [ ] **Step 6: Verify at the largest accessibility text size**

```bash
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
```
**Then relaunch the app** — RN caches text measurements, so a live size change renders correct text inside stale boxes and looks exactly like a layout regression. Screenshot with `xcrun simctl io booted screenshot`. Every card's name and blurb must be fully visible and the confirm button reachable. Reset with `xcrun simctl ui booted content_size medium`.

- [ ] **Step 7: Commit**

```bash
git add src/features/character/SpeciesPicker.tsx "app/(onboard)/character.tsx" "app/(onboard)/name.tsx"
git commit -m "feat: onboarding picks a species"
```

---

### Task 6: The one-time picker for existing users

**Files:**
- Create: `app/species.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: `SpeciesPicker` (Task 5); `Profile.species` (Task 3).
- Produces: the `/species` route, reachable from home (once) and from the profile screen (any time).

- [ ] **Step 1: Write the route**

Create `app/species.tsx`:

```tsx
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SpeciesPicker } from '@/features/character/SpeciesPicker.tsx';
import type { SpeciesId } from '@/features/character/species.ts';
import { profileKey, useProfile } from '@/features/profile/queries.ts';
import { useSession } from '@/features/auth/useSession.ts';
import { supabase } from '@/lib/supabase.ts';
import { BackRow, Screen } from '@/ui/index.ts';

export default function ChooseSpecies() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useSession().user?.id;
  const profile = useProfile(userId);
  const [selected, setSelected] = useState<SpeciesId | null>(
    profile.data?.species ?? null,
  );

  const save = useMutation({
    mutationFn: async (species: SpeciesId) => {
      if (!userId) throw new Error('Not signed in.');
      // A direct UPDATE under the column-scoped grant — there is no RPC, and
      // RLS confines it to auth.uid()'s own row. Raw PostgrestError text never
      // reaches the screen; see create-profile.ts for why.
      const { error } = await supabase
        .from('profiles')
        .update({ species })
        .eq('id', userId);
      if (error) {
        console.warn('[chooseSpecies] update failed', error.code, error.message);
        throw new Error("Couldn't save that. Check your connection and try again.");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileKey(userId) });
      router.back();
    },
  });

  const first = profile.data?.species == null;

  return (
    <Screen>
      <BackRow />
      <SpeciesPicker
        title={first ? 'Who’s coming with you?' : 'Change your companion'}
        help={
          first
            ? 'Your character is one of four animals found only in the Philippines. You can change this any time.'
            : 'Purely cosmetic — nothing about your stats or scores changes.'
        }
        cta={first ? 'Choose' : 'Save'}
        selected={selected}
        onSelect={setSelected}
        onConfirm={(id) => save.mutate(id)}
        busy={save.isPending}
      />
    </Screen>
  );
}
```

**Match `useSession` and `useProfile` to their real names and signatures** in `src/features/auth/` and `src/features/profile/queries.ts` — the shapes above follow how `app/delete-account.tsx` reaches the session and profile. Do not add a new hook.

Head the file with:

```tsx
/**
 * Choose or change your species.
 *
 * **Groupless on purpose, and it is the only shape that works.**
 * `redirectTarget` cuts both ways: a `ready` user in `(onboard)` is bounced to
 * `/`, and a `needs-profile` user *outside* `(onboard)` is bounced to
 * `/connect`. So no single route can serve both onboarding and an existing
 * user — `app/(onboard)/character.tsx` mounts the same picker for onboarding,
 * and this route serves everyone past it. Groupless is what the `ready` case's
 * denylist explicitly permits, the same as `/goal/new` and `/delete-account`.
 *
 * Unlike the onboarding mount, this one **writes**: the profile row already
 * exists, so there is no INSERT to defer to and deviation #22's ordering rule
 * does not apply here.
 */
```

- [ ] **Step 2: Prompt once from home**

In `app/(tabs)/index.tsx`, when the profile has loaded and `species` is null, push `/species` once per app session (an in-module `let prompted = false`, or the existing MMKV once-ever pattern if a permanent dismissal is wanted).

**Gate on the loaded profile, never on the in-flight one.** This is deviation #37's fourth lesson in a new place: `profile.data?.species` reads `undefined` while the query is in flight, which is indistinguishable from null, and prompting on that frame throws the picker at a user who already has a species. Require `profile.isSuccess` before reading it.

- [ ] **Step 3: Add the profile-screen entry**

In `app/(tabs)/profile.tsx`, a `Panel` above the existing Timezone panel showing the current species name and pushing `/species`, following that panel's markup exactly.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Verify all three paths on the simulator**

```bash
./supabase/scripts/remote-sql.sh "update public.profiles set species = null where character_name = '<your test character>'"
```
Then: (a) relaunch — the picker appears once, and choosing returns you home with the new figure; (b) relaunch again — no prompt; (c) profile screen → change species → the home figure changes. Confirm none of the three ever bounces to `/connect` or `/`.

- [ ] **Step 6: Commit**

```bash
git add app/species.tsx "app/(tabs)/index.tsx" "app/(tabs)/profile.tsx"
git commit -m "feat: choose or change your species after onboarding"
```

---

### Task 7: The figure says what it is

**Files:**
- Create: `src/features/character/species-label.ts`
- Create: `src/features/character/species-label.test.ts`
- Modify: `src/features/character/Diorama.tsx`

**Interfaces:**
- Consumes: `SpeciesId`, `CoreStat`, `Dominance` as types only.
- Produces: `speciesFigureLabel(input: { species: SpeciesId | null; level: number; dominance: Dominance; speciesNames: Record<SpeciesId, string>; statNames: Record<CoreStat, string> }): string`.

- [ ] **Step 1: Write the failing test**

Create `src/features/character/species-label.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SPECIES_NAMES } from './species.ts';
import { speciesFigureLabel } from './species-label.ts';

const statNames = { AGI: 'Agility', STR: 'Strength', END: 'Endurance', VIT: 'Vitality' } as const;
const base = { speciesNames: SPECIES_NAMES, statNames };

describe('speciesFigureLabel', () => {
  it('names the species, the level and the dominant stat', () => {
    expect(
      speciesFigureLabel({ ...base, species: 'eagle', level: 12, dominance: 'AGI' }),
    ).toBe('Philippine Eagle, level 12, Agility-dominant');
  });

  it('never says the character name', () => {
    // The name is already printed beside the figure. Repeating it is the noise
    // the StatCoin-inside-StatRail label was reverted for. There is deliberately
    // no parameter for it — the omission is structural, not a caller's choice.
    const label = speciesFigureLabel({ ...base, species: 'tamaraw', level: 3, dominance: 'STR' });
    expect(label).not.toMatch(/,\s*[A-Z][a-z]+\s*,/);
    expect(label).toBe('Tamaraw, level 3, Strength-dominant');
  });

  it('says balanced rather than naming a stat', () => {
    expect(
      speciesFigureLabel({ ...base, species: 'carabao', level: 8, dominance: 'balanced' }),
    ).toBe('Carabao, level 8, balanced');
  });

  it('drops the dominance clause when there is none yet', () => {
    // A new character has no dominance. "null-dominant" is not a thing, and a
    // trailing comma is worse out loud than a shorter sentence.
    expect(
      speciesFigureLabel({ ...base, species: 'pilandok', level: 1, dominance: null }),
    ).toBe('Pilandok, level 1');
  });

  it('falls back to a neutral noun when no species has been chosen', () => {
    // Every row predating the migration, plus anyone who dismissed the picker.
    expect(
      speciesFigureLabel({ ...base, species: null, level: 5, dominance: 'END' }),
    ).toBe('Your character, level 5, Endurance-dominant');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/character/species-label.test.ts`
Expected: FAIL — `Failed to resolve import "./species-label.ts"`.

- [ ] **Step 3: Write the label**

Create `src/features/character/species-label.ts`:

```ts
import type { CoreStat, Dominance } from '@kairo/core';
import type { SpeciesId } from './species.ts';

/**
 * The character figure, said out loud.
 *
 * The figure says three things without words: which animal you are (the art),
 * how far you have got (the ground shadow widens with the level band), and
 * what you have actually been doing (the shadow's tint and the presence ring).
 * Left unlabelled that is a picture; composed, it is one sentence.
 *
 * **The character name is deliberately absent, and there is no parameter for
 * it** — the omission is structural rather than a caller's choice. The name is
 * already rendered as text beside the figure, and a label that repeats adjacent
 * text is noise. That is the same rule that got `StatCoin`'s label inside
 * `StatRail` reverted.
 *
 * Pure, and tested in Node, for the same reason `row-label.ts` and
 * `program-copy.ts` are: the conditionals here read as obviously right and are
 * wrong at the edges — a character with no dominance yet, and one with no
 * species at all. Names are injected so this module imports no UI.
 */
export interface SpeciesLabelInput {
  /** Null for a profile predating the choice, or one that dismissed the picker. */
  species: SpeciesId | null;
  level: number;
  /** Null for a character with nothing scored yet. */
  dominance: Dominance;
  speciesNames: Record<SpeciesId, string>;
  statNames: Record<CoreStat, string>;
}

export function speciesFigureLabel(input: SpeciesLabelInput): string {
  const who = input.species ? input.speciesNames[input.species] : 'Your character';
  const parts = [who, `level ${input.level}`];

  // No clause at all rather than an empty one: "null-dominant" is not a thing,
  // and a trailing comma is audible.
  if (input.dominance === 'balanced') parts.push('balanced');
  else if (input.dominance) parts.push(`${input.statNames[input.dominance]}-dominant`);

  return parts.join(', ');
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/character/species-label.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the diorama**

Wrap the figure and its habitat in a `View` carrying `accessible` **and** `accessibilityLabel={speciesFigureLabel(...)}`, and give every direct child `accessibilityElementsHidden` **and** `importantForAccessibility="no-hide-descendants"`.

**Both halves, on both sides.** The 2026-08-14 device pass found that `accessible` + `accessibilityLabel` on a parent is documented to collapse its descendants on iOS and did not on that build. The mechanism is still unconfirmed; the fix deliberately does not depend on it. Removing either half is how this comes back.

- [ ] **Step 6: Verify in Accessibility Inspector**

Open Xcode → Developer Tools → Accessibility Inspector, target the simulator, and step through the character screen. The figure, its shadow, its ring and its habitat must be **one** element speaking the composed label — not four. This answers the question directly, with no VoiceOver gestures and no build.

- [ ] **Step 7: Commit**

```bash
git add src/features/character/species-label.ts src/features/character/species-label.test.ts \
        src/features/character/Diorama.tsx
git commit -m "feat: the figure says which animal it is"
```

---

### Task 8: Species on the social surfaces

**Files:**
- Modify: `src/features/squad/queries.ts:26` — the `LeaderboardRow` type, and the RPC call at `:170`
- Modify: `src/features/squad/LeaderboardRow.tsx:85` — the `Avatar` call
- Modify: `src/features/squad/row-label.ts` + `row-label.test.ts`
- Modify: the goal participants component under `src/features/goals/`

**Interfaces:**
- Consumes: `squad_leaderboard()`'s `species` column (Task 2); `SPECIES_FIGURES`, `SPECIES_NAMES`.
- Produces: species art on leaderboard rows, the roster, and goal cards.

- [ ] **Step 1: Add species to the leaderboard row type**

`src/features/squad/queries.ts:26` declares `LeaderboardRow` as "exactly the columns `squad_leaderboard()` returns". Append, matching that comment's promise:

```ts
  /**
   * Which animal the squadmate chose, or null for anyone predating the choice.
   * Cosmetic — it is in this projection because it reveals nothing (§5), not
   * because it is needed for ranking.
   */
  species: SpeciesId | null;
```

The call at `:170` is `supabase.rpc('squad_leaderboard', …)`, which returns every column the function declares — so **no select list to update**, and the type is the whole change.

- [ ] **Step 2: Render the species icon in place of the initial disc**

At `src/features/squad/LeaderboardRow.tsx:85`, replace the `Avatar` call with:

```tsx
{row.species ? (
  // Replaces the disc rather than sitting beside it. Avatar's tints are
  // terracotta and sage — the palette's only two hues — and four species
  // hues next to them is two colour systems in one row.
  <Image
    source={SPECIES_FIGURES[row.species]}
    style={{ width: 44, height: 44 }}
    resizeMode="contain"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  />
) : (
  /* `Avatar` already hides itself. Kept for anyone predating the choice. */
  <Avatar name={row.character_name} self={row.is_self} />
)}
```

**Replace rather than sit beside.** Two colour systems in one row — `Avatar`'s name-derived terracotta/sage discs and four species hues — is the collision spec §9 flagged. Falling back to `Avatar` for a null species keeps the row identifiable for anyone who has not chosen.

The image is `accessibilityElementsHidden`; the row is already one element with a composed label, and Step 3 is what puts the species into it.

- [ ] **Step 3: Add the species to the spoken row**

Extend `leaderboardRowLabel`'s input with `species?: string` (the resolved **name**, injected — the module imports no UI and must not start now) and place it directly after the character name, so the reading order stays rank → who → how much.

Write the test first, in `src/features/squad/row-label.test.ts`, following the cases already there:

```ts
it('names the species after the person', () => {
  expect(
    leaderboardRowLabel({ ...base, rank: 2, characterName: 'Bantay', species: 'Philippine Eagle' }),
  ).toContain('Bantay, Philippine Eagle');
});

it('omits the species clause entirely when there is none', () => {
  // Everyone who predates the migration. An empty clause would leave a doubled
  // comma, which is audible.
  const label = leaderboardRowLabel({ ...base, rank: 2, characterName: 'Bantay' });
  expect(label).not.toMatch(/,\s*,/);
});
```

- [ ] **Step 4: Add species to goal cards**

Render participants as their species art on the goal card — same `<Image>` shape as Step 2, at whatever size the card's existing participant row uses, `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`, with the existing participant label unchanged.

**Check what is already spoken there first.** Kairo's rule is that a label repeating adjacent text is noise, and `GoalBar`'s pace marker needed nothing because `statusLine()` already said "behind pace". If the card already names participants, the art adds nothing to say.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verify on the simulator**

Two accounts in one squad with different species. Confirm the board shows two distinguishable animals, and step the row in Accessibility Inspector to confirm it is still **one** element.

- [ ] **Step 7: Commit**

```bash
git add src/features/squad app/\(tabs\)/squad.tsx
git commit -m "feat: squadmates are their animals"
```

---

### Task 9: Smoke the deployed backend

**Files:** none — verification only.

- [ ] **Step 1: Confirm the deployed RPC returns the new column**

```bash
./supabase/scripts/remote-sql.sh "select species from public.squad_leaderboard('<a real squad id>')"
```
Expected: a `species` column, null or a species per row.

- [ ] **Step 2: Run the sync smoke test**

Run: `node supabase/scripts/smoke-sync.mjs`
Expected: PASS.

This migration touches no table an Edge Function writes, so nothing is owed a redeploy — but the two-day August outage happened because a migration and its function drifted and **every test passed the whole time**, since they check the source and not the deployed artifact. The smoke test is the guard that runs against what is actually deployed, and skipping it here is exactly the reasoning that failed then.

- [ ] **Step 3: Commit nothing**

Verification only. If either step fails, stop and fix before Task 10.

---

### Task 10: Documentation

**Files:**
- Modify: `docs/roadmap.md`, `CLAUDE.md`, `docs/user-journey.md`, `docs/mvp-scope.md`, `assets/character/README.md`
- Delete: `docs/kairo-animal-character-plan.md`
- Decide: `src/features/profile/character-body.ts` and its test

- [ ] **Step 1: Add roadmap deviation #40**

Append a row to the approved-deviations table (`docs/roadmap.md:27`), matching the depth of #35–#39 — those rows record what the *build* found, not just what the design intended. Cover:

- Spec says: the character is a human body, male or female (§6, deviation #27).
- We build: four Philippine endemic species, cosmetic-only, freely changeable.
- Why, and the four things worth recording:
  1. **`redirectTarget` cuts both ways** — a `ready` user cannot enter `(onboard)` and a `needs-profile` user cannot leave it, so one picker component is mounted by two thin routes. Reading half that function is what produced a spec that would have looped a new user between `/species` and `/connect` forever.
  2. **A new column rather than a widened `character_body`** — and `character_body` left dead in place, the same disposition as `profiles.sex`.
  3. **Species is safe in `squad_leaderboard()` and that is not self-evident** — it is a cosmetic self-declaration carrying no health signal, unlike heart rate, which is not projected and must not be.
  4. **One artwork per species, because the figure's responses are already code** — stage drives the ground shadow, dominance the tint, rating the ring. The stage × dominance art matrix (~96 assets) was deleted rather than filled.
- Note on the #27 row that it is superseded.

- [ ] **Step 2: Update CLAUDE.md**

Replace the "Onboarding is two screens as of 2026-08-11" paragraph. It must still say the profile row commits exactly once on the name screen and that steps go *before* the name — those are unchanged and load-bearing. It must now say: `profiles.species` is the choice, `character_body` is dead like `profiles.sex`, the picker is one component behind two routes because the gate forbids one, and species is cosmetic and never read by scoring.

Also amend the "Hunter and barkada were retired" paragraph: §20's "dark fantasy hunter aesthetic" brief and the `scripts/generate_swap_assets*.py` prompts are listed there as "a genuinely open decision the art regeneration has to settle". **Deviation #40 settles it** — flat vector, bold outlines, colourful. Say so, and drop them from the not-stale list.

- [ ] **Step 3: Update the remaining docs**

- `docs/user-journey.md` — onboarding and character sections.
- `docs/mvp-scope.md` — the character bullet under "Solo, and first-class", plus spec §13's out-of-scope list (animation beyond `Animated`, evolution art, skins, battle frames, roster beyond four, mechanical affinity, rep-counting, trading).
- `assets/character/README.md` — rewrite for the species keys and the art contract: transparent, up to 2:1 portrait, **no baked shadow**, layered source retained upstream.

- [ ] **Step 4: Delete the superseded draft**

```bash
git rm docs/kairo-animal-character-plan.md
```

Its content is superseded by the spec, whose §15 already records what it assumed that is no longer true.

- [ ] **Step 5: Decide `character-body.ts`**

`parseCharacterBody`, `CHARACTER_BODIES` and `character-body.test.ts` now have no caller. **Delete all three.** The column stays (with its new "DEAD" comment) and the schema test for it stays — that is what documents the column's disposition. A TypeScript parser for a value no screen can produce documents nothing, and leaving it invites a future reader to wire it back up.

- [ ] **Step 6: Run everything**

```bash
npm test && npm run typecheck
```
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: the character is an animal (deviation #40)"
```

---

## Not in this plan

- **The art itself.** Track A — AI style board, illustrator brief, the Eagle gate — runs in parallel and is not code. Real art swaps in file-for-file over Task 4's placeholders.
- **Brand.** App icon, logo restyle, store screenshots. Agreed, and its own spec.
- **Animation past `Animated` transforms**, evolution stages, skins, battle frames, roster growth, mechanical affinity, rep-counting. Spec §13.
