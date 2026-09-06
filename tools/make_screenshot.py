"""Compose a representative frame for the README.

Not a mock-up: it uses the shipped atlas, the shipped background and the same
grade the canvas renderer applies (warm point lights, vignette, film grain,
scanlines), so what the README shows is what the game draws.
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "public", "assets")
OUT = os.path.join(ROOT, "docs")
W, H = 640, 360

man = json.load(open(f"{A}/sprites.json"))
atlas = Image.open(f"{A}/sprites.png").convert("RGBA")
font = json.load(open(f"{A}/font.json"))
glyphs = font["glyphs"]
fontimg = Image.open(f"{A}/font.png").convert("RGBA")

# corridor floor band, matching game/world.ts
FLOOR = dict(top=274, bottom=348)


def depth(y, char_scale=1.0):
    t = max(0.0, min(1.0, (y - FLOOR["top"]) / (FLOOR["bottom"] - FLOOR["top"])))
    return (0.86 + 0.14 * t) * char_scale


def put(dst, key, frame, x, y, lift=0, flip=False):
    f = man["anims"][key]["frames"][frame]
    s = round(depth(y) * 20) / 20
    w, h = round(f["w"] * s), round(f["h"] * s)
    sp = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])).resize((w, h), Image.LANCZOS)
    if flip:
        sp = sp.transpose(Image.FLIP_LEFT_RIGHT)
    ax, ay = f["ax"] * s, f["ay"] * s
    dst.alpha_composite(sp, (round(x - (w - ax if flip else ax)), round(y - ay - lift)))


def text(dst, s, x, y, colour):
    tint = Image.new("RGBA", fontimg.size, colour)
    tint.putalpha(fontimg.getchannel("A"))
    cx = x
    for ch in s:
        g = glyphs.get(ch) or glyphs[" "]
        if g["w"]:
            dst.alpha_composite(
                tint.crop((g["x"], g["y"], g["x"] + g["w"], g["y"] + g["h"])),
                (cx + g["ox"], y + g["oy"]),
            )
        cx += g["adv"]
    return cx - x


def width(s):
    return sum((glyphs.get(c) or glyphs[" "])["adv"] for c in s)


def panel(d, x, y, w, h):
    d.rectangle([x, y, x + w, y + h], fill=(8, 11, 10, 230), outline=(61, 74, 65, 255))
    d.line([(x + 1, y + 1), (x + w - 1, y + 1)], fill=(233, 229, 214, 26))


def bar(d, x, y, w, value, colour):
    d.rectangle([x, y, x + w, y + 4], fill=(0, 0, 0, 140))
    d.rectangle([x, y, x + round(w * value), y + 4], fill=colour)
    d.rectangle([x, y, x + w, y + 4], outline=(233, 229, 214, 56))


im = Image.open(f"{A}/bg/corridor.png").convert("RGBA")

# a spill on the floor, drawn the way the engine draws it
sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sp).ellipse([196, 316, 248, 334], fill=(18, 48, 58, 150))
ImageDraw.Draw(sp).ellipse([204, 319, 228, 326], fill=(159, 216, 230, 60))
im.alpha_composite(sp)

# the corridor at four in the morning: the old man on the bench, the intern
# down on the floor with her charts, the janitor between them
put(im, "prop.wet_sign", 0, 92, 344)
put(im, "oldman.sit", 0, 388, 276, lift=16)
put(im, "intern.kneel", 0, 470, 338)
put(im, "mc.idle_mop", 0, 286, 330)

# warm point lights, additive, from game/world.ts
lights = [(72, 60, 96, 0.55), (400, 58, 96, 0.5), (590, 60, 96, 0.5), (160, 170, 46, 0.35)]
base = np.array(im).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]
for lx, ly, r, s in lights:
    d = np.sqrt((xx - lx) ** 2 + (yy - ly) ** 2) / r
    fall = np.clip(1 - d, 0, 1) ** 2
    for c, tint in enumerate((255, 220, 150)):
        base[..., c] += fall * s * tint * 0.28
im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGBA")

# HUD
d = ImageDraw.Draw(im, "RGBA")
panel(d, 6, 6, 176, 61)
text(im, "04:12", 14, 12, (233, 229, 214, 255))
coins = "23¢"
text(im, coins, 6 + 176 - 12 - width(coins), 12, (232, 196, 106, 255))
for i, (label, v, col) in enumerate([
    ("FED", 0.54, (127, 168, 106, 255)),
    ("TIRED", 0.61, (176, 138, 74, 255)),
    ("MOOD", 0.72, (143, 191, 122, 255)),
]):
    y = 29 + i * 13
    text(im, label, 14, y, (154, 163, 154, 255))
    bar(d, 58, y + 4, 112, v, col)
task = "Corridor B — mop 2 spills  1/2"
panel(d, 6, 71, width(task) + 24, 16)
text(im, "▪", 13, 75, (232, 196, 106, 255))
text(im, task, 24, 75, (200, 205, 190, 255))

# vignette, grain, scanlines -- the same grade the renderer applies
arr = np.array(im).astype(np.float32)
r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
arr[..., :3] *= np.clip(1 - 0.62 * np.clip((r - 0.34) / 0.9, 0, 1), 0, 1)[..., None]
rng = np.random.default_rng(7)
arr[..., :3] += (rng.random((H, W, 1)) - 0.5) * 13
arr[1::2, :, :3] *= 0.86
im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA").convert("RGB")

os.makedirs(OUT, exist_ok=True)
im.resize((W * 2, H * 2), Image.NEAREST).save(f"{OUT}/screenshot.png", optimize=True)
print(f"docs/screenshot.png  {W * 2}x{H * 2}")
