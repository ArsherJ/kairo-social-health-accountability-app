# Character Body Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding asks which character you play as — male or female — before the name, and the app renders the chosen character.

**Architecture:** A new nullable `profiles.character_body` column, set in the same single INSERT that already creates the profile. The choice is made on a new first onboarding screen and travels to the name screen as a route param, so the profile still commits exactly once — which is what keeps deviation #22's deleted `finishingOnboarding` flag deleted. The female character is generated as a GPT Image *edit* of the existing male anchor, so the two read as one game.

**Tech Stack:** Expo / React Native, Supabase Postgres (migrations applied over HTTPS), PGlite for schema tests, vitest, GPT Image via the bundled `image_gen.py` CLI.

**Spec:** `docs/superpowers/specs/2026-08-11-character-body-choice-design.md`

## Global Constraints

- **No mocking exists in this repo.** Zero `vi.mock` / `vi.fn` anywhere. Do not introduce it.
- **Only pure modules are unit-testable.** `vitest.config.ts` includes `src/**/*.test.ts` and its comment is binding: tested modules "must not import native modules or the `@/` alias, neither of which resolves here." `.test.tsx` is not in the include list — **there are no component tests**. UI is verified by hand on the simulator.
- **Docker is unavailable.** Migrations are applied with `./supabase/scripts/remote-sql.sh -f`, wrapped in `begin; ... commit;`, followed by a manual row in `supabase_migrations.schema_migrations`.
- **Column-level `REVOKE` against a table-level `GRANT` is silently a no-op in Postgres.** Revoke the table grant, then re-grant the complete column list.
- **`character_body` is nullable.** `null` means "never asked". Never add a `not null default`.
- **The stat/art map `CHARACTER_ART` stays empty and stays keyed `${stage}-${dominance}`.** Do not expand it to carry a body axis.
- Imports use explicit `.ts` / `.tsx` extensions.
- Copy never says "Hunter" or "barkada" (roadmap deviation #26).

## Correction to the spec

The spec's test table lists a **`create-profile` unit test**. That is not achievable: `create-profile.ts` imports `@/lib/supabase.ts`, and the `@/` alias does not resolve under vitest. Rather than introduce mocking, Task 1 extracts the one decision worth testing (**is this route param a valid body?**) into a pure module, matching how `route.ts`, `body-metrics.ts` and the `*-plan.ts` Edge Function modules are already structured. `create-profile.ts` itself stays hand-verified.

---

### Task 1: `character-body.ts` — the pure module

The only logic in this feature that a machine can check: turning an untrusted route param into a body or a null.

**Files:**
- Create: `src/features/profile/character-body.ts`
- Test: `src/features/profile/character-body.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CHARACTER_BODIES: readonly ['male', 'female']`
  - `type CharacterBody = 'male' | 'female'`
  - `parseCharacterBody(raw: unknown): CharacterBody | null`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/character-body.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHARACTER_BODIES, parseCharacterBody } from './character-body.ts';

