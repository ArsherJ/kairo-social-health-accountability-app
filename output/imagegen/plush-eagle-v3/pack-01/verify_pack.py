"""Read-only checks on the v3 eleven-render pack. No API, no app code."""
from PIL import Image
import numpy as np
from pathlib import Path

P = Path(__file__).resolve().parent
W, H, FLOOR = 570, 636, 16
fails = []

renders = sorted(p for p in P.glob("*/kairo_*.png"))
assert len(renders) == 11, f"expected 11 renders, found {len(renders)}"

for src in renders:
    im = Image.open(src)
    a = np.array(im.convert("RGBA"))
    alpha = a[:, :, 3]
    solid = alpha > FLOOR
    rows, cols = np.where(solid.any(axis=1))[0], np.where(solid.any(axis=0))[0]

    if im.size != (W, H): fails.append(f"{src.name}: size {im.size} != {(W, H)}")
    if im.mode != "RGBA": fails.append(f"{src.name}: mode {im.mode} != RGBA")
    if rows[0] != 0 or rows[-1] != H - 1:
        fails.append(f"{src.name}: figure y[{rows[0]},{rows[-1]}], expected full 636 height")
    if cols[0] < 1 or cols[-1] > W - 2:
        fails.append(f"{src.name}: figure touches the canvas edge x[{cols[0]},{cols[-1]}]")
    # horizontal centring within 12px
    off = abs(((cols[0] + cols[-1]) / 2) - (W - 1) / 2)
    if off > 12: fails.append(f"{src.name}: off-centre by {off:.0f}px")
    # no chroma-green residue
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    green = ((g > 100) & (g - r > 35) & (g - b > 35) & solid).sum()
    if green: fails.append(f"{src.name}: {green} green pixels remain")
    # transparent corners
    for y, x in ((0, 0), (0, W - 1), (H - 1, 0), (H - 1, W - 1)):
        if alpha[y, x] > FLOOR: fails.append(f"{src.name}: corner ({x},{y}) is opaque")

    mask_path = P / "crests" / f"crest_{src.name}"
    if not mask_path.is_file():
        fails.append(f"{src.name}: no crest mask")
        continue
    m = np.array(Image.open(mask_path).convert("RGBA"))[:, :, 3]
    if m.shape != alpha.shape: fails.append(f"{src.name}: mask shape mismatch")
    # the mask may only paint pixels the bird already occupies
    outside = int(((m > FLOOR) & ~solid).sum())
    if outside: fails.append(f"{src.name}: mask paints {outside}px outside the figure")
    if (m > FLOOR).sum() == 0: fails.append(f"{src.name}: mask is empty")

idle = (P / "poses/kairo_pose_idle.png").read_bytes()
normal = (P / "states/kairo_state_normal.png").read_bytes()
if idle != normal: fails.append("kairo_state_normal.png is not a copy of kairo_pose_idle.png")

if fails:
    print("\n".join(f"FAIL {f}" for f in fails))
    raise SystemExit(1)
print(f"PASS — {len(renders)} renders + 11 crest masks: 570x636 RGBA, full-height figure, "
      "centred, feet at the bottom edge, transparent corners, no green residue, masks contained.")
