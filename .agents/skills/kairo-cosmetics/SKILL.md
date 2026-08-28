---
name: kairo-cosmetics
description: Use when designing, reviewing, exporting, or specifying wearable KAIRO cosmetics, cosmetic slots, anchors, offsets, layering, or pose compatibility; not for shop economy or canonical character redesign.
---

# KAIRO Cosmetics

Cosmetics adapt to KAIRO; KAIRO's anatomy does not adapt to cosmetics.

**REQUIRED BACKGROUND:** Use `kairo-character-assets` for canonical authority, locked features, and the current export boundary.

## Design contract

- Choose slots and anchors only from `assets/CHARACTER_SPEC.json`. A slot describes where an item belongs, not merely the z-order desired.
- Reserve `effect` for detached visual effects such as auras, glows, or trails. Do not use it to force clothing above the character.
- Give each independently positioned component one primary slot and anchor. Split a multi-region set into modular components; any bundle relationship belongs to an existing consumer schema, not an invented asset schema.
- If an anchor is missing, report the gap and propose a spec change. Do not improvise an unregistered anchor.
- Change the item's silhouette, cut, offsets, or component split to solve fit and occlusion. Never narrow wings, move eyes, reshape the body, or bake the item into canonical art.
- Keep source layers separate and production assets transparent. Use simple silhouettes that remain readable at mobile sizes.
- Keep art delivery separate from pricing, rarity, inventory, entitlements, and shop behavior unless the user explicitly includes those systems.

## Decision guide

| Situation | Response |
|---|---|
| Cape plus halo | Separate `back` and `effect` components with appropriate anchors. |
| Item varies by pose | Also use `kairo-poses-states`; prefer adjustment metadata over duplicated combinations. |
| Cosmetic lives in a `.riv` file | Also use `kairo-rive`; keep attachment inputs independent of character state. |
| Full-body skin requested | Treat it as explicit full-body scope and run a canonical-identity review; never overwrite the base. |

## Handoff metadata

Use an existing catalog or manifest when present. Otherwise return handoff metadata without creating storage infrastructure:

```json
{
  "id": "runner_cap",
  "slot": "head",
  "anchor": "head_top",
  "offset": { "x": 0, "y": -8 },
  "scale": 1,
  "rotation": 0
}
```

IDs are stable and deterministic. Offsets use the coordinate system of the actual consumer; state the units and origin rather than assuming them.

## Compatibility review

Validate every pose and state the intended consumer can select, emphasizing extreme head, wing, back, and foot positions instead of exporting a full Cartesian product. Check:

- anchor stability and intentional layer order;
- clipping, occlusion, drift, and unwanted anatomy changes;
- readability at the app's display and thumbnail sizes;
- transparent edges and absence of baked shadow, ring, or background.

Deliver the modular assets, metadata, representative previews, compatibility results, and any approved exceptions. Do not add app registries or runtime behavior to an art-only task.