describe('parseCharacterBody', () => {
  it('accepts each body the column allows', () => {
    expect(parseCharacterBody('male')).toBe('male');
    expect(parseCharacterBody('female')).toBe('female');
  });

  it('lists exactly the two values in the CHECK constraint', () => {
    // Mirrors `check (character_body in ('male', 'female'))`. A value this
    // accepts and the database rejects is a 23514 the user can do nothing
    // with — the same discipline body-metrics.ts applies to its bounds.
    expect([...CHARACTER_BODIES]).toEqual(['male', 'female']);
  });

  it('returns null for a missing param rather than throwing', () => {
    // Deep-linking /name directly is legitimate. The column is nullable
    // precisely so this renders a default character instead of a dead screen.
    expect(parseCharacterBody(undefined)).toBeNull();
    expect(parseCharacterBody(null)).toBeNull();
    expect(parseCharacterBody('')).toBeNull();
  });

  it('rejects a value outside the CHECK', () => {
    // `profiles.sex` allows 'other'; this column deliberately does not, and
    // the two must not be conflated.
    expect(parseCharacterBody('other')).toBeNull();
    expect(parseCharacterBody('Male')).toBeNull();
  });

  it('rejects a repeated query param', () => {
    // expo-router types a search param as `string | string[]`. `?body=male&body=female`
    // arrives as an array, which is an ambiguous answer, not a choice.
    expect(parseCharacterBody(['male', 'female'])).toBeNull();
    expect(parseCharacterBody(['male'])).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseCharacterBody(0)).toBeNull();
    expect(parseCharacterBody({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/profile/character-body.test.ts`

Expected: FAIL — `Failed to resolve import "./character-body.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/profile/character-body.ts`:

```ts
/**
 * Which character the player chose to be.
 *
 * Deliberately **not** `profiles.sex`. That column exists, is already in the
 * client grants, and would need no migration — but its documented purpose is
 * physiological (HealthKit's calorie estimate, §5) and this question is
 * cosmetic, which is how §6 files character appearance. One column answering
 * two questions is what deviation #22 removed `profiles.focus` for.
 *
 * The values mirror `check (character_body in ('male', 'female'))` in
 * `20260811120000_character_body.sql`. `sex` additionally allows 'other'; this
 * does not, and the two lists must not be assumed to track each other.
 */
export const CHARACTER_BODIES = ['male', 'female'] as const;

export type CharacterBody = (typeof CHARACTER_BODIES)[number];

/**
 * An untrusted route param as a body, or `null`.
 *
 * `null` is a real answer here — "never asked" — not a failure. Someone
 * deep-linking `/name` with no param gets the default character rather than a
 * screen that refuses to render, which is what the nullable column is for.
 *
 * Takes `unknown` rather than `string | string[] | undefined` so the validation
 * is total: this is the boundary where a value stops being data off a URL.
 */
export function parseCharacterBody(raw: unknown): CharacterBody | null {
  if (typeof raw !== 'string') return null;
  return (CHARACTER_BODIES as readonly string[]).includes(raw)
    ? (raw as CharacterBody)
    : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/profile/character-body.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/features/profile/character-body.ts src/features/profile/character-body.test.ts
git commit -m "feat: add CharacterBody type and route-param parser"
```

---

### Task 2: The migration and its schema tests

**Files:**
- Create: `supabase/migrations/20260811120000_character_body.sql`
- Modify: `supabase/tests/schema.test.ts` (add a describe block; **update the existing UPDATE-grant assertion at ~line 1391**)

**Interfaces:**
- Consumes: `CHARACTER_BODIES` from Task 1 (as the value list the CHECK mirrors — not imported; SQL restates it).
- Produces: `profiles.character_body text null check (character_body in ('male','female'))`, present in the INSERT and UPDATE column grants for `authenticated`.

- [ ] **Step 1: Write the failing tests**

Add to `supabase/tests/schema.test.ts`:

```ts
describe('profiles.character_body', () => {
  it('exists and is nullable', async () => {
    const rows = await h.asService<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'character_body'`,
    );
    // NULL means "never asked", which is what every profile created before
    // this column genuinely is. A not-null default would backfill an
    // assertion nobody made.
    expect(rows[0]!.is_nullable).toBe('YES');
    expect(rows[0]!.data_type).toBe('text');
  });

  it('accepts male and female', async () => {
    const user = await h.createUser();
    await h.asService(
      `update public.profiles set character_body = 'female' where id = $1`,
      [user],
    );
    const rows = await h.asService<{ character_body: string }>(
      `select character_body from public.profiles where id = $1`,
      [user],
    );
    expect(rows[0]!.character_body).toBe('female');
  });

  it("rejects a value outside the CHECK, including sex's 'other'", async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `update public.profiles set character_body = 'other' where id = $1`,
        [user],
      ),
      /character_body/,
    );
  });

  it('lets a client set it on their own row', async () => {
    const user = await h.createUser();
    await h.asUser(
      user,
      `update public.profiles set character_body = 'male' where id = $1`,
      [user],
    );
    const rows = await h.asService<{ character_body: string }>(
      `select character_body from public.profiles where id = $1`,
      [user],
    );
    expect(rows[0]!.character_body).toBe('male');
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
      'timezone',
      'weight_kg',
    ]);
  });
});
```

- [ ] **Step 2: Update the existing UPDATE-grant assertion**

This test **will now fail** and that is correct — it asserts the exact column list, which this migration changes. In `supabase/tests/schema.test.ts` (~line 1391, inside the `profiles.focus` describe), add `'character_body'` in alphabetical position:

```ts
    expect(rows.map((r) => r.column_name)).toEqual([
      'birth_year',
      'character_body',
      'character_name',
      'class',
      'exclude_from_recap',
      'height_cm',
      'sex',
      'timezone',
      'weight_kg',
    ]);
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "character_body"`

Expected: FAIL — `column "character_body" does not exist`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260811120000_character_body.sql`:

