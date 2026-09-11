# KAIRO character art

The plush eagle **v3** pack — eleven renders and eleven crest masks, installed by
[deviation #73](../../docs/roadmap.md) on 2026-09-11.

| Directory | Contents |
| --- | --- |
| `base/` | `kairo_base_front.png` — the identity and framing baseline every other render is laid out against. Registered but unreachable at runtime: `motionPose()` always answers, so the figure never falls through to it. |
| `poses/` | `idle` · `walk` · `run` · `summit` · `race_victory` · `workout` · `sleep` |
| `states/` | `sleepy` · `normal` · `well_rested` — the Mind reading, wearable-gated |
| `crests/` | one `crest_<render>.png` per render, for the plumage tint |

## Rules

**Filenames carry no version suffix.** A version in a filename earns its place
only while two versions coexist; v1 was deleted rather than shipped beside this,
and git holds the history.

**Every render is framed against the base** — 570 × 636 RGBA, the figure at full
636 px height with its feet on the bottom edge, centred. This is what lets
`figureResponse`'s `bodyScale` make a young bird small without the artwork ever
being small, and `character-assets.test.ts`'s "frames every render against the
base" is what holds it. Width is deliberately unpinned: a wings-out pose is
legitimately wider than a tucked one.

**Masks are generated, never drawn.** Run
`python3 scripts/generate_crest_masks.py` after any change to the art; it locates
the crest by geometry — the topmost opaque row inside the central 44% band — so
**nothing may rise above the crest tips in any pose**. That is why `summit` and
`race_victory` spread their wings wide and outward rather than up over the head.

**Two of these were not generated.** `sleepy` and `well_rested` are deterministic
local edits of `kairo_pose_idle.png`; Mind's premise is that only the face moves,
and generating a whole bird to shift two eyes is how identity drifts.
`kairo_state_normal.png` is a byte copy of idle — the state the resolver never
picks, kept as its own file because the registry guard reads paths and a shared
path reads as a duplicated cell.

**Nothing draws `sleep`.** No surface in the app reaches that pose; it exists so
the registry stays whole.

## Verifying

```sh
python3 assets/character/verify_pack.py
```

Read-only and local. Checks dimensions, the full-height figure and ground line,
centring, edge clearance, transparent corners, chroma-green residue, that each
mask exists and paints no pixel outside its bird, and that `normal` still matches
`idle`.

## Provenance and known defects

The direction, the generation prompts, every rejected roll and the defects
carried forward are in
[`output/imagegen/plush-eagle-v3/`](../../output/imagegen/plush-eagle-v3/README.md).
The v1 pack's own documents are archived at
[`docs/archive/character-asset-pack-v1.md`](../../docs/archive/character-asset-pack-v1.md)
and
[`docs/archive/kairo-static-asset-handoff-v1.md`](../../docs/archive/kairo-static-asset-handoff-v1.md);
they inventory files that no longer exist and are kept as a record, not as
authority.
