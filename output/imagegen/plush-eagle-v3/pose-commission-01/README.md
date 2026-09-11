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

## Run's stance: three attempts, all rejected

Deviation #73 committed to fixing one art defect — Run's "bouncy hop/skip" read.
Three `gpt-image-2` edits were spent on it and **none shipped**; the checked-in
`run` is still the retained `pose-cleanup-01` export.

| Attempt | Prompt | Outcome |
| --- | --- | --- |
| v1 | inherited from `pose-study-01` | the stance this was meant to fix |
| v2 | `prompt-run-v2-rejected.txt` — forward pitch, legs stretched along travel, wings swept back | wings streamed horizontally and **clipped both canvas edges** (figure 570 px wide in a 570 px frame); lean did not land |
| v3 | `prompt-run-v3-rejected.txt` — same, but motion moved into body and legs with wings held tucked | fits the frame, but reads as a bird **sitting with its legs out**. At 72 px it shows no motion at all, where the current pose does |

**The finding is about the view, not the prompt.** Running is a side-on motion,
and every pose in this pack is front-facing. A front view can show a leg
stagger and a lean of a few degrees; it cannot show travel. The existing pose
buys its motion with asymmetry and a raised foot, which is what reads at 44 and
72 px — the sizes that matter most — and the three corrections each traded that
away for a lean nobody can see at those sizes.

So the defect stands, and it is **reclassified rather than carried**: fixing it
needs a three-quarter or side-on view for `run`, which is an art-direction
decision about the whole pack's camera, not a re-roll. Raw outputs for all three
attempts are preserved in `raw/`.
