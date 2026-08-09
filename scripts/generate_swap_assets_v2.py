#!/usr/bin/env python3
"""
Kairo — chained swap asset generator (GPT Image 2)

Every generation carries the character anchor as a persistent style reference,
so gear reads as belonging to the same game as the hunter.

Reference roles:
  IMAGE 1  hunter-character-anchor-final.png  -> STYLE AUTHORITY (every call)
  IMAGE 2  previous tier                      -> SCALE / FRAMING (tiers 2-5)

Output: assets/{slot}/tier_{n}.png   (background keyed out to transparency once
the chain for a slot is done; pass --skip-bg-removal to keep the raw white-bg
renders instead)

Usage:
    export OPENAI_API_KEY=sk-...
    python generate_swap_assets.py --palette          # sample anchor colors first
    python generate_swap_assets.py --slot chest
    python generate_swap_assets.py --slot all
"""

import argparse
import base64
import os
import time
from pathlib import Path

from openai import OpenAI
from PIL import Image

MODEL = "gpt-image-2"
SIZE = "1024x1024"        # square for gear; 1024 is ample for flat art -> vector
QUALITY = "high"
OUT_ROOT = Path("output/swap_assets_v2")
ANCHOR = Path("output/imagegen/hunter-character-anchor-final.png")

# Background keying — FRAMING renders every tier on a solid #FFFFFF backdrop
# with no shadow, so a whiteness threshold is enough; no ML matting needed.
BG_THRESHOLD = 245  # pixels this close to white (0-255 per channel) count as background
BG_FEATHER = 12      # soft transition band so anti-aliased edges don't leave a white fringe

# ---------------------------------------------------------------------------
# PALETTE
#
# Replace these with hex values sampled from YOUR anchor. Run --palette to get
# them. Hardcoded guesses are the single most common cause of gear that looks
# "close but wrong" next to the character.
# ---------------------------------------------------------------------------

PALETTE = "matte charcoal #2B2E33, dark slate #3F444C, cyan trim #4FD8E8, light gray #E8EAED"

# ---------------------------------------------------------------------------
# CONSTANT BLOCKS
# ---------------------------------------------------------------------------

STYLE = f"""Flat cel-shaded vector illustration. Exactly two shading tones per color.
Hard-edged shapes, no gradients, no texture, no glow effects, no rendered detail.
Limited flat palette drawn from: {PALETTE}.
Clean uniform outlines of consistent weight.
Do not use pure white anywhere within the object itself — use the light gray from
the palette for any highlight or light surface."""

FRAMING = """Orthographic front view, flat-on, zero perspective, perfectly symmetrical.
Object centered, floating, isolated on a pure white #FFFFFF background.
No cast shadow, no drop shadow, no ground plane, no vignette.
Object fills approximately 70% of the frame with even margins on all sides."""

# Hardened: passing a character reference makes the model want to draw the
# character or dress them. This block is what stops it.
NO_CHARACTER = """ABSOLUTE CONSTRAINT: Do NOT draw the character shown in the reference.
Do NOT draw a person, body, torso, chest, shoulders, arms, hands, legs, head, face,
or any anatomy whatsoever. Do NOT show the equipment being worn, held, or equipped.
Do NOT include a mannequin, armor stand, silhouette, or ghosted body outline.
The output must contain the equipment object and nothing else, floating in empty space."""

NEGATIVE = """Do not include: background elements, scenes, environments, or props.
No shadow of any kind. No gradients, no glow, no bloom, no lens effects.
No text, no labels, no watermark, no signature. No multiple objects, no variant
sheets, no turnarounds. No perspective, no three-quarter view, no isometric angle.
No pure white pixels inside the object."""

# ---------------------------------------------------------------------------
# TIER LADDERS
# ---------------------------------------------------------------------------

