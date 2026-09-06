"""Asset pipeline: magenta key -> defringe -> per-animation rescale -> atlas + manifest.

Run: python3 tools/build_assets.py
Outputs: public/assets/sprites.png, public/assets/sprites.json,
         public/assets/bg/*.png, public/assets/portraits/*.png
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_frames import boxes
from sheet_spec import SHEETS, PORTRAITS, BACKGROUNDS, GLOBAL_SCALE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets")
GAME_W, GAME_H = 640, 360
PORTRAIT_PX = 96          # dialogue portrait box, drawn at 1x in game space
ATLAS_PAD = 2


# ---------------------------------------------------------------- keying ----
KEY = np.array([238.0, 12.0, 239.0])          # the sheets' actual magenta
KEY_SPREAD = float(min(KEY[0], KEY[2]) - KEY[1])


def key_magenta(path):
    """Chroma-key the magenta backing out, recovering fractional alpha.

    Every sheet is art composited over flat magenta, and the artist painted
    translucent things (mop water, rain, cloth edges) straight onto it. A hard
    threshold either keeps those as bright pink or eats them whole, so instead
    solve the compositing equation: a pixel is `a` of the real colour F over
    `1-a` of the key K. Magenta excess -- how far red and blue run ahead of
    green -- gives `a`, then F falls out by un-mixing K back off.
    """
    rgb = np.array(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    excess = np.minimum(r, b) - g
    alpha = np.clip(1.0 - excess / KEY_SPREAD, 0.0, 1.0)
    # Colours that lean magenta but are far off the key hue (warm skin, rust)
    # must not be punched through, so only trust the estimate where r ~= b.
    hue_ok = np.clip(1.0 - np.abs(r - b) / 110.0, 0.0, 1.0)
    alpha = 1.0 - (1.0 - alpha) * hue_ok

    a3 = alpha[..., None]
    fg = np.where(a3 > 0.02, (rgb - (1.0 - a3) * KEY) / np.maximum(a3, 0.02), 0.0)
    fg = np.clip(fg, 0, 255)

    alpha = np.where(alpha < 0.06, 0.0, alpha)
    # drop specks the key leaves floating in the empty parts of the sheet
    lab, n = ndimage.label(alpha > 0.25)
    if n:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        tiny = np.isin(lab, 1 + np.flatnonzero(sizes < 24))
        alpha[tiny] = 0.0

    return np.dstack([fg, alpha * 255.0])


def resize_rgba(rgba, w, h):
    """Downscale in premultiplied space so transparent pixels never bleed colour."""
    a = rgba[..., 3:4] / 255.0
    pm = np.dstack([rgba[..., :3] * a, rgba[..., 3:4]])
    im = Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGBA")
    im = im.resize((max(1, w), max(1, h)), Image.LANCZOS)
    arr = np.array(im).astype(np.float32)
    a2 = np.maximum(arr[..., 3:4] / 255.0, 1e-4)
    arr[..., :3] = np.clip(arr[..., :3] / a2, 0, 255)
    arr[..., 3] = np.where(arr[..., 3] < 8, 0, arr[..., 3])   # kill dust
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def tight(im):
    """Crop to the real pixels, return (image, dx, dy)."""
    a = np.array(im)[..., 3]
    ys, xs = np.nonzero(a > 6)
    if not len(xs):
        return im, 0, 0
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return im.crop((int(x0), int(y0), int(x1), int(y1))), int(x0), int(y0)


def align_anchors(frames, anchors, sx=12, sy=6):
    """Cancel the crop wobble inside an animation.

    Every frame is detected and cropped independently, so a moving arm changes
    the bounding box and therefore the anchor -- and the body appears to slide
    left and right as the loop plays. Stamp each frame at its own anchor, find
    the whole-pixel shift that best overlays it on the first frame, and fold
    that shift back into the anchor.
    """
    if len(frames) < 2:
        return anchors
    W = max(f.width for f in frames) + 2 * sx + 4
    H = max(f.height for f in frames) + 2 * sy + 4
    cx, cy = W // 2, H - sy - 2

    def stamp(f, ax, ay):
        m = np.zeros((H, W), bool)
        a = np.array(f)[..., 3] > 40
        x0, y0 = int(round(cx - ax)), int(round(cy - ay))
        x1, y1 = x0 + f.width, y0 + f.height
        if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
            return None
        m[y0:y1, x0:x1] = a
        return m

    ref = stamp(frames[0], *anchors[0])
    if ref is None:
        return anchors
    out = [anchors[0]]
    for f, (ax, ay) in zip(frames[1:], anchors[1:]):
        m = stamp(f, ax, ay)
        if m is None:
            out.append((ax, ay))
            continue
        best, score = (0, 0), -1
        for dy in range(-sy, sy + 1):
            rolled_y = np.roll(m, dy, axis=0)
            for dx in range(-sx, sx + 1):
                v = int(np.logical_and(ref, np.roll(rolled_y, dx, axis=1)).sum())
                if v > score:
                    score, best = v, (dx, dy)
        out.append((ax - best[0], ay - best[1]))
    return out


def feet_anchor(im):
    """Anchor = horizontal centroid of the bottom slab, on the bottom edge."""
    a = np.array(im)[..., 3] > 40
    h = a.shape[0]
    slab = a[int(h * 0.88):]
    if not slab.any():
        slab, = (a,)
    xs = np.nonzero(slab.any(axis=0))[0]
    return (float(xs.mean()) if len(xs) else a.shape[1] / 2.0), float(h)


# ------------------------------------------------------------ atlas pack ----
class Shelf:
    def __init__(self, width=1024):
        self.w, self.x, self.y, self.rowh, self.placed = width, 0, 0, 0, []

    def add(self, im):
        w, h = im.size
        if self.x + w + ATLAS_PAD > self.w:
            self.x, self.y, self.rowh = 0, self.y + self.rowh + ATLAS_PAD, 0
        pos = (self.x, self.y)
        self.placed.append((im, pos))
        self.x += w + ATLAS_PAD
        self.rowh = max(self.rowh, h)
        return pos

    def render(self):
        h = self.y + self.rowh + ATLAS_PAD
        canvas = Image.new("RGBA", (self.w, h), (0, 0, 0, 0))
        for im, pos in self.placed:
            canvas.paste(im, pos)
        return canvas


# ------------------------------------------------------------------ main ----
def main():
    os.makedirs(f"{OUT}/bg", exist_ok=True)
    os.makedirs(f"{OUT}/portraits", exist_ok=True)

    shelf = Shelf(1024)
    manifest = {"atlas": "sprites.png", "gameSize": [GAME_W, GAME_H], "anims": {}}

    for path, spec in SHEETS.items():
        src = os.path.join(ROOT, path)
        rgba = key_magenta(src)
        bs = boxes(src)
        prefix = spec["prefix"]
        print(f"{path}: {len(bs)} frames detected")

        for anim, cfg in spec["anims"].items():
            idxs = cfg["frames"]
            crops = []
            for i in idxs:
                x, y, w, h = bs[i]
                sub = rgba[y:y + h, x:x + w]
                if "subcrop" in cfg:
                    fx0, fy0, fx1, fy1 = cfg["subcrop"]
                    sub = sub[int(h * fy0):int(h * fy1), int(w * fx0):int(w * fx1)]
                crops.append(Image.fromarray(np.clip(sub, 0, 255).astype(np.uint8), "RGBA"))
            crops = [tight(c)[0] for c in crops]

            ref = float(np.median([c.height for c in crops]))
            scale = (cfg["h"] * GLOBAL_SCALE) / ref

            smalls, raw_anchors = [], []
            for c in crops:
                small = resize_rgba(np.array(c).astype(np.float32),
                                    round(c.width * scale), round(c.height * scale))
                small, _, _ = tight(small)
                smalls.append(small)
                raw_anchors.append(feet_anchor(small))

            fixed = align_anchors(smalls, raw_anchors)
            drift = max((abs(a[0] - b[0]) for a, b in zip(raw_anchors, fixed)), default=0)
            if drift >= 2:
                print(f"    {prefix}.{anim}: corrected {drift:.0f}px of frame wobble")

            frames = []
            for small, (ax, ay) in zip(smalls, fixed):
                px, py = shelf.add(small)
                frames.append({"x": px, "y": py, "w": small.width, "h": small.height,
                               "ax": round(ax, 1), "ay": round(ay, 1)})

            manifest["anims"][f"{prefix}.{anim}"] = {"fps": cfg["fps"], "frames": frames}

    atlas = shelf.render()
    atlas.save(f"{OUT}/sprites.png", optimize=True)
    manifest["atlasSize"] = list(atlas.size)
    with open(f"{OUT}/sprites.json", "w") as f:
        json.dump(manifest, f, separators=(",", ":"))
    print(f"\natlas {atlas.size}  ->  {len(manifest['anims'])} animations")

    for path, name in BACKGROUNDS.items():
        im = Image.open(os.path.join(ROOT, path)).convert("RGB")
        # cover-fit 640x360
        s = max(GAME_W / im.width, GAME_H / im.height)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        left = (im.width - GAME_W) // 2
        top = (im.height - GAME_H) // 2
        im.crop((left, top, left + GAME_W, top + GAME_H)).save(f"{OUT}/bg/{name}.png", optimize=True)
        print(f"bg/{name}.png")

    for path, name in PORTRAITS.items():
        im = Image.open(os.path.join(ROOT, path)).convert("RGB")
        side = min(im.size)
        left = (im.width - side) // 2
        im = im.crop((left, 0, left + side, side)).resize((PORTRAIT_PX * 2, PORTRAIT_PX * 2), Image.LANCZOS)
        im.save(f"{OUT}/portraits/{name}.png", optimize=True)
        print(f"portraits/{name}.png")


if __name__ == "__main__":
    main()
