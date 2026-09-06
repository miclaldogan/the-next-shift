"""Compose the README / write-up frames.

Not mock-ups: every frame uses the shipped atlas, the shipped backgrounds, the
baked bitmap font and the same grade the canvas renderer applies -- warm point
lights, rain, vignette, film grain, scanlines -- so the pictures show what the
game draws. Layout constants mirror game/hud.ts.
"""
import json, os, math
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
portraits = {n: Image.open(f"{A}/portraits/{n}.png").convert("RGB")
             for n in ("oldman", "intern", "father", "nurse", "stranger")}

INK = (233, 229, 214, 255)
DIM = (154, 163, 154, 255)
GOLD = (232, 196, 106, 255)
EDGE = (61, 74, 65, 255)

SCENES = {
    "corridor":    dict(floor=(274, 348), scale=1.00,
                        lights=[(72, 60, 96, .55), (400, 58, 96, .5), (590, 60, 96, .5), (160, 170, 46, .35)]),
    "fire_exit":   dict(floor=(220, 266), scale=1.00, rain=True,
                        lights=[(86, 42, 70, .5), (372, 128, 40, .3), (478, 128, 34, .28)]),
    "outside":     dict(floor=(220, 256), scale=0.84, rain=True,
                        lights=[(166, 60, 110, .6), (560, 128, 90, .45)]),
    "locker_room": dict(floor=(300, 350), scale=1.42,
                        lights=[(500, 60, 120, .7), (500, 160, 60, .4)]),
}


def depth(scene, y):
    top, bot = SCENES[scene]["floor"]
    t = max(0.0, min(1.0, (y - top) / (bot - top)))
    return (0.86 + 0.14 * t) * SCENES[scene]["scale"]


def put(dst, scene, key, frame, x, y, lift=0, flip=False):
    f = man["anims"][key]["frames"][frame % len(man["anims"][key]["frames"])]
    s = round(depth(scene, y) * 20) / 20
    w, h = round(f["w"] * s), round(f["h"] * s)
    sp = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])).resize((w, h), Image.LANCZOS)
    if flip:
        sp = sp.transpose(Image.FLIP_LEFT_RIGHT)
    ax, ay = f["ax"] * s, f["ay"] * s
    dst.alpha_composite(sp, (round(x - (w - ax if flip else ax)), round(y - ay - lift)))


def width(s):
    return sum((glyphs.get(c) or glyphs[" "])["adv"] for c in s)


def text(dst, s, x, y, colour):
    tint = Image.new("RGBA", fontimg.size, colour)
    tint.putalpha(fontimg.getchannel("A"))
    cx = int(x)
    for ch in s:
        g = glyphs.get(ch) or glyphs[" "]
        if g["w"]:
            dst.alpha_composite(tint.crop((g["x"], g["y"], g["x"] + g["w"], g["y"] + g["h"])),
                                (cx + g["ox"], int(y) + g["oy"]))
        cx += g["adv"]


def wrap(s, maxw):
    out, line = [], ""
    for word in s.split(" "):
        probe = f"{line} {word}".strip()
        if width(probe) > maxw and line:
            out.append(line); line = word
        else:
            line = probe
    out.append(line)
    return out


def blend(im, box, rgba):
    """Translucent fill. PIL's RGBA draw mode does not actually blend here, so
    the rectangle is composited as its own layer."""
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rectangle(box, fill=rgba)
    im.alpha_composite(layer)


def panel(im_or_d, x, y, w, h, im=None):
    target = im if im is not None else im_or_d
    blend(target, [x, y, x + w, y + h], (8, 11, 10, 230))
    d = ImageDraw.Draw(target, "RGBA")
    d.rectangle([x, y, x + w, y + h], outline=EDGE)
    d.line([(x + 1, y + 1), (x + w - 1, y + 1)], fill=(233, 229, 214, 26))


def bar(d, x, y, w, v, colour):
    d.rectangle([x, y, x + w, y + 4], fill=(0, 0, 0, 140))
    d.rectangle([x, y, x + round(w * v), y + 4], fill=colour)
    d.rectangle([x, y, x + w, y + 4], outline=(233, 229, 214, 56))


def hud(im, clock, coins, fed, tired, mood, strip=None, strip_icon="▪"):
    d = ImageDraw.Draw(im, "RGBA")
    top, ph = 6, 65
    panel(im, 6, top, 176, ph)
    text(im, clock, 14, top + 6, INK)
    c = f"{coins}¢"
    text(im, c, 6 + 176 - 12 - width(c), top + 6, GOLD)
    rows = [("FED", fed, (127, 168, 106, 255)), ("TIRED", tired, (176, 138, 74, 255)),
            ("MOOD", mood, (111, 150, 176, 255) if mood < .7 else (143, 191, 122, 255))]
    for i, (label, v, col) in enumerate(rows):
        y = top + 23 + i * 13
        text(im, label, 14, y, DIM)
        bar(d, 58, y + 4, 112, v, col)
    if strip:
        y = top + ph + 4
        panel(im, 6, y, width(strip) + 24, 16)
        text(im, strip_icon, 13, y + 4, GOLD)
        text(im, strip, 24, y + 4, INK if strip_icon == "▸" else (200, 205, 190, 255))


