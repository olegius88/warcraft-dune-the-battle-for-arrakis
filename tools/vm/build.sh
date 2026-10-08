#!/usr/bin/env bash
# Build one Emperor structure from the sidebar: order it (click its cell), wait for the "Готово"
# label on that cell, pick it up and place it at the first candidate point that takes it (place.sh).
#   build.sh CELL_X CELL_Y [WAIT_S] -- X1 Y1 [X2 Y2 ...]
# The cell is the icon centre on the 1280x800 screen; the label is near-white text over its top.
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cx="$1"; cy="$2"; shift 2
wait_s=180
if [[ "$1" != "--" ]]; then wait_s="$1"; shift; fi
shift
ready() {
    python3 - "${vm_dir}/runtime/shot.png" "${cx}" "${cy}" <<'EOF'
import sys
from PIL import Image
px = Image.open(sys.argv[1]).convert("RGB").load()
cx, cy = int(sys.argv[2]), int(sys.argv[3])
print(sum(1 for x in range(cx - 35, cx + 40, 3) for y in range(cy - 26, cy - 6, 3) if px[x, y][0] > 200 and px[x, y][1] > 200))
EOF
}
GAME=1 "${vm_dir}/harness/input.sh" click "${cx}" "${cy}" > /dev/null 2>&1 || true
start=$(date +%s)
while (( $(date +%s) - start < wait_s )); do
    sleep 3
    "${vm_dir}/harness/shot.sh" > /dev/null
    if (( $(ready) > 15 )); then
        echo "ready after $(( $(date +%s) - start )) s"
        GAME=1 "${vm_dir}/harness/input.sh" click "${cx}" "${cy}" > /dev/null 2>&1 || true
        sleep 1
        exec "${vm_dir}/harness/place.sh" "$@"
    fi
done
echo "not ready after ${wait_s} s"
exit 1
