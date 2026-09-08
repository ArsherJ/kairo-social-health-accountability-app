#!/usr/bin/env python3
"""
Kairo — crest masks (issue #33)

Derives one crest mask per checked-in KAIRO render. A mask is a 570x636 RGBA
PNG whose colour channels are white and whose **alpha is the crest**: opaque
over the fan of head feathers, ramping to nothing as the fan meets the round
of the head. The app draws it over the figure with `tintColor` set to the
player's dominant stat's hue, so two eagles in a flock stop looking identical
without a second set of artwork.

Why a mask rather than runtime geometry
---------------------------------------
The pose art is flattened — there is no crest layer to recolour — so the tint
has to be told where the crest is. A rectangle clipped at render time can say
that, but only with hard edges (React Native has no mask or blend primitive
without a native module, and this ships over the air), and a hard horizontal
cut across the head reads as a bug. A mask carries the soft edge the shape
needs, and it costs one `<Image>`.

How the crest is found
----------------------
Geometry, not colour. The crest and the head fluff share the same two creams
and the same tans as the body, so a colour rule cannot separate them; what is
reliably true of every render is that the crest is the topmost part of the
*head*, and the head is centred.

  1. The topmost opaque row inside the central band is the crest's tip. The
     band matters: `race_victory` and `workout` raise the wings above the eyes,
     and a full-width scan would find a wingtip and tint the wings.
  2. The crest's centre line is the mean x of the twenty rows below that tip —
     `run` and `workout` carry the head off centre, so a fixed centre would
     drag the mask off the fan.
  3. The mask is the figure's own alpha, multiplied by a vertical ramp that
     holds for the first half of the crest's height and fades out over the
     second, and by a horizontal window with soft shoulders. Multiplying by the
     figure's alpha is what keeps the tint off the background: the mask can
     only ever paint pixels the bird already occupies.

Rerun this after any change to the art it reads, including the nine
growth-stage images issue #31 commissions. `character-assets.test.ts` fails if
a render has no mask beside it, so a forgotten rerun is a red test rather than
an eagle whose crest tint sits next to its head.

Run: python3 scripts/generate_crest_masks.py
Requires: Pillow (tested against 12.1.1), numpy.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART_DIR = ROOT / "assets/character"
OUT_DIR = ART_DIR / "crests"

# Every render the two KAIRO components can draw. Cosmetics are QA previews
# that no product surface mounts, so they get no mask.
SOURCES = [
    "base/kairo_base_front_v1.png",
    "poses/kairo_pose_idle_v1.png",
    "poses/kairo_pose_sleep_v1.png",
    "poses/kairo_pose_walk_v1.png",
    "poses/kairo_pose_run_v1.png",
    "poses/kairo_pose_workout_v1.png",
    "poses/kairo_pose_race_victory_v1.png",
    "states/kairo_state_sleepy_v1.png",
    "states/kairo_state_normal_v1.png",
    "states/kairo_state_well_rested_v1.png",
    "stages/kairo_stage_hatchling_idle_v1.png",
    "stages/kairo_stage_hatchling_walk_v1.png",
    "stages/kairo_stage_hatchling_run_v1.png",
    "stages/kairo_stage_fledgling_idle_v1.png",
    "stages/kairo_stage_fledgling_walk_v1.png",
    "stages/kairo_stage_fledgling_run_v1.png",
    "stages/kairo_stage_juvenile_idle_v1.png",
    "stages/kairo_stage_juvenile_walk_v1.png",
    "stages/kairo_stage_juvenile_run_v1.png",
]

# The horizontal slice the head is searched in. Wide enough for `run`'s lean,
# narrow enough to miss a raised wing.
HEAD_BAND = (0.28, 0.72)
# Rows below the tip that decide the crest's centre line.
CENTRE_ROWS = 20
# The crest's height and half-width, as fractions of the canvas.
CREST_HEIGHT = 0.17
CREST_HALF_WIDTH = 0.26
# Where the vertical ramp starts fading, as a fraction of the crest's height.
FADE_FROM = 0.5
# The share of the half-width that is a soft shoulder rather than full strength.
SHOULDER = 0.3
# Below this the alpha is background antialiasing, not the bird.
SOLID = 0.15


def crest_alpha(image: Image.Image) -> np.ndarray:
    alpha = np.array(image.getchannel("A"), dtype=np.float32) / 255
    height, width = alpha.shape
    solid = alpha > SOLID

    left, right = int(HEAD_BAND[0] * width), int(HEAD_BAND[1] * width)
    rows = np.where(solid[:, left:right].any(axis=1))[0]
    if rows.size == 0:
        raise ValueError("no figure found in the central band")
    tip = int(rows[0])

    columns = np.where(solid[tip : tip + CENTRE_ROWS, :].any(axis=0))[0]
    columns = columns[(columns >= left) & (columns < right)]
    centre = float(columns.mean())

    span = CREST_HEIGHT * height
    half = CREST_HALF_WIDTH * width
    ys, xs = np.mgrid[0:height, 0:width]

    depth = (ys - tip) / span
    vertical = np.clip(1 - (depth - FADE_FROM) / (1 - FADE_FROM), 0, 1)
    vertical[depth < 0] = 1
    vertical[depth > 1] = 0

    shoulder = half * SHOULDER
    horizontal = np.clip(1 - (np.abs(xs - centre) - (half - shoulder)) / shoulder, 0, 1)

    return np.clip(alpha * vertical * horizontal, 0, 1)


def mask_name(source: str) -> str:
    return f"crest_{Path(source).name}"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for source in SOURCES:
        image = Image.open(ART_DIR / source).convert("RGBA")
        mask = crest_alpha(image)
        # White with the crest in the alpha channel: `tintColor` replaces the
        # colour and keeps the alpha, so the RGB only has to be non-transparent.
        out = Image.new("RGBA", image.size, (255, 255, 255, 0))
        out.putalpha(Image.fromarray((mask * 255).astype(np.uint8), "L"))
        out.save(OUT_DIR / mask_name(source))
        print(f"{source} -> crests/{mask_name(source)}")


if __name__ == "__main__":
    main()