LADDERS = {
    "chest": [
        "a worn leather chest harness, plain straps, no plating, scuffed and simple, unranked hunter gear",
        "a reinforced leather vest with two small steel plates over the sternum, minimal trim stitching",
        "a segmented steel breastplate, layered overlapping plates, thin accent trim lines along the seams",
        "an ornate dark steel cuirass, angular armored ridges, accent-colored energy channels through the plating",
        "a monarch-tier obsidian breastplate, sharp asymmetric ridges, deep runic channels, imposing silhouette",
    ],
    "shoulder": [
        "a single simple leather shoulder strap pad, plain and unadorned, left side only",
        "a single small steel shoulder plate over leather backing, one rivet row, left side only",
        "a single segmented steel pauldron, two overlapping layers, thin accent trim, left side only",
        "a single ornate dark steel pauldron with an upswept angular ridge, accent energy channel, left side only",
        "a single monarch-tier obsidian pauldron with three sharp upswept spikes, deep runes, left side only",
    ],
    "bracer": [
        "a single plain leather forearm wrap, frayed edges, left arm only",
        "a single leather bracer with a thin steel band, left arm only",
        "a single segmented steel bracer, three plates, thin accent trim, left arm only",
        "a single ornate dark steel bracer with an angular knuckle guard, accent channel, left arm only",
        "a single monarch-tier obsidian bracer with a bladed edge ridge and deep runes, left arm only",
    ],
    "weapon": [
        "a plain short iron dagger, chipped blade, wrapped leather grip",
        "a simple steel shortsword, straight crossguard, leather-wrapped hilt",
        "a refined steel longsword, fullered blade, angular crossguard, thin accent inlay along the fuller",
        "an ornate dark steel greatsword, angular blade profile, accent energy channel down the center of the blade",
        "a monarch-tier obsidian greatsword, jagged asymmetric blade, deep runic glyphs etched along the edge",
    ],
}

# ---------------------------------------------------------------------------
# PROMPT BUILDERS
# ---------------------------------------------------------------------------

def prompt_tier_one(descriptor: str) -> str:
    """One reference: the character anchor."""
    return f"""IMAGE 1 (attached) is a character illustration from the game this asset
belongs to. It is your STYLE AUTHORITY. Study and replicate its rendering
conventions exactly: outline weight and consistency, number of shading tones,
exact color palette, level of detail, and shape language.

{NO_CHARACTER}

Generate a single piece of fantasy game equipment: {descriptor}
It must look like it was drawn by the same artist, for the same game, as IMAGE 1 —
indistinguishable in style, palette, and line weight. Same world, same tier of
visual polish. One object only.

{STYLE}

{FRAMING}

{NEGATIVE}"""


def prompt_chained(descriptor: str, tier: int) -> str:
    """
    Two references with distinct jobs. Labelling them explicitly matters — an
    unlabelled second image gets treated as another thing to copy, and the tier
    ladder collapses into near-duplicates.
    """
    return f"""You are given TWO reference images with DIFFERENT roles.

IMAGE 1 is the game's character illustration. It is the STYLE AUTHORITY.
Replicate exactly: outline weight, number of shading tones, color palette, level
of detail, and shape language. When IMAGE 1 and IMAGE 2 disagree on style,
IMAGE 1 always wins.

IMAGE 2 is the previous tier of this equipment set. It is the SCALE AND FRAMING
reference only. Match its object scale within the frame, its camera angle, and its
background treatment. Do NOT copy IMAGE 2's design, shapes, or silhouette — the
new object must be immediately, visibly different from it.

{NO_CHARACTER}

Generate a single piece of fantasy game equipment, tier {tier} of 5 in an ascending
power progression: {descriptor}
It must read as clearly more powerful and more elaborate than IMAGE 2 — legible as
an upgrade even at thumbnail size — while remaining stylistically identical to
IMAGE 1. One object only.

{STYLE}

{FRAMING}

{NEGATIVE}"""


# ---------------------------------------------------------------------------
# PALETTE SAMPLING
# ---------------------------------------------------------------------------

def sample_palette(path: Path, n: int = 8) -> None:
    """Print the dominant colors in the anchor so PALETTE can be set accurately."""
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit("pip install Pillow")

    img = Image.open(path).convert("RGB")
    img.thumbnail((400, 400))
    quant = img.quantize(colors=n, method=Image.MEDIANCUT).convert("RGB")
    counts = sorted(quant.getcolors(maxcolors=n * 4) or [], reverse=True)
    total = sum(c for c, _ in counts)

    print(f"\nDominant colors in {path.name}:\n")
    for count, (r, g, b) in counts:
        print(f"  #{r:02X}{g:02X}{b:02X}   {100 * count / total:5.1f}%")
    print("\nDrop the non-background entries into PALETTE, with descriptive names.\n")


# ---------------------------------------------------------------------------
# GENERATION
# ---------------------------------------------------------------------------

def save_b64(b64: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(b64))
    print(f"  saved -> {path}")


def extract_b64(result) -> str:
    item = result.data[0]
    if getattr(item, "b64_json", None):
        return item.b64_json
    raise RuntimeError("No b64_json in response; check model and output_format.")


