"""Contact sheet of captured frames (frames.sh), to look through a series at once.
  sheet.py DIR OUT.png [COLUMNS] [WIDTH] [X Y W H]   frames scaled to WIDTH, optionally a crop first
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

frames = sorted(p for p in Path(sys.argv[1]).glob("*.png") if not p.name.startswith("."))
out = sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
width = int(sys.argv[4]) if len(sys.argv) > 4 else 320
crop = tuple(map(int, sys.argv[5:9])) if len(sys.argv) > 8 else None
if not frames:
    raise SystemExit("no frames")
# names: <index>_<seconds from the start of the series> (frames.sh)
t0 = float(frames[0].stem.split("_", 1)[1])
tiles = []
for p in frames:
    img = Image.open(p).convert("RGB")
    if crop:
        x, y, w, h = crop
        img = img.crop((x, y, x + w, y + h))
    img = img.resize((width, round(img.height * width / img.width)))
    ImageDraw.Draw(img).text((4, 4), f"{p.stem.split('_')[0]} +{float(p.stem.split('_', 1)[1]) - t0:.2f}s", fill=(255, 255, 0))
    tiles.append(img)
h = tiles[0].height
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (cols * width, rows * h))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * width, (i // cols) * h))
sheet.save(out)
print(out, len(tiles), "frames")
