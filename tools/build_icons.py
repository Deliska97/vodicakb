import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

INDIGO = (79, 70, 229)
WHITE = (255, 255, 255)
SCALE = 4
FONT_CANDIDATES = ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf']


def load_font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise FileNotFoundError('no bold system font found')


def render(size, rounded, glyph_scale):
    canvas = size * SCALE
    image = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    radius = int(canvas * 0.22) if rounded else 0
    draw.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=radius, fill=INDIGO)
    c = canvas / 2
    half = canvas * 0.33 * glyph_scale
    top, bottom = c - half * 0.95, c + half * 0.78
    triangle = [(c, top), (c + half * 1.0, bottom), (c - half * 1.0, bottom)]
    draw.polygon(triangle, outline=WHITE, width=int(canvas * 0.07 * glyph_scale))
    draw.line(triangle + [triangle[0], triangle[1]], fill=WHITE, width=int(canvas * 0.07 * glyph_scale), joint='curve')
    font = load_font(int(canvas * 0.30 * glyph_scale))
    draw.text((c, bottom - canvas * 0.045 * glyph_scale), 'B', font=font, fill=WHITE, anchor='ms')
    return image.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    render(180, rounded=False, glyph_scale=1.0).convert('RGB').save(out / 'apple-touch-icon.png')
    render(192, rounded=True, glyph_scale=1.0).save(out / 'icon-192.png')
    render(512, rounded=True, glyph_scale=1.0).save(out / 'icon-512.png')
    render(512, rounded=False, glyph_scale=0.78).convert('RGB').save(out / 'icon-maskable-512.png')
    print('icons written to', out)
