# Character art

§15 scopes MVP to **AI-placeholder static art**. This directory holds it.

**The character is an animal as of 2026-08-18** (roadmap deviation #40). The
figure is one of four Philippine endemic species, chosen at onboarding and
changeable any time. `species-art.ts` (`src/features/character/`) maps each id
to a file; `CharacterFigure` renders it, and `Diorama` renders the matching
habitat behind it.

## `species/`

| Id | File | Habitat |
|---|---|---|
| `pilandok` | `species/pilandok.png` | `species/habitat-pilandok.png` |
| `tamaraw` | `species/tamaraw.png` | `species/habitat-tamaraw.png` |
| `carabao` | `species/carabao.png` | `species/habitat-carabao.png` |
| `eagle` | `species/eagle.png` | `species/habitat-eagle.png` |

The ids are pinned by a test and by the CHECK constraint on
`profiles.species` — `src/features/character/species.ts` is the single source
for them, along with each species' name, hue, affinity and blurb.

**A missing file is a bundling failure, not a silent miss.** Metro resolves
`require` statically, which is why `species-art.ts` writes all eight paths out
literally instead of building them from the id: a template string would be a
runtime miss on device, which is the failure mode this arrangement exists to
avoid.

## The art contract

Real art swaps in **file-for-file with no code change**, provided it holds to
this:

- **PNG, transparent background**, anything up to 2:1 portrait at 636 tall
  (@3×). The slot is 190 × 212 with `resizeMode="contain"`, so a narrower
  figure simply sits centred.
- **No shadow, no glow, no ring baked in.** `GroundShadow` draws the contact
  shadow sized from the evolution stage, and the presence ring is drawn from
  the ability rating — so one artwork per species reads correctly at every
  stage and every build. Art carrying its own contact shadow doubles it, and
  that is what would force a stage × dominance matrix nobody wants to draw.
- **Figure centred, feet at the bottom edge**, so a swap does not shift the
  layout under the TODAY card.
- **Reads on cream and on its own habitat.** The app is a warm light theme
  (`colors.bg` is #f5ead8) and the figure stands on a sage sky when it has no
  habitat yet, so pure black merges into neither — but a raw render often ships
  with its outline at 0,0,0, which is what `prep_character_art.py --lift` is
  for.
- **Direction: flat vector, bold outlines, colourful.** Deviation #40 settles
  what §20's "dark fantasy hunter aesthetic" brief left open. Habitats are in
  the same language as the figures — flat vector, not photographic — which is
  why a literal outdoors no longer fights the character art the way that
  concern assumed it would.
- **Layered source is retained upstream**, not here. This directory holds the
  flattened export only.

The picker uses the same figure file at 72 × 72 as a list thumbnail, so a
figure that only reads at full size will not read on the choice screen.

## `anchor-male.png` / `anchor-female.png`

**Dead, kept in place.** They belonged to `profiles.character_body`
(deviation #27), which #40 superseded — no surface renders them, and
`CharacterFigure` falls back to its drawn primitives rather than to an anchor
when a profile has no species. Kept rather than deleted for the same reason the
column is: they cost nothing and they record what the figure used to be.
