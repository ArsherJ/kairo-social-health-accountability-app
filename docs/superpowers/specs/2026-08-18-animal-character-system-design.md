# The character becomes an animal

**Status:** design approved 2026-08-18. Roadmap deviation **#40** on build.
**Supersedes:** the working draft at `docs/kairo-animal-character-plan.md`, which
this replaces wholesale (see "What the draft got wrong" below).
**Reverses:** deviation #27's male/female body picker.
**Overrides:** the no-habitat reasoning written into `src/features/character/Diorama.tsx`.
**Retires:** §20's "dark fantasy hunter aesthetic" art brief and the prompts in
`scripts/generate_swap_assets*.py`.

---

## 1. What changes, in one paragraph

The character stops being a human body and becomes one of four Philippine
endemic animals, chosen at onboarding and freely changeable afterwards. The
species is **identity only** — it never touches scoring, and every existing
response the figure already has to real behaviour (level stage widens the ground
shadow, dominance tints it, ability rating drives the presence ring) survives
untouched. Art direction moves from painterly semi-realism to **flat vector with
bold outlines**, colourful, one artwork per species plus one habitat per
species: eight assets total. Nothing about `kairo-core`, `daily_scores`,
`health_buckets` or any Edge Function changes.

## 2. Why this is worth doing

The human anchors answer a question nobody asked. "Male or female" is an
identity declaration at the highest-attention moment in onboarding, it produces
two assets that must both be maintained forever, and — as the screen's own
comment admits — the app cannot even promise the choice is changeable, because
it is not. What it buys in return is a figure that looks like a stock render.

An animal answers a better question ("who's coming with you?"), needs no
identity declaration, gives the Philippine market something that is
unmistakably theirs, and — because affinity is cosmetic — carries zero regret,
which is what makes it safe to let people change it.

## 3. Working model, as decided

- **Four species, each nominally tied to one core stat:** Pilandok (AGI),
  Tamaraw (STR), Carabao (END), Philippine Eagle (VIT).
- **The Eagle/VIT mapping is loose and knowingly accepted.** VIT is *hourly
  movement* — credit for not sitting still — and an eagle soars and perches.
  The Philippine Eagle is the strongest brand asset available to a PH health
  app, and since affinity is cosmetic the looseness costs nothing mechanically.
  Recorded here so a later reader does not "fix" it.
- **Affinity is cosmetic at MVP, revisitable at V1.5.** If a mechanical bonus is
  ever added, note that `daily_scores` is *replayed* from stored buckets, so a
  retroactive affinity bonus rescores history. That is a migration, not a tweak.
- **Species does not restrict anything.** A Tamaraw player still earns AGI, END
  and VIT normally. §5's "no stat is required daily" pillar is untouched.
- **Conservation is the flavour.** Tamaraw and Philippine Eagle are critically
  endangered; the Palawan mouse-deer is vulnerable. The species blurb carries
  that fact. It is framing, not a claim of partnership or donation — do not
  write copy that implies either until one exists.

## 4. Art direction

**Flat vector, bold outlines, flat fills, no gradients, colourful.** Not pixel
art — which means the draft's Aseprite selection, canvas/grid standard and
sprite-sheet economics are answering a question that is not being asked.

Three properties are load-bearing:

- **The source is layered.** Head, body, limbs, tail delivered as separable
  vector layers even though MVP flattens them to PNG. Phase-2 animation is
  layered-parts-plus-`Animated` or Rive; both need separable source, and
  commissioning flattened art means buying the whole roster twice. Flat vector
  with hard outlines is precisely the style where this upgrade is free.
- **The ground shadow is never baked in.** `GroundShadow` draws it, keyed to
  level stage. One asset therefore reads correctly at every stage, which is the
  whole reason four assets suffice.
- **Species hues must clear the palette's existing meanings.** Terracotta
  (`colors.accent`) means *call to action*; sage means *your lane*. Four species
  hues have to be distinguishable from each other **and** from those two. This
  is a constraint on the illustrator brief, not a post-hoc check.

