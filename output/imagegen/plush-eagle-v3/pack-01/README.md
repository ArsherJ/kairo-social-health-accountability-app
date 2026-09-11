# Plush eagle v3 — complete pack

2026-09-11. The eleven renders and eleven crest masks that deviation #73 installs.
**Candidate for review. No app code, registry, production asset or runtime
behaviour has changed, and nothing here is wired to the app.**

## Review

- [Pack sheet](pack-sheet.png) — all eleven, light, plus a 72 pt dark strip.
- [Crest tint check](crest-tint-check.png) — production strength (0.62) in all three stat hues.

## Contents

| Slot | File | Origin |
| --- | --- | --- |
| base | `base/kairo_base_front.png` | refined v3 base study |
| pose | `poses/kairo_pose_idle.png` · `walk` · `run` | retained `pose-cleanup-01` exports |
| pose | `poses/kairo_pose_summit.png` | the retained `ridge` export, renamed |
| pose | `poses/kairo_pose_race_victory.png` · `workout` · `sleep` | `pose-commission-01`, framed here |
| state | `states/kairo_state_sleepy.png` · `well_rested.png` | local face-only edits of Idle |
| state | `states/kairo_state_normal.png` | byte copy of `kairo_pose_idle.png` |
| crest | `crests/crest_<name>.png` × 11 | `generate_crest_masks.py`'s constants, unchanged |

Filenames carry no version suffix, per the decision recorded in deviation #73:
v1 is being deleted rather than shipped beside this, so there is nothing left to
disambiguate from.

## The two Mind faces were not generated

`sleepy` and `well_rested` are deterministic local edits of `kairo_pose_idle.png`
and cost no API call. Mind's whole premise is that the body does not change —
only the face — so generating a whole bird to move two eyes is precisely how the
identity drifts. The eyes are 24 px dots at (235, 201) and (334, 201); the cheeks
are r≈18 at (183, 228) and (386, 228).

- `sleepy` — cream lid over the upper eye, a drooping ink lid line, and the blush
  blended 55% toward cream.
- `well_rested` — the dot grown 2 px, a white glint at its upper left, and warmer
  cheeks.

## Verification

`python3 output/imagegen/plush-eagle-v3/pack-01/verify_pack.py` — read-only, local,
no API. It asserts, for all eleven: 570 × 636 RGBA, the figure at full 636 px
height with feet on the bottom edge, horizontal centring within 12 px, no contact
with the canvas edge, no chroma-green residue, transparent corners, a crest mask
present and shaped alike, **mask alpha painting no pixel outside the figure**, and
that `kairo_state_normal.png` is a byte copy of `kairo_pose_idle.png`. Currently
passes.

Separately measured and not asserted by that script: the crest is the topmost
opaque row inside the central 44% band on **all eleven**, so the mask script finds
the crest rather than a raised wingtip. This was the one hard constraint on
`summit`, `race_victory` and `workout`.

These are off-device raster checks. No Simulator, Accessibility Inspector,
Dynamic Type or animation pass has been run.

## Known defects, carried forward deliberately

Inherited from the retained studies and unchanged here:

- The base's ≈1.694:1 proportion against the 3:2 the original prompt asked for.
- Pose-to-pose body proportion drift.
- Walk's oversized raised foot.
- Run's bouncy hop/skip stance, which deviation #73 records as the one art defect
  to fix.

New, from this pass:

- `sleep`'s beak drifted to a flat lozenge instead of the base's hooked shape. It
  is the least visible defect in the pack because **no surface in the app draws
  the sleep pose** — it exists so the registry stays whole.
- `sleep` and `sleepy` read similarly at a glance. Same reason: only one of them
  is reachable.

## Provenance

Five paid `gpt-image-2` edits in total across this direction's commission:
`race_victory`, `workout`, `sleep`, plus one re-roll each of `sleep` and
`race_victory`. Every call used the refined base as its sole image input; no pose
was ever the input to another pose. Rejected rolls and their prompts are preserved
in `../pose-commission-01/`. Framing, the two Mind faces, `normal` and all eleven
masks were produced locally with no API call.