```sql
-- Which character the player is: profiles.character_body.
--
-- Founder decision 2026-08-11. Onboarding asks it before the name; §6 files
-- character appearance under "Cosmetic / Flavor Only — No Stat Advantage" and
-- this is that, stored.
--
-- **Why not profiles.sex.** `sex` already exists, is already in these grants,
-- and would need no migration at all. It is still the wrong column. Its
-- documented purpose (20260727120000_init_core.sql:58) is improving HealthKit's
-- active-calorie estimate — a reader nothing implements, and unlikely to arrive
-- since Kairo consumes Apple's activeEnergyBurned rather than computing one.
-- But "currently dead" is not "free to repurpose": a physiological field and an
-- avatar choice can have different answers for the same person, and merging
-- them is exactly what 20260810140000 dropped `focus` for. `sex` is left as it
-- is — dead, and not made worse. It also keeps 'other', which this does not.
--
-- **Nullable on purpose.** NULL means *never asked*, which is the true state of
-- every row that predates this column. A `not null default 'male'` would
-- backfill an assertion nobody made. Both render the male anchor, so there is
-- no visible difference — the difference is whether the row claims a choice.
-- New users always have a value: the onboarding screen has no skip.

begin;

alter table public.profiles
  add column character_body text
    check (character_body in ('male', 'female'));

comment on column public.profiles.character_body is
  'Which character art the player chose at onboarding. NULL = never asked. Cosmetic only (§6) — never read by scoring.';

-- ---------------------------------------------------------------------------
-- Rebuild the column-scoped client grants to include it
-- ---------------------------------------------------------------------------
--
-- The usual Postgres caveat, for the sixth time in this repo: a column-level
-- REVOKE against a table-level GRANT is silently a no-op. Revoke the table
-- grant, then re-grant exactly the allowed columns.
--
-- INSERT because onboarding sets it at profile creation. UPDATE because it
-- should be changeable later — no UI ships with this migration, but the
-- alternative is a second migration for a one-word change.
--
-- `has_wearable` stays out of both lists, as 20260807100000 established:
-- capability is observed by `sync-health`, never asserted by a client.

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  character_name,
  character_body,
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
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap
) on public.profiles to authenticated;

commit;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:schema`

Expected: PASS. The PGlite harness replays every migration, so this proves the new one applies cleanly on top of the existing chain.

- [ ] **Step 6: Apply to the live project**

Docker is unavailable, so the CLI cannot push. Apply over HTTPS, then record it:

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260811120000_character_body.sql

./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version, name) values ('20260811120000', 'character_body')"
```

Verify:

```bash
./supabase/scripts/remote-sql.sh "select column_name, is_nullable from information_schema.columns where table_name='profiles' and column_name='character_body'"
```

Expected: one row, `is_nullable = YES`. **If the `schema_migrations` row is skipped, the CLI will try to re-apply this migration later and fail on the duplicate column.**

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260811120000_character_body.sql supabase/tests/schema.test.ts
git commit -m "feat: add profiles.character_body with column-scoped grants"
```

---

### Task 3: The female character art

Not test-driven — the deliverable is an image, verified by eye. The task is done when a female character in the male character's exact style sits in `assets/character/`.

