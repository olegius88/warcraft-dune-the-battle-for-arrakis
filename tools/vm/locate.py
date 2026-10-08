"""Find Emperor's mouse cursor on a VM screen capture (input.sh corrects its walk with it).

The cursor is a white arrow with a violet rim. A template is the set of its white and violet pixel
offsets from the arrow's tip, taken once from a capture where the tip's position is known:
  locate.py make shot.png TIP_X TIP_Y template.json
  locate.py find shot.png X Y template.json [radius]   -> "x y score" of the best tip near (X, Y)
  locate.py where shot.png template.json...            -> the same, anywhere on the screen
Pillow only (no numpy on the test host): the search is limited to a square around the guess.
"""
from __future__ import annotations

import json
import sys

from PIL import Image

BOX = 40  # template window right/down of the tip


# The arrow is drawn half transparent: its core is near white with a blue tinge (e4f5ff..ffffff) and
# its rim is blue, violet over the orange planet (measured on menu captures, 2026-10-08).
def white(p: tuple[int, int, int]) -> bool:
    # (tinged blue over the blue menu, pink over the sand, greyer over the dark results screen)
    return min(p) > 165 and max(p) - min(p) < 90


def violet(p: tuple[int, int, int]) -> bool:
    return p[2] > 120 and p[2] > p[0] + 40 and not white(p)


def make(shot: str, tx: int, ty: int, out: str) -> None:
    img = Image.open(shot).convert("RGB")
    px = img.load()
    w = [[dx, dy] for dy in range(BOX) for dx in range(BOX) if white(px[tx + dx, ty + dy])]
    v = [[dx, dy] for dy in range(BOX) for dx in range(BOX) if violet(px[tx + dx, ty + dy])]
    json.dump({"white": w, "violet": v}, open(out, "w"))
    print(f"template: {len(w)} white, {len(v)} violet pixels")


def find(shot: str, gx: int, gy: int, template: str, radius: int) -> None:
    t = json.load(open(template))
    img = Image.open(shot).convert("RGB")
    px = img.load()
    width, height = img.size
    # every 2nd violet / white offset is enough to tell the arrow apart and halves the time
    ws = t["white"][::2]
    vs = t["violet"][::2]
    total = len(ws) + len(vs)
    best = (0, gx, gy)
    for y in range(max(0, gy - radius), min(height - BOX, gy + radius)):
        for x in range(max(0, gx - radius), min(width - BOX, gx + radius)):
            score = sum(1 for dx, dy in ws if white(px[x + dx, y + dy]))
            if score < len(ws) // 2:
                continue
            score += sum(1 for dx, dy in vs if violet(px[x + dx, y + dy]))
            if score > best[0]:
                best = (score, x, y)
    print(best[1], best[2], round(best[0] / max(1, total), 2))


def where(shot: str, template: str) -> tuple[int, int, int, float]:
    """The whole screen, no guess: the arrow's core is a clump of near-white pixels, so only the
    top left corners of such clumps are tried (with a small margin), then the best is printed."""
    t = json.load(open(template))
    img = Image.open(shot).convert("RGB")
    width, height = img.size
    raw = img.tobytes()
    # near-white pixels on a 2 px grid, bucketed in 24 px cells
    cells: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for y in range(0, height, 2):
        row = y * width
        for x in range(0, width, 2):
            i = (row + x) * 3
            if white((raw[i], raw[i + 1], raw[i + 2])):
                cells.setdefault((x // 24, y // 24), []).append((x, y))
    # the template's white part starts this far right/down of the tip
    ox = min(dx for dx, _ in t["white"])
    oy = min(dy for _, dy in t["white"])
    px = img.load()
    ws = t["white"][::2]
    vs = t["violet"][::2]
    total = len(ws) + len(vs)
    best = (0, 0, 0)
    for pts in cells.values():
        if len(pts) < 8:
            continue
        cx = min(p[0] for p in pts) - ox
        cy = min(p[1] for p in pts) - oy
        for y in range(max(0, cy - 8), min(height - BOX, cy + 9)):
            for x in range(max(0, cx - 8), min(width - BOX, cx + 9)):
                score = sum(1 for dx, dy in ws if white(px[x + dx, y + dy]))
                if score < len(ws) // 2:
                    continue
                score += sum(1 for dx, dy in vs if violet(px[x + dx, y + dy]))
                if score > best[0]:
                    best = (score, x, y)
    return best[1], best[2], best[0], round(best[0] / max(1, total), 2)


if __name__ == "__main__":
    if sys.argv[1] == "make":
        make(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5])
    elif sys.argv[1] == "find":
        find(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], int(sys.argv[6]) if len(sys.argv) > 6 else 80)
    elif sys.argv[1] == "where":
        # several templates (menu arrow, battle arrow): the best match of any
        x, y, _, score = max((where(sys.argv[2], t) for t in sys.argv[3:]), key=lambda r: r[3])
        print(x, y, score)
    else:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
