#!/usr/bin/env python3
"""
Kairo — the nine growth-stage renders (issue #31)

Three pre-adult growth stages (hatchling, fledgling, juvenile) in the three
poses that actually draw (idle, walk, run). The adult keeps the art it already
has, so this script writes nine files and never a tenth.

Why nine and not three
----------------------
`staticFigureSelection` applies the stage to `{ kind: 'pose' }` only, and
`motionPose()` always answers, so a single base image per stage would almost
never be drawn. `STAGE_POSES` is the three that do.

How each render is produced
---------------------------
An identity-preserving **edit of the adult render for that same pose**, not a
fresh generation. The camera, the palette and the line weight all come along
for free that way, which is what "the same bird at a different age" needs — the
alternative is nine drawings that agree about nothing.

The stage prompts move only what age moves: the down-to-feather transition, the
crest fan's growth, the wing length, and the head's share of the figure. The
Bible's locked features (eye placement, beak shape, wing attachment, foot
shape, base palette) are restated as constraints on every call.

The pose does **not** come along for free, and two things buy it back
------------------------------------------------------------------
`--input-fidelity high` and `POSE_PROMPTS`, and the first run of this script
shipped without either. Age is the loudest thing in the prompt, so an edit that
is told to grow down over a bird redraws the bird — the first nine came back
with every foot planted flat and level, hatchling walk indistinguishable from
hatchling idle, on artwork whose whole reason for being nine rather than three
is that the three *poses* draw. Restating the pose as a positive instruction of
its own is what fixes it; `IDENTITY`'s "the same pose … as the input image" was
already there and lost the argument to the paragraph above it.

`--input-fidelity high` is the other half and holds the line weight, the eye
shape and the crest's colour steady across a stage's three renders. Without it
one stage's three images drifted into three different birds — a black-eyed
walk beside a brown-eyed idle — which fails the ticket's second criterion
sideways: the stages read as ages, but the poses inside a stage did not read as
one bird.

Framing is not left to the model
--------------------------------
`normalise()` trims each render to its own alpha and re-lays it out against the
**adult's** bounding box for that pose: the same 570x636 canvas, the same
centre line, the same feet-on-the-bottom-edge ground line, the same figure
height. That is the ticket's third criterion and no screen has to move for it.
Size on screen is the runtime's job, not the artwork's — `figureResponse`'s
`bodyScale` stands a hatchling smaller in the same box.

Known drift in the checked-in nine
---------------------------------
The juvenile's idle and run renders draw dark tips on the toes, where the adult
draws plain orange feet — a few pixels at display size, and a real deviation
from `IDENTITY`'s locked "same three-toed feet". It was left rather than
regenerated: a re-roll spends a call and risks the pose, which is the expensive
half. If you are regenerating that stage for another reason, add the feet to
the constraints and check them.

After running this, rerun `scripts/generate_crest_masks.py`: every new render
needs the mask beside it, and `character-assets.test.ts` fails if one is
missing.

Usage:
    python3 scripts/generate_stage_art.py               # all nine
    python3 scripts/generate_stage_art.py --stages hatchling --poses idle
    python3 scripts/generate_stage_art.py --normalise-only   # re-lay out the raws
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ADULT_DIR = ROOT / "assets/character/poses"
RAW_DIR = ROOT / "output/imagegen/stages"
OUT_DIR = ROOT / "assets/character/stages"

# Alpha at or below this is erased, both before the figure is measured and
# again after it is resampled. Two different specks, one rule. The API returns a
# faint ghost of the input a few hundred pixels wide at alpha 1 — invisible on
# screen, and enough to drag the bounding box off the figure and hand
# `normalise()` a centre line that is nobody's. LANCZOS then rings a few single
# pixels out past the silhouette at alpha 9 to 13, which is why the floor is 16
# rather than the 8 that cleared the ghost: `generate_crest_masks.py` finds the
# crest by the topmost opaque row in the middle of the canvas, so one invisible
# speck above the head is a mask that tints the sky.
ALPHA_FLOOR = 16

POSES = ("idle", "walk", "run")
STAGES = ("hatchling", "fledgling", "juvenile")

# What the model is never allowed to move. Lifted from `assets/CHARACTER_BIBLE.md`'s
# locked features — an edit that drifts on any of these produces a different
# bird, which is the one thing the ticket's second criterion forbids.
IDENTITY = """Preserve the character's identity exactly: the same stylised eagle chick
mascot, the same flat vector illustration style, the same bold outlines of even weight drawn in
the input's own very dark near-black brown ink rather than a lighter brown, the same cel shading with no gradients and no texture, the same warm palette
of cream, tan and chocolate brown with orange-yellow beak and feet, the same large round
dark eyes with a single white highlight in the same position, the same small rounded
triangular beak, the same three-toed feet, the same front-facing camera, and the same
pose, limb placement and weight distribution as the input image."""

FRAMING = """Keep the whole figure inside the frame with its feet at the bottom, centred
horizontally, on a fully transparent background. No shadow, no ground plane, no
background, no scenery, no text, no border, no second character, no colour swatches."""

# Age moves four things and nothing else: the down, the crest fan, the wing
# length, and the head's share of the figure. Written as a change *from the
# input* rather than as a description of a bird, because the call is an edit.
STAGE_PROMPTS = {
    "hatchling": """Make the character a newly hatched chick, a few days old.
