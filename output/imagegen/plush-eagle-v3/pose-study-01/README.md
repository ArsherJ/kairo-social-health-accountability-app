# Plush eagle v3 — four Motion pose studies

2026-09-11. **Concept-only visual test. Four approved paid API edits completed. No production assets or runtime behavior changed.**

Follow-up: [local tail/wing/frame cleanup](../pose-cleanup-01/README.md). The original images and review results below remain preserved.

## Result

The four silhouettes are distinguishable at 44 px in this off-device visual review. That supports the direction's ability to communicate Motion, but **the set does not pass strict character consistency or production-export readiness**.

| Pose | Readability | Identity / behavior findings |
| --- | --- | --- |
| Idle | Upright, feet level, wings tucked | Slightly taller/slimmer than the refined base at equal figure height. |
| Walk | Raised foot and low outward wings separate it from idle | The raised foot becomes noticeably oversized; revisit its scale and foreshortening in authored art. |
| Run | One foot raised, asymmetric stance, broad wings distinguish it from walk/ridge | Reads as a lively hop/skip more than a forward sprint. Adds a tail, feather notches on the wings, and longer-looking legs. These violate the fixed-base constraints. |
| Ridge | Two feet planted with an upright, raised-wing silhouette | Adds feather notches to the wings and elongates the torso. The wider smile is requested; the new wing anatomy is not. |

Recommendation: retain the overall character direction and pose vocabulary, then resolve the wing/foot/tail geometry against one fixed base before production authoring or rigging. Do not commission a Body × Mind × Motion PNG matrix from these outputs. No further API edits are included or authorized by this document.

## Review sheets

- [Four-pose overview](pose-sheet.png)
- [Light/dark size checks](size-check.png): actual 44 px figure height plus 190 × 212 and 72 × 72 display slots
- [Base-to-pose identity comparison](identity-check.png)
- [Existing crest-mask geometry check](mask-review.png)

These are raster inspections, not a usability study, Simulator pass, Accessibility Inspector pass, or animation test. Labels identify the intended poses; the visual judgment above is an engineering/art-direction assessment.

## Files and exact prompts

| Pose | Normalized concept PNG | Prompt |
| --- | --- | --- |
| Idle | [kairo_pose_idle_concept_v3.png](kairo_pose_idle_concept_v3.png) | [prompt-idle.txt](prompt-idle.txt) |
| Walk | [kairo_pose_walk_concept_v3.png](kairo_pose_walk_concept_v3.png) | [prompt-walk.txt](prompt-walk.txt) |
| Run | [kairo_pose_run_concept_v3.png](kairo_pose_run_concept_v3.png) | [prompt-run.txt](prompt-run.txt) |
| Ridge | [kairo_pose_ridge_concept_v3.png](kairo_pose_ridge_concept_v3.png) | [prompt-ridge.txt](prompt-ridge.txt) |

Each pose also has its preserved `raw-<pose>.png`, chroma-extracted `cutout-<pose>.png`, and provisional `crest_kairo_pose_<pose>_concept_v3.png`. The `concept_v3` filenames follow the pose/crest templates but do not bump the canonical asset version.

## Generation provenance

- The user explicitly approved uploading the refined base to OpenAI for four additional paid image edits, one for each pose.
- All four calls used the same sole image input: [plush-eagle-refined.png](../base-study-01/plush-eagle-refined.png). No pose was used as the input to another pose.
- The approved fallback used the bundled image-generation CLI, `gpt-image-2`, medium quality, 1024 × 1024, one output per call. There were no additional image-generation calls or retries.
- Calls completed successfully: idle 34.7 s; walk 36.1 s; run 35.8 s; ridge 35.0 s.
- The original [pose instructions](../prompt-poses.txt) and [base prompt](../prompt-base.txt) were preserved. Each derived prompt includes their identity clause and positive pose paragraph, plus the base Rendering, Palette, and Technical background paragraphs verbatim. Only reference-role and full-figure framing clarification was added.
- The notes' `--input-fidelity high` flag belongs to the older model path. The bundled CLI documents that `gpt-image-2` always uses high input fidelity and rejects that explicit flag; these edits therefore use its built-in high-fidelity behavior without passing the unsupported flag.
- Credentials were loaded locally from the configured root `.env`; no key or environment-file contents are saved in these artifacts or included as image inputs.

## Local processing and export checks

`review_poses.py` performs local-only cleanup and review-sheet composition. It uses the same six-color concept palette as the refined base, removes disconnected chroma residue, floors faint alpha at 16, and scales proportionally to 636 px figure height. Geometry drift from generation is preserved for review, not painted over or hidden.

All figures share a **590 × 636** transparent study canvas, horizontal center line, and bottom ground line. The canvas is deliberately 20 px wider than the current 570 × 636 app contract: Run's 577 px normalized silhouette would otherwise clip. This is a study export, **not a drop-in replacement** for the current app files.

| Pose | Normalized alpha bounds | Fits current 570 px width at this height? |
| --- | --- | --- |
| Idle | `(117, 0, 473, 636)` | Yes |
| Walk | `(69, 0, 520, 636)` | Yes |
| Run | `(6, 0, 583, 636)` | No — 577 px wide |
| Ridge | `(55, 0, 535, 636)` | Yes |

Automated checks passed for all four: nonempty RGBA output, centered bounds, bottom-aligned feet, transparent corners, no green-dominant residue, and mask alpha contained within the bird's alpha. Raw images and all four review sheets were inspected visually.

The existing pure `crest_alpha()` function from `scripts/generate_crest_masks.py` was reused without executing its production-writing `main()`. It produced provisional masks only inside this study folder. The overlay review places the tint at the crest and upper head, not the raised wings; the soft mask boundary still needs art review. No production crest files were regenerated.

## Character and runtime boundaries

The canonical authority remains the existing v1 Character Bible, Character Spec, golden reference, and character export README. The approved concept exploration intentionally differs from v1 in dot eyes, crest/beak simplicity, proportions, limb geometry, and cheek blush. The original 3:2 silhouette target also remains unresolved: the preferred base was approximately 1.694:1 before pose generation.

Character-assets and pose/state guidance keep these files outside canonical identity and runtime behavior. No app code, schema, dependency, selector, source manifest, Rive artboard, cosmetic anchor, or health-derived state rule changed. In particular, `ridge` remains a proposed pose: this study does not implement a persistent cleared-day state or alter the existing celebration.