**Files:**
- Modify: `scripts/generate_character_variants.py` (add a `--variants` filter and the female-anchor prompt)
- Create: `output/imagegen/character-anchor-female.png` and `output/imagegen/female/{str_max,agi_min,agi_max,vit_min,vit_max}.png`
- Rename: `assets/character/anchor.png` → `assets/character/anchor-male.png`
- Create: `assets/character/anchor-female.png`
- Modify: `assets/character/README.md`

**Interfaces:**
- Produces: `assets/character/anchor-male.png` and `assets/character/anchor-female.png`, both meeting `assets/character/README.md` — transparent background, figure centred, feet on the bottom edge, no shadow or aura baked in.

- [ ] **Step 1: Add a variant filter to the generator**

The script's `VARIANTS` dict is all-or-nothing, and the female anchor must be generatable without also regenerating the five stat variants. In `scripts/generate_character_variants.py`, add to `VARIANTS`:

```python
    "character-anchor-female.png": (
        "Same art style, same outfit, same line weight, same color palette, same "
        "chibi proportions, same front-facing full-body framing. The character is "
        "female: softer jawline, longer hairstyle in the same black, same suit "
        "tailored to a female figure. Same world, same game, same illustration "
        "finish — a different character, not a different style."
    ),
```

Add the argument in `parse_args()`:

```python
    parser.add_argument(
        "--variants",
        help="Comma-separated filenames from VARIANTS to generate. Default: all.",
    )
```

And filter in `main()`, replacing `for filename, request in VARIANTS.items():`:

```python
    selected = VARIANTS
    if args.variants:
        wanted = [name.strip() for name in args.variants.split(",") if name.strip()]
        missing = [name for name in wanted if name not in VARIANTS]
        if missing:
            raise SystemExit(f"Unknown variant(s): {', '.join(missing)}")
        selected = {name: VARIANTS[name] for name in wanted}

    for filename, request in selected.items():
```

- [ ] **Step 2: Generate the female anchor**

```bash
python scripts/generate_character_variants.py \
  --anchor output/imagegen/hunter-character-anchor-final.png \
  --variants character-anchor-female.png \
  --out-dir output/imagegen
```

Open the result. **Iterate the prompt until she is recognisably from the same game as the male anchor** — same outline weight, same flat fill, same teal-on-black suit, same chibi head-to-body ratio. Re-run with `--force` to overwrite. This is the step worth spending attempts on; everything downstream assumes the two match.

- [ ] **Step 3: Generate her five reaction variants**

Into a separate directory so the filenames do not collide with the male set:

```bash
python scripts/generate_character_variants.py \
  --anchor output/imagegen/character-anchor-female.png \
  --variants str_max.png,agi_min.png,agi_max.png,vit_min.png,vit_max.png \
  --out-dir output/imagegen/female
```

**Nothing in the app reads these.** They are the next spec's raw material — the male set already exists, and generating hers while the style is established stops that spec opening with an asymmetry to fix. Recorded in the spec's §2 so it does not later read as an oversight.

- [ ] **Step 4: Prep both anchors into `assets/`**

```bash
git mv assets/character/anchor.png assets/character/anchor-male.png

python scripts/prep_character_art.py output/imagegen/character-anchor-female.png \
    --out assets/character/anchor-female.png --aspect 0.60
```

The script keys the white background, lifts the black floor so the outline does not merge into `colors.bg`, and re-pads feet-to-bottom. Confirm the output has an alpha channel and no white fringe:

```bash
python3 -c "from PIL import Image; i=Image.open('assets/character/anchor-female.png'); print(i.mode, i.size)"
```

Expected: `RGBA` and a portrait size close to `382 x 636`.

- [ ] **Step 5: Update the assets README**

In `assets/character/README.md`, replace the `## anchor.png` section heading and its regenerate command to cover both files:

