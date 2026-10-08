#!/usr/bin/env bash
# Watch a region of the Dune test VM's screen for a long time (the message strip over a whole match:
# storm warnings, "wall lost", ...): a capture every INTERVAL seconds, kept only when the region
# changed, as <index>_<unix time>.png of the region. Slow (a second per capture), for passive runs;
# frames.sh is the fast one for effects.
#   watch.sh DIR SECONDS INTERVAL X Y W H
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
dir="$(realpath -m "${1:?usage: watch.sh DIR SECONDS INTERVAL X Y W H}")"
seconds="${2:?}"
interval="${3:?}"
mkdir -p "${dir}"
tmp="${dir}/.frame.ppm"
end=$(( $(date +%s) + ${seconds%.*} ))
n=0
while (( $(date +%s) < end )); do
    "${vm_dir}/harness/qmp.sh" screendump "{\"filename\":\"${tmp}\"}" > /dev/null || true
    stamp=$(date +%s)
    n=$(python3 - "${tmp}" "${dir}" "${n}" "${stamp}" "$4" "$5" "$6" "$7" <<'EOF'
import sys
from pathlib import Path
from PIL import Image
src, out, n, stamp = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
x, y, w, h = map(int, sys.argv[5:9])
part = Image.open(src).convert("RGB").crop((x, y, x + w, y + h))
last = out / ".last.png"
if not last.exists() or Image.open(last).convert("RGB").tobytes() != part.tobytes():
    part.save(out / f"{n:05d}_{stamp}.png")
    part.save(last)
    n += 1
print(n)
EOF
)
    sleep "${interval}"
done
rm -f "${tmp}" "${dir}/.last.png"
echo "${n} frames in ${dir}"