Its whole body is covered in soft pale-cream down instead of feathers: the wings are
short rounded stubs of down with no visible flight feathers and no brown wing markings,
and the chocolate-brown plumage of the input is reduced to a faint warm-tan wash across
the back and stubs. On top of the head, the tall fanned crest of the input becomes a
short soft tuft of three or four stubby down feathers standing straight up, and it keeps
the input's warm tan colour so the chick still reads as this eagle's chick rather than as
a generic bird. The head is
noticeably larger relative to the body than in the input — roughly two thirds of the
figure — and the body is a small round bundle. The legs are very short and thick and the
beak is smaller and more rounded. The eyes stay large and stay exactly where they are.""",
    "fledgling": """Make the character a fledgling, a young bird that has just grown its
first real feathers. The soft down of a chick is giving way to plumage: the wings are
proper wings now but clearly short, rounded at the tips and reaching only about halfway
down the body, with the first chocolate-brown feathers coming in over a still-downy
cream chest. On top of the head the crest has opened into a real fan, but a short and
slightly ragged one, about half the height of the input's. The head is still larger
relative to the body than an adult's, and the body is rounder and shorter, with short
legs.""",
    "juvenile": """Make the character a juvenile, nearly grown. The plumage is fully
feathered and close to the input's, but a shade lighter and softly mottled where the
adult is solid, and the wings, while properly formed and clearly feathered, are a little
shorter than the input's and stop just short of the body's lowest point. The crest fan on
top of the head is nearly full height but slightly narrower and less even than the
input's. The head is a little larger relative to the body than the input and the body is leaner
and less stocky, but the legs stay exactly as long and as feathered down to the ankle as the
input's — only the bare part above the foot is a little thinner.""",
}


# The pose, said out loud. `IDENTITY` already asks for "the same pose … as the
# input image" and that is not enough on its own: it sits inside a paragraph of
# constraints, under a primary request about growing down over a bird, and the
# model resolves the conflict by drawing a well-posed bird of the right age
# standing still. Each of these describes the *input's own* stagger and wing
# set as a positive instruction, so the edit has something to keep rather than
# something not to break.
POSE_PROMPTS = {
    "idle": """The bird stands square and upright facing the viewer, both feet flat on the
ground side by side at the same height, taking its weight evenly, with the wings held down and
folded in against its sides.""",
    "walk": """The bird is mid-stride, walking towards the viewer: one leg is lifted clear of
the ground and swung forward so that its foot sits well above the other, and the other leg is
planted and carries the weight; the wings are held a little away from the body for balance. Keep
the same leg lifted, at the same height, as in the input image. The lifted foot is drawn open,
with the same three spread toes as the planted one, never as a closed fist or a stump.""",
    "run": """The bird is mid-run: the body leans and both wings are raised and swept out and
back away from the body, one leg is lifted high and forward with the foot well clear of the
ground, and the other is planted beneath the body. Keep the same leg lifted and the same wing
sweep as in the input image. The lifted foot is drawn open, with the same three spread toes as the
planted one, never as a closed fist or a stump.""",
}


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def image_cli() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    path = codex_home / "skills/.system/imagegen/scripts/image_gen.py"
    if not path.is_file():
        raise SystemExit(f"Bundled image CLI not found: {path}")
    return path


def generate(stage: str, pose: str, args: argparse.Namespace) -> Path:
    source = ADULT_DIR / f"kairo_pose_{pose}_v1.png"
    if not source.is_file():
        raise SystemExit(f"Adult render not found: {source}")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw = RAW_DIR / f"kairo_stage_{stage}_{pose}_v1_raw.png"

    prompt = "\n\n".join(
        [
            "Use case: identity-preserve",
            "Input image: the edit target and the sole identity and style anchor.",
            f"Primary request: {STAGE_PROMPTS[stage]}",
            f"Pose, which the edit must keep exactly as the input has it: {POSE_PROMPTS[pose]}",
            f"Composition: {FRAMING}",
            f"Constraints: {IDENTITY} Change only what the primary request asks for.",
        ]
    )

    command = [
        sys.executable,
        str(image_cli()),
        "edit",
        "--model",
        args.model,
        "--image",
        str(source),
        "--input-fidelity",
        args.input_fidelity,
        "--prompt",
        prompt,
        "--quality",
        args.quality,
        "--size",
        args.size,
        "--background",
        "transparent",
        "--output-format",
        "png",
        "--out",
        str(raw),
    ]
    if args.force:
        command.append("--force")
    if args.dry_run:
        command.append("--dry-run")

    print(f"Generating {stage} {pose}...", flush=True)
    subprocess.run(command, check=True)
    return raw


