# Plush eagle v3 — commissioned poses

2026-09-11. The three body poses that deviation #73's plan lists as missing:
`race_victory`, `workout`, `sleep`. **Concept exports. No app code, production
asset, registry or runtime behaviour has changed.**

## Review

- [Seven-pose sheet](pose-sheet.png) — these three beside the four retained poses.

| Pose | Verdict | Finding |
| --- | --- | --- |
| `workout` | **Accept as generated** | Reads as a flex instantly. Wings kept their smooth mitten outline with no notches. |
| `race_victory` | **Accept, needs wing cleanup** | Pose and expression are right; the wingtips came back with feather notches — the same defect `cleanup_poses.py` already removed from Run and Ridge. |
| `sleep` | **Accept on the second roll** | The first roll is kept as `raw-sleep-v1-rejected.png`. Minor residual: the beak drifted to a flat lozenge instead of the base's hooked shape. |

## Why the first `sleep` roll was rejected

Its prompt asked for drooping crest tufts and legs folded beneath the body. The
model obliged on both and the result was a different, chubbier bird: the crest —
the identity mark, and what `generate_crest_masks.py` locates by geometry —
flattened to a bump, the legs vanished, and the body widened to an aspect ratio
of 0.79 against the base's 0.59.

`prompt-sleep-v1-rejected.txt` preserves that prompt. The corrected one keeps the
crest and legs explicitly and forbids widening; the re-roll measures 0.57.

## Checks

Measured from the chroma-keyed cutouts, not asserted:

- The crest is the topmost opaque row inside the central 44% band on all three,
  so `generate_crest_masks.py` will find it rather than a raised wingtip. This was
  the one hard constraint on the two wings-up poses.
- Aspect ratios: `race_victory` 0.83 and `workout` 0.86, both within the range the
  retained wings-out poses already occupy (Ridge 0.74, Run 0.87). `sleep` 0.57
  against the base's 0.59 and Idle's 0.56, as a tucked-wing pose should be.

Off-device raster inspection only. No Simulator, Accessibility Inspector or
animation pass.

## Provenance

- Four paid `gpt-image-2` edits: `race_victory`, `workout`, `sleep`, and one
  `sleep` re-roll. Medium quality, 1024 × 1024, one output per call, `--no-augment`.
- Every call used the same sole image input,
  [`plush-eagle-refined.png`](../base-study-01/plush-eagle-refined.png). No pose was
  used as the input to another pose.
- `--input-fidelity` is not passed: `gpt-image-2` always uses high input fidelity
  and rejects the explicit flag.
- Credentials were read from the repository root `.env`. No key or environment
  contents appear in these artifacts or were sent as image inputs.
- `raw/` preserves every original response, rejected roll included. `cutout-*.png`
  are chroma-keyed intermediates on the 1024 canvas, not final exports — framing to
  570 × 636 belongs to the cleanup pass.

## Not done here

Wing-notch cleanup on `race_victory`, beak repair on `sleep`, framing to the
570 × 636 export canvas, crest masks, and the two Mind faces (`sleepy`,
`well_rested`), which are local face-only edits of Idle and need no API call.