```markdown
## `anchor-male.png` / `anchor-female.png`

The baseline figure for each body, standing in for every key that has no file
of its own. They are the neutral build, so they carry `stage` (the shadow under
them grows) but not `dominance` — a per-key file always wins over them.

Which one renders is `profiles.character_body`, chosen in onboarding. NULL
means never asked and falls back to the male anchor.

Regenerate from a render with:

```bash
python scripts/prep_character_art.py output/imagegen/character-anchor-female.png \
    --out assets/character/anchor-female.png --aspect 0.60
```
```

- [ ] **Step 6: Commit**

```bash
git add scripts/generate_character_variants.py assets/character output/imagegen
git commit -m "feat: add female character anchor and reaction variants"
```

---

### Task 4: Render the chosen character

**Files:**
- Modify: `src/features/character/CharacterFigure.tsx`
- Modify: `src/features/character/Diorama.tsx`
- Modify: `src/features/profile/queries.ts` (add `character_body` to the `Profile` type and the select list)
- Modify: `app/(tabs)/index.tsx:204`

**Interfaces:**
- Consumes: `CharacterBody` from Task 1; the two anchor files from Task 3.
- Produces: `CharacterFigure` and `Diorama` both accept `body?: CharacterBody | null`.

- [ ] **Step 1: Add the column to the profile query**

In `src/features/profile/queries.ts`, add to the `Profile` type (after `class`):

```ts
  /**
   * Which character the player chose at onboarding (§6, cosmetic only).
   * Null for every profile created before the choice existed — those render
   * the male anchor, which is what they already showed.
   */
  character_body: 'male' | 'female' | null;
```

And add `character_body` to the select string at `queries.ts:60`.

- [ ] **Step 2: Give `CharacterFigure` the two anchors**

In `src/features/character/CharacterFigure.tsx`, replace the single-anchor constant:

```ts
/**
 * The baseline figure per body, used for any key `CHARACTER_ART` does not
 * cover yet — which is currently every key.
 *
 * Written out rather than built from the body, for the same reason
 * `CHARACTER_ART` is: Metro resolves `require` statically, so a computed path
 * is not a path it can follow.
 *
 * Built from the generated renders by `scripts/prep_character_art.py` — the
 * renders ship on white with no alpha, which would show as a card on
 * `colors.bg`.
 */
const ANCHORS: Record<CharacterBody, ImageSourcePropType> = {
  male: require('../../../assets/character/anchor-male.png'),
  female: require('../../../assets/character/anchor-female.png'),
};
```

Add the import:

```ts
import type { CharacterBody } from '@/features/profile/character-body.ts';
```

Add the prop to the signature:

```ts
export function CharacterFigure({
  stage,
  dominance,
  body,
  height = 220,
}: {
  stage: 1 | 2 | 3 | 4;
  /** Undefined while the query is in flight; null for an unstarted character. */
  dominance?: Dominance;
  /**
   * Which character. Null or undefined means the profile predates the choice
   * (or has not loaded) — both render the male anchor, which is what those
   * users already saw.
   */
  body?: CharacterBody | null;
  /** The figure's box. The diorama stands them taller than a card does. */
  height?: number;
}) {
```

And change the art lookup:

```ts
  const art = CHARACTER_ART[artKey(stage, dominance)] ?? ANCHORS[body ?? 'male'];
```

**`CHARACTER_ART` is not touched.** It stays empty and stays keyed `${stage}-${dominance}`. Expanding it to carry a body axis would lock in a 48-asset matrix for art that does not exist.

- [ ] **Step 3: Pass it through `Diorama`**

In `src/features/character/Diorama.tsx`, add `body` to the props type and forward it:

```ts
export function Diorama({
  height,
  stage,
  dominance,
  body,
  children,
}: {
  height: number;
  stage: 1 | 2 | 3 | 4;
  dominance?: Dominance;
  body?: CharacterBody | null;
  /** The floating HUD. Absolutely positioned by the caller. */
  children?: ReactNode;
}) {
```

```tsx
        <CharacterFigure
          stage={stage}
          dominance={dominance}
          body={body}
          height={height * 0.6}
        />
```

With the import:

