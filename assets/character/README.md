# Character placeholder art

§15 scopes MVP to **AI-placeholder static art**. This directory holds it.

`CharacterFigure` (`src/features/character/CharacterFigure.tsx`) looks each
file up by `${stage}-${dominance}`. **A missing file is not a bug** — the
component falls back to `anchor.png`, so art can land one file at a time and a
half-populated directory renders correctly.

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

That script does the three things a raw render needs: keys out the white
background it ships with, lifts the black floor so the suit and outline do not
merge into `colors.bg`, and re-pads the figure feet-to-bottom. Run it on any new
render rather than dropping the render in directly.

## Adding a per-key file

Two steps, both required:

1. Drop the PNG here as `<stage>-<dominance>.png`.
2. Add its line to `CHARACTER_ART` in the component:
   `'3-STR': require('../../../assets/character/3-STR.png'),`

Metro resolves `require` statically, which is why step 2 cannot be automated
away — a `require` naming a file that does not exist fails the bundle rather
than missing at runtime.

## Specification

- **PNG, transparent background**, anything up to 2:1 portrait at 636 tall
  (@3×). The slot is 190 × 212 with `resizeMode="contain"`, so a narrower figure
  is fine and simply sits centred — `anchor.png` is 382 × 636 and renders
  127 × 212.
- **No shadow, no glow, no ring baked in.** The component draws the ground
  shadow (and the All-Rounder's ring) itself, sized from `stage`, so the same
  figure reads correctly as its presence grows. Art carrying its own contact
  shadow will double it.
- **Figure centred, feet at the bottom edge**, so a swap does not shift the
  layout under the TODAY card.
- Reads on cream. The app is a warm light theme now (`colors.bg` is #f5ead8)
  and the character stands on a sage sky, so pure black merges into neither —
  but `prep_character_art.py --lift` exists because a raw render often ships
  with its outline at 0,0,0.

## The keys

`stage` is the evolution band from §6: **1** = level 1–5, **2** = 6–10,
**3** = 11–20, **4** = 21+. Presence should grow across stages; the figure is
the same character throughout.

`dominance` is §6's visual-evolution table:

| Key | §6 | Notes |
|---|---|---|
| `AGI` | Leaner frame | The idle animation §6 also asks for needs Rive; V1. |
| `STR` | Broader silhouette, power aura intensifies | |
| `END` | Endurance stance, stamina particle effect | Particles need Rive; the planted stance does not. |
| `VIT` | Recovery glow, healthier skin tone | |
| `balanced` | The rare **All-Rounder** — "cannot be bought, must be earned" | Should read as clearly rarer than the other four. |
| `none` | Unstarted, or the profile query still in flight | Neutral. Stage 1 is the common case by far. |

That is 4 × 6 = 24 keys. **Only `1-none` through `4-none` and stage 1–2 of each
dominance are worth generating first** — the seed data cannot reach the higher
stages yet, and the primitives cover anything missing.

| | AGI | STR | END | VIT | balanced | none |
|---|---|---|---|---|---|---|
| **1** | `1-AGI` | `1-STR` | `1-END` | `1-VIT` | `1-balanced` | `1-none` |
| **2** | `2-AGI` | `2-STR` | `2-END` | `2-VIT` | `2-balanced` | `2-none` |
| **3** | `3-AGI` | `3-STR` | `3-END` | `3-VIT` | `3-balanced` | `3-none` |
| **4** | `4-AGI` | `4-STR` | `4-END` | `4-VIT` | `4-balanced` | `4-none` |

Commissioned art and Rive replace all of this in V1 (§6, §15).
