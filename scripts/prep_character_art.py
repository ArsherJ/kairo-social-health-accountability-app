#!/usr/bin/env python3
"""
Kairo — character art prep (key -> trim -> canvas)

Turns a generated character render into an asset that satisfies
`assets/character/README.md`: transparent background, figure centred, feet on the
bottom edge, no aura baked in.

Deliberately *not* `prep_assets.py`. That script keys, quantizes to ~6 colours
and vectorizes, because gear swaps ship as SVG and a path budget is the whole
point. The character ships as a raster placeholder, so quantizing it would only
throw away shading the app is happy to render.

What it does:

  1. Flood-fill the white background from the four corners. Flood fill rather
     than a threshold, for the same reason `prep_assets.py` uses it: the eye
     whites and suit highlights are light but not connected to the border, so
     a global threshold would punch holes through the face.
  2. Recolour the keyed pixels near-black *before* softening the alpha edge.
     A blurred alpha over white background pixels leaves a bright fringe, which
     on `colors.bg` reads as a halo — exactly what the README forbids.
  3. Trim to the figure, then re-pad to the requested aspect with the figure
     centred horizontally and its feet on the bottom edge, so swapping art in
     never shifts the layout under the TODAY card.

Usage:
    pip install Pillow numpy
    python scripts/prep_character_art.py output/imagegen/character-anchor-female.png \
        --out assets/character/anchor-female.png
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SENTINEL = (255, 0, 255)  # magenta; must not occur in the artwork
# The outline colour of the character art. Keyed pixels take this value so the
# antialiased edge fades to ink rather than to white.
EDGE_INK = (17, 17, 22)


def key_background(im: Image.Image, thresh: int) -> np.ndarray:
    """Flood-fill from the four corners; return a boolean background mask."""
    work = im.copy()
    w, h = work.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(work, corner, SENTINEL, thresh=thresh)
    return np.all(np.array(work) == SENTINEL, axis=-1)


def lift_shadows(rgb: np.ndarray, amount: int, knee: int = 56) -> np.ndarray:
    """
    Raise the black floor so the figure separates from `colors.bg` (#08080C).

    A generated render puts the suit and the outline at or near pure black,
    which on Kairo's background is an invisible edge — the silhouette loses its
    shape and only the face and the teal piping survive. The README rules out
    fixing that with a baked-in rim light, so the floor moves instead.

    Shadows only, on a ramp: a flat global lift would wash the teal out, and a
    hard cutoff would band across the suit's soft panels. Above `knee` the
    artwork is untouched.
    """
    if amount <= 0:
        return rgb
    lum = rgb.max(axis=-1, keepdims=True).astype(np.float32)
    ramp = np.clip(1 - lum / knee, 0, 1)
    return np.clip(rgb + amount * ramp, 0, 255).astype(np.uint8)


def soften(alpha: np.ndarray, feather: float) -> np.ndarray:
    """
    Antialias the hard flood-fill edge.

    MaxFilter first: the fill eats one pixel into the outline, and blurring
    without growing the mask back thins the ink line at every silhouette edge.
    """
    a = Image.fromarray(alpha).filter(ImageFilter.MaxFilter(3))
    if feather > 0:
        a = a.filter(ImageFilter.GaussianBlur(feather))
    return np.array(a)


def fit_canvas(im: Image.Image, aspect: float, height: int, pad: float) -> Image.Image:
    """
    Trim to the figure, then centre it on a canvas of the requested aspect with
    the feet on the bottom edge.

    `pad` is headroom above the figure as a fraction of its height — a hair of
    it keeps the hair tips off the top edge, where `resizeMode="contain"` would
    otherwise crop them against the aura.
    """
    figure = im.crop(im.getbbox())

    body = round(height * (1 - pad))
    scale = body / figure.height
    figure = figure.resize((max(1, round(figure.width * scale)), body), Image.LANCZOS)

    width = round(height * aspect)
    if figure.width > width:  # a wide figure sets the width instead
        width = figure.width

    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.paste(figure, ((width - figure.width) // 2, height - figure.height), figure)
    return canvas


def prep(src: Path, out: Path, thresh: int, feather: float, aspect: float,
         height: int, pad: float, lift: int) -> None:
    im = Image.open(src).convert("RGB")
    rgb = np.array(im)

    bg = key_background(im, thresh)
    if bg.all():
        raise SystemExit("Everything was keyed out — lower --thresh.")

    # Lift before keying the background out, so the edge ink and the outline it
    # feathers into end up at the same value.
    rgb = lift_shadows(rgb, lift)
    rgb[bg] = lift_shadows(np.array([[EDGE_INK]], dtype=np.uint8), lift)[0, 0]
    alpha = soften(np.where(bg, 0, 255).astype(np.uint8), feather)

    art = fit_canvas(Image.fromarray(np.dstack([rgb, alpha])), aspect, height, pad)
    out.parent.mkdir(parents=True, exist_ok=True)
    art.save(out)

    print(f"{src.name} -> {out}: {art.width}x{art.height} "
          f"({100 * (~bg).sum() / bg.size:.1f}% of the source was artwork)")
    print(f"  render at {art.width / 3:.0f}x{art.height / 3:.0f} @3x")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path, help="source PNG render")
    ap.add_argument("--out", type=Path, required=True, help="destination PNG")
    ap.add_argument("--thresh", type=int, default=30,
                    help="flood-fill tolerance; raise if white halos survive")
    ap.add_argument("--feather", type=float, default=0.8,
                    help="edge antialias radius in px; 0 keeps the hard mask")
    ap.add_argument("--aspect", type=float, default=0.62,
                    help="canvas width / height")
    ap.add_argument("--height", type=int, default=636,
                    help="canvas height in px (@3x of the rendered height)")
    ap.add_argument("--pad", type=float, default=0.04,
                    help="headroom above the figure, as a fraction of height")
    ap.add_argument("--lift", type=int, default=26,
                    help="black floor, 0-255; 0 keeps pure black and the "
                         "silhouette merges into colors.bg")
    args = ap.parse_args()

    prep(args.src, args.out, args.thresh, args.feather, args.aspect,
         args.height, args.pad, args.lift)


if __name__ == "__main__":
    main()