def remove_background(
    path: Path, threshold: int = BG_THRESHOLD, feather: int = BG_FEATHER
) -> None:
    """
    Key the pure-white backdrop out of a generated asset, in place.

    Every tier is rendered on a solid #FFFFFF background with no shadow (see
    FRAMING/NEGATIVE above), so this is a plain whiteness threshold rather than
    real matting. `feather` ramps alpha over a small band below the threshold
    so anti-aliased edge pixels fade out instead of leaving a hard white
    fringe around the object.
    """
    img = Image.open(path).convert("RGBA")
    pixels = img.load()
    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            whiteness = min(r, g, b)  # low if any channel is dark -> part of the object
            if whiteness >= threshold:
                alpha = 0
            elif whiteness >= threshold - feather:
                alpha = round(a * (threshold - whiteness) / feather)
            else:
                alpha = a
            pixels[x, y] = (r, g, b, alpha)
    img.save(path)
    print(f"  bg removed -> {path}")


def remove_backgrounds(out_root: Path = OUT_ROOT) -> None:
    """Batch entry point: key out the background of every generated asset on disk."""
    paths = sorted(out_root.glob("*/tier_*.png"))
    if not paths:
        print(f"No assets found under {out_root}")
        return
    for path in paths:
        remove_background(path)


def pick_reference(tier: int, paths: dict[int, Path]) -> Path:
    """Tier 4 re-anchors to tier 1 so ladder drift doesn't compound."""
    return paths[1] if tier % 3 == 1 else paths[tier - 1]


def generate_slot(
    client: OpenAI, slot: str, ladder: list[str], remove_bg: bool = True
) -> None:
    print(f"\n=== {slot} ===")
    out_dir = OUT_ROOT / slot
    paths: dict[int, Path] = {}

    # Tier 1 — anchor only. Uses the edit endpoint, not generate, because the
    # character reference is what keeps the style locked.
    print(f"[tier 1] ref={ANCHOR.name}")
    with open(ANCHOR, "rb") as anchor_fh:
        result = client.images.edit(
            model=MODEL,
            image=[anchor_fh],
            prompt=prompt_tier_one(ladder[0]),
            size=SIZE,
            quality=QUALITY,
            n=1,
        )
    paths[1] = out_dir / "tier_1.png"
    save_b64(extract_b64(result), paths[1])

    # Tiers 2-5 — anchor first, previous tier second. Order matters; the prompt
    # refers to them as IMAGE 1 and IMAGE 2.
    for tier in range(2, len(ladder) + 1):
        ref = pick_reference(tier, paths)
        note = " (re-anchored)" if ref == paths[1] and tier != 2 else ""
        print(f"[tier {tier}] ref={ANCHOR.name} + {ref.name}{note}")

        with open(ANCHOR, "rb") as anchor_fh, open(ref, "rb") as prev_fh:
            result = client.images.edit(
                model=MODEL,
                image=[anchor_fh, prev_fh],
                prompt=prompt_chained(ladder[tier - 1], tier),
                size=SIZE,
                quality=QUALITY,
                n=1,
            )
        paths[tier] = out_dir / f"tier_{tier}.png"
        save_b64(extract_b64(result), paths[tier])
        time.sleep(1)

    # Background removal happens only after the whole chain is generated —
    # each chained edit above sends the *previous* tier back as a reference
    # image, and it needs to stay white-backed to match FRAMING/STYLE. Keying
    # out mid-chain would feed a transparent reference into the next edit.
    if remove_bg:
        print(f"[{slot}] removing backgrounds")
        for path in paths.values():
            remove_background(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slot", default="chest", choices=[*LADDERS.keys(), "all"])
    ap.add_argument("--palette", action="store_true", help="print anchor colors and exit")
    ap.add_argument("--anchor", type=Path, default=ANCHOR)
    ap.add_argument(
        "--skip-bg-removal",
        action="store_true",
        help="leave the pure-white backdrop in place instead of keying it out",
    )
    args = ap.parse_args()

    globals()["ANCHOR"] = args.anchor
    if not args.anchor.exists():
        raise SystemExit(f"Anchor not found: {args.anchor}")

    if args.palette:
        sample_palette(args.anchor)
        return

    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("Set OPENAI_API_KEY first.")

    client = OpenAI()
    slots = list(LADDERS) if args.slot == "all" else [args.slot]
    for slot in slots:
        generate_slot(client, slot, LADDERS[slot], remove_bg=not args.skip_bg_removal)

    print("\nDone. Next: vectorize, then align in Figma over the anchor.")


if __name__ == "__main__":
    main()