"""Clean the Ironstead generated pack and map it into the game's asset layout.

Source:  /Users/rabbi/Desktop/ironstead_assets  (read-only, never modified)
Target:  /Users/rabbi/Desktop/Projects/rts/public/assets

Cleanup per file:
  - isolate the largest alpha connected component (drops baked labels, section
    headers, and neighbour bleed from the master sheet)
  - trim to content with a small margin
  - terrain tiles additionally inset to remove the sheet's baked tile border

Units are expanded to 6 identical frames (static idle) so the existing loader
works; real walk-cycle frames can replace them later.
"""
from collections import deque
import glob
import json
import os

import numpy as np
from PIL import Image

SRC = "/Users/rabbi/Desktop/ironstead_assets"
OUT = "/Users/rabbi/Desktop/Projects/rts/public/assets"
ALPHA_MIN = 30
PAD = 6

BUILDINGS = [
    ("buildings/town_center_blue.png", ["tc_blue.png"]),
    ("buildings/town_center_red.png", ["tc_red.png"]),
    ("buildings/house_blue.png", ["house_blue.png"]),
    ("buildings/house_red.png", ["house_red.png"]),
    ("buildings/storage.png", ["storage_blue.png", "storage_red.png"]),
    ("buildings/army_camp.png", ["army_camp_blue.png", "army_camp_red.png"]),
    ("buildings/tower.png", ["tower_blue.png", "tower_red.png"]),
    ("buildings/academy.png", ["academy_blue.png", "academy_red.png"]),
    ("buildings/farm.png", ["farm.png"]),
    ("buildings/wall.png", ["wall.png"]),
    ("buildings/forest.png", ["forest.png"]),
    ("buildings/gold_vein.png", ["gold_vein.png"]),
]

UNITS = [
    ("units/villager_blue.png", "villager", "blue"),
    ("units/villager_red.png", "villager", "red"),
    ("units/swordsman_blue.png", "swordsman", "blue"),
    ("units/swordsman_red.png", "swordsman", "red"),
    ("units/spearman_blue.png", "spearman", "blue"),
    ("units/spearman_red.png", "spearman", "red"),
    ("units/crossbowman_blue.png", "crossbowman", "blue"),
    ("units/crossbowman_red.png", "crossbowman", "red"),
    ("units/horse_rider_blue.png", "horse_rider", "blue"),
    ("units/horse_rider_red.png", "horse_rider", "red"),
    ("units/king_blue.png", "hero", "blue"),
    ("units/queen_red.png", "hero", "red"),
]

UNIT_FRAMES = 6