def speech(im, name, portrait, line, bottom=354):
    d = ImageDraw.Draw(im, "RGBA")
    y = bottom - 80
    panel(im, 6, y, W - 12, 80)
    tx = 14
    if portrait:
        p = portraits[portrait].resize((58, 58), Image.LANCZOS)
        im.paste(p, (12, y + 11))
        d.rectangle([12, y + 11, 12 + 57, y + 11 + 57], outline=EDGE)
        tx = 80
    ty = y + 11
    if name:
        text(im, name, tx, ty, GOLD); ty += 15
    for l in wrap(line, W - tx - 22):
        text(im, l, tx, ty, INK); ty += 14


def choices(im, header, options, selected=0):
    d = ImageDraw.Draw(im, "RGBA")
    n = len(options)
    h = 24 + n * 16 + 6
    y = H - h - 6
    panel(im, 6, y, W - 12, h)
    blend(im, [7, y + 1, 6 + W - 13, y + 18], (232, 196, 106, 20))
    text(im, header, 15, y + 5, GOLD)
    for i, (label, hint) in enumerate(options):
        oy = y + 22 + i * 16
        if i == selected:
            blend(im, [7, oy - 3, 6 + W - 13, oy + 13], (232, 196, 106, 38))
            text(im, "▸", 14, oy, GOLD)
        text(im, label, 26, oy, INK if i == selected else DIM)
        if hint:
            text(im, hint, 6 + W - 12 - 10 - width(hint), oy, GOLD)
    return y


def beacon(im, x, y):
    for r, a in ((22, 22), (14, 30), (7, 42)):
        layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse([x - r, y + 6 - r, x + r, y + 6 + r], fill=(232, 196, 106, a))
        im.alpha_composite(layer)
    ImageDraw.Draw(im, "RGBA").polygon([(x - 5, y - 5), (x + 5, y - 5), (x, y + 2)], fill=GOLD)


def spill(im, x, y, w=26):
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([x - w, y - w * .34, x + w, y + w * .34], fill=(18, 48, 58, 150))
    ld.ellipse([x - w * .65, y - w * .2, x - w * .1, y - w * .02], fill=(159, 216, 230, 60))
    im.alpha_composite(layer)


