#!/usr/bin/env bash
# Mouse and keyboard input to the Dune test VM through QMP input-send-event: virtual USB tablet and
# keyboard events, which Windows takes as real hardware (DirectInput games read them; on the host
# desktop Emperor ignored injected clicks). Coordinates are pixels of the VM screen (screendump).
#   input.sh click X Y          left click (the game cursor walked there, see walk below); keep
#                               targets 30 px off the screen edges, a battle scrolls there
#   input.sh ctrlclick X Y      the same with Ctrl held (Emperor: force fire)
#   input.sh goto X Y           the game cursor there, no click
#   input.sh move X Y           the tablet's absolute position (the Windows cursor)
#   input.sh rel DX DY          one relative mouse step
#   input.sh key esc            QEMU qcode (esc, ret, spc, up, down, left, right, a..z, 0..9, f1..)
set -Eeuo pipefail
vm_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
qmp_path="${vm_dir}/runtime/qmp.sock"
action="${1:?usage: input.sh click X Y | move X Y | key QCODE}"
# the tablet's axes run 0..32767 over the whole screen; screen size from the last mode set
size() { python3 - "$vm_dir" <<'EOF'
import struct, sys
# width/height of runtime/shot.png (IHDR) when present, else the 1280x800 desktop
try:
    data = open(sys.argv[1] + "/runtime/shot.png", "rb").read(24)
    print(*struct.unpack(">II", data[16:24]))
except OSError:
    print(1280, 800)
EOF
}
send() {
    {
        printf '%s\n' '{"execute":"qmp_capabilities"}'
        for event in "$@"; do printf '%s\n' "${event}"; done
        sleep 0.3
    } | socat - "UNIX-CONNECT:${qmp_path}" > /dev/null
}
abs() {
    read -r w h < <(size)
    local x=$(( $1 * 32767 / (w - 1) )) y=$(( $2 * 32767 / (h - 1) ))
    printf '{"execute":"input-send-event","arguments":{"events":[{"type":"abs","data":{"axis":"x","value":%d}},{"type":"abs","data":{"axis":"y","value":%d}}]}}' "$x" "$y"
}
rel() { printf '{"execute":"input-send-event","arguments":{"events":[{"type":"rel","data":{"axis":"x","value":%d}},{"type":"rel","data":{"axis":"y","value":%d}}]}}' "$1" "$2"; }
button() { printf '{"execute":"input-send-event","arguments":{"events":[{"type":"btn","data":{"down":%s,"button":"left"}}]}}' "$1"; }
key() { printf '{"execute":"input-send-event","arguments":{"events":[{"type":"key","data":{"down":%s,"key":{"type":"qcode","data":"%s"}}}]}}' "$2" "$1"; }
# Emperor keeps its own cursor and moves it by the mouse's relative steps only (the tablet's absolute
# position does nothing there): push it into the top left corner, then walk to the point in small
# steps (big ones are accelerated). Screen pixels per step unit, measured on the 1280x800 VM screen
# with the 800x600 menu stretched over it (2026-10-08): GAIN_X 2.35, GAIN_Y 1.98.
GAIN_X="${GAIN_X:-2.35}"
GAIN_Y="${GAIN_Y:-1.98}"
# the battle (another resolution stretched over the screen): a 250 x 43 px walk went 270 x 52
GAME_GAIN_X="${GAME_GAIN_X:-2.54}"
GAME_GAIN_Y="${GAME_GAIN_Y:-2.39}"
walk() {
    local ux uy
    ux=$(python3 -c "print(round($1 / ${GAIN_X}))")
    uy=$(python3 -c "print(round($2 / ${GAIN_Y}))")
    local events=() i
    for i in $(seq 12); do events+=("$(rel -300 -300)"); done
    while (( ux > 0 || uy > 0 )); do
        local sx=$(( ux < 5 ? ux : 5 )) sy=$(( uy < 5 ? uy : 5 ))
        events+=("$(rel "$sx" "$sy")")
        ux=$(( ux - sx )); uy=$(( uy - sy ))
    done
    {
        printf '%s\n' '{"execute":"qmp_capabilities"}'
        for event in "${events[@]}"; do printf '%s\n' "${event}"; sleep 0.02; done
        sleep 0.3
    } | socat - "UNIX-CONNECT:${qmp_path}" > /dev/null
}
# relative steps of at most 5 units from where the cursor is (negative too)
steps() {
    local ux uy
    ux=$(python3 -c "print(round($1 / ${GAIN_X}))")
    uy=$(python3 -c "print(round($2 / ${GAIN_Y}))")
    local events=()
    while (( ux != 0 || uy != 0 )); do
        local sx=$(( ux > 5 ? 5 : (ux < -5 ? -5 : ux) )) sy=$(( uy > 5 ? 5 : (uy < -5 ? -5 : uy) ))
        events+=("$(rel "$sx" "$sy")")
        ux=$(( ux - sx )); uy=$(( uy - sy ))
    done
    (( ${#events[@]} )) || return 0
    {
        printf '%s\n' '{"execute":"qmp_capabilities"}'
        for event in "${events[@]}"; do printf '%s\n' "${event}"; sleep 0.02; done
        sleep 0.3
    } | socat - "UNIX-CONNECT:${qmp_path}" > /dev/null
}
# the walk drifts (some 25 px over 600): find the cursor on the screen (locate.py) and step the rest.
# GAME=1 (a battle): the corner would scroll the map, so the cursor is found anywhere on the screen
# and walked from there. Both templates are tried: the battle and its results draw a smaller arrow.
GAME="${GAME:-0}"
# where the cursor was last seen or sent (runtime/cursor.pos): with units selected the battle shows a
# move / attack cursor that neither template matches, then the walk starts from there, unchecked
pos_file="${vm_dir}/runtime/cursor.pos"
aim() {
    local i found x y score
    [[ "${GAME}" == 1 ]] || walk "$1" "$2"
    for i in 1 2 3 4 5; do
        sleep 0.2
        "${vm_dir}/harness/shot.sh" > /dev/null
        found=$(python3 "${vm_dir}/harness/locate.py" where "${vm_dir}/runtime/shot.png" "${vm_dir}/harness/emperor-cursor.json" "${vm_dir}/harness/emperor-cursor-game.json")
        read -r x y score <<< "${found}"
        if ! python3 -c "import sys; sys.exit(0 if ${score} >= 0.25 else 1)"; then
            # over a unit or a building the arrow turns into a select / attack cursor that neither
            # template matches: lost after it was found means it has arrived
            if (( i == 1 )) && [[ "${GAME}" == 1 && -s "${pos_file}" ]]; then
                read -r x y < "${pos_file}"
                echo "cursor not seen, walking from ${x},${y}" >&2
                GAIN_X="${GAME_GAIN_X}" GAIN_Y="${GAME_GAIN_Y}" steps $(( $1 - x )) $(( $2 - y ))
            elif (( i == 1 )); then
                echo "cursor not found (best ${found})" >&2
                return 1
            fi
            echo "$1 $2" > "${pos_file}"
            return 0
        fi
        echo "${x} ${y}" > "${pos_file}"
        (( x - $1 <= 3 && $1 - x <= 3 && y - $2 <= 3 && $2 - y <= 3 )) && return 0
        if [[ "${GAME}" == 1 ]]; then
            GAIN_X="${GAME_GAIN_X}" GAIN_Y="${GAME_GAIN_Y}" steps $(( $1 - x )) $(( $2 - y ))
        else
            steps $(( $1 - x )) $(( $2 - y ))
        fi
    done
}
case "${action}" in
    move) send "$(abs "$2" "$3")" ;;
    rel) send "$(rel "$2" "$3")" ;;
    goto) aim "$2" "$3" ;;
    click) aim "$2" "$3"; sleep 0.1; send "$(button true)"; sleep 0.08; send "$(button false)" ;;
    rclick) aim "$2" "$3"; sleep 0.1
        send '{"execute":"input-send-event","arguments":{"events":[{"type":"btn","data":{"down":true,"button":"right"}}]}}'; sleep 0.08
        send '{"execute":"input-send-event","arguments":{"events":[{"type":"btn","data":{"down":false,"button":"right"}}]}}' ;;
    ctrlclick) aim "$2" "$3"; sleep 0.1; send "$(key ctrl true)"; sleep 0.05; send "$(button true)"; sleep 0.08; send "$(button false)"; sleep 0.05; send "$(key ctrl false)" ;;
    key) send "$(key "$2" true)"; sleep 0.08; send "$(key "$2" false)" ;;
    *) echo "unknown action ${action}" >&2; exit 2 ;;
esac
echo "${action} ${*:2}"