```ts
import type { CharacterBody } from '@/features/profile/character-body.ts';
```

- [ ] **Step 4: Pass it from the character screen**

In `app/(tabs)/index.tsx:204`, the `profile` query is already in scope:

```tsx
        <Diorama
          height={skyHeight}
          stage={stage}
          dominance={dominance.data}
          body={profile.data?.character_body}
        >
```

- [ ] **Step 5: Verify it compiles and bundles**

```bash
npm run typecheck
npx expo export --platform ios --output-dir /tmp/bodycheck
```

Expected: typecheck clean; the export lists **both** anchor PNGs. A missing `require` path is a bundling error here, not a runtime miss — which is the loud failure mode worth having.

- [ ] **Step 6: Commit**

```bash
git add src/features/character/CharacterFigure.tsx src/features/character/Diorama.tsx \
        src/features/profile/queries.ts "app/(tabs)/index.tsx"
git commit -m "feat: render the chosen character body"
```

---

### Task 5: Ask the question in onboarding

**Files:**
- Create: `app/(onboard)/character.tsx`
- Modify: `src/features/auth/route.ts`
- Modify: `src/features/auth/route.test.ts`
- Modify: `src/features/profile/create-profile.ts`
- Modify: `app/(onboard)/name.tsx`

**Interfaces:**
- Consumes: `parseCharacterBody` and `CharacterBody` from Task 1; the two anchors from Task 3.
- Produces: `useCreateProfile(...).mutate({ name, body })` — note this changes the mutation variable from a bare `string` to an object.

- [ ] **Step 1: Write the failing route test**

In `src/features/auth/route.test.ts`, **replace the existing test at lines 91–94** — it asserts `/name`, which this task changes:

```ts
  it('sends a user with no profile to the character choice, and leaves them there', () => {
    // The choice screen is the *first* onboarding step and the name screen is
    // the second, but the gate only ever knows "has no profile row yet" — so
    // it targets the first, and the (onboard) branch covers both.
    //
    // Onboarding is two screens again, and the profile still commits exactly
    // once, on the second. The order is what makes that safe: deviation #22
    // deleted the `finishingOnboarding` flag because a row committing on step
    // 1 flipped resolveRoute to 'ready' underneath step 2. Asking anything
    // after the INSERT needs that flag back.
    expect(at('needs-profile', '(auth)')).toBe('/character');
    expect(at('needs-profile', '(tabs)')).toBe('/character');
    expect(at('needs-profile', undefined)).toBe('/character');
    expect(at('needs-profile', '(onboard)')).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/features/auth/route.test.ts`

Expected: FAIL — `expected '/name' to be '/character'`.

- [ ] **Step 3: Change the gate**

In `src/features/auth/route.ts`, widen the return type and change the target:

```ts
export function redirectTarget(input: {
  route: AppRoute;
  group: string | undefined;
}): '/sign-in' | '/character' | '/name' | '/' | null {
```

```ts
    case 'needs-profile':
      // The *first* onboarding screen. The name screen is the second and is
      // reached by pushing from it with the choice as a param — never by this
      // gate, which only ever knows "has no profile row yet".
      return input.group === '(onboard)' ? null : '/character';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --config vitest.config.ts src/features/auth/route.test.ts`

Expected: PASS. The file's test count is unchanged at 21 — the existing case was replaced, not added to.

- [ ] **Step 5: Widen the create-profile mutation**

In `src/features/profile/create-profile.ts`, change the mutation variable and the insert:

```ts
import type { CharacterBody } from './character-body.ts';

export type NewProfile = {
  name: string;
  /** Null when the choice screen was bypassed — the column is nullable for it. */
  body: CharacterBody | null;
};
```

```ts
    mutationFn: async ({ name, body }: NewProfile): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      // level, total_xp and is_legendary are deliberately absent. The INSERT
      // grant is column-scoped, so naming them would be rejected outright —
      // they are server-awarded and take their column defaults here.
      const { error } = await supabase.from('profiles').insert({
        id: userId,
        character_name: normalizeCharacterName(name),
        character_body: body,
        timezone: deviceTimeZone(),
      });
```

