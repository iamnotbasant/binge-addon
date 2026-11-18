#!/usr/bin/env python3
"""Binge Addon v1.0.6 — minimal badge render.

Regenerates every kept badge in app/lib/badges.json as a 1200x320 PNG:
dark #1A1A1A fill, #858283 border, white DejaVu Sans Bold text, plus a
VERY simple drawn icon for the icon badges (speaker / sun / disc /
globe / film). Text-only badges: REMUX + resolutions (already plain).

Icon map (id -> (kind, label)):
  speaker: atmos "Dolby Atmos", dd-plus "DD+"
  sun:     hdr10plus "HDR10+", hdr10 "HDR10", dolby-vision "Dolby Vision", hdr "HDR"
  disc:    bluray "BluRay"
  globe:   web-dl "WEB-DL", lang-* "<Language>"
  film:    webrip "WEBRip"
  text:    remux "REMUX", res-1080p "1080p", res-720p "720p", res-480p "480p"

Also writes a contact sheet (tests/badge-contact-sheet-106.png) for a
visual check before shipping. Run: python3 scripts/render-badges-v106.py
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'app', 'lib', 'badge-images')
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
W, H = 1200, 320
FILL = (26, 26, 26, 255)
BORDER = (133, 130, 131, 255)
WHITE = (255, 255, 255, 255)

ICONS = {
    'atmos': ('speaker', 'Dolby Atmos'), 'dd-plus': ('speaker', 'DD+'),
    'hdr10plus': ('sun', 'HDR10+'), 'hdr10': ('sun', 'HDR10'),
    'dolby-vision': ('sun', 'Dolby Vision'), 'hdr': ('sun', 'HDR'),
    'bluray': ('disc', 'BluRay'), 'web-dl': ('globe', 'WEB-DL'),
    'webrip': ('film', 'WEBRip'),
    'remux': ('text', 'REMUX'), 'res-1080p': ('text', '1080p'),
    'res-720p': ('text', '720p'), 'res-480p': ('text', '480p'),
}
LANG_LABEL = {
    'lang-hindi': 'Hindi', 'lang-english': 'English', 'lang-tamil': 'Tamil',
    'lang-telugu': 'Telugu', 'lang-malayalam': 'Malayalam',
    'lang-kannada': 'Kannada', 'lang-bengali': 'Bengali',
    'lang-marathi': 'Marathi', 'lang-gujarati': 'Gujarati',
    'lang-punjabi': 'Punjabi',
}


def font(size):
    return ImageFont.truetype(BOLD, size)


def fit_font(draw, text, max_w, start=170):
    size = start
    while size > 40:
        f = font(size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 6
    return font(40)


def draw_speaker(d, x0, y0, x1, y1):
    # speaker box + cone + 2 sound arcs, white, line width 14
    w = 14
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    # box
    d.rectangle([x0 + 8, cy - 42, x0 + 62, cy + 42], fill=WHITE)
    # cone
    d.polygon([(x0 + 62, cy - 42), (x0 + 128, cy - 88), (x0 + 128, cy + 88),
               (x0 + 62, cy + 42)], fill=WHITE)
    # arcs centred on the cone tip, kept inside the icon zone (x < 300)
    tip_x, tip_y = x0 + 150, cy
    for r in (34, 66):
        d.arc([tip_x - r, tip_y - r, tip_x + r, tip_y + r], -58, 58,
              fill=WHITE, width=w)


def draw_sun(d, x0, y0, x1, y1):
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    d.ellipse([cx - 52, cy - 52, cx + 52, cy + 52], fill=WHITE)
    for k in range(8):
        a = math.radians(k * 45)
        xA, yA = cx + int(72 * math.cos(a)), cy + int(72 * math.sin(a))
        xB, yB = cx + int(104 * math.cos(a)), cy + int(104 * math.sin(a))
        d.line([xA, yA, xB, yB], fill=WHITE, width=16)


def draw_disc(d, x0, y0, x1, y1):
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    d.ellipse([cx - 96, cy - 96, cx + 96, cy + 96], outline=WHITE, width=14)
    d.ellipse([cx - 58, cy - 58, cx + 58, cy + 58], outline=WHITE, width=10)
    d.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill=WHITE)


def draw_globe(d, x0, y0, x1, y1):
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    d.ellipse([cx - 96, cy - 96, cx + 96, cy + 96], outline=WHITE, width=14)
    d.ellipse([cx - 44, cy - 96, cx + 44, cy + 96], outline=WHITE, width=10)
    d.line([cx - 96, cy, cx + 96, cy], fill=WHITE, width=10)
    d.arc([cx - 96, cy - 58, cx + 96, cy + 58], 200, 340, fill=WHITE, width=10)
    d.arc([cx - 96, cy - 58, cx + 96, cy + 58], 20, 160, fill=WHITE, width=10)


def draw_film(d, x0, y0, x1, y1):
    # film frame: rounded rect outline + sprocket holes top/bottom
    d.rounded_rectangle([x0 + 10, y0 + 34, x1 - 10, y1 - 34], radius=18,
                        outline=WHITE, width=12)
    for x in (x0 + 52, x0 + 106, x0 + 160):
        d.rounded_rectangle([x, y0 + 52, x + 26, y0 + 78], radius=6, fill=WHITE)
        d.rounded_rectangle([x, y1 - 78, x + 26, y1 - 52], radius=6, fill=WHITE)
    # play triangle in the middle
    cx, cy = (x0 + x1) // 2 + 14, (y0 + y1) // 2
    d.polygon([(cx - 26, cy - 34), (cx - 26, cy + 34), (cx + 34, cy)], fill=WHITE)


DRAW = {'speaker': draw_speaker, 'sun': draw_sun, 'disc': draw_disc,
        'globe': draw_globe, 'film': draw_film}


def render(badge_id, kind, label):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([6, 6, W - 7, H - 7], radius=48, fill=FILL,
                        outline=BORDER, width=10)
    if kind == 'text':
        f = fit_font(d, label, W - 160)
        tw = d.textlength(label, font=f)
        d.text(((W - tw) / 2, (H - f.size) / 2 - 8), label, font=f, fill=WHITE)
    else:
        DRAW[kind](d, 56, 48, 300, 272)
        f = fit_font(d, label, W - 360)
        tw = d.textlength(label, font=f)
        d.text((330 + (W - 330 - tw) / 2, (H - f.size) / 2 - 8), label,
               font=f, fill=WHITE)
    return img


def main():
    pack = json.load(open(os.path.join(ROOT, 'app', 'lib', 'badges.json')))
    os.makedirs(OUT, exist_ok=True)
    # delete dropped PNGs first
    wanted = {f['id'] for f in pack['filters']}
    for n in os.listdir(OUT):
        if n.endswith('.png') and n[:-4] not in wanted:
            os.remove(os.path.join(OUT, n))
            print('deleted', n)
    rendered = []
    for f in pack['filters']:
        bid = f['id']
        kind, label = ICONS.get(bid, ('globe', LANG_LABEL.get(bid, f['name'])))
        img = render(bid, kind, label)
        img.save(os.path.join(OUT, bid + '.png'))
        rendered.append((bid, img))
        print(f'{bid:16s} {kind:8s} {label}')
    # contact sheet: 2 cols, scaled 0.5, white bg
    cols, sc = 2, 0.5
    rows = (len(rendered) + cols - 1) // cols
    sw, sh = int(W * sc), int(H * sc)
    sheet = Image.new('RGB', (cols * sw + 60, rows * (sh + 20) + 20), (255, 255, 255))
    for i, (bid, img) in enumerate(rendered):
        x = 20 + (i % cols) * (sw + 20)
        y = 20 + (i // cols) * (sh + 20)
        sheet.paste(img.resize((sw, sh)), (x, y))
    sheet_path = os.path.join(ROOT, 'tests', 'badge-contact-sheet-106.png')
    sheet.save(sheet_path)
    print('sheet:', sheet_path, sheet.size)
    print('total badges:', len(rendered))


if __name__ == '__main__':
    main()
