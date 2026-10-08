#!/usr/bin/env bash
# Boot the Dune test VM (Windows 11, QEMU/KVM) on the test host, in the background.
# Writes stay in dune.qcow2 (the games are installed there once). WinRM is forwarded to
# 127.0.0.1:55986 and the screen to VNC 127.0.0.1:5906; both only on the host loopback.
# No GPU: Windows draws with WARP (software), enough for the probes and captures.
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="${vm_dir}/runtime"
pid_path="${runtime}/qemu.pid"
qmp_path="${runtime}/qmp.sock"
mkdir -p "${runtime}" "${vm_dir}/payload"
if [[ -s "${pid_path}" ]] && kill -0 "$(<"${pid_path}")" 2>/dev/null; then
    echo "VM already running (PID $(<"${pid_path}"))" >&2
    exit 1
fi
rm -f "${pid_path}" "${qmp_path}"
exec qemu-system-x86_64 \
    -name "Dune test VM" \
    -machine q35,accel=kvm -cpu host -smp 4,sockets=1,cores=4,threads=1 -m 8192 \
    -rtc base=localtime,clock=host \
    -drive "if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd" \
    -drive "if=pflash,format=raw,file=${vm_dir}/OVMF_VARS_4M.fd" \
    -drive "if=none,id=system,format=qcow2,cache=writeback,file=${vm_dir}/dune.qcow2" \
    -device ide-hd,drive=system,bus=ide.0 \
    -device qemu-xhci,id=xhci \
    -device usb-tablet \
    -netdev user,id=net0,hostfwd=tcp:127.0.0.1:55986-:5985 \
    -device e1000e,netdev=net0,mac=52:54:00:44:55:4e \
    -audiodev none,id=snd0 -device ich9-intel-hda -device hda-output,audiodev=snd0 \
    -vga std -vnc 127.0.0.1:6 \
    -qmp "unix:${qmp_path},server=on,wait=off" \
    -pidfile "${pid_path}" -D "${runtime}/qemu.log" \
    -daemonize
