#!/usr/bin/env bash
# Place a building that Emperor holds ready (picked from the sidebar): click the candidate points in
# turn until the placement hint at the bottom of the screen is gone. The placement cursor matches no
# template, so the walk to each point is unchecked (input.sh, runtime/cursor.pos): a few candidates
# around a green patch of the grid are needed (2026-10-08: the first placed after 3 misses).
#   place.sh X1 Y1 [X2 Y2 ...]      prints "placed X Y" or "not placed"
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# the hint text is yellow on the dark strip at the bottom of the battlefield
hint() {
    python3 - "${vm_dir}/runtime/shot.png" <<'EOF'
import sys
from PIL import Image
px = Image.open(sys.argv[1]).convert("RGB").crop((30, 690, 940, 770)).load()
print(sum(1 for y in range(0, 80, 2) for x in range(0, 910, 2) if px[x, y][0] > 200 and px[x, y][1] > 170 and px[x, y][2] < 140))
EOF
}
while (( $# >= 2 )); do
    GAME=1 "${vm_dir}/harness/input.sh" click "$1" "$2" > /dev/null 2>&1 || true
    sleep 2
    "${vm_dir}/harness/shot.sh" > /dev/null
    if (( $(hint) < 50 )); then
        echo "placed $1 $2"
        exit 0
    fi
    shift 2
done
echo "not placed"
exit 1
