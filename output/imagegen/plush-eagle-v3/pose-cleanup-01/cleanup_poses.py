"""Targeted local bitmap cleanup; originals and production assets are read-only."""

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont


FOLDER = Path(__file__).resolve().parent
ROOT = FOLDER.parents[3]
SOURCE = FOLDER.parent / 'pose-study-01'
BASE = FOLDER.parent / 'base-study-01/plush-eagle-refined.png'
INK = (42, 33, 28, 255)
BROWN = (107, 69, 50, 255)
CREAM = (244, 230, 199, 255)
SCALE = 4


def cubic(start, first, second, end, steps=40):
    points = []
    for t in np.linspace(0, 1, steps):
        points.append(tuple((1 - t) ** 3 * start[i] + 3 * (1 - t) ** 2 * t * first[i]
                            + 3 * (1 - t) * t ** 2 * second[i] + t ** 3 * end[i]
                            for i in (0, 1)))
    return points


def curve(start, segments):
    points = [start]
    for first, second, end in segments:
        points.extend(cubic(points[-1], first, second, end)[1:])
    return points


def raster_polygon(size, points, fill=255):
    mask = Image.new('L', (size[0] * SCALE, size[1] * SCALE))
    ImageDraw.Draw(mask).polygon([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=fill)
    return mask.resize(size, Image.Resampling.LANCZOS)


def draw_curve(image, points, color=INK, width=6):
    layer = Image.new('RGBA', (image.width * SCALE, image.height * SCALE))
    pen = ImageDraw.Draw(layer)
    scaled = [(round(x * SCALE), round(y * SCALE)) for x, y in points]
    pen.line(scaled, fill=color, width=round(width * SCALE), joint='curve')
    r = width * SCALE / 2
    for x, y in (scaled[0], scaled[-1]):
        pen.ellipse((x - r, y - r, x + r, y + r), fill=color)
    return Image.alpha_composite(image, layer.resize(image.size, Image.Resampling.LANCZOS))


def grid(image, name):
    canvas = Image.new('RGBA', image.size, (255, 246, 236, 255))
    canvas.alpha_composite(image)
    pen = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(str(ROOT / 'assets/fonts/Nunito-SemiBold.ttf'), 12)
    for x in range(0, image.width, 25):
        pen.line((x, 0, x, image.height), fill=(130, 120, 160, 80), width=1)
        if x % 50 == 0:
            pen.text((x + 2, 0), str(x), fill=(36, 27, 77), font=font)
    for y in range(0, image.height, 25):
        pen.line((0, y, image.width, y), fill=(130, 120, 160, 80), width=1)
        if y % 50 == 0:
            pen.text((0, y + 2), str(y), fill=(36, 27, 77), font=font)
    canvas.save(FOLDER / name)


def erase_outside(image, boundary, side):
    edge = 0 if side == 'left' else image.width
    polygon = [(edge, boundary[0][1]), *boundary, (edge, boundary[-1][1])]
    erase = raster_polygon(image.size, polygon)
    result = image.copy()
    result.putalpha(ImageChops.multiply(result.getchannel('A'), ImageChops.invert(erase)))
    return result


# One smooth mitten outline traced from the preferred base's left wing. These
# points are relative to its shoulder attachment; the same geometry is mirrored
# and rotated for both cleaned poses. No feather scallops or new anatomy.
WING = curve((-7, -10), [
    ((-26, 17), (-57, 52), (-70, 89)),
    ((-83, 125), (-80, 150), (-66, 159)),
    ((-51, 171), (-31, 152), (-18, 131)),
    ((0, 101), (7, 65), (0, 31)),
    ((-2, 17), (1, 3), (5, -3)),
    ((1, -5), (-3, -7), (-7, -10)),
])


def wing_layer(size, root, angle, mirrored=False):
    radians = math.radians(angle)
    points = []
    for x, y in WING:
        if mirrored:
            x = -x
        points.append((root[0] + x * math.cos(radians) - y * math.sin(radians),
                       root[1] + x * math.sin(radians) + y * math.cos(radians)))
    layer = Image.new('RGBA', size, BROWN)
    layer.putalpha(raster_polygon(size, points))
    return draw_curve(layer, points, width=6)


def clean_run(source):
    left_head = curve((119, 211), [
        ((119, 235), (123, 254), (135, 268)),
        ((149, 276), (185, 286), (201, 298)),
    ])
    left_body = curve((201, 298), [
        ((176, 327), (152, 365), (144, 397)),
        ((134, 443), (155, 481), (205, 502)),
    ])
    right_head = curve((447, 170), [
        ((457, 210), (460, 258), (441, 282)),
        ((433, 291), (424, 298), (414, 302)),
    ])
    right_body = curve((414, 302), [((429, 324), (437, 343), (439, 364))])
    body = erase_outside(source, left_head + left_body[1:], 'left')
    body = erase_outside(body, right_head + right_body[1:], 'right')
    # Remove the short internal stroke left by the old lower wing notch.
    alpha = body.getchannel('A')
    ImageDraw.Draw(body).rectangle((150, 355, 172, 374), fill=BROWN)
    body.putalpha(alpha)
    # Restore only the torso edge exposed by removing the old wings/tail.
    body = draw_curve(body, left_body, width=6)
    body = draw_curve(body, right_body, width=6)
    wings = Image.new('RGBA', source.size)
    wings.alpha_composite(wing_layer(source.size, (198, 299), 85))
    wings.alpha_composite(wing_layer(source.size, (418, 301), -105, mirrored=True))
    result = Image.alpha_composite(wings, body)
    return result, body, wings


def clean_ridge(source):
    left_head = curve((153, 164), [
        ((146, 193), (145, 242), (155, 260)),
        ((165, 278), (186, 290), (198, 295)),
    ])
    left_body = curve((198, 295), [
        ((177, 325), (161, 371), (154, 412)),
        ((149, 434), (148, 456), (153, 479)),
    ])
    right_head = [(590 - x, y) for x, y in left_head]
    right_body = [(590 - x, y) for x, y in left_body]
    body = erase_outside(source, left_head + left_body[1:], 'left')
    body = erase_outside(body, right_head + right_body[1:], 'right')
    body = draw_curve(body, left_body, width=6)
    body = draw_curve(body, right_body, width=6)
    wings = Image.new('RGBA', source.size)
    wings.alpha_composite(wing_layer(source.size, (197, 296), 110))
    wings.alpha_composite(wing_layer(source.size, (393, 296), -110, mirrored=True))
    result = Image.alpha_composite(wings, body)
    return result, body, wings


def main():
    for pose in ('idle', 'walk', 'run', 'ridge'):
        source = Image.open(SOURCE / f'kairo_pose_{pose}_concept_v3.png').convert('RGBA')
        if pose in ('run', 'ridge'):
            clean = clean_run if pose == 'run' else clean_ridge
            result, body, wings = clean(source)
            body.save(FOLDER / f'layer-body-{pose}.png')
            wings.save(FOLDER / f'layer-wings-{pose}.png')
            # Eye, beak and cheek pixels are outside the cleanup regions.
            protected = (175, 135, 436, 278) if pose == 'run' else (170, 115, 427, 279)
            # Supersampled silhouette erasure can touch a few lower head-edge
            # pixels. The original face is an authoritative protected layer.
            result.paste(source.crop(protected), protected[:2])
            assert np.array_equal(np.asarray(source.crop(protected)), np.asarray(result.crop(protected))), f'{pose}: face changed'
        else:
            result = source.copy()
        result.save(FOLDER / f'cutout-{pose}.png')
        print(f'{pose}: local cleanup saved; alpha bounds={result.getchannel("A").getbbox()}')


if __name__ == '__main__':
    main()
