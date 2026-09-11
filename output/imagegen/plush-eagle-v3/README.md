# Plush eagle — selected v3 direction

2026-09-11. **The user selected v3 after reviewing the cleaned four-pose set.**
This is the retained direction for the next character/UI pass, not an installed runtime
replacement. The app's canonical v1 pack, growth stages, masks, and selectors remain intact.

## Start here

- [Selected four-pose sheet](pose-cleanup-01/pose-sheet.png)
- [Selected transparent poses and cleanup notes](pose-cleanup-01/README.md)
- [Light/dark size check](pose-cleanup-01/size-check.png)
- [Preferred base](base-study-01/plush-eagle-refined.png)

`pose-cleanup-01/` is the selected output. `base-study-01/` and `pose-study-01/` are
supporting v3 source studies, not competing versions to adopt; their inputs are needed by
the local cleanup and its preservation checks. The older eagle v1/v2 concept folders have
been removed from the active output tree. Historical stage/source art elsewhere in the
repository is unrelated to these concept alternatives and remains unchanged.

The original user-supplied cartoon crop is preserved under [references/](references/README.md).
It is drawing-language inspiration, not KAIRO artwork to bundle or publish.

## Direction and source files

- [`prompt-base.txt`](prompt-base.txt) — original base direction, preserved verbatim.
- [`prompt-poses.txt`](prompt-poses.txt) — original identity clause and four Motion poses.
- [`base-study-01/`](base-study-01/README.md) — generation sources and proportion refinement.
- [`pose-study-01/`](pose-study-01/README.md) — original generated inputs and exact pose prompts.
- [`pose-cleanup-01/`](pose-cleanup-01/README.md) — selected exports, local edits, and verification.

The prompt files are historical inputs, not a current API runbook: the derived base prompt
resolves their ratio/coverage mismatch, and the pose-study notes explain the model-specific
input-fidelity flag. Do not execute production asset generators to check this concept set.

## Verify the retained set

With Python, Pillow, and NumPy available, run from the repository root:

```sh
python3 output/imagegen/plush-eagle-v3/pose-cleanup-01/verify_cleanup.py
```

This is read-only and local. It checks the four final PNGs and masks against their retained
v3 sources; it does not call an API, read credentials, or change the app.

## What v3 changes, and why

v3 revises the now-retired round-eagle v2 concept, which was rejected on two grounds that
turned out to be one:

1. **It reads chubby.** Its figure bounding box is 558 x 574 px in a 570 x 636 canvas — 98%
   of the canvas width, against the canonical render's 55%. Its silhouette is as wide as it
   is tall.
2. **It cannot express Motion.** It has no visible legs and its wings are fused into the body
   outline, so `idle`, `walk` and `run` — the axis that changes every day for every player —
   would be near-indistinguishable.

Both come from the same cause, so the base prompt fixes them together: a silhouette that is
clearly taller than wide, two visible legs with daylight between them, wings drawn as separate
outlined shapes, and a visible taper at throat and waist. The charm of v2 is kept intact —
flat fills, bold soft outline, dot eyes, tiny hooked beak, cheek blush.

The blush is **not** an app token and no palette change is proposed here.

## The state model these poses serve

Three axes read off the character, and this prompt set covers only the first:

| Axis | Signal | What changes |
| --- | --- | --- |
| **Motion** | steps | the **pose** — `idle` / `walk` / `run` / `ridge` |
| **Body** | verified strength sessions, lifetime STR | **posture and stance**, never mass |
| **Mind** | sleep, wearable-gated | **the face** — heavy-lidded / neutral / alive |

Body is expressed as posture rather than body mass deliberately: a bird that visibly fattens
when a player skips a workout is a punishment mechanic, and `livingCharacterLabel` currently
refuses to speak a physique tier at all for the same reason.

## Known limits of this approach

Three independent axes **multiply**. Four Motion poses x three Body stances x three Mind faces
is 36 full-body renders per growth stage, or 144 across four stages, each needing a crest mask
beside it. That matrix cannot be held identity-consistent by generated art — the nine
growth-stage images already needed `--input-fidelity high` to stop one stage drifting into
three different birds.

So this prompt set is the **go/no-go gate, not the production pipeline**: generate the base,
then the four poses, and check that `idle`, `walk`, `run` and `ridge` separate at a glance at
44 px. If they do, the character should be authored once as a rigged Rive artboard with three
inputs rather than rendered as a PNG matrix. If they do not, the direction needs another pass
before any further art is commissioned.

Any earlier Rive authoring trace based on the old bird needs new face/wing geometry before
adopting v3. That is future authoring work: the repository's character export contract keeps
Rive parked and the shipped static v1 assets in place. Selecting this direction does not
install a new artboard, define persistent `ridge` behavior, or authorize a native build.