- [ ] **Step 6: Build the choice screen**

Create `app/(onboard)/character.tsx`:

```tsx
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CharacterBody } from '@/features/profile/character-body.ts';
import { Button, Label } from '@/ui/index.ts';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';

/**
 * The first thing anyone sees after signing in.
 *
 * §5's onboarding philosophy is "Character First" — name and character on
 * screen inside 60 seconds, for the emotional investment. Until now the first
 * screen was a text field; meeting the two characters and picking one is closer
 * to what that section describes.
 *
 * **This screen writes nothing.** The choice rides to the name screen as a
 * route param and lands in the single INSERT there. That ordering is
 * load-bearing: deviation #22 deleted the `finishingOnboarding` flag because a
 * profile row committed on step 1 flipped `resolveRoute` to 'ready' while step
 * 2 was still on screen, and the gate bounced the user off it. Choosing before
 * naming keeps the commit at the end, so neither the flag nor a store comes
 * back.
 */
const CHOICES: { body: CharacterBody; art: number }[] = [
  { body: 'male', art: require('../../assets/character/anchor-male.png') },
  { body: 'female', art: require('../../assets/character/anchor-female.png') },
];

export default function ChooseCharacter() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [chosen, setChosen] = useState<CharacterBody | null>(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.xl }]}>
      <View style={styles.top}>
        <Label>CHOOSE YOUR CHARACTER</Label>
        <Text style={styles.title}>Who are you playing as?</Text>
        <Text style={styles.help}>
          This is the character that levels with you. You can change it later.
        </Text>

        <View style={styles.row}>
          {CHOICES.map(({ body, art }) => (
            <Pressable
              key={body}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen === body }}
              accessibilityLabel={body === 'male' ? 'Male character' : 'Female character'}
              onPress={() => setChosen(body)}
              style={[styles.card, chosen === body && styles.cardChosen]}
            >
              <Image source={art} style={styles.art} resizeMode="contain" />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        <Button
          label="Continue"
          onPress={() => chosen && router.push(`/name?body=${chosen}`)}
          variant="primary"
          disabled={chosen === null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
  },
  top: { flex: 1 },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  // Raised is *lighter* on this system, and depth comes from shadow rather
  // than from a border (see theme.ts) — so an unchosen card carries no ring at
  // all and the chosen one earns the terracotta.
  card: {
    flex: 1,
    aspectRatio: 0.72,
    borderRadius: radius.xl,
    backgroundColor: ramp.sage[200],
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    ...shadow.sm,
  },
  cardChosen: { borderWidth: 3, borderColor: colors.accent, ...shadow.md },
  art: { width: '86%', height: '86%' },
});
```

- [ ] **Step 7: Read the param on the name screen**

In `app/(onboard)/name.tsx`, import and read it:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { parseCharacterBody } from '@/features/profile/character-body.ts';
```

Inside the component, above `submit`:

```tsx
  // Null when someone reached this screen without choosing — a deep link, or a
  // reload. The column is nullable for exactly that, so this defaults the
  // character rather than blocking the screen.
  const body = parseCharacterBody(useLocalSearchParams().body);