def floor_alpha(image: Image.Image) -> Image.Image:
    """Erase everything at or below `ALPHA_FLOOR`, so a bounding box is the bird's."""
    channels = list(image.split())
    alpha = np.array(channels[3])
    alpha[alpha <= ALPHA_FLOOR] = 0
    channels[3] = Image.fromarray(alpha)
    return Image.merge("RGBA", channels)


def normalise(stage: str, pose: str) -> Path:
    """Re-lay out one raw render against the adult's frame for the same pose."""
    raw_path = RAW_DIR / f"kairo_stage_{stage}_{pose}_v1_raw.png"
    adult = Image.open(ADULT_DIR / f"kairo_pose_{pose}_v1.png").convert("RGBA")
    raw = floor_alpha(Image.open(raw_path).convert("RGBA"))

    target = adult.split()[3].getbbox()
    if target is None:
        raise SystemExit(f"Adult render for {pose} is empty")
    target_height = target[3] - target[1]
    target_centre_x = (target[0] + target[2]) / 2

    box = raw.split()[3].getbbox()
    if box is None:
        raise SystemExit(f"{raw_path} is empty — the edit returned nothing opaque")
    figure = raw.crop(box)

    scale = target_height / figure.height
    resized = figure.resize(
        (max(1, round(figure.width * scale)), target_height), Image.LANCZOS
    )

    # Floor again after the resample, then re-trim. Both halves are about the
    # ground line. LANCZOS has negative lobes, so it both rounds a faint
    # antialiased edge row down to nothing — lifting the figure off the bottom
    # edge that *is* the shared ground line — and rings a couple of alpha out
    # past the silhouette, which would then hold the bbox open around a bird
    # standing on invisible dust. `character-assets.test.ts` asserts an opaque
    # pixel in the last row, and this is what makes that true rather than lucky.
    resized = floor_alpha(resized)
    trimmed = resized.split()[3].getbbox()
    if trimmed is not None:
        resized = resized.crop(trimmed)

    # Pasted **without a mask**, which is not a shortcut. `paste(im, box, im)`
    # blends the source into the destination through the source's own alpha, so
    # a bottom row at alpha 1 lands at alpha 1/255 of itself and rounds to
    # nothing — the figure lifts off the ground line again, one resample later.
    # The canvas is empty and this rectangle is the whole figure, so a straight
    # copy is both lossless and correct.
    canvas = Image.new("RGBA", adult.size, (0, 0, 0, 0))
    left = round(target_centre_x - resized.width / 2)
    canvas.paste(resized, (left, adult.size[1] - resized.height))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"kairo_stage_{stage}_{pose}_v1.png"
    canvas.save(out)
    print(f"  -> {out.relative_to(ROOT)}")
    return out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stages", help=f"Comma-separated subset of {', '.join(STAGES)}")
    parser.add_argument("--poses", help=f"Comma-separated subset of {', '.join(POSES)}")
    # `gpt-image-2` refuses a transparent background, and keying a white one
    # back out leaves the bright fringe `prep_character_art.py` exists to fight.
    # `gpt-image-1.5` returns real alpha, so the render arrives already keyed.
    parser.add_argument("--model", default="gpt-image-1.5")
    # `low` is the API's default and is what the first run of this script got.
    # It reads the input as a reference rather than as the thing being edited,
    # so a stage's three renders came back as three subtly different birds.
    parser.add_argument("--input-fidelity", choices=("low", "high"), default="high")
    parser.add_argument("--quality", choices=("low", "medium", "high", "auto"), default="high")
    parser.add_argument("--size", default="1024x1024")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--normalise-only",
        action="store_true",
        help="Skip the API and re-lay out the raws already in output/imagegen/stages.",
    )
    return parser.parse_args()


def selected(requested: str | None, available: tuple[str, ...]) -> list[str]:
    if not requested:
        return list(available)
    wanted = [item.strip() for item in requested.split(",") if item.strip()]
    unknown = [item for item in wanted if item not in available]
    if unknown:
        raise SystemExit(f"Unknown: {', '.join(unknown)}. Known: {', '.join(available)}")
    return wanted


def main() -> int:
    args = parse_args()
    stages = selected(args.stages, STAGES)
    poses = selected(args.poses, POSES)

    if not args.normalise_only:
        load_env_file(args.env_file)
        if not args.dry_run and not os.environ.get("OPENAI_API_KEY"):
            raise SystemExit(f"OPENAI_API_KEY is not set and was not found in {args.env_file}")

    for stage in stages:
        for pose in poses:
            if not args.normalise_only:
                generate(stage, pose, args)
            if args.dry_run:
                continue
            normalise(stage, pose)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
