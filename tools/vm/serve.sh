#!/usr/bin/env bash
# Serve the game archives (games/*.tar) and probe maps (payload/) to the VM over HTTP, on the host
# loopback only (127.0.0.1:8770; QEMU user networking shows the host to the VM as 10.0.2.2).
#   serve.sh start | stop
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
pid_path="${vm_dir}/runtime/http.pid"
case "${1:-start}" in
    start)
        if [[ -s "${pid_path}" ]] && kill -0 "$(<"${pid_path}")" 2>/dev/null; then
            echo "already serving (PID $(<"${pid_path}"))"
            exit 0
        fi
        nohup python3 -m http.server 8770 --bind 127.0.0.1 --directory "${vm_dir}" > "${vm_dir}/runtime/http.log" 2>&1 &
        echo $! > "${pid_path}"
        echo "serving ${vm_dir} on 127.0.0.1:8770 (PID $!)"
        ;;
    stop)
        if [[ -s "${pid_path}" ]]; then kill "$(<"${pid_path}")" 2>/dev/null || true; rm -f "${pid_path}"; fi
        echo stopped
        ;;
esac
