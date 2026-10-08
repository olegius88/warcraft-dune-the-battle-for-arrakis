#!/usr/bin/env bash
# Capture the Dune test VM's screen as a series of frames (QMP screendump), for effects and for what
# the game announces over a match. One QMP session writes raw PPM frames at a fixed interval (some 10
# a second are possible; a separate session per frame took a second each); afterwards they become PNG
# named <index>_<seconds from the start>, and a frame whose region did not change is dropped.
#   frames.sh DIR SECONDS INTERVAL [X Y W H]    region defaults to the whole screen
# e.g. frames.sh runtime/fx 8 0.1              an explosion
#      frames.sh runtime/msg 900 2 0 0 640 40   the message strip for 15 minutes
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
dir="$(realpath -m "${1:?usage: frames.sh DIR SECONDS INTERVAL [X Y W H]}")"
seconds="${2:?}"
interval="${3:?}"
mkdir -p "${dir}/raw"
count=$(python3 -c "print(max(1, round(${seconds} / ${interval})))")
{
    printf '%s\n' '{"execute":"qmp_capabilities"}'
    for i in $(seq -f '%06g' 1 "${count}"); do
        printf '{"execute":"screendump","arguments":{"filename":"%s/raw/%s.ppm"}}\n' "${dir}" "${i}"
        sleep "${interval}"
    done
    sleep 1
} | socat - "UNIX-CONNECT:${vm_dir}/runtime/qmp.sock" > /dev/null
python3 - "${dir}" "${interval}" "${4:-}" "${5:-}" "${6:-}" "${7:-}" <<'EOF'
import sys
from pathlib import Path
from PIL import Image
out, interval = Path(sys.argv[1]), float(sys.argv[2])
crop = tuple(int(v) for v in sys.argv[3:7]) if sys.argv[6] else None
last, kept = None, 0
for i, p in enumerate(sorted((out / "raw").glob("*.ppm"))):
    img = Image.open(p).convert("RGB")
    part = img.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3])) if crop else img
    data = part.tobytes()
    if data != last:
        (part if crop else img).save(out / f"{kept:05d}_{i * interval:.2f}.png")
        kept += 1
        last = data
    p.unlink()
(out / "raw").rmdir()
print(kept, "frames in", out)
EOF
