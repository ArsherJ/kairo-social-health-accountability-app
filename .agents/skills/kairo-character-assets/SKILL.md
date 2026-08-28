---
name: kairo-character-assets
description: Use when work affects KAIRO's canonical base character, character asset exports, identity consistency, or asset-pipeline organization; not for cosmetics-only, pose/state-only, or Rive-only work.
---

# KAIRO Character Assets

Keep every deliverable recognizably the same Philippine-eagle-inspired KAIRO, expressed through reusable assets.

## Canonical authority

Resolve these paths from the repository root, in order:

1. `assets/CHARACTER_BIBLE.md` — identity, style, and product intent.
2. `assets/CHARACTER_SPEC.json` — machine-readable constraints.
3. The file named by `canonical_reference`, resolved relative to `assets/`.
4. `assets/character/README.md` — the current app export contract.

If the Bible and spec conflict, report it and stop. If the canonical reference is missing, do not generate or approve visual variants from memory; request the reference or an explicit canonical-redesign decision.

A requested change to a locked feature is a canonical redesign. Identify the conflict and obtain explicit approval before changing the Bible, spec, and reference together.

## Scope routing

| Work | Also use |
|---|---|
| Wearable cosmetic or attachment metadata | `kairo-cosmetics` |
| Pose, expression, reaction, or attribute appearance | `kairo-poses-states` |
| `.riv` artboard, animation, state machine, or runtime integration | `kairo-rive` |

Do not expand an art request into app code, dependencies, schemas, or store/economy work. The current app uses static placeholder art; change that boundary only when explicitly requested.

## Asset contract

- Preserve the locked silhouette, anatomy, proportions, attachment points, base palette, and established rounded mobile-first style.
- Retain layered source upstream; export transparent production PNGs without baked shadows, glows, rings, or backgrounds.
- Center the figure with feet at the bottom edge. Verify readability at both the 190 × 212 display slot and the 72 × 72 thumbnail.
- Use the naming templates already defined in `CHARACTER_SPEC.json`. Do not invent a parallel naming convention.
- Prefer reusable base, pose, state, and cosmetic layers. For a flattened Cartesian product, calculate its size and produce only combinations justified by a consumer or approved deliverable.
- Update a manifest only when one exists or its creation is explicitly in scope. Never invent an incidental manifest schema.

## Review and delivery

Before delivery, compare the output with the canonical reference and verify locked features, transparency, alignment, dimensions, small-size legibility, and absence of baked effects. Report:

- files created or modified;
- canonical reference and version used;
- intentional deviations and their approval;
- unresolved conflicts or missing inputs;
- checks performed.

## Common mistakes

| Mistake | Correct response |
|---|---|
| Continue from memory when the golden reference is absent | Pause visual generation; request or deliberately replace the reference. |
| Accept every pose × state × cosmetic export | Keep dimensions modular and justify each flattened export. |
| Quietly alter eyes, beak, silhouette, or palette | Treat it as a canonical redesign requiring explicit approval. |
| Create a manifest or runtime selector because assets may need one | Keep the current task scoped; propose missing infrastructure separately. |
