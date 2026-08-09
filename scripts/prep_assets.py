#!/usr/bin/env python3
"""
Kairo — swap asset prep (key -> quantize -> vectorize)

Correct order matters:
  1. Key out the white background FIRST
  2. Quantize ONLY the opaque pixels
  3. Vectorize

Quantizing before keying wastes most of the palette on background whites,
which both flattens the artwork and explodes the vtracer path count.

Usage:
    pip install Pillow numpy vtracer
    python prep_asset.py assets/bracer/tier_1.png
    python prep_asset.py assets/bracer/            # whole directory
    python prep_asset.py assets/ --colors 8 --recursive
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SENTINEL = (255, 0, 255)   # magenta; must not occur in your palette


def key_background(im: Image.Image, thresh: int = 25) -> np.ndarray:
    """
    Flood-fill from the four corners and return a boolean background mask.

    Flood fill rather than a global threshold: light pixels INSIDE the artwork
    (highlights, steel rivets) are not connected to the border, so they survive.
    A global threshold would punch holes in them.
    """
    work = im.copy()
    w, h = work.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(work, corner, SENTINEL, thresh=thresh)
    return np.all(np.array(work) == SENTINEL, axis=-1)


def quantize_artwork(rgb: np.ndarray, bg: np.ndarray, colors: int) -> np.ndarray:
    """
    Quantize the opaque pixels only, so every palette slot goes to real artwork.

    Trick: reshape the opaque pixels into an Nx1 strip image and quantize that.
    The background never enters the color-space split, so median cut can't
    subdivide it.
    """
    opaque = rgb[~bg]
    if opaque.size == 0:
        raise ValueError("Everything was keyed out — lower --thresh.")

    strip = Image.fromarray(opaque.reshape(-1, 1, 3), "RGB")
    q = strip.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE)

    palette = np.array(q.getpalette()[: colors * 3], dtype=np.uint8).reshape(-1, 3)
    out = rgb.copy()
    out[~bg] = palette[np.array(q).reshape(-1)]
    return out


def denoise(art: np.ndarray, size: int) -> np.ndarray:
    """
    Replace each pixel with the most common color in its neighborhood.

    ModeFilter, not median or blur: on already-quantized flat art it can only
    return colors that exist in the palette, so it consolidates stray pixels
    into surrounding regions without inventing new tones. This is what stops
    vtracer emitting a path per speck.
    """
    if size < 3:
        return art
    return np.array(Image.fromarray(art, "RGB").filter(ImageFilter.ModeFilter(size=size)))


def prep(path: Path, colors: int, thresh: int, vectorize: bool, mode_size: int) -> None:
    im = Image.open(path).convert("RGB")
    rgb = np.array(im)

    bg = key_background(im, thresh)
    art = quantize_artwork(rgb, bg, colors)
    art = denoise(art, mode_size)

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    rgba = np.dstack([art, alpha])

    flat_path = path.with_name(f"{path.stem}_flat.png")
    Image.fromarray(rgba, "RGBA").save(flat_path)

    used = len({tuple(c) for c in art[~bg]})
    coverage = 100 * (~bg).sum() / bg.size
    print(f"{path.name}: {used} artwork colors, {coverage:.1f}% opaque -> {flat_path.name}")

    if not vectorize:
        return

    import vtracer

    svg_path = path.with_suffix(".svg")
    vtracer.convert_image_to_svg_py(
        str(flat_path),
        str(svg_path),
        colormode="color",
        hierarchical="stacked",
        mode="spline",
        filter_speckle=16,
        color_precision=5,
        corner_threshold=60,
        length_threshold=8.0,
    )

    n_paths = svg_path.read_text().count("<path")
    flag = "  <-- OVER BUDGET" if n_paths > 80 else ""
    print(f"  -> {svg_path.name}: {n_paths} paths{flag}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", type=Path, help="PNG file or directory")
    ap.add_argument("--colors", type=int, default=6,
                    help="palette size for the ARTWORK only (default 6)")
    ap.add_argument("--thresh", type=int, default=25,
                    help="flood-fill tolerance; raise if white halos survive")
    ap.add_argument("--denoise", type=int, default=5,
                    help="ModeFilter kernel; 0 disables, 5 default, 7-9 for heavy speckle")
    ap.add_argument("--recursive", action="store_true")
    ap.add_argument("--no-vectorize", action="store_true")
    args = ap.parse_args()

    if args.target.is_file():
        files = [args.target]
    else:
        pattern = "**/*.png" if args.recursive else "*.png"
        files = sorted(f for f in args.target.glob(pattern)
                       if not f.stem.endswith("_flat"))

    if not files:
        raise SystemExit(f"No PNGs found at {args.target}")

    for f in files:
        prep(f, args.colors, args.thresh, not args.no_vectorize, args.denoise)


if __name__ == "__main__":
    main()