**Habitats.** One flat-vector backdrop per species — Eagle on a mountain ridge,
Carabao in a rice terrace, Tamaraw in Mindoro grassland, Pilandok in Palawan
forest. This deliberately overrides `Diorama.tsx`'s comment that "a photographic
landscape would date instantly and fight the flat character art": flat-vector
habitats in the same bold-outline language are neither photographic nor
fighting the figure. Update that comment when the change lands rather than
leaving it contradicting the code beneath it.

## 5. Animation

**Static PNG driven by React Native `Animated` transforms** — breathing, bob,
squash — exactly as `useFloat` already does. **No new dependency.**
`react-native-svg`, Rive and Reanimated stay uninstalled, and `CharacterFigure`'s
existing comment on why remains true.

This is explicitly an MVP position, not a permanent one. Phase 2 upgrades to
layered parts or Rive; §4's layered-source requirement is what keeps that cheap.
Note for whoever does it: Rive is a **native** dependency, so it needs
`npm run prebuild` **and a commit of the regenerated `ios/`** (#28), and it must
survive the build-from-source setup (#29).

## 6. Data model

One migration.

- **`profiles.species text`**, nullable, with
  `check (species in ('pilandok','tamaraw','carabao','eagle'))`. Null means
  *never asked*, exactly as `character_body` does today — so existing rows need
  no backfill and no default.
- **Added to the column-scoped INSERT grant** (onboarding's single commit writes
  it) **and the UPDATE grant** (the profile screen swaps it). Postgres rule that
  bites here: a column-level `REVOKE` against an existing table-level `GRANT` is
  silently a no-op — revoke the table grant and re-grant the allowed columns.
- **A new column, not a widened `character_body`.** The column name would
  otherwise lie about what it holds, and the existing `'male'`/`'female'` rows
  would have to be migrated to a species or left as values the picker can no
  longer produce. Neither is worth saving one migration.
- **`character_body` becomes inert** — kept, never written, read by no surface.
  Same disposition as `profiles.sex`. Add a `comment on column` saying so; that
  comment is what has kept `sex` from being mistaken for live.
- **`squad_leaderboard()` gains `species text`.** Drop and recreate, and update
  the schema test that pins its exact row shape. Species is cosmetic and
  non-sensitive, so this does not touch the §5 privacy boundary the way steps or
  heart rate would — state that in the migration comment so a future reader does
  not have to re-derive it. Incidental: that RPC already projects `class text`,
  the inert `'hunter'` default, rendered nowhere; cleaning it up in the same
  drop-and-recreate is free if wanted.

**No `create_profile` RPC exists** — the client INSERTs directly under the
column-scoped grant (`src/features/profile/create-profile.ts`). The
ambiguous-overload trap that forced `create_goal` to be dropped and recreated
(#35) therefore does **not** apply here.

## 7. Code structure

Mirrors how `character-body.ts` and `StatIcon.tsx` are already organised.

- **`src/features/character/species.ts`** — the single registry: id, display
  name, stat affinity, hue, endemic/conservation blurb. **Zero imports**, so
  root Vitest loads and tests it directly, the same constraint that shaped
  `buffer.ts` and `milestones.ts`. `parseSpecies(raw: unknown)` is total and
  returns `null` for anything unrecognised — copied wholesale from
  `parseCharacterBody`'s reasoning, because this is the boundary where a value
  off a URL stops being data.
- **`SPECIES_NAMES` lives inside that registry**, never as a parallel table.
  This is `STAT_NAMES`' lesson: a second list of the same words drifts.
- **`src/features/character/species-art.ts`** — the static `require` map for
  figures and habitats, written out literally. Metro resolves `require`
  statically, so a computed path is not a path it can follow. Same shape and
  same comment as the existing `CHARACTER_ART` / `ANCHORS` maps.
- **`CharacterFigure.tsx`** takes `species` where it takes `body` today.
  `ANCHORS` is replaced. **`stage`, `dominance`, `auraStrength` and
  `GroundShadow` are untouched** — that is what "one artwork per species" buys,
  and it is why this is a smaller change than it looks.
- **One picker component, three call sites** — see §8.

## 8. Routing, onboarding, and the migration for existing users

**Onboarding stays `/connect` → `/character` → `/name`,** with `/character`
becoming the species picker. The species rides to the name screen as a route
param, exactly as `body` does now. **The profile row still commits exactly
once, on `/name`** — deviation #22's deleted `finishingOnboarding` flag stays
deleted only while every step is *before* the name screen.

**Existing users get a one-time picker, and it must not live in `(onboard)`.**
`redirectTarget` is a denylist: a `ready` user in group `(onboard)` is bounced
straight to `/`. So the picker is **`app/species.tsx`, a stacked route outside
any group** — the same shape as `/goal/new` and `/delete-account`, which that
denylist explicitly permits and was written to permit. Consequences, all good:

- **One screen serves all three entry points** — pushed from onboarding, pushed
  once from home when `species is null`, pushed from the profile screen to swap.
- **No new `resolveRoute` state and no `finishingOnboarding` flag.**
- Nobody loses progress, and no interstitial fights the gate.

**The screen may now promise the choice is changeable**, which retires the
comment in `app/(onboard)/character.tsx` explaining why it had to stay silent —
"a promise here would be one the app does not keep, made at the highest-attention
moment in onboarding". It keeps it now.

## 9. Surfaces

| Surface | What appears |
|---|---|
| Character screen | Full-colour figure over its species habitat |
| Leaderboard rows | Small species icon |
| Squad roster | Small species icon |
| Goal cards | Participants as their animals |

**Open, and deliberately deferred to device:** on the small surfaces the species
icon sits beside `Avatar.tsx`'s name-derived terracotta/sage disc — two colour
systems in one row. The likely resolution is the species icon **replacing** the
initial disc rather than sitting next to it, but that is a judgement to make
looking at real art at 24px, not now.

## 10. Accessibility

Kairo's rule, set by `StatIcon` and `row-label.ts`: decorative or duplicative
elements are hidden; the group that means something is **one** element with a
composed label; and a label that repeats text already beside it is noise.

- **`speciesFigureLabel()`** — a tested pure module alongside `row-label.ts`.
  Composes species + level + dominance. It **omits the character name**, which is
  already printed beside the figure. The reverted `StatCoin`-inside-`StatRail`
  label is the cautionary tale for getting this wrong in the other direction.
- Shadow, ring and habitat get `accessibilityElementsHidden` +
  `importantForAccessibility="no-hide-descendants"`. Both halves — the 2026-08-14
  device pass found that parent grouping alone did not collapse descendants on
  that build, and the fix deliberately does not depend on the mechanism.
- Picker cards keep `accessibilityRole="radio"` with `accessibilityState`,
  as `/character` already does, labelled with the species name and its blurb.

## 11. Verification

**Node (root Vitest, no alias, no native):**
- `species.ts`: `parseSpecies` totality; `SPECIES_NAMES` covers every id;
  affinity covers all four core stats; a hue is defined for each.
- A test mirroring the SQL check constraint so the TS list and the database
  cannot drift — `character-body.test.ts` is the template.
- `speciesFigureLabel()` composition.

**Schema suite (PGlite):** the column, the check, both grants, the updated
`squad_leaderboard` row-shape pin, and that a non-owner `authenticated` role
reads species through the RPC and nowhere else.

**By hand, before a TestFlight build:**
- **Accessibility Inspector** on the character screen — confirm the figure is
  *one* element, not several. This is the failure that cost two builds to find
  and confirm in August.
- **`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`**
  on `app/species.tsx`, **then relaunch the app** — RN caches text measurements,
  so a live size change renders correct text in stale boxes. The picker is four
  cards each carrying art, a name and a blurb: exactly the shape of thing the
  permission sheet was silently clipping inside `Panel`'s `overflow: 'hidden'`.

## 12. Sequencing — two tracks in parallel

**Track A — the Eagle gate.** AI generation for exploration and a style board,
then commission the final art from that brief. The board makes the commission
brief unusually precise, which is what makes it cheap.

The Eagle is the gate species because it is the one most likely to break the
pipeline: feathers, wings, and a silhouette that is hard to read small. **The
gate passes only if** the Eagle reads as an eagle at **24px** in a leaderboard
row; holds up against both stage-1 and stage-4 ground shadow; its hue clears
terracotta and sage; and the source arrives **layered**, transparent, at
@1x/@2x/@3x, with no shadow baked in. Its habitat is part of the gate.

**Track B — the system, against a placeholder Eagle.** Registry, migration,
`app/species.tsx`, picker component, RPC change, `SPECIES_NAMES`, accessible
label. **Written species-agnostic throughout**, so a failed art gate costs the
asset and nothing else: you swap a PNG, not a system.

Track B is what makes the illustrator's turnaround productive instead of idle.
The gate decision — bet three more species on this pipeline, or not — stays
real and stays on track A.

## 13. Out of scope

Recorded here and in `docs/mvp-scope.md`, because that file exists precisely so
a later QA pass does not grade the build against features that were deliberately
deferred:

- Animation beyond `Animated` transforms
- Evolution / growth-stage art
- Skins and cosmetic variants
- Battle frames of any kind (attack, hit, victory, faint)
- Roster beyond the four species
- Mechanical affinity
- Rep-counting / pose estimation tie-ins
- Trading, collection meta, rarity

**Brand — app icon as an animal mark, logo restyled to the flat-vector
language, store screenshots and listing copy — is agreed and runs as its own
spec.** It shares track A's style board but has its own timeline and must not
block the app change.

## 14. Documentation this change carries

Not a follow-up — part of the change:

- `docs/roadmap.md`: deviation **#40**, and a note on the row for #27 that it is
  superseded.
- `CLAUDE.md`: the character-body paragraph is replaced; the "Hunter retired"
  paragraph's reference to `output/imagegen/hunter-*.png` and the
  `generate_swap_assets*.py` art-direction brief becomes fully stale rather than
  "a genuinely open decision" — this spec settles it.
- `docs/user-journey.md`: onboarding and character sections.
- `docs/mvp-scope.md`: §13's out-of-scope list.
- `assets/character/README.md`: rewritten for the species art keys.
- `src/features/character/Diorama.tsx`: the no-habitat comment.
- `docs/kairo-animal-character-plan.md`: deleted or marked superseded by this file.

## 15. What the draft got wrong

Kept as a record, because the same stale assumptions will resurface:

- **Tier badges.** The draft proposes Bronze/Silver/Gold overlays. Tiers went
  internal-only on 2026-08-10 (deviation #23) — `tierFor()` and `TIER_POINTS`
  still decide every day, but **no surface names one**. There is nothing for a
  tier badge to land on.
- **Sabotage and War Declaration.** Both removed 2026-08-09. The draft's V2
  collection/trading meta is built on mechanics that do not exist.
- **Legendary, coin packs, referrals.** All explicitly OUT per
  `docs/mvp-scope.md`. A monetization hook cannot be gated behind them.
- **"MVP" framing.** There is a shipped build with a body picker, two anchor
  PNGs, real users on TestFlight and a committed `ios/`. This is a replacement
  with a migration, not a greenfield scope.
- **The pixel-art pipeline.** Aseprite, canvas/grid standard, sprite-sheet frame
  budgets, and the whole "asset pipeline by phase" table answer a question that
  is not being asked. Flat vector, no grid.
- **Species vs. the figure that already responds.** The draft treats the
  character as inert art. It is not: shape follows observed dominance, presence
  follows level stage, the ring follows ability rating. The design had to decide
  which wins, and did — species is the *body*, behaviour is the *state*.
