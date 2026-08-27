# KAIRO character assets

## Authority

Resolve KAIRO character decisions in this order:

1. `assets/CHARACTER_BIBLE.md` for identity, style, locked features, and product intent.
2. `assets/CHARACTER_SPEC.json` for machine-readable identity constraints, anchors, names, and export templates.
3. `assets/reference/KAIRO_GOLDEN_REFERENCE.png` for approved anatomy, palette, proportions, and views.
4. This README for the current export and runtime boundary.

If the Bible and spec conflict, stop and resolve the canonical decision before producing or approving assets. The golden reference is required for visual work; do not recreate KAIRO from memory.

## Folder roles

- Rive work is parked. No `.riv` asset or Rive runtime is part of the current character delivery.
- `base/`, `poses/`, `states/`, and `cosmetics/` hold a **provisional v1 static PNG pack** generated from `assets/reference/KAIRO_GOLDEN_REFERENCE.png`. These files are fallbacks and QA previews, not Rive exports and not a compositional runtime.
- `assets/reference/` holds the approved golden reference.
- `data/character.json`, `data/cosmetics.json`, and `data/animations.json` are the versioned semantic source for IDs, defaults, compatibility, property paths, and behavior.
- `src/features/character/character-assets.ts` will own every Metro registration using literal `require()` calls. JSON never contains computed module paths.

## Naming and versions

Use the exact templates in `assets/CHARACTER_SPEC.json`:

- `kairo_base_{view}_{version}.png`
- `kairo_pose_{pose}_{version}.png`
- `kairo_state_{state}_{version}.png`
- `cosmetic_{slot}_{id}_{version}.png`

The spec reserves `character/rive/kairo_v1.riv` as a future runtime filename, but that asset is parked and absent from this delivery. The current static asset version is `v1`. IDs are stable lowercase snake case and must remain separate from player-facing copy.

Metro only bundles literal asset registration. Add each PNG explicitly to the registry rather than constructing paths at runtime.

## Export requirements

Keep layered source upstream and export production PNGs with transparency. Full figures are centered with feet on the bottom edge and must read at both 190 × 212 and 72 × 72. Do not bake a shadow, glow, presence ring, text, habitat, or background into an export.

The JSON manifests remain the semantic source. The provisional PNG pack does not own health interpretation, product scoring, cosmetic ownership, network behavior, or runtime composition.
