from dotenv import load_dotenv

# Load environment variables from .env file FIRST
load_dotenv()


"""
Kairo — chained swap asset generator (GPT Image 2)

Generates full-resolution gear tiers that share a consistent rendering style,
by chaining each tier off the previous one as a style reference.

Anti-drift: every 3rd tier re-references tier 1 instead of its immediate
predecessor, so line-weight and scale errors don't compound down the chain.

Output: assets/{slot}/tier_{n}.png   (background keyed out to transparency once
the chain for a slot is done; pass --skip-bg-removal to keep the raw white-bg
renders instead)

Usage:
    pip install -r requirements.txt
    export OPENAI_API_KEY=sk-...
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
OUT_ROOT = Path("output/swap_assets")

# Background keying — FRAMING renders every tier on a solid #FFFFFF backdrop
# with no shadow, so a whiteness threshold is enough; no ML matting needed.
BG_THRESHOLD = 245  # pixels this close to white (0-255 per channel) count as background
BG_FEATHER = 12      # soft transition band so anti-aliased edges don't leave a white fringe

# ---------------------------------------------------------------------------
# CONSTANT BLOCKS — copy STYLE verbatim from your character prompt.
# Changing STYLE mid-project is what breaks visual family resemblance.
# ---------------------------------------------------------------------------

STYLE = """Flat cel-shaded vector illustration. Exactly two shading tones per color.
Hard-edged shapes, no gradients, no texture, no glow effects, no rendered detail.
Limited flat palette: matte charcoal #2B2E33, dark slate #3F444C, cyan trim #4FD8E8,
light gray #E8EAED for highlights. Clean uniform outlines of consistent weight.
Do not use pure white anywhere within the object itself — use light gray #E8EAED
for any highlight or light surface."""

FRAMING = """Orthographic front view, flat-on, zero perspective, perfectly symmetrical.
Object centered, floating, isolated on a pure white #FFFFFF background.
No cast shadow, no drop shadow, no ground plane, no vignette.
Object fills approximately 70% of the frame with even margins on all sides."""

NEGATIVE = """Do not include: any character, person, body, torso, mannequin, or hands
wearing or holding the object. No background elements, no scene, no environment.
No shadow of any kind. No gradients, no glow, no bloom, no lens effects.
No text, no labels, no watermark, no signature. No multiple objects, no variations
in one frame. No perspective, no three-quarter view, no isometric angle.
No pure white pixels inside the object."""

# ---------------------------------------------------------------------------
# TIER LADDERS — the only thing that varies per generation.
# Keep the escalation legible: tier 5 must beat tier 3 at a glance, thumbnail-size.
# ---------------------------------------------------------------------------

LADDERS = {
    "chest": [
        "a worn leather chest harness, plain straps, no plating, scuffed and simple, unranked hunter gear",
        "a reinforced leather vest with two small steel plates over the sternum, minimal cyan stitching",
        "a segmented steel breastplate, layered overlapping plates, thin cyan trim lines along the seams",
        "an ornate dark steel cuirass, angular armored ridges, cyan energy channels running through the plating",
        "a monarch-tier obsidian breastplate, sharp asymmetric ridges, deep cyan runic channels, imposing silhouette",
    ],
    "shoulder": [
        "a single simple leather shoulder strap pad, plain and unadorned, left side only",
        "a single small steel shoulder plate over leather backing, one rivet row, left side only",
        "a single segmented steel pauldron, two overlapping layers, thin cyan trim, left side only",
        "a single ornate dark steel pauldron with an upswept angular ridge, cyan energy channel, left side only",
        "a single monarch-tier obsidian pauldron with three sharp upswept spikes, deep cyan runes, left side only",
    ],
    "bracer": [
        "a single plain leather forearm wrap, frayed edges, left arm only",
        "a single leather bracer with a thin steel band, left arm only",
        "a single segmented steel bracer, three plates, thin cyan trim, left arm only",
        "a single ornate dark steel bracer with an angular knuckle guard, cyan channel, left arm only",
        "a single monarch-tier obsidian bracer with a bladed edge ridge and deep cyan runes, left arm only",
    ],
    "weapon": [
        "a plain short iron dagger, chipped blade, wrapped leather grip",
        "a simple steel shortsword, straight crossguard, leather-wrapped hilt",
        "a refined steel longsword, fullered blade, angular crossguard, thin cyan inlay along the fuller",
        "an ornate dark steel greatsword, angular blade profile, cyan energy channel down the center of the blade",
        "a monarch-tier obsidian greatsword, jagged asymmetric blade, deep cyan runic glyphs etched along the edge",
    ],
}

# ---------------------------------------------------------------------------
# PROMPT BUILDERS
# ---------------------------------------------------------------------------

def prompt_tier_one(descriptor: str) -> str:
    """Text-to-image. Establishes the visual family for every later tier."""
    return f"""A single piece of fantasy game equipment: {descriptor}
