#!/usr/bin/env bash
# Save the Dune test VM's screen as PNG (QMP screendump; works whatever window is in front).
#   shot.sh [out.png]     default runtime/shot.png (input.sh reads the screen size from it)
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(realpath -m "${1:-${vm_dir}/runtime/shot.png}")"
"${vm_dir}/harness/qmp.sh" screendump "{\"filename\":\"${out}\",\"format\":\"png\"}" > /dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do [[ -s "${out}" ]] && break; sleep 0.2; done
echo "${out}"
