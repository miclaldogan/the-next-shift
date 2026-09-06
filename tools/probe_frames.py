"""Detect sprite frames in magenta-keyed sheets via connected components."""
import sys, glob
import numpy as np
from PIL import Image
from scipy import ndimage

def mask_of(path):
    a = np.array(Image.open(path).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ~((r > 200) & (g < 60) & (b > 200))

def boxes(path, min_area_frac=0.0015, dilate=6):
    m = mask_of(path)
    # bridge small gaps (a limb separated from body by keyed pixels)
    grown = ndimage.binary_dilation(m, np.ones((dilate, dilate), bool))
    lab, n = ndimage.label(grown)
    out = []
    total = m.size
    for sl in ndimage.find_objects(lab):
        y, x = sl
        h, w = y.stop - y.start, x.stop - x.start
        if h * w < total * min_area_frac:
            continue
        sub = m[sl]
        ys, xs = np.nonzero(sub)          # tighten to real pixels
        out.append((x.start + xs.min(), y.start + ys.min(),
                    xs.max() - xs.min() + 1, ys.max() - ys.min() + 1))
    # reading order: rows then columns
    if out:
        hs = sorted(b[3] for b in out)
        rowtol = hs[len(hs)//2] * 0.5
        out.sort(key=lambda b: (round(b[1] / max(rowtol, 1)), b[0]))
    return out

if __name__ == "__main__":
    for f in sorted(sys.argv[1:]):
        bs = boxes(f)
        print(f"\n{f}  ->  {len(bs)} frames")
        for i, (x, y, w, h) in enumerate(bs):
            print(f"   [{i:2d}] x={x:5d} y={y:5d} w={w:4d} h={h:4d}")
