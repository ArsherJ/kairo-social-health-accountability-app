#!/usr/bin/env python3
"""Generate identity-preserving character variants with GPT Image."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


VARIANTS = {
    "str_max.png": (
        "Same character, same outfit, same pose, same style. Significantly more "
        "developed musculature — broader shoulders, thicker arms and chest, wider "
        "lat spread. Identity and clothing unchanged."
    ),
    "agi_min.png": (
        "Same character, same outfit, same style. Slouched exhausted posture, "
        "shoulders rolled forward, head slightly down, knees soft."
    ),
    "agi_max.png": (
        "Same character, same outfit, same style. Upright confident posture, chest "
        "open, shoulders back, chin level, weight forward."
    ),
    "vit_min.png": (
        "Same character, same outfit, same pose. Face only differs: tired expression, "
        "heavy eyelids, dull eyes, downturned mouth."
    ),
    "vit_max.png": (
        "Same character, same outfit, same pose. Face only differs: alert sharp "
        "expression, wide bright eyes, focused brow."
    ),
    "character-anchor-female.png": (
        "Same art style, same outfit, same line weight, same color palette, same "
        "front-facing full-body framing, same white backdrop. The character is "
        "female: longer black hair, softer jawline, suit tailored to a female "
        "figure.\n\n"
        "CRITICAL - the body proportions must be IDENTICAL to the input image. "
        "The head must be the same size and the same fraction of total height as "
        "the input: a very large chibi head, about 2.5 heads tall for the whole "
        "figure. Keep the same wide round face shape, the same short arms and "
        "legs, and the same overall height. Do NOT slim the body, do NOT lengthen "
        "the legs, do NOT narrow the face, do NOT make the character taller or "
        "more realistically proportioned. Only the hair, the jawline softness and "
        "the torso shaping may change."
    ),
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Edit a character anchor into five GPT Image stat variants."
    )
    parser.add_argument(
        "--anchor",
        type=Path,
        default=Path("output/imagegen/hunter-character-anchor-final.png"),
    )
    parser.add_argument("--out-dir", type=Path, default=Path("output/imagegen"))
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    parser.add_argument("--quality", choices=("low", "medium", "high", "auto"), default="high")
    parser.add_argument("--size", default="1024x1536")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--variants",
        help="Comma-separated filenames from VARIANTS to generate. Default: all.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.anchor.is_file():
        raise SystemExit(f"Anchor image not found: {args.anchor}")

    load_env_file(args.env_file)
    if not args.dry_run and not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit(f"OPENAI_API_KEY is not set and was not found in {args.env_file}")

    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    image_cli = codex_home / "skills/.system/imagegen/scripts/image_gen.py"
    if not image_cli.is_file():
        raise SystemExit(f"Bundled image CLI not found: {image_cli}")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    selected = VARIANTS
    if args.variants:
        wanted = [name.strip() for name in args.variants.split(",") if name.strip()]
        missing = [name for name in wanted if name not in VARIANTS]
        if missing:
            raise SystemExit(f"Unknown variant(s): {', '.join(missing)}")
        selected = {name: VARIANTS[name] for name in wanted}

    for filename, request in selected.items():
        prompt = (
            "Use case: identity-preserve\n"
            "Input image: edit target and sole identity/style anchor.\n"
            f"Primary request: {request}\n"
            "Composition: preserve the full-body front-facing framing and white backdrop.\n"
            "Constraints: preserve the exact character identity, facial structure, hairstyle, "
            "black futuristic armor design, teal trim, chibi proportions, clean black outlines, "
            "color palette, and illustration finish except for the explicitly requested change. "
            "No added props, text, logos, or watermark."
        )
        command = [
            sys.executable,
            str(image_cli),
            "edit",
            "--model",
            "gpt-image-2",
            "--image",
            str(args.anchor),
            "--prompt",
            prompt,
            "--quality",
            args.quality,
            "--size",
            args.size,
            "--out",
            str(args.out_dir / filename),
        ]
        if args.force:
            command.append("--force")
        if args.dry_run:
            command.append("--dry-run")
        print(f"Generating {filename}...", flush=True)
        subprocess.run(command, check=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