def components(mask):
    """BFS connected-components. Returns (labels, comps) where comps is a list of
    (id, area, (x0, y0, x1, y1))."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    comps = []
    current = 0
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or labels[y0, x0]:
                continue
            current += 1
            queue = deque([(y0, x0)])
            labels[y0, x0] = current
            area = 0
            minx, miny, maxx, maxy = w, h, 0, 0
            while queue:
                cy, cx = queue.popleft()
                area += 1
                if cx < minx:
                    minx = cx
                if cy < miny:
                    miny = cy
                if cx > maxx:
                    maxx = cx
                if cy > maxy:
                    maxy = cy
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = current
                            queue.append((ny, nx))
            comps.append((current, area, (minx, miny, maxx + 1, maxy + 1)))
    return labels, comps


def _dilate(mask, iterations=1):
    h, w = mask.shape
    out = mask
    for _ in range(iterations):
        p = np.pad(out, 1, constant_values=False)
        out = np.maximum.reduce(
            [
                p[0:h, 0:w], p[0:h, 1 : w + 1], p[0:h, 2 : w + 2],
                p[1 : h + 1, 0:w], p[1 : h + 1, 1 : w + 1], p[1 : h + 1, 2 : w + 2],
                p[2 : h + 2, 0:w], p[2 : h + 2, 1 : w + 1], p[2 : h + 2, 2 : w + 2],
            ]
        )
    return out


def _erode(mask, iterations=1):
    h, w = mask.shape
    out = mask
    for _ in range(iterations):
        p = np.pad(out, 1, constant_values=True)
        out = np.minimum.reduce(
            [
                p[0:h, 0:w], p[0:h, 1 : w + 1], p[0:h, 2 : w + 2],
                p[1 : h + 1, 0:w], p[1 : h + 1, 1 : w + 1], p[1 : h + 1, 2 : w + 2],
                p[2 : h + 2, 0:w], p[2 : h + 2, 1 : w + 1], p[2 : h + 2, 2 : w + 2],
            ]
        )
    return out


def clean(path, inset=0):
    image = Image.open(path).convert("RGBA")
    arr = np.array(image)
    # The source pack zeroed alpha in a grid pattern inside some sprites. Close the
    # alpha mask (dilate then erode) to bridge those internal gaps.
    mask = arr[:, :, 3] > 24
    if not mask.any():
        return image
    mask = _erode(_dilate(mask, 2), 2)

    labels, comps = components(mask)
    main = max(comps, key=lambda c: c[1])
    main_id, main_area, (mx0, my0, mx1, my1) = main

    keep_ids = {main_id}
    for cid, area, (x0, y0, x1, y1) in comps:
        if cid == main_id:
            continue
        height = y1 - y0
        width = x1 - x0
        # drop text glyphs / short specks (labels, section headers)
        if height <= 16 and area <= 900:
            continue
        # drop thin slivers that run off the edge (neighbour bleed)
        touches_border = x0 <= 0 or y0 <= 0 or x1 >= image.width or y1 >= image.height
        if touches_border and min(width, height) <= 22 and area <= 0.4 * main_area:
            continue
        intersects = not (x1 < mx0 or x0 > mx1 or y1 < my0 or y0 > my1)
        if intersects or area >= 0.15 * main_area:
            keep_ids.add(cid)

    keep = np.isin(labels, list(keep_ids))
    out = arr.copy()
    out[:, :, 3] = np.where(keep, 255, 0).astype(np.uint8)
    out[~keep, 0:3] = 0
    out = Image.fromarray(out, "RGBA")

    # crop to the union bbox of every kept component (not just the largest)
    ux0, uy0, ux1, uy1 = image.width, image.height, 0, 0
    for cid, _area, (x0, y0, x1, y1) in comps:
        if cid not in keep_ids:
            continue
        ux0 = min(ux0, x0)
        uy0 = min(uy0, y0)
        ux1 = max(ux1, x1)
        uy1 = max(uy1, y1)

    x0 = max(0, ux0 - PAD)
    y0 = max(0, uy0 - PAD)
    x1 = min(image.width, ux1 + PAD)
    y1 = min(image.height, uy1 + PAD)
    out = out.crop((x0, y0, x1, y1))

    if inset > 0:
        w, h = out.size
        out = out.crop((inset, inset, w - inset, h - inset))
    return out


def main():
    os.makedirs(f"{OUT}/buildings", exist_ok=True)
    os.makedirs(f"{OUT}/units", exist_ok=True)
    manifest = {"buildings": {}, "units": {}, "source": "ironstead_assets"}

    for rel, dests in BUILDINGS:
        src = os.path.join(SRC, rel)
        if not os.path.exists(src):
            print("MISSING", src)
            continue
        img = clean(src)
        for dest in dests:
            img.save(f"{OUT}/buildings/{dest}")
            manifest["buildings"][dest.replace(".png", "")] = [img.width, img.height]
        print(f"building {rel:38s} -> {', '.join(dests):44s} {img.width}x{img.height}")

    for rel, unit, faction in UNITS:
        src = os.path.join(SRC, rel)
        if not os.path.exists(src):
            print("MISSING", src)
            continue
        img = clean(src)
        for i in range(UNIT_FRAMES):
            img.save(f"{OUT}/units/{unit}_{faction}_{i}.png")
        manifest["units"][f"{unit}_{faction}"] = [img.width, img.height]
        print(f"unit     {rel:38s} -> {unit}_{faction}_0..{UNIT_FRAMES - 1}  {img.width}x{img.height}")

    with open(f"{OUT}/manifest.json", "w") as fh:
        json.dump(manifest, fh, indent=2)
    print("CLEAN_DONE")


if __name__ == "__main__":
    main()
