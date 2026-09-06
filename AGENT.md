# AGENT INSTRUCTIONS: ASSET CROPPING & PROCESSING

This guide provides step-by-step instructions for scanning visual assets under `/home/misa/the-next-shift/`, clearing magenta backgrounds, slicing sprite sheets, and preparing them for the game engine.

---

## 1. Directory Structure & File Analysis

Current directory structure:

```text
/the-next-shift/
├── background/
│   ├── hospitalFireout.png  (Fire escape exterior)
│   ├── hospitalInside.jpg   (Main hospital corridor)
│   ├── hospitalOutside.png  (Rainy street outside hospital)
│   └── mcRoom.png           (Janitor locker room / Final scene)
├── characters/
│   ├── father.png           (Desperate father outside OR - 1:1 Portrait)
│   ├── nurse.png            (Authoritarian Head Nurse - 1:1 Portrait)
│   ├── oldman.png           (Elderly man with prescription - 1:1 Portrait)
│   ├── stranger.png         (Suspicious guy on fire escape - 1:1 Portrait)
│   └── studentNurse.png     (Crying intern doctor - 1:1 Portrait)
├── sheet/
│   ├── fatherSheet.png      (Father sitting/grieving animations)
│   ├── mcMain.png           (Janitor in overalls: idle, walk, mop)
│   ├── mcNormalClothes.png  (Janitor in civilian jacket/beanie)
│   ├── mcSheets.png         (Janitor push, kick, sit animations)
│   ├── mcSitting.png        (Janitor sitting in mid-air poses)
│   ├── mcTakingOffClothes.png (Janitor removing overalls sequence)
│   ├── mcWalking.png        (Janitor empty-handed walk)
│   ├── nurseSheet.png       (Head Nurse standing/walkie-talkie)
│   ├── nurseWalking.png     (Head Nurse walking animation)
│   ├── oldmanSheet.png      (Elderly man sit/cough/walk)
│   ├── strangerSheet.png    (Shady guy leaning/sitting)
│   └── studentNurseSheet.png (Intern sitting/picking up papers)
├── cat.png                  (Wet stray cat standalone image)
└── furniture.png            (Vending machine, wet floor sign, cleaning cart, oxygen tank, chair)
```

---

## 2. Agent Tasks (Automation Backlog)

### Task A: Background Cleanup (Magenta Alpha Keying)

Convert the pink/magenta (`#FF00FF` / RGB: `[255, 0, 255]`) backgrounds in sheets and props to full transparency (Alpha 0):

* **Threshold:** Some pixels might not be pure `#FF00FF` (e.g., RGB: R > 230, G < 30, B > 230). Convert all pixels within this range to `RGBA(0,0,0,0)`.
* **Halo Prevention:** Apply a light edge-defringe to clean up residual 1-pixel pink artifacts around character borders.

### Task B: Sprite Sheet Slicing & Metadata (JSON Export)

Calculate automatic coordinates or extract grid-based slices for each character and sheet:

1. `furniture.png`:
   * `vending_machine.png` (Vending Machine)
   * `wet_floor_sign.png` (Yellow warning sign)
   * `cleaning_cart.png` (Janitor cleaning cart)
   * `oxygen_tank.png` (Oxygen tank)
   * `folding_chair.png` (Folding metal chair)
2. `cat.png`:
   * Separate the pipe from the background or isolate the cat and save it as `cat_idle.png`.
3. Character Sheets:
   * Separate each sheet by rows/frames as `mc_walk_0.png`, `mc_walk_1.png` etc., or generate a `sprites.json` file providing direct Canvas `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` coordinates.

### Task C: Python Automation Script Example

Sample slicing and cleanup script for the agent to execute:

```python
from PIL import Image
import numpy as np

def remove_magenta_and_crop(image_path, output_path):
    img = Image.open(image_path).convert("RGBA")
    data = np.array(img)
    r, g, b, a = data.T
    # Target magenta color range
    magenta_areas = (r > 210) & (g < 45) & (b > 210)
    data[..., 3][magenta_areas.T] = 0
    clean_img = Image.fromarray(data)
    clean_img.save(output_path)
```