```

And change the mutate call:

```tsx
    createProfile.mutate(
      { name, body },
      {
        onSuccess: () => router.replace('/'),
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
```

Also update the screen's label copy so the two steps read as a sequence:

```tsx
        <Label>NAME YOUR CHARACTER</Label>
```

(unchanged — already correct after deviation #26).

- [ ] **Step 8: Run everything**

```bash
npm run typecheck
npm test
```

Expected: typecheck clean; all tests pass.

- [ ] **Step 9: Verify by hand on the simulator**

```bash
npm run ios
```

This repo's posture is that UI is verified by hand. Check, in order:

1. **Fresh install.** Delete the app from the simulator first (`xcrun simctl uninstall booted com.arsherj.kairo`) so the gate actually reaches `needs-profile`. Sign in → the character screen appears **first**, not the name screen.
2. Neither card is selected on arrival and **Continue is disabled**. Tapping a card selects it and enables Continue.
3. Pick **female** → name screen → type a name → Begin → lands on the character tab showing **her** in the diorama.
4. `./supabase/scripts/remote-sql.sh "select character_name, character_body from public.profiles order by created_at desc limit 1"` returns `female`.
5. **Existing profile.** A profile with `character_body IS NULL` still shows the male anchor and is not sent back through onboarding.
6. **VoiceOver** on the choice screen announces "Male character" / "Female character" and their selected state.

- [ ] **Step 10: Commit**

```bash
git add "app/(onboard)/character.tsx" "app/(onboard)/name.tsx" \
        src/features/auth/route.ts src/features/auth/route.test.ts \
        src/features/profile/create-profile.ts
git commit -m "feat: choose your character before naming it"
```

---

### Task 6: Documentation

`CLAUDE.md` requires docs to land in the same pass, not as a follow-up.

**Files:**
- Modify: `docs/roadmap.md` (deviation row #27)
- Modify: `docs/user-journey.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add deviation #27 to the roadmap**

In the approved-deviations table in `docs/roadmap.md`, after row #26:

| Column | Content |
|---|---|
| # | 27 |
| Spec says | §6 ships "one class only (Hunter)" with a single character; §5's onboarding collects name only |
| Built instead | **Two character bodies, chosen on a new first onboarding screen.** New nullable `profiles.character_body`; onboarding is two screens with the profile still committing once |
| Why | Founder decision 2026-08-11. §6's premise is that "two people in the same squad look different"; one character made everyone identical. Stored on a **new** column rather than the existing `profiles.sex` — that column's documented purpose is physiological (HealthKit calorie estimate) and this question is cosmetic, and merging the two is what deviation #22 dropped `focus` for. Nullable so existing rows read as *never asked* rather than as having chosen. The choice is asked **before** the name specifically so the single INSERT stays at the end: deviation #22 deleted the `finishingOnboarding` flag when onboarding went back to one step, and asking after the commit would have required resurrecting it. `CHARACTER_ART` stays at 24 empty keys rather than doubling to 48 — the body axis joins the key only when per-dominance art actually exists. |

- [ ] **Step 2: Update the user journey**

In `docs/user-journey.md`, replace the MVP scope note (line ~22) so the flow matches:

```markdown
**MVP scope note:** ships one character class with placeholder art; the other three classes are V1 (§6). The class is internal — `profiles.class` defaults to `'hunter'` and no surface names it. **The character has no in-app noun** as of 2026-08-11 (roadmap deviation #26): it is "your character", never a Hunter. **Onboarding asks which of two character bodies you play as** (2026-08-11, deviation #27) before asking for a name; the answer is `profiles.character_body`, and it is cosmetic only.
```

- [ ] **Step 3: Add the note to CLAUDE.md**

Alongside the existing dated decision notes:

```markdown
**Onboarding is two screens as of 2026-08-11** (roadmap deviation #27): choose a
character body, then name it. **The profile row still commits exactly once**, on
the name screen — that is load-bearing, not incidental. Deviation #22 deleted the
`finishingOnboarding` flag when onboarding collapsed to one step; asking anything
*after* the INSERT flips `resolveRoute` to `'ready'` under the unfinished screen
and needs that flag back. Add onboarding steps *before* the name, never after.
`profiles.character_body` is cosmetic and nullable (null = never asked); it is
deliberately **not** `profiles.sex`, which stays dead.
```

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md docs/user-journey.md CLAUDE.md
git commit -m "docs: record the character body choice as deviation #27"
```

---

## Final verification

```bash
npm run typecheck     # tsc + workspace tsc + deno check
npm test              # 603 existing + 12 new (6 in character-body, 6 in schema)
npm run ios           # hand-verify the fresh-install path in Task 5, Step 9
```

The single most important check is **Task 5, Step 9.1** — a fresh install landing on the character screen rather than the name screen. Everything else in this plan is provable by machine; the gate ordering is only observable there.
