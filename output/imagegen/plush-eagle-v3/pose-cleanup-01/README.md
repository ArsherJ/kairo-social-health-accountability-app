# Plush eagle v3 — local pose cleanup

2026-09-11. **Selected by the user as the v3 character direction after the tail, smooth-wing,
and frame cleanup.** These are the preferred concept exports; the canonical documents and
runtime assets have not been replaced.

## Review

- [Cleaned four-pose sheet](pose-sheet.png)
- [Light/dark size check](size-check.png): 190 × 212 and 72 × 72 slots, plus actual 44 px figure height
- [Crest-mask review](mask-review.png)
- [Base-to-pose comparison](identity-check.png)

## What changed

- Removed Run's added tail and the residual lower-wing notch stroke.
- Replaced Run/Ridge's feathered wings with one smooth mitten outline traced from the preferred base, mirrored and rotated at their shoulders. Ridge's wings angle outward for a readable raised-wing silhouette.
- Restored the torso edges exposed by removing the old wings and tail.
- Kept the original face regions as protected pixel layers; the eyes, beak and cheeks were not redrawn.
- Retained Idle and Walk's artwork, changing only their shared export framing/preparation.
- Exported all four on the current **570 × 636** transparent canvas at the same 636 px figure height, centered with feet at the bottom. No figure was stretched or cropped to force it into the frame.

This was deterministic local bitmap/path cleanup, **with no image-generation API calls, uploads, key access, or additional API charges**. It edits the existing generated studies; it is not a fresh generation or a new mascot design.

## Deliverables

| Pose | PNG | Final alpha bounds |
| --- | --- | --- |
| Idle | [kairo_pose_idle_concept_v3.png](kairo_pose_idle_concept_v3.png) | `(107, 0, 463, 636)` |
| Walk | [kairo_pose_walk_concept_v3.png](kairo_pose_walk_concept_v3.png) | `(59, 0, 510, 636)` |
| Run | [kairo_pose_run_concept_v3.png](kairo_pose_run_concept_v3.png) | `(7, 0, 562, 636)` |
| Ridge | [kairo_pose_ridge_concept_v3.png](kairo_pose_ridge_concept_v3.png) | `(48, 0, 521, 636)` |

Each PNG has a corresponding provisional `crest_` mask. Run now occupies 555 px horizontally, within the existing 570 px frame; the previous study occupied 577 px and required a wider canvas.

## Source and reproducibility

- Source poses and their exact generation prompts remain in [pose-study-01](../pose-study-01/README.md). All previous raw images, concept PNGs, and review sheets are preserved.
- The wing reference remains [plush-eagle-refined.png](../base-study-01/plush-eagle-refined.png).
- [cleanup_poses.py](cleanup_poses.py) contains the shared editable wing contour, localized erasure/repair paths, and protected-face compositing. `cutout-*.png` are the cleaned intermediates on the source study canvas before final framing.
- `layer-body-*` and `layer-wings-*` are diagnostic intermediate layers. The script's final protected-face copy is authoritative; these are not complete Rive-ready layers.
- The existing [review helper](../pose-study-01/review_poses.py) gained optional `--directory` and `--title` arguments so it can write this sibling study without overwriting previous outputs. Its normal invocation remains available.
- [verify_cleanup.py](verify_cleanup.py) independently checks the exported files and preservation constraints.
- `diagnostics/` retains coordinate grids and an intermediate Ridge candidate, not deliverables to adopt.

No new generation prompt was used for this cleanup. The editable local paths and original source images are its reproducible source.

## Verification

Automated checks cover 570 × 636 RGBA dimensions, centered bounds, feet-bottom alignment, transparent corners, no green residue, mask alpha contained inside the bird, unchanged Idle/Walk intermediates, preserved Run/Ridge face regions and grounded feet, and removal of a known pixel in Run's former tail.

The final pose sheet, size check, and mask overlay were visually inspected. The four poses remain distinguishable at 44 px on light and dark surfaces. Crest tint stays at the crest/upper head without selecting the raised wings. These are off-device visual checks, not a Simulator, Accessibility Inspector, animation, or usability pass.

## Scope and remaining design decisions

The canonical authority remains the existing v1 Character Bible, Character Spec, golden reference, and character export README. The user-approved v3 exploration intentionally differs from v1; this cleanup does not replace that authority. Character-assets and pose/state guidance kept the work outside production assets and runtime behavior.

This pass does not resolve every broader art-direction decision: the preferred base's approximately 1.694:1 proportion versus the original 3:2 target, pose-to-pose body proportion drift, Walk's oversized raised foot, and Run's bouncy hop/skip stance remain as in the source studies. Those belong to canonical art/rig authoring when implementing this selected direction. A matching export size alone does not make the set production-approved.

No app code, production art, production masks, schema, native dependency, Rive file, or health/state rule changed. No preview server or simulator was started.
