#!/usr/bin/env bash
# Send one QMP command to the Dune test VM and print the answer.
#   qmp.sh query-status
#   qmp.sh screendump '{"filename":"/abs/path/shot.png","format":"png"}'   - the VM screen
#   qmp.sh system_powerdown
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
qmp_path="${vm_dir}/runtime/qmp.sock"
command="${1:-query-status}"
arguments="${2:-}"
if [[ ! -S "${qmp_path}" ]]; then
    echo "QMP socket does not exist: ${qmp_path}" >&2
    exit 1
fi
{
    printf '%s\n' '{"execute":"qmp_capabilities"}'
    if [[ -n "${arguments}" ]]; then
        printf '{"execute":"%s","arguments":%s}\n' "${command}" "${arguments}"
    else
        printf '{"execute":"%s"}\n' "${command}"
    fi
    sleep 1
} | socat - "UNIX-CONNECT:${qmp_path}"
