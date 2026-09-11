"""Independent checks for the local cleanup deliverables; no writes."""

from pathlib import Path

import numpy as np
from PIL import Image


folder = Path(__file__).resolve().parent
source_folder = folder.parent / 'pose-study-01'

for pose in ('idle', 'walk', 'run', 'ridge'):
    filename = f'kairo_pose_{pose}_concept_v3.png'
    image = Image.open(folder / filename)
    assert image.mode == 'RGBA' and image.size == (570, 636), pose
    pixels = np.asarray(image)
    alpha = pixels[:, :, 3]
    bounds = image.getchannel('A').getbbox()
    assert bounds[3] == 636 and alpha[-1].max() > 16, pose
    assert abs((bounds[0] + bounds[2]) / 2 - 285) <= 0.5, pose
    assert all(alpha[y, x] == 0 for x, y in ((0, 0), (569, 0), (0, 635), (569, 635))), pose
    rgb = pixels[:, :, :3].astype(int)
    green = (rgb[:, :, 1] > rgb[:, :, 0] + 16) & (rgb[:, :, 1] > rgb[:, :, 2] + 16)
    assert not np.any(green & (alpha > 16)), pose
    mask = np.asarray(Image.open(folder / f'crest_{filename}').getchannel('A'))
    assert mask.shape == alpha.shape and np.all(mask <= alpha), pose

    before = np.asarray(Image.open(source_folder / filename).convert('RGBA'))
    after = np.asarray(Image.open(folder / f'cutout-{pose}.png').convert('RGBA'))
    if pose in ('idle', 'walk'):
        assert np.array_equal(before, after), f'{pose}: source artwork changed before framing'
    else:
        box = (175, 135, 436, 278) if pose == 'run' else (170, 115, 427, 279)
        x1, y1, x2, y2 = box
        assert np.array_equal(before[y1:y2, x1:x2], after[y1:y2, x1:x2]), f'{pose}: face changed'
        # Existing leg/foot pixels remain untouched by the upper-body cleanup.
        visible = before[520:, :, 3] > 16
        assert np.array_equal(before[520:][visible], after[520:][visible]), f'{pose}: grounded foot changed'
    print(f'{pose}: 570×636 RGBA, frame, alpha, crest mask, and preservation checks passed.')

run_before = Image.open(source_folder / 'kairo_pose_run_concept_v3.png')
run_after = Image.open(folder / 'cutout-run.png')
assert run_before.getpixel((126, 442))[3] > 128
assert run_after.getpixel((126, 442))[3] == 0, 'Added tail still occupies the checked tail point'
print('Run tail-point regression check passed. Visual silhouette review is still required.')
