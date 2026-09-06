"""Bake a 1-bit bitmap font atlas so the game needs no webfont at runtime."""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets")
SRC = "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"
SIZE = 12
THRESH = 118

CHARS = ("!\"#$%&'()*+,-./0123456789:;<=>?@"
         "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`"
         "abcdefghijklmnopqrstuvwxyz{|}~"
         "çğıöşüÇĞİÖŞÜ…—’‘“”·♥←→↑↓▸◂▪▶◤◢◆●■¢°×")

def main():
    f = ImageFont.truetype(SRC, SIZE)
    asc, desc = f.getmetrics()
    line = asc + desc
    glyphs, pad = {}, 1
    tiles = []
    for ch in CHARS:
        w = int(round(f.getlength(ch)))
        im = Image.new("L", (max(w, 1) + 4, line + 4), 0)
        ImageDraw.Draw(im).text((2, 2), ch, font=f, fill=255)
        a = (np.array(im) >= THRESH).astype(np.uint8) * 255
        ys, xs = np.nonzero(a)
        if not len(xs):                      # space and friends
            glyphs[ch] = {"w": 0, "h": 0, "adv": max(w, 3), "ox": 0, "oy": 0, "x": 0, "y": 0}
            tiles.append((ch, None)); continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        tile = Image.fromarray(a[y0:y1, x0:x1])
        glyphs[ch] = {"w": int(x1 - x0), "h": int(y1 - y0), "adv": max(w, 1),
                      "ox": int(x0) - 2, "oy": int(y0) - 2}
        tiles.append((ch, tile))

    # shelf pack into a white-on-transparent atlas (tinted at draw time)
    W = 256
    x = y = rowh = 0
    for ch, t in tiles:
        if t is None: continue
        if x + t.width + pad > W:
            x, y, rowh = 0, y + rowh + pad, 0
        glyphs[ch]["x"], glyphs[ch]["y"] = x, y
        x += t.width + pad
        rowh = max(rowh, t.height)
    H = y + rowh + pad
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for ch, t in tiles:
        if t is None: continue
        g = glyphs[ch]
        rgba = Image.merge("RGBA", (t.point(lambda v: 255), t.point(lambda v: 255),
                                    t.point(lambda v: 255), t))
        atlas.paste(rgba, (g["x"], g["y"]))
    atlas.save(f"{OUT}/font.png", optimize=True)
    glyphs[" "] = {"w": 0, "h": 0, "adv": 4, "ox": 0, "oy": 0, "x": 0, "y": 0}
    blank = [c for c in CHARS if c != " " and glyphs[c]["w"] == 0]
    if blank:
        print(f"  !! {len(blank)} glyph(s) the font does not have: {''.join(blank)}")
    with open(f"{OUT}/font.json", "w") as fp:
        json.dump({"size": SIZE, "lineHeight": line, "ascent": asc, "glyphs": glyphs},
                  fp, separators=(",", ":"))
    print(f"font atlas {atlas.size}, {len(glyphs)} glyphs, line height {line}")

if __name__ == "__main__":
    main()
