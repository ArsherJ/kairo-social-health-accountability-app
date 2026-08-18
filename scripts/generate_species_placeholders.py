#!/usr/bin/env python3
"""
Generates the placeholder art `src/features/character/species-art.ts` maps.

Eight flat PNGs: one silhouette per species (512x1024, transparent) and one
habitat backdrop per species (1024x1024, transparent above a flat two-band
ground). Every hue is read out of `species.ts` — the source of truth Task 1
established — by a small regex parse, rather than retyped here, so a hue
change there regenerates correctly by rerunning this script instead of
requiring someone to remember a second copy.

These are placeholders (animal character system, Task 4). Real art replaces
every file here one-for-one with no code change; the two properties that
matter are load-bearing for that replacement too, and this script preserves
both:

- Transparent background — `Diorama` and `Panel` draw the ground, not the art.
- No ground shadow baked into the figure — `GroundShadow` draws it, keyed to
  level stage, so one asset reads correctly at all four stages.

Run: python3 scripts/generate_species_placeholders.py
Requires: Pillow (tested against 12.1.1).
"""

import colorsys
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPECIES_TS = ROOT / "src/features/character/species.ts"
OUT_DIR = ROOT / "assets/character/species"

FIGURE_SIZE = (512, 1024)
HABITAT_SIZE = (1024, 1024)

RGB = tuple[int, int, int]


def load_hues() -> dict[str, str]:
    """Parse each species' `id` / `hue` pair out of `species.ts`'s `SPECIES` object.

    A regex, not a TS parser — the file is small and stable, and its own
    order is already pinned by `species.test.ts`, so a light parse here does
    not need to survive arbitrary edits, only this file's actual shape.
    """
    text = SPECIES_TS.read_text()
    entries: dict[str, str] = {}
    for match in re.finditer(r"id:\s*'([a-z]+)'.*?hue:\s*'(#[0-9a-fA-F]{6})'", text, re.S):
        entries[match.group(1)] = match.group(2)
    if len(entries) != 4:
        raise SystemExit(f"expected 4 species in {SPECIES_TS}, found {len(entries)}: {entries}")
    return entries


def hex_to_rgb(hue: str) -> RGB:
    h = hue.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def desaturate(rgb: RGB, amount: float) -> RGB:
    """Blend toward grey by `amount` (0 = untouched, 1 = grey)."""
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    r2, g2, b2 = colorsys.hls_to_rgb(h, l, s * (1 - amount))
    return (round(r2 * 255), round(g2 * 255), round(b2 * 255))


def lighten(rgb: RGB, amount: float) -> RGB:
    return tuple(round(c + (255 - c) * amount) for c in rgb)  # type: ignore[return-value]


def draw_figure(hue_hex: str, out_path: Path) -> None:
    """A generic standing silhouette — head, torso, legs — in one flat hue.

    Not species-specific; these are placeholders that exist to prove the
    swap path (species chooses art), not to depict the animal. Real art
    replaces this file-for-file with no code change.
    """
    w, h = FIGURE_SIZE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fill = hex_to_rgb(hue_hex) + (255,)

    cx = w // 2

    head_r = w * 0.16
    head_cy = h * 0.16
    draw.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=fill)

    torso_w = w * 0.42
    torso_top = h * 0.28
    torso_bottom = h * 0.66
    draw.rounded_rectangle(
        [cx - torso_w / 2, torso_top, cx + torso_w / 2, torso_bottom],
        radius=w * 0.14,
        fill=fill,
    )

    leg_w = w * 0.11
    leg_gap = w * 0.06
    leg_top = torso_bottom - h * 0.03
    leg_bottom = h * 0.92
    draw.rounded_rectangle(
        [cx - leg_gap / 2 - leg_w, leg_top, cx - leg_gap / 2, leg_bottom],
        radius=leg_w * 0.4,
        fill=fill,
    )
    draw.rounded_rectangle(
        [cx + leg_gap / 2, leg_top, cx + leg_gap / 2 + leg_w, leg_bottom],
        radius=leg_w * 0.4,
        fill=fill,
    )

    img.save(out_path)


def draw_habitat(hue_hex: str, out_path: Path) -> None:
    """A flat two-band ground in a desaturated version of the species hue.

    The top of the canvas stays fully transparent on purpose: `Diorama`
    renders this behind its own sage sky gradient (see that file's doc
    comment), so this composition only needs to cover the ground the
    gradient does not already carry — a hard-edged rectangle over the whole
    canvas would fight the sky rather than sit on it.
    """
    w, h = HABITAT_SIZE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    rgb = hex_to_rgb(hue_hex)

    far = desaturate(lighten(rgb, 0.3), 0.35) + (235,)
    near = desaturate(rgb, 0.25) + (255,)

    horizon = h * 0.46
    midline = h * 0.72

    draw.rectangle([0, horizon, w, midline], fill=far)
    draw.rectangle([0, midline, w, h], fill=near)

    img.save(out_path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for species_id, hue in load_hues().items():
        draw_figure(hue, OUT_DIR / f"{species_id}.png")
        draw_habitat(hue, OUT_DIR / f"habitat-{species_id}.png")
        print(f"{species_id}: {hue}")


if __name__ == "__main__":
    main()
