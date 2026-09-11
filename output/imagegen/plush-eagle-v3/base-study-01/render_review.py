"""Non-destructive presentation/alpha cleanup for this concept study only."""

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageFont, ImageOps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--light', required=True)
    parser.add_argument('--dark', required=True)
    parser.add_argument('--ink', required=True)
    parser.add_argument('--on-dark', required=True)
    parser.add_argument('--palette', nargs='+')
    parser.add_argument('--input', default='cutout.png')
    parser.add_argument('--suffix', default='')
    parser.add_argument('--caption', default='First draft · Proportion correction pending')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    fonts = base.parents[3] / 'assets/fonts'
    display = lambda size: ImageFont.truetype(str(fonts / 'Fredoka-SemiBold.ttf'), size)
    body = lambda size: ImageFont.truetype(str(fonts / 'Nunito-SemiBold.ttf'), size)
    light, dark, ink, on_dark = [ImageColor.getrgb(value) for value in (
        args.light, args.dark, args.ink, args.on_dark,
    )]

    with Image.open(base / args.input) as original:
        source = original.convert('RGBA')
    alpha = source.getchannel('A').point(lambda value: value if value >= 16 else 0)
    center = (source.width // 2, source.height // 2)
    assert alpha.getpixel(center) >= 128, 'Expected one centered character'
    connected = alpha.point(lambda value: 255 if value else 0)
    ImageDraw.floodfill(connected, center, 128)
    connected = connected.point(lambda value: 255 if value == 128 else 0)
    alpha = ImageChops.multiply(alpha, connected)

    if args.palette:
        palette_colors = [ImageColor.getrgb(value) for value in args.palette]
        palette = Image.new('P', (1, 1))
        entries = (palette_colors * (256 // len(palette_colors) + 1))[:256]
        palette.putpalette([channel for color in entries for channel in color])
        source = source.convert('RGB').quantize(
            palette=palette, dither=Image.Dither.NONE,
        ).convert('RGBA')
    source.putalpha(alpha)
    source_bounds = alpha.getbbox()
    source = source.crop(source_bounds)
    source_ratio = source.height / source.width
    figure = ImageOps.contain(source, (558, 636), Image.Resampling.LANCZOS)
    figure.putalpha(figure.getchannel('A').point(lambda value: value if value >= 16 else 0))
    figure = figure.crop(figure.getchannel('A').getbbox())
    art = Image.new('RGBA', (570, 636))
    art.paste(figure, ((570 - figure.width) // 2, 636 - figure.height))
    art.save(base / f'plush-eagle{args.suffix}.png')

    def place(canvas, x, y, width, height):
        fitted = ImageOps.contain(art, (width, height), Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, (
            x + (width - fitted.width) // 2, y + height - fitted.height,
        ))

    preview = Image.new('RGBA', (1000, 1000), light)
    pen = ImageDraw.Draw(preview)
    pen.text((56, 43), 'KAIRO / V3 BASE STUDY', font=body(19), fill=ink)
    pen.text((53, 79), 'Plush eagle', font=display(54), fill=ink)
    place(preview, 180, 180, 640, 680)
    pen.text((56, 911), args.caption, font=body(19), fill=ink)
    pen.text((56, 945), 'Concept only · Existing app artwork unchanged', font=body(19), fill=ink)
    preview.convert('RGB').save(base / f'preview{args.suffix}.png')

    qa = Image.new('RGBA', (1120, 540), light)
    pen = ImageDraw.Draw(qa)
    pen.text((32, 28), 'Light + dark / size check', font=display(32), fill=ink)
    for x, background, foreground, label in (
        (28, light, ink, 'LIGHT'), (572, dark, on_dark, 'DARK'),
    ):
        pen.rounded_rectangle((x, 104, x + 520, 480), radius=24, fill=background)
        pen.text((x + 28, 124), label, font=body(17), fill=foreground)
        place(qa, x + 22, 178, 190, 212)
        place(qa, x + 276, 318, 72, 72)
        place(qa, x + 418, 346, 44, 44)
        pen.text((x + 117, 420), '190 × 212', font=body(17), fill=foreground, anchor='mt')
        pen.text((x + 312, 420), '72 × 72', font=body(17), fill=foreground, anchor='mt')
        pen.text((x + 440, 420), '44 px', font=body(17), fill=foreground, anchor='mt')
    pen.text((32, 506), 'Base only · Four-pose differentiation still to be tested', font=body(17), fill=ink)
    qa.convert('RGB').save(base / f'size-check{args.suffix}.png')

    bounds = art.getchannel('A').getbbox()
    assert bounds[3] == 636
    assert abs((bounds[0] + bounds[2]) / 2 - 285) <= 0.5
    assert all(art.getpixel(point)[3] == 0 for point in ((0, 0), (569, 0), (0, 635), (569, 635)))
    assert not any(a >= 16 and g > r + 16 and g > b + 16 for r, g, b, a in art.get_flattened_data())
    print(f'Source bounds={source_bounds}; silhouette height/width={source_ratio:.3f} (target 1.500).')
    print(f'RGBA {art.size}; centered bounds={bounds}; bottom-aligned feet; transparent corners; no green residue.')
    print(f'Saved plush-eagle{args.suffix}.png, preview{args.suffix}.png, size-check{args.suffix}.png; no geometry distortion.')


if __name__ == '__main__':
    main()
