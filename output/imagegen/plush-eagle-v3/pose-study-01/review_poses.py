"""Local-only pose preparation and review. Never writes production assets."""

import argparse
import math
import runpy
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageFont, ImageOps


POSES = ('idle', 'walk', 'run', 'ridge')
HEIGHT = 636
ALPHA_FLOOR = 16


def floor_alpha(image):
    image.putalpha(image.getchannel('A').point(lambda a: a if a > ALPHA_FLOOR else 0))
    return image


def prepare(path, palette):
    source = Image.open(path).convert('RGBA')
    alpha = floor_alpha(source).getchannel('A')
    center = (source.width // 2, source.height // 2)
    assert alpha.getpixel(center) > 128, f'No centered bird in {path.name}'
    connected = alpha.point(lambda a: 255 if a else 0)
    ImageDraw.floodfill(connected, center, 128)
    connected = connected.point(lambda a: 255 if a == 128 else 0)
    alpha = ImageChops.multiply(alpha, connected)
    source = source.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
    source.putalpha(alpha)
    bounds = alpha.getbbox()
    figure = source.crop(bounds)
    scale = HEIGHT / figure.height
    figure = floor_alpha(figure.resize((round(figure.width * scale), HEIGHT), Image.Resampling.LANCZOS))
    return figure.crop(figure.getchannel('A').getbbox()), bounds


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--light', required=True)
    parser.add_argument('--dark', required=True)
    parser.add_argument('--ink', required=True)
    parser.add_argument('--on-dark', required=True)
    parser.add_argument('--tint', required=True)
    parser.add_argument('--palette', nargs='+', required=True)
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--title', default='Four Motion poses')
    args = parser.parse_args()
    folder = args.directory.resolve() if args.directory else Path(__file__).resolve().parent
    root = folder.parents[3]
    fonts = root / 'assets/fonts'
    display = lambda size: ImageFont.truetype(str(fonts / 'Fredoka-SemiBold.ttf'), size)
    body = lambda size: ImageFont.truetype(str(fonts / 'Nunito-SemiBold.ttf'), size)
    light, dark, ink, on_dark, tint = [ImageColor.getrgb(value) for value in (
        args.light, args.dark, args.ink, args.on_dark, args.tint,
    )]
    colors = [ImageColor.getrgb(value) for value in args.palette]
    palette = Image.new('P', (1, 1))
    palette.putpalette([channel for color in (colors * (256 // len(colors) + 1))[:256] for channel in color])

    # Reuse the existing pure mask function, without running its production-writing main().
    crest_alpha = runpy.run_path(str(root / 'scripts/generate_crest_masks.py'))['crest_alpha']
    prepared = {pose: prepare(folder / f'cutout-{pose}.png', palette) for pose in POSES}
    width = max(570, math.ceil((max(figure.width for figure, _ in prepared.values()) + 12) / 2) * 2)
    art, tinted = {}, {}
    print(f'Shared study canvas: {width} × {HEIGHT}; canonical canvas: 570 × 636.')
    for pose, (figure, source_bounds) in prepared.items():
        canvas = Image.new('RGBA', (width, HEIGHT))
        canvas.paste(figure, ((width - figure.width) // 2, HEIGHT - figure.height))
        filename = f'kairo_pose_{pose}_concept_v3.png'
        canvas.save(folder / filename)
        art[pose] = canvas
        alpha = np.asarray(canvas.getchannel('A'))
        mask_alpha = (crest_alpha(canvas) * 255).astype(np.uint8)
        assert np.all(mask_alpha <= alpha), f'{pose}: mask exceeds figure alpha'
        mask = Image.new('RGBA', canvas.size, (255, 255, 255, 0))
        mask.putalpha(Image.fromarray(mask_alpha))
        mask.save(folder / f'crest_{filename}')
        overlay = Image.new('RGBA', canvas.size, tint)
        overlay.putalpha(mask.getchannel('A'))
        tinted[pose] = Image.alpha_composite(canvas, overlay)
        bounds = canvas.getchannel('A').getbbox()
        assert bounds[3] == HEIGHT
        assert abs((bounds[0] + bounds[2]) / 2 - width / 2) <= 0.5
        assert all(canvas.getpixel(point)[3] == 0 for point in ((0, 0), (width - 1, 0), (0, HEIGHT - 1), (width - 1, HEIGHT - 1)))
        assert not any(a > ALPHA_FLOOR and g > r + 16 and g > b + 16 for r, g, b, a in canvas.get_flattened_data())
        print(f'{pose}: source={source_bounds}; bounds={bounds}; native-width-fit={figure.width <= 570}; alpha/alignment/mask checks passed.')

    def at_height(canvas, image, center_x, bottom, height):
        figure = image.crop(image.getchannel('A').getbbox())
        figure = figure.resize((round(figure.width * height / figure.height), height), Image.Resampling.LANCZOS)
        canvas.alpha_composite(figure, (round(center_x - figure.width / 2), bottom - height))

    def in_slot(canvas, image, x, y, w, h):
        fitted = ImageOps.contain(image, (w, h), Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, (x + (w - fitted.width) // 2, y + h - fitted.height))

    sheet = Image.new('RGBA', (1600, 850), light)
    pen = ImageDraw.Draw(sheet)
    pen.text((56, 38), 'KAIRO / PLUSH EAGLE V3', font=body(19), fill=ink)
    pen.text((53, 77), args.title, font=display(52), fill=ink)
    labels = ('Wings tucked', 'One foot lifted', 'Forward lean', 'Wings raised')
    for index, pose in enumerate(POSES):
        cx = 230 + index * 380
        pen.text((cx, 182), pose.capitalize(), font=display(30), fill=ink, anchor='mt')
        at_height(sheet, art[pose], cx, 612, 370)
        pen.text((cx, 636), labels[index], font=body(20), fill=ink, anchor='mt')
    pen.rounded_rectangle((56, 692, 1544, 809), radius=24, fill=dark)
    pen.text((78, 704), '44 px / dark', font=body(16), fill=on_dark)
    for index, pose in enumerate(POSES):
        at_height(sheet, art[pose], 230 + index * 380, 785, 44)
    pen.text((56, 825), 'Concept study only · Pose and identity review, not production artwork', font=body(16), fill=ink)
    sheet.convert('RGB').save(folder / 'pose-sheet.png')

    qa = Image.new('RGBA', (1200, 960), light)
    pen = ImageDraw.Draw(qa)
    pen.text((32, 24), 'Light + dark / pose readability', font=display(34), fill=ink)
    for top, background, foreground, label in (
        (90, light, ink, 'LIGHT'), (520, dark, on_dark, 'DARK'),
    ):
        pen.rounded_rectangle((20, top, 1180, top + 410), radius=24, fill=background)
        pen.text((38, top + 12), label, font=body(16), fill=foreground)
        for index, pose in enumerate(POSES):
            x = 25 + index * 290
            pen.text((x + 145, top + 35), pose.capitalize(), font=display(23), fill=foreground, anchor='mt')
            in_slot(qa, art[pose], x + 50, top + 68, 190, 212)
            pen.text((x + 145, top + 285), '190 × 212 slot', font=body(15), fill=foreground, anchor='mt')
            in_slot(qa, art[pose], x + 54, top + 310, 72, 72)
            at_height(qa, art[pose], x + 210, top + 382, 44)
            pen.text((x + 90, top + 387), '72 × 72 slot', font=body(13), fill=foreground, anchor='mt')
            pen.text((x + 210, top + 387), '44 px tall', font=body(13), fill=foreground, anchor='mt')
    pen.text((32, 940), 'Off-device raster check · All figures share a canvas and ground line', font=body(14), fill=ink)
    qa.convert('RGB').save(folder / 'size-check.png')

    masks = Image.new('RGBA', (1200, 460), light)
    pen = ImageDraw.Draw(masks)
    pen.text((32, 24), 'Existing crest-mask geometry / study-only check', font=display(30), fill=ink)
    for index, pose in enumerate(POSES):
        cx = 150 + index * 300
        at_height(masks, tinted[pose], cx, 384, 250)
        pen.text((cx, 402), pose.capitalize(), font=body(19), fill=ink, anchor='mt')
    masks.convert('RGB').save(folder / 'mask-review.png')

    identity = Image.new('RGBA', (1500, 500), light)
    pen = ImageDraw.Draw(identity)
    pen.text((32, 24), 'Identity review / same figure height', font=display(32), fill=ink)
    anchor = Image.open(folder.parent / 'base-study-01/plush-eagle-refined.png').convert('RGBA')
    for index, (label, image) in enumerate([('Base', anchor), *[(p.capitalize(), art[p]) for p in POSES]]):
        cx = 150 + index * 300
        at_height(identity, image, cx, 410, 260)
        pen.text((cx, 435), label, font=display(23), fill=ink, anchor='mt')
    identity.convert('RGB').save(folder / 'identity-check.png')
    print('Saved four normalized poses, four provisional crest masks, and four review sheets.')


if __name__ == '__main__':
    main()
