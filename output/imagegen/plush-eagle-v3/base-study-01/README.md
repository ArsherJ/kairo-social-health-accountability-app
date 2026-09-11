# Plush eagle v3 — base study and proportion edit

2026-09-11. **Supporting source study for the selected v3 direction.** The refined base below
fed the [selected cleaned pose set](../pose-cleanup-01/README.md). The historical review
records the remaining 3:2 discrepancy; neither base image is an installed runtime replacement.

## Review

- [Refined presentation](preview-refined.png)
- [Refined light/dark size checks](size-check-refined.png): 190 × 212, 72 × 72, and 44 px tall
- [Refined transparent character](plush-eagle-refined.png): 570 × 636 RGBA
- [Original presentation](preview.png), [size checks](size-check.png), and [transparent character](plush-eagle.png) — preserved unchanged
- [Initial generation prompt](prompt.txt)
- [Executed correction prompt](refine-prompt.txt)

The draft keeps the flat, softly outlined cartoon language while adding visible ochre legs, individually readable wings, and a throat taper. Its torso is still too long: the cleaned source silhouette measures approximately **1.747:1 height to width**, against the approved **1.5:1** target. It has not passed the proportion requirement or the four-pose readability gate.

The correction shortened the torso and wings while keeping the same character's head/face language, visible legs, and stance. The model also narrowed the relaxed wing span, so its cleaned silhouette measures **1.694:1**, still taller than the **1.5:1** target. This is a partial proportion improvement, not an exact geometry pass. There was no local stretching or shape alteration to force the ratio.

The approval check initially denied the corrective upload/call. Execution paused until the user explicitly approved uploading this draft to OpenAI for one additional paid edit. That single approved call then completed successfully in 35.4 seconds. No further API calls were made.

## Source and execution

The user's [base prompt](../prompt-base.txt) and [pose instructions](../prompt-poses.txt) remain untouched; the [direction README](../README.md) now records the selected output. The derived prompt makes the approved 3:2 silhouette authoritative and changes square-canvas width coverage from 42% to 52% to match 78% height coverage. Image 1 is explicitly a drawing-style reference, not an anatomy reference.

Both requests used the approved OpenAI API fallback and bundled image-generation CLI: `gpt-image-2`, medium quality, 1024 × 1024. The initial request uploaded only the now-retired round-eagle v2 render and produced `raw.png`. The separately approved correction uploaded only `raw.png` and produced `raw-refined.png`. Credentials were loaded locally from the root `.env`; the environment file was not uploaded or copied into these artifacts. Both raw responses are preserved. Re-running the local v3 cleanup does not need the removed v2 render or another API call.

The bundled chroma-key helper created `cutout.png` and `cutout-refined.png`. The local `render_review.py` removes disconnected background residue, normalizes flat fills to the same six-color concept palette as v2, and proportionally fits each figure into a centered, feet-bottom-aligned transparent canvas. Its `--suffix=-refined` option preserves the initial review files. No nonuniform scaling or local geometry edits were applied. The palette uses canonical warm ivory, chestnut, deep brown, ochre, and charcoal, plus the concept-only cheek blush. This does not introduce an app token or approve a canonical palette change.

## Verification and boundaries

- Reviewed both raw generations, finished presentations, and all three small-size placements on existing light/dark theme surfaces.
- Verified 570 × 636 RGBA dimensions, centered bounds (original: `(103, 0, 467, 636)`; refined: `(97, 0, 472, 636)`), bottom alignment, transparent corners, and no remaining green-dominant pixels.
- At 44 px the base silhouette, feet, and face remain identifiable; distinguishing idle/walk/run/ridge still requires the planned separate pose test.
- The canonical authority remains `assets/CHARACTER_BIBLE.md`, `assets/CHARACTER_SPEC.json` (`asset_version: v1`), `assets/reference/KAIRO_GOLDEN_REFERENCE.png`, and `assets/character/README.md`.
- This approved concept exploration intentionally differs from v1 in eyes, crest, simplified beak, proportions, wing/leg geometry, and blush. Character-assets and pose/state guidance keep those changes outside canonical identity and runtime behavior until separately approved.
- No app, canonical asset, character document, dependency, runtime selector, crest mask, Rive asset, or state rule changed. No simulator was started; no device or animation verification is claimed.

The later pose study and local cleanup are complete, and the user selected v3. See the
[selected set](../pose-cleanup-01/README.md) for its current status. This source record does
not authorize additional generation or promote the assets into the runtime.
