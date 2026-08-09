#!/usr/bin/env python3
"""
Kairo — SVG path audit & prune

Answers one question: are your high path counts hundreds of sub-pixel specks,
or genuinely a hundred real shapes?

  Speckle-dominated  -> prune fixes it, keep your generated PNGs
  Evenly distributed -> real detail, regenerate or switch to a vector generator

Usage:
    python audit_svg.py assets/                      # audit only
    python audit_svg.py assets/ --recursive
    python audit_svg.py assets/chest/tier_5.svg --prune 0.02
"""

import argparse
import re
from pathlib import Path

PATH_RE = re.compile(r'<path\b[^>]*?\bd="([^"]+)"[^>]*/?>', re.S)
FULL_RE = re.compile(r"<path\b[^>]*?/>", re.S)
NUM_RE = re.compile(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?")


def path_bbox_area(d: str, canvas: float) -> float:
    """
    Approximate area as bounding-box fraction of canvas.

    vtracer emits absolute M/C commands where every number is a coordinate, so
    pairing the floats gives a usable bbox. Rough, but the speckle-vs-shape
    distinction is orders of magnitude, not percentages.
    """
    nums = [float(n) for n in NUM_RE.findall(d)]
    if len(nums) < 4:
        return 0.0
    xs, ys = nums[0::2], nums[1::2]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    return 100.0 * (w * h) / (canvas * canvas)


def audit(svg_path: Path, canvas: float, prune: float | None) -> None:
    text = svg_path.read_text()
    paths = FULL_RE.findall(text)
    areas = []
    for p in paths:
        m = re.search(r'\bd="([^"]+)"', p, re.S)
        areas.append(path_bbox_area(m.group(1), canvas) if m else 0.0)

    if not areas:
        print(f"{svg_path}: no paths found")
        return

    buckets = {
        "speck   (<0.01%)": sum(a < 0.01 for a in areas),
        "tiny    (<0.10%)": sum(0.01 <= a < 0.10 for a in areas),
        "small   (<1.00%)": sum(0.10 <= a < 1.00 for a in areas),
        "real    (>1.00%)": sum(a >= 1.00 for a in areas),
    }
    junk = buckets["speck   (<0.01%)"] + buckets["tiny    (<0.10%)"]
    junk_pct = 100 * junk / len(areas)

    print(f"\n{svg_path}  —  {len(areas)} paths")
    for label, n in buckets.items():
        bar = "#" * int(40 * n / len(areas))
        print(f"  {label}  {n:4d}  {bar}")

    if junk_pct >= 70:
        verdict = "SPECKLE-DOMINATED -> prune; do not regenerate"
    elif junk_pct >= 40:
        verdict = "MIXED -> prune first, then reassess"
    else:
        verdict = "GENUINE DETAIL -> prompt or tool change needed"
    print(f"  {junk_pct:.0f}% junk  ->  {verdict}")

    if prune is None:
        return

    kept = [p for p, a in zip(paths, areas) if a >= prune]
    out = svg_path.with_name(f"{svg_path.stem}_pruned.svg")
    body = text
    for p, a in zip(paths, areas):
        if a < prune:
            body = body.replace(p, "", 1)
    out.write_text(body)
    print(f"  pruned at {prune}%  ->  {len(kept)} paths  ->  {out.name}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", type=Path)
    ap.add_argument("--canvas", type=float, default=1024.0)
    ap.add_argument("--prune", type=float, default=None,
                    help="drop paths below this %% of canvas area, e.g. 0.02")
    ap.add_argument("--recursive", action="store_true")
    args = ap.parse_args()

    if args.target.is_file():
        files = [args.target]
    else:
        pattern = "**/*.svg" if args.recursive else "*.svg"
        files = sorted(f for f in args.target.glob(pattern)
                       if not f.stem.endswith("_pruned"))

    for f in files:
        audit(f, args.canvas, args.prune)


if __name__ == "__main__":
    main()