"""Compose a scene the way the canvas renderer will, straight from world.ts.

A dev tool: it exists to catch actors standing in mid-air or scaled wrong
before the game is even running in a browser.
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "public", "assets")
FONT = "/usr/share/fonts/carlito/Carlito-Bold.ttf"

src = open(os.path.join(ROOT, "game", "world.ts")).read()


def carriables():
    """Props that live in game state, not in the scene table."""
    block = src[src.index("export const CARRIABLES"):]
    block = block[:block.index("};")]
    out = []
    for m in re.finditer(r'(\w+): \{ anim: "([^"]+)", scene: "(\w+)", x: (\d+), y: (\d+) \}', block):
        out.append({"id": m.group(1), "anim": m.group(2), "scene": m.group(3),
                    "x": float(m.group(4)), "y": float(m.group(5))})
    return out


def scene_blocks():
    """Split SCENES into per-scene source chunks."""
    body = src[src.index("export const SCENES"):]
    out = {}
    for m in re.finditer(r"\n  (\w+): \{\n(.*?)\n  \},\n", body, re.S):
        out[m.group(1)] = m.group(2)
    return out


def num_list(block, key):
    m = re.search(rf"{key}: \{{([^}}]*)\}}", block)
    if not m:
        return {}
    return {k: float(v) for k, v in re.findall(r"(\w+): (-?[\d.]+)", m.group(1))}


def top_level_objects(body):
    """Yield the source of each brace-balanced object at depth 1."""
    depth, start = 0, None
    for i, ch in enumerate(body):
        if ch == "{":
            if depth == 0:
                start = i + 1
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                yield body[start:i]
                start = None


def entries(block, key):
    """Pull one array literal out of the block by matching brackets."""
    m = re.search(rf"{key}: \[", block)
    if not m:
        return []
    i = m.end()
    depth = 1
    while i < len(block) and depth:
        if block[i] == "[":
            depth += 1
        elif block[i] == "]":
            depth -= 1
        i += 1
    body = block[m.end():i - 1]
    out = []
    for txt in top_level_objects(body):
        # drop nested objects (an exit's `landing`) so their keys don't shadow
        txt = re.sub(r"\w+:\s*\{[^{}]*\}", "", txt)
        d = {}
        for k, v in re.findall(r'(\w+):\s*"([^"]*)"', txt):
            d[k] = v
        for k, v in re.findall(r"(\w+):\s*(-?[\d.]+)", txt):
            d[k] = float(v)
        for k, v in re.findall(r"(\w+):\s*(true|false)", txt):
            d[k] = v == "true"
        out.append(d)
    return out


def depth_scale(floor, y, char_scale):
    t = max(0.0, min(1.0, (y - floor["top"]) / max(1.0, floor["bottom"] - floor["top"])))
    return (0.86 + 0.14 * t) * char_scale


def main():
    manifest = json.load(open(f"{ASSETS}/sprites.json"))
    atlas = Image.open(f"{ASSETS}/sprites.png").convert("RGBA")
    blocks = scene_blocks()
    want = sys.argv[1:] or list(blocks)
    out_dir = os.environ.get("PREVIEW_OUT", "/tmp")
    f = ImageFont.truetype(FONT, 11)

    for name in want:
        block = blocks[name]
        bg_name = re.search(r'bg: "(\w+)"', block).group(1)
        floor = num_list(block, "floor")
        char_scale = float(re.search(r"charScale: ([\d.]+)", block).group(1))
        im = Image.open(f"{ASSETS}/bg/{bg_name}.png").convert("RGBA")
        d = ImageDraw.Draw(im)

        # floor band
        d.rectangle([floor["left"], floor["top"], floor["right"], floor["bottom"]],
                    outline=(0, 255, 120, 90))

        # one stand-in sprite per pose, so slot heights can be eyeballed
        POSE_SAMPLE = {"sit": "oldman.sit", "kneel": "intern.kneel",
                       "stand": "stranger.lean", "low": "cat.idle"}
        items = []
        for p in entries(block, "props"):
            items.append((p["y"], p["anim"], p["x"], p["y"], p.get("flip", False), 0, "prop"))
        for c in carriables():
            if c["scene"] == name:
                items.append((c["y"], c["anim"], c["x"], c["y"], False, 0, c["id"]))
        for sl in entries(block, "slots"):
            items.append((sl["y"], POSE_SAMPLE[sl["pose"]], sl["x"], sl["y"],
                          sl.get("flip", False), sl.get("lift", 0), sl["id"] + ":" + sl["pose"]))
        # the player, dropped in the middle of the band
        px = floor["left"] + (floor["right"] - floor["left"]) * 0.28
        py = floor["bottom"] - 4
        items.append((py, "mc.idle_mop", px, py, False, 0, "player"))

        for _, key, x, y, flip, lift, label in sorted(items):
            fr = manifest["anims"][key]["frames"][0]
            s = round(depth_scale(floor, y, char_scale) * 20) / 20
            w, h = round(fr["w"] * s), round(fr["h"] * s)
            sp = atlas.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"])).resize((w, h), Image.LANCZOS)
            if flip:
                sp = sp.transpose(Image.FLIP_LEFT_RIGHT)
            ax = fr["ax"] * s
            ay = fr["ay"] * s
            dx = round(x - (w - ax if flip else ax))
            dy = round(y - ay - lift)
            im.alpha_composite(sp, (dx, dy))
            d.line([(x - 5, y), (x + 5, y)], fill=(255, 80, 80, 200))
            d.text((dx, dy - 11), label, font=f, fill=(255, 220, 120))

        for h in entries(block, "hotspots"):
            d.rectangle([h["x"], h["y"], h["x"] + h["w"], h["y"] + h["h"]], outline=(120, 180, 255, 160))
            d.text((h["x"] + 2, h["y"] - 11), h.get("label", ""), font=f, fill=(120, 180, 255))
        for e in entries(block, "exits"):
            d.rectangle([e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]], outline=(255, 140, 60, 160))
            d.text((e["x"] + 2, e["y"] - 11), e.get("label", ""), font=f, fill=(255, 160, 80))

        path = f"{out_dir}/scene_{name}.png"
        im.convert("RGB").resize((im.width * 2, im.height * 2), Image.NEAREST).save(path)
        print(path)


if __name__ == "__main__":
    main()