def grade(im, scene, rain=False, mood=0.7):
    arr = np.array(im).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    for lx, ly, r, s in SCENES[scene]["lights"]:
        dd = np.sqrt((xx - lx) ** 2 + (yy - ly) ** 2) / r
        fall = np.clip(1 - dd, 0, 1) ** 2
        for c, tint in enumerate((255, 220, 150)):
            arr[..., c] += fall * s * tint * 0.28
    if rain:
        rng = np.random.default_rng(11)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        for _ in range(230):
            x, y = rng.integers(-40, W), rng.integers(0, H)
            ln = rng.integers(5, 16)
            ld.line([(x, y), (x + 2, y + ln)], fill=(186, 206, 220, 90))
        top, bot = SCENES[scene]["floor"]
        for _ in range(26):
            x = rng.integers(0, W); y = rng.integers(bot - 6, min(H, bot + 40)); r = rng.integers(3, 9)
            ld.ellipse([x - r, y - r * .3, x + r, y + r * .3], outline=(200, 220, 235, 70))
        arr = np.array(Image.alpha_composite(
            Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA"), layer)).astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    arr[..., :3] *= np.clip(1 - 0.62 * np.clip((r - 0.34) / 0.9, 0, 1), 0, 1)[..., None]
    if mood < 0.5:
        k = (0.5 - mood) * 2
        grey = arr[..., :3].mean(axis=2, keepdims=True)
        arr[..., :3] = arr[..., :3] * (1 - 0.5 * k) + grey * (0.5 * k)
        arr[..., :3] *= 1 - 0.25 * k
    rng = np.random.default_rng(7)
    arr[..., :3] += (rng.random((H, W, 1)) - 0.5) * 13
    arr[1::2, :, :3] *= 0.86
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def bg(scene):
    return Image.open(f"{A}/bg/{scene}.png").convert("RGBA")


def save(im, name):
    os.makedirs(OUT, exist_ok=True)
    im.convert("RGB").resize((W * 2, H * 2), Image.NEAREST).save(f"{OUT}/{name}.png", optimize=True)
    print(f"  docs/{name}.png")


# --------------------------------------------------------------- the shots --

def shot_corridor():
    im = bg("corridor")
    spill(im, 222, 325)
    put(im, "corridor", "prop.wet_sign", 0, 92, 344)
    put(im, "corridor", "oldman.sit", 0, 388, 276, lift=16)
    put(im, "corridor", "intern.kneel", 0, 470, 338)
    put(im, "corridor", "mc.idle_mop", 0, 286, 330)
    im = grade(im, "corridor")
    hud(im, "04:12", 23, .54, .61, .72, "Corridor B — mop 2 spills  1/2")
    save(im, "corridor")


def shot_choice():
    im = bg("corridor")
    put(im, "corridor", "oldman.sit", 0, 388, 276, lift=16)
    put(im, "corridor", "mc.idle_mop", 0, 330, 322)
    im = grade(im, "corridor")
    hud(im, "02:41", 21, .62, .24, .48)
    y = choices(im, "HE HASN'T ASKED YOU FOR ANYTHING.", [
        ("Put eight coins in his hand. Don't explain.", "-8¢"),
        ("Tell the desk there's a man loitering.", "+3¢"),
        ("Nod. Keep mopping.", None),
    ])
    speech(im, "the old man", "oldman",
           "It's fine. The pharmacy opens at nine. I'll sit until nine.", bottom=y - 4)
    save(im, "choice")


def shot_fire_escape():
    im = bg("fire_exit")
    put(im, "fire_exit", "prop.cart", 0, 232, 262)
    put(im, "fire_exit", "cat.idle", 0, 312, 264)
    put(im, "fire_exit", "stranger.lean", 0, 392, 258, flip=True)
    put(im, "fire_exit", "mc.walk_mop", 2, 196, 254)
    im = grade(im, "fire_exit", rain=True)
    hud(im, "03:26", 21, .41, .55, .44, "Check the fire landing")
    save(im, "fire-escape")


def shot_street():
    im = bg("outside")
    put(im, "outside", "oldman.sit", 0, 52, 252, lift=12)
    put(im, "outside", "mc.idle_mop", 1, 214, 250)
    im = grade(im, "outside", rain=True, mood=0.28)
    hud(im, "04:47", 13, .22, .78, .26)
    save(im, "street")


def shot_locker_room():
    im = bg("locker_room")
    put(im, "locker_room", "civ.idle", 0, 300, 336)
    im = grade(im, "locker_room")
    hud(im, "06:00", 26, .30, .88, .74, "Look in the mirror", strip_icon="▸")
    beacon(im, 414, 260)
    save(im, "locker-room")


def shot_title():
    im = Image.new("RGBA", (W, H), (5, 7, 10, 255))
    t = "THE NEXT SHIFT"
    tw = width(t)
    for dx, col in ((-2, (74, 160, 192, 40)), (2, (192, 90, 74, 40))):
        text(im, t, (W - tw) / 2 + dx, 74, col)
    text(im, t, (W - tw) / 2, 74, INK)
    sub = "a night at St. Mercy"
    text(im, sub, (W - width(sub)) / 2, 94, DIM)
    line = "shift #7 · 14 coins were left for you"
    text(im, line, (W - width(line)) / 2, 128, GOLD)

    head = "THE SHIFTS BEFORE YOURS"
    text(im, head, 106, 158, (93, 106, 93, 255))
    ImageDraw.Draw(im, "RGBA").rectangle([106, 172, W - 106, 172], fill=EDGE)
    rows = [("#7", "left 14", '"Machine eats coins on the second try."'),
            ("#6", "left  9", '"Don\'t wake the girl in 4."'),
            ("#5", "left 21", '"The cat is real. Feed it."'),
            ("#4", "left  0", "—")]
    y = 180
    for n, left, quote in rows:
        text(im, n, 106, y, DIM)
        text(im, left, 140, y, GOLD if left != "left  0" else (92, 101, 92, 255))
        text(im, quote, 198, y, (125, 138, 125, 255))
        y += 13
    press = "PRESS ENTER"
    text(im, press, (W - width(press)) / 2, 266, INK)
    hint = "WASD / arrows to move · E to interact · SPACE to mop · ↑↓ to choose"
    text(im, hint, (W - width(hint)) / 2, 330, (77, 88, 80, 255))
    arr = np.array(im).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    arr[..., :3] *= np.clip(1 - 0.5 * np.clip((r - 0.4) / 0.9, 0, 1), 0, 1)[..., None]
    arr[1::2, :, :3] *= 0.88
    save(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA"), "title")


if __name__ == "__main__":
    shot_title()
    shot_corridor()
    shot_choice()
    shot_fire_escape()
    shot_street()
    shot_locker_room()
