#!/usr/bin/env python3
"""
Kairo — posterize + vectorize swap assets (vtracer pipeline)

Second stage after generate_swap_assets_v2.py. That generator's raw PNGs are
AI-rendered with soft gradient shading; feeding them straight into vtracer
produces hundreds of stray speckle paths from every gradient ramp. This
script:

  1. Posterizes each tier_N.png (median-filter despeckle, then hard color
     quantization with no dithering) into tier_N_flat.png, collapsing both
     gradient ramps and fine per-pixel render grain into flat color bands.
  2. Traces the flat PNG with vtracer, tuned for flat vector art rather than
     vtracer's photo-oriented defaults, producing tier_N.svg.
  3. Counts <path> elements in each SVG and reports it against this spec's
     per-piece budgets, flagging over-detailed pieces for regeneration
     rather than further tracer tuning.

Requires the `vtracer` package: pip install vtracer (see
scripts/requirements.txt). That PyPI wheel is Python bindings around the
Rust vtracer library, not the standalone Rust CLI — there is no `vtracer`
binary to put on PATH, and no Rust/cargo toolchain is needed. This script
calls vtracer.convert_image_to_svg_py() directly.

The binding's keyword args don't all share names with the CLI flags they
correspond to: `gradient_step` (CLI) is `layer_difference` here, and
`segment_length` (CLI) is `length_threshold` here. This script's own flags
keep the CLI-style names since that's the vocabulary the tracer-tuning spec
is written in; TUNE_PARAM_MAP below does the translation.

Usage:
    source .venv-swap-assets/bin/activate
    python scripts/vectorize_swap_assets.py                        # everything
    python scripts/vectorize_swap_assets.py --slots chest --tiers 3
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import vtracer
from PIL import Image, ImageFilter

OUT_ROOT = Path("output/swap_assets_v2")

# Per-slot path-count budgets from spec. (None, None) means no opinion — the
# report still prints the count, just without a pass/fail range.
TARGETS: dict[str, tuple[int | None, int | None]] = {
    "chest": (20, 50),
    "bracer": (10, 25),
    "weapon": (15, 40),
    "shoulder": (None, None),
}

# Any single piece above this is over-detailed for vtracer to fix by tuning
# flags alone, regardless of slot — the source PNG needs to be regenerated.
HARD_CEILING = 80

PATH_RE = re.compile(rb"<path[\s>]", re.IGNORECASE)


# ---------------------------------------------------------------------------
# POSTERIZE
# ---------------------------------------------------------------------------

def posterize(src: Path, dst: Path, colors: int, despeckle_size: int) -> None:
    """
    Hard color quantization, alpha preserved.

    The obvious `Image.open(src).convert("RGB")` drops alpha entirely, which
    would composite this pipeline's transparent-keyed backgrounds (see
    remove_background() in generate_swap_assets_v2.py) onto black — handing
    vtracer a big black background shape to trace, the opposite of the
    point. Quantize only the RGB channels and re-merge the original alpha.

    Despeckle runs *before* quantizing. GPT Image 2's "flat cel-shaded"
    renders still carry fine per-pixel grain — not a gradient ramp, so
    quantizing alone doesn't collapse it. MEDIANCUT buckets that grain into
    its own outlier color cluster, scattered as dozens of single-pixel-scale
    specks rather than one contiguous region, which is exactly the kind of
    noise `filter_speckle` is too coarse to fully clean up downstream. A
    median filter smooths those outliers into their surrounding color first.
    """
    img = Image.open(src)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    r, g, b, a = img.split()
    rgb = Image.merge("RGB", (r, g, b))
    if despeckle_size > 1:
        rgb = rgb.filter(ImageFilter.MedianFilter(size=despeckle_size))
    quant = rgb.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    flat = Image.merge("RGBA", (*quant.convert("RGB").split(), a))
    flat.save(dst)


# ---------------------------------------------------------------------------
# TRACE
# ---------------------------------------------------------------------------

# CLI-vocabulary flag name -> vtracer.convert_image_to_svg_py() keyword arg.
TUNE_PARAM_MAP = {
    "filter_speckle": "filter_speckle",
    "color_precision": "color_precision",
    "gradient_step": "layer_difference",
    "corner_threshold": "corner_threshold",
    "segment_length": "length_threshold",
}


def trace(src: Path, dst: Path, tune: dict[str, int | float]) -> None:
    vtracer.convert_image_to_svg_py(
        str(src),
        str(dst),
        colormode="color",
        hierarchical="stacked",
        mode="spline",
        **{TUNE_PARAM_MAP[name]: value for name, value in tune.items()},
    )


def count_paths(svg: Path) -> int:
    return len(PATH_RE.findall(svg.read_bytes()))


# ---------------------------------------------------------------------------
# REPORT
# ---------------------------------------------------------------------------

def status_for(slot: str, paths: int) -> str:
    if paths > HARD_CEILING:
        return "REGENERATE"
    lo, hi = TARGETS[slot]
    if lo is None:
        return "-"
    if paths < lo:
        return "under target"
    if paths > hi:
        return "over target"
    return "ok"


def print_report(rows: list[tuple[str, int, int | None, str]]) -> None:
    print(f"\n{'slot':<10} {'tier':<6} {'paths':<7} status")
    print("-" * 40)
    flagged = []
    for slot, tier, paths, status in rows:
        marker = " ⚠" if status in ("REGENERATE", "over target", "under target", "ERROR") else ""
        shown = "-" if paths is None else paths
        print(f"{slot:<10} {tier:<6} {shown!s:<7} {status}{marker}")
        if status == "REGENERATE":
            flagged.append((slot, tier, paths))
    if flagged:
        print(
            f"\n{len(flagged)} piece(s) exceed the {HARD_CEILING}-path ceiling — "
            "regenerate the source PNG rather than re-tuning vtracer:"
        )
        for slot, tier, paths in flagged:
            print(f"  {slot}/tier_{tier}.png  ({paths} paths)")
    print()


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def parse_tiers(spec: str) -> list[int]:
    if "-" in spec:
        lo, hi = spec.split("-", 1)
        return list(range(int(lo), int(hi) + 1))
    return [int(t) for t in spec.split(",")]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", type=Path, default=OUT_ROOT)
    ap.add_argument("--slots", default=",".join(TARGETS), help="comma-separated slot names")
    ap.add_argument("--tiers", default="1-5", help="e.g. 1-5 or 2,4")
    ap.add_argument("--colors", type=int, default=8, help="posterize color count")
    ap.add_argument(
        "--despeckle-size",
        type=int,
        default=3,
        help="median-filter kernel size run before quantizing, odd number; 0 or 1 disables it",
    )
    ap.add_argument("--filter-speckle", type=int, default=8)
    ap.add_argument("--color-precision", type=int, default=5)
    ap.add_argument("--gradient-step", type=int, default=32, help="-> layer_difference")
    ap.add_argument("--corner-threshold", type=int, default=60)
    ap.add_argument("--segment-length", type=float, default=8, help="-> length_threshold, valid range [3.5, 10]")
    args = ap.parse_args()

    if args.despeckle_size > 1 and args.despeckle_size % 2 == 0:
        raise SystemExit("--despeckle-size must be odd (0 or 1 disables it, or 3/5/7...)")

    slots = [s.strip() for s in args.slots.split(",") if s.strip()]
    for slot in slots:
        if slot not in TARGETS:
            raise SystemExit(f"Unknown slot '{slot}'. Known slots: {', '.join(TARGETS)}")
    tiers = parse_tiers(args.tiers)

    tune = {
        "filter_speckle": args.filter_speckle,
        "color_precision": args.color_precision,
        "gradient_step": args.gradient_step,
        "corner_threshold": args.corner_threshold,
        "segment_length": args.segment_length,
    }

    rows: list[tuple[str, int, int | None, str]] = []
    for slot in slots:
        for tier in tiers:
            src = args.root / slot / f"tier_{tier}.png"
            if not src.exists():
                print(f"skip (missing): {src}")
                continue
            flat = src.with_name(f"tier_{tier}_flat.png")
            svg = src.with_suffix(".svg")

            try:
                posterize(src, flat, args.colors, args.despeckle_size)
                trace(flat, svg, tune)
                paths = count_paths(svg)
                status = status_for(slot, paths)
            except Exception as exc:  # noqa: BLE001 — keep going, report per-file
                paths, status = None, "ERROR"
                print(f"[{slot}/tier_{tier}] ERROR: {exc}")
            else:
                print(f"[{slot}/tier_{tier}] {paths} paths ({status})")
            rows.append((slot, tier, paths, status))

    print_report(rows)


if __name__ == "__main__":
    main()
