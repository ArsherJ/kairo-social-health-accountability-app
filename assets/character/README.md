# KAIRO character assets

## Authority

Resolve KAIRO character decisions in this order:

1. `assets/CHARACTER_BIBLE.md` for identity, style, locked features, and product intent.
2. `assets/CHARACTER_SPEC.json` for machine-readable identity constraints, anchors, names, and export templates.
3. `assets/reference/KAIRO_GOLDEN_REFERENCE.png` for approved anatomy, palette, proportions, and views.
4. This README for the current export and runtime boundary.

If the Bible and spec conflict, stop and resolve the canonical decision before producing or approving assets. The golden reference is required for visual work; do not recreate KAIRO from memory.

## Folder roles

- `rive/kairo_v1.riv` is the embedded runtime visual source. It owns layers, rigging, visual transitions, and reaction completion.
- `base/`, `poses/`, `states/`, and `cosmetics/` hold transparent PNG previews and static fallbacks; they are not a second runtime compositor.
- `assets/reference/` holds the approved golden reference.
- `data/character.json`, `data/cosmetics.json`, and `data/animations.json` are the versioned semantic source for IDs, defaults, compatibility, property paths, and behavior.
- `src/features/character/character-assets.ts` will own every Metro registration using literal `require()` calls. JSON never contains computed module paths.

## Naming and versions

Use the exact templates in `assets/CHARACTER_SPEC.json`:

- `kairo_base_{view}_{version}.png`
- `kairo_pose_{pose}_{version}.png`
- `kairo_state_{state}_{version}.png`
- `cosmetic_{slot}_{id}_{version}.png`

The canonical runtime asset is `character/rive/kairo_v1.riv`; the current asset version is `v1`. IDs are stable lowercase snake case and must remain separate from player-facing copy.

Metro only bundles literal asset registration. Add each `.riv` or PNG explicitly to the registry rather than constructing paths at runtime.

## Export requirements

Keep layered source upstream and export production PNGs with transparency. Full figures are centered with feet on the bottom edge and must read at both 190 × 212 and 72 × 72. Do not bake a shadow, glow, presence ring, text, habitat, or background into an export.

The `.riv` is the runtime visual source; the JSON manifests are the semantic source. Rive receives resolved semantic values and never owns health interpretation, product scoring, cosmetic ownership, or network behavior.
