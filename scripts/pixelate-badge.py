"""Turn badge artwork into pixel art that keeps the original design (needs Python 3 with Pillow).

Usage: python3 scripts/pixelate-badge.py public/badges/<id>.webp [...]

Each file is rewritten in place, so run it once on a freshly cropped 320px badge (see CREDITS.txt), not on one
that is already pixelated. The steps, tuned so small accents like eye colour survive:
  1. a little extra contrast and saturation, then a light median filter that flattens painted texture into areas;
  2. a 48-colour octree palette picked at full size, where small bright details still win a slot;
  3. a 64x64 grid where every pixel takes its block's most common colour, so edges stay hard;
  4. a nearest-neighbour upscale back to 320px, saved as lossless webp.
"""
import sys
from collections import Counter
from PIL import Image, ImageEnhance, ImageFilter

GRID = 64
COLORS = 48
OUTPUT = 320


def pixelate(path):
    block = 5
    image = Image.open(path).convert('RGB').resize((GRID * block, GRID * block), Image.LANCZOS)
    image = ImageEnhance.Contrast(image).enhance(1.1)
    image = ImageEnhance.Color(image).enhance(1.2)
    image = image.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.MedianFilter(3))
    indexed = image.quantize(colors=COLORS, method=Image.Quantize.FASTOCTREE, kmeans=6, dither=Image.Dither.NONE)
    palette, source = indexed.getpalette(), indexed.load()
    grid = Image.new('RGB', (GRID, GRID))
    target = grid.load()
    for y in range(GRID):
        for x in range(GRID):
            cells = (source[x * block + i, y * block + j] for i in range(block) for j in range(block))
            colour = Counter(cells).most_common(1)[0][0]
            target[x, y] = tuple(palette[colour * 3:colour * 3 + 3])
    grid.resize((OUTPUT, OUTPUT), Image.NEAREST).save(path, lossless=True, quality=100, method=6)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for badge in sys.argv[1:]:
        pixelate(badge)
        print('pixelated', badge)
