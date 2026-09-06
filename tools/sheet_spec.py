"""Hand-labelled animation map for every source sheet.

`h` is the target on-screen height in game pixels (the game renders at 640x360),
so each animation gets its own scale factor. The source sheets are not drawn at a
consistent scale between poses, which is why the scale is per-animation and not
per-sheet.
"""

MC_H = 104  # janitor standing height, the yardstick for everything else

# The backgrounds were painted at a larger human scale than a first pass at the
# sprites assumed -- measured against door frames and bench seats in the
# corridor art, a 175 cm person wants about 132 px, not 104. Rather than retune
# every number below, the whole table is scaled once on the way out.
GLOBAL_SCALE = 1.27

SHEETS = {
    "sheet/mcMain.png": {
        "prefix": "mc",
        "anims": {
            "idle_mop": {"frames": [0, 1], "h": MC_H, "fps": 2},
            "walk_mop": {"frames": [2, 3, 4, 5], "h": MC_H, "fps": 8},
            "mop":      {"frames": [6, 7, 8], "h": 84, "fps": 6},
        },
    },
    "sheet/mcWalking.png": {
        "prefix": "mc",
        "anims": {
            "idle":      {"frames": [0, 1], "h": MC_H, "fps": 2},
            "walk":      {"frames": [2, 3, 4, 5], "h": MC_H, "fps": 8},
            "walk_back": {"frames": [6, 7], "h": MC_H, "fps": 5},
        },
    },
    "sheet/mcSheets.png": {
        "prefix": "mc",
        "anims": {
            "push":     {"frames": [0, 1, 2], "h": 94, "fps": 6},
            "kick":     {"frames": [3], "h": 96, "fps": 1},
            "reach":    {"frames": [4, 5], "h": 96, "fps": 4},
            "sit_side": {"frames": [6, 7], "h": 66, "fps": 1.5},
        },
    },
    "sheet/mcSitting.png": {
        "prefix": "mc",
        "anims": {
            "sit_front": {"frames": [6, 7], "h": 68, "fps": 1.5},
        },
    },
    "sheet/mcTakingOffClothes.png": {
        "prefix": "mc",
        "anims": {
            "undress": {"frames": [0, 1, 2, 3], "h": MC_H, "fps": 2},
        },
    },
    "sheet/mcNormalClothes.png": {
        "prefix": "civ",
        "anims": {
            "idle":  {"frames": [0, 1], "h": MC_H, "fps": 2},
            "walk":  {"frames": [2, 3, 4, 5], "h": MC_H, "fps": 8},
            "offer": {"frames": [6, 7], "h": MC_H, "fps": 2},
        },
    },
    "sheet/nurseSheet.png": {
        "prefix": "nurse",
        "anims": {
            "idle":  {"frames": [0, 1, 2], "h": 100, "fps": 3},
            "walk":  {"frames": [3, 4, 5], "h": 100, "fps": 7},
            "radio": {"frames": [6, 7], "h": 100, "fps": 3},
        },
    },
    "sheet/nurseWalking.png": {
        "prefix": "nurse",
        "anims": {
            "walk_far": {"frames": [0, 1, 2, 3, 4, 5, 6, 7], "h": 100, "fps": 8},
        },
    },
    "sheet/oldmanSheet.png": {
        "prefix": "oldman",
        "anims": {
            "sit":   {"frames": [0, 1], "h": 64, "fps": 1.2},
            "cough": {"frames": [3, 4], "h": 64, "fps": 5},
            "walk":  {"frames": [5, 6, 7], "h": 96, "fps": 6},
        },
    },
    "sheet/studentNurseSheet.png": {
        "prefix": "intern",
        "anims": {
            "sit":        {"frames": [0, 1], "h": 62, "fps": 1.2},
            "cry":        {"frames": [2], "h": 62, "fps": 1},
            "kneel":      {"frames": [3, 4], "h": 58, "fps": 3},
            "read":       {"frames": [5], "h": 58, "fps": 1},
            "stand_cry":  {"frames": [6, 7], "h": 96, "fps": 3},
        },
    },
    "sheet/strangerSheet.png": {
        "prefix": "stranger",
        "anims": {
            "lean":  {"frames": [0, 1], "h": 100, "fps": 1.4},
            "squat": {"frames": [2, 3], "h": 64, "fps": 1.2},
            "deal":  {"frames": [4, 5, 6], "h": 100, "fps": 4},
        },
    },
    "sheet/fatherSheet.png": {
        "prefix": "father",
        "anims": {
            "despair": {"frames": [0, 1], "h": 70, "fps": 1.4},
            "sit":     {"frames": [2, 3], "h": 70, "fps": 1.2},
            "look":    {"frames": [4, 5], "h": 70, "fps": 2},
        },
    },
    "furniture.png": {
        "prefix": "prop",
        "anims": {
            "vending":    {"frames": [0], "h": 108, "fps": 1},
            "cart":       {"frames": [1], "h": 62, "fps": 1},
            "wet_sign":   {"frames": [2], "h": 36, "fps": 1},
            "oxygen":     {"frames": [3], "h": 70, "fps": 1},
            "chair":      {"frames": [4], "h": 48, "fps": 1},
        },
    },
    "cat.png": {
        "prefix": "cat",
        "anims": {
            # a sitting cat is about a fifth of a standing adult
            "idle": {"frames": [0], "h": 21, "fps": 1, "subcrop": (0.0, 0.0, 0.66, 1.0)},
            "pipe": {"frames": [0], "h": 34, "fps": 1},
        },
    },
}

# 1:1 dialogue portraits (no magenta key needed, they are full-bleed art)
PORTRAITS = {
    "characters/father.png": "father",
    "characters/nurse.png": "nurse",
    "characters/oldman.png": "oldman",
    "characters/stranger.png": "stranger",
    "characters/studentNurse.png": "intern",
}

BACKGROUNDS = {
    "background/hospitalInside.jpg": "corridor",
    "background/hospitalFireout.png": "fire_exit",
    "background/hospitalOutside.png": "outside",
    "background/mcRoom.png": "locker_room",
}