Game asset icon. One object only.

{STYLE}

{FRAMING}

{NEGATIVE}"""


def prompt_chained(descriptor: str, tier: int) -> str:
    """
    Edit call with a reference image.

    The critical instruction is the first paragraph: the reference is a STYLE
    guide, not an object to modify. Without it the model returns a near-copy of
    the reference with cosmetic tweaks, and your tier ladder collapses.
    """
    return f"""The attached image is a STYLE REFERENCE ONLY. Do not edit it, do not
copy its design, and do not reuse its shapes. Generate a completely NEW and
visually distinct object that happens to be rendered in the same style.

Match the reference EXACTLY on: outline weight, shading tone count, color palette,
object scale within the frame, framing, camera angle, and background treatment.
Change EVERYTHING about the design itself — this is a different, more advanced
piece of equipment in the same set.

The new object is a single piece of fantasy game equipment, tier {tier} of 5 in an
ascending power progression: {descriptor}
It must read as clearly more powerful and more elaborate than the reference.
One object only.

{STYLE}

{FRAMING}

{NEGATIVE}"""


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
    """
    Anti-drift rule: tiers 2 and 3 chain off their predecessor, but tier 4
    re-anchors to tier 1 so accumulated error is flushed. Tier 5 then chains
    off tier 4, which is itself anchored.
    """
    return paths[1] if tier % 3 == 1 else paths[tier - 1]


def generate_slot(
    client: OpenAI, slot: str, ladder: list[str], remove_bg: bool = True
) -> None:
    print(f"\n=== {slot} ===")
    out_dir = OUT_ROOT / slot
    paths: dict[int, Path] = {}

    # Tier 1 — text-to-image, no reference.
    print("[tier 1] text-to-image")
    result = client.images.generate(
        model=MODEL,
        prompt=prompt_tier_one(ladder[0]),
        size=SIZE,
        quality=QUALITY,
        output_format="png",
        n=1,
    )
    paths[1] = out_dir / "tier_1.png"
    save_b64(extract_b64(result), paths[1])

    # Tiers 2-5 — chained edits.
    for tier in range(2, len(ladder) + 1):
        ref = pick_reference(tier, paths)
        anchored = " (re-anchored to tier 1)" if ref == paths[1] and tier != 2 else ""
        print(f"[tier {tier}] ref={ref.name}{anchored}")

        with open(ref, "rb") as fh:
            result = client.images.edit(
                model=MODEL,
                image=[fh],
                prompt=prompt_chained(ladder[tier - 1], tier),
                size=SIZE,
                quality=QUALITY,
                n=1,
            )
        paths[tier] = out_dir / f"tier_{tier}.png"
        save_b64(extract_b64(result), paths[tier])
        time.sleep(1)  # be polite to the rate limiter

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
    ap.add_argument(
        "--slot",
        default="chest",
        choices=[*LADDERS.keys(), "all"],
        help="which equipment slot to generate",
    )
    ap.add_argument(
        "--skip-bg-removal",
        action="store_true",
        help="leave the pure-white backdrop in place instead of keying it out",
    )
    args = ap.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("Set OPENAI_API_KEY first.")

    client = OpenAI()
    slots = list(LADDERS) if args.slot == "all" else [args.slot]
    for slot in slots:
        generate_slot(client, slot, LADDERS[slot], remove_bg=not args.skip_bg_removal)

    print("\nDone. Next: vectorize, then align in Figma over anchor.png.")


if __name__ == "__main__":
    main()