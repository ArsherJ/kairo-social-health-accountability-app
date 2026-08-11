# Character body choice — male / female in onboarding

Status: approved 2026-08-11. Founder decision.

## Goal

Onboarding asks which character you play as, and the app renders that character.
Two bodies, chosen once, before the name.

Today there is exactly one character — `assets/character/anchor.png`, a male
chibi figure — and no way to be anyone else. §6's premise is that "two people in
the same squad look different"; the app currently makes them look identical to
everyone.

**This spec is static art only.** Animation is the next spec. That split is
deliberate: the animation work applies to both bodies, so doing it before the
second body exists would mean doing it twice.

---

## 1. Storage — `profiles.character_body`

```sql
alter table public.profiles
  add column character_body text check (character_body in ('male', 'female'));
```

### Why not `profiles.sex`

`sex` already exists (`'male' | 'female' | 'other'`, nullable) and is already
inside the column-scoped grants, so reusing it needs no migration. It is still
the wrong column.

Its documented purpose (`20260727120000_init_core.sql:58`) is improving
HealthKit's active-calorie estimate. **Nothing implements that** — it is selected
in `queries.ts:60`, typed in `ProfileEdit`, written by no UI and read by no code.
Kairo consumes Apple's `activeEnergyBurned` rather than computing one, so the
reader it was added for is unlikely to ever arrive.

But "currently dead" is not "free to repurpose". The question onboarding asks is
*which character do you want to play as* — a cosmetic choice, which is how §6
files character appearance ("Cosmetic / Flavor Only — No Stat Advantage"). A
physiological field and an avatar choice are different questions that can have
different answers for the same person, and merging them is precisely what
deviation #22 removed `profiles.focus` for: one column answering two questions,
where only one of them meant anything.

`sex` is left exactly as it is — dead, and not made worse.

### Why nullable

`null` means **never asked**, which is the true state of every profile that
exists today. A `not null default 'male'` would backfill an assertion nobody
made; nullable backfills a fact. It renders as the male anchor either way, so
there is no visible difference — the difference is whether the row claims the
user chose that.

It also leaves the door open to asking existing users later without having to
distinguish "chose male" from "was defaulted to male" after the fact.

New users always have a value: the screen has no skip.

### Grants

`character_body` joins **both** column-scoped lists:

- **INSERT** — onboarding sets it at profile creation.
- **UPDATE** — so it can be changed later. No UI in this spec; the grant is
  written now because the alternative is a second migration for a one-word
  change.

The repeated Postgres caveat applies, for the sixth time in this repo: a
column-level `REVOKE` against an existing table-level `GRANT` is silently a
no-op. Revoke the table grant, then re-grant the complete column list. Follow the
shape of `20260810140000_drop_profiles_focus.sql`.

### Applying it

Docker is unavailable, so: run via `supabase/scripts/remote-sql.sh -f`, wrapped
in `begin; ... commit;`, then insert the row into
`supabase_migrations.schema_migrations` by hand or the CLI re-applies it later.

---

## 2. Art

### Generation

GPT Image **edit** against the existing male anchor, not a fresh generation.
This is the mechanism `scripts/generate_character_variants.py` already uses and
it is proven in this repo — `output/imagegen/str_max.png` is unmistakably the
same character as the anchor, same outfit, same line weight, same palette.

The prompt holds style and drops only what has to change: *same style, same
outfit, same line weight, same palette, same framing — female character.* A
from-scratch generation produces a character from a different game.

The male anchor's own source is `output/imagegen/hunter-character-anchor-final.png`.
That filename keeps its "hunter" (roadmap deviation #26 records it as a
deliberate exclusion); the new render is named without it.

### Prep

`scripts/prep_character_art.py` unchanged — key the white background, lift the
black floor, trim and re-pad feet-to-bottom. It already produces exactly what
`assets/character/README.md` specifies.

### Files

| File | Source |
|---|---|
| `assets/character/anchor-male.png` | the current `anchor.png`, renamed |
| `assets/character/anchor-female.png` | new |

Renaming the existing file rather than leaving it as `anchor.png` matters: a
default-named file beside an explicitly-named one invites the reading that one
of them is the real character and the other is a variant of it.

### Reaction variants — generated, not wired

Her five variants (`agi_min` slouched, `agi_max` upright, `vit_min` tired,
`vit_max` alert, `str_max` broader) are generated in the same run and land in
`output/imagegen/`. **Nothing in the app reads them in this spec.**

They exist for the male character already. The next spec's chosen behaviour —
idle animation that reacts to the day's data — needs both sets, and generating
hers while the style context is established costs one command. Starting that
spec with one body's variants and not the other's would make its first task
"fix the asymmetry this one left".

This is the one place the spec deliberately produces something it does not use.
It is recorded here so it does not later read as an oversight.

---

## 3. Rendering

`CharacterFigure` gains one prop:

```ts
body?: 'male' | 'female' | null;   // null / undefined -> male anchor
```

`CHARACTER_ANCHOR` becomes a two-entry lookup. `Diorama` passes `body` through
from the profile query; `app/(tabs)/index.tsx` reads it from `useProfile`.

**`CHARACTER_ART` stays empty and stays 24 keys.** It is not expanded to 48. The
map is keyed `${stage}-${dominance}` and has no entries; pre-expanding it to
carry a body axis would lock in a 48-asset matrix for art that does not exist,
which is the combinatorial trap this whole area has been walking toward. When
per-dominance art arrives it can key `${body}-${stage}-${dominance}` then, with
real files behind it.

Nothing else about the component changes. `stage` still drives presence through
`GroundShadow`, the All-Rounder ring still belongs to `dominance`, and the
primitive fallback branch stays.

---

## 4. Onboarding

### The constraint that decides the shape

Onboarding today is one step (`/name`) and the profile row commits there.
Deviation #22 records why it is one step: with two steps, the row committed on
step 1, `resolveRoute` flipped to `'ready'` while step 2 was still on screen, and
the gate bounced the user off it. A `finishingOnboarding` flag existed to hold
the gate off, and was **deleted** with the second step.

Any design that asks for the body *after* the profile INSERT resurrects that
flag. So the body is asked **before** the name, and the profile still commits
exactly once — at the end, carrying both values.

### Flow

```
needs-profile ──▶ /character ──(route param)──▶ /name ──[single INSERT]──▶ /
```

- **New route** `app/(onboard)/character.tsx` — both characters side by side,
  tap to select, continue. No skip.
- **`redirectTarget`** — `needs-profile` targets `/character` instead of
  `/name`. One line; its return type widens by one member. Both routes are in
  `(onboard)`, so the existing `group === '(onboard)' → null` branch already
  leaves a user alone on either screen.
- **The choice travels as a route param**, `/name?body=female`, read with
  `useLocalSearchParams()`. Not a store: deviation #22 deleted
  `useOnboardingStore` and nothing here needs it back. A param is also
  inspectable in the URL, which a store is not.
- **`create-profile.ts`** takes `{ name, body }` and puts `character_body` in
  the same single INSERT.
- **Missing param** — someone deep-linking `/name` directly gets `null`, not a
  block. That is what the nullable column is for, and refusing to render a name
  screen because a query string is absent is a worse failure than a default
  character.

### Why character-first is also the better flow

§5's onboarding philosophy is "Character First": *name + character on screen
within the first 60 seconds (emotional investment)*. Today the first screen is a
text field. Meeting the two characters and picking one before being asked to type
is closer to what that section describes than what is currently built.

---

## 5. Testing

| What | Where |
|---|---|
| `needs-profile` → `/character`; a user already in `(onboard)` is left alone on either screen | `src/features/auth/route.test.ts` (21 existing tests) |
| Column exists; CHECK rejects a value outside `male`/`female`; NULL accepted; rebuilt grants let a client write it and still not write `level`/`total_xp` | `supabase/tests/schema.test.ts` via the PGlite harness |
| `character_body` reaches the INSERT; absent body inserts NULL rather than failing | `create-profile` test |

Then by hand on the simulator, which is this repo's posture for UI: a fresh
install picks female, names the character, and lands on the character tab showing
her; an existing profile (`character_body IS NULL`) still shows the male anchor.

---

## 6. Out of scope

- **Animation of any kind.** Next spec.
- **Changing your character after onboarding.** The UPDATE grant permits it; no
  UI is built.
- **Per-dominance or per-stage art.** `CHARACTER_ART` stays empty.
- **A third option or a skip.** Founder decision 2026-08-11: two choices, both
  required.
- **`profiles.sex`.** Left dead and untouched.
