"""Draw detected frame boxes + indices onto a downscaled copy of each sheet."""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from probe_frames import boxes

FONT = "/usr/share/fonts/carlito/Carlito-Bold.ttf"
OUT = sys.argv[1]
TARGET_W = 860

for path in sys.argv[2:]:
    im = Image.open(path).convert("RGB")
    bs = boxes(path)
    s = TARGET_W / im.width
    small = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    d = ImageDraw.Draw(small)
    f = ImageFont.truetype(FONT, 30)
    for i, (x, y, w, h) in enumerate(bs):
        r = [x * s, y * s, (x + w) * s, (y + h) * s]
        d.rectangle(r, outline=(0, 255, 100), width=3)
        d.rectangle([r[0], r[1] - 32, r[0] + 40, r[1]], fill=(0, 255, 100))
        d.text((r[0] + 8, r[1] - 34), str(i), font=f, fill=(0, 0, 0))
    name = os.path.basename(path).rsplit(".", 1)[0]
    small.save(f"{OUT}/{name}.png")
    print(f"{OUT}/{name}.png  ({len(bs)} frames)")
