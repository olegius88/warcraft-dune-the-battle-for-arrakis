// Model probe: converted Emperor models next to a stock footman (scale reference), all facing east
// (WC3 facing 0 = +x), camera close; the walking unit shows the Walk sequence.
function ModelProbeRun takes nothing returns nothing
    local integer i = 0
    local unit u
    call FogEnableOff()
    call FogMaskEnableOff()
    call CreateUnit(Player(0), 'hfoo', -300.0, -250.0, 0.0)
{{placeLines}}
    set u = CreateUnit(Player(0), '{{walker}}', -400.0, 250.0, 0.0)
    call IssuePointOrder(u, "move", 800.0, 250.0)
    call SetCameraField(CAMERA_FIELD_TARGET_DISTANCE, 1400.0, 0.0)
    call SetCameraField(CAMERA_FIELD_ANGLE_OF_ATTACK, 320.0, 0.0)
    call SetCameraPosition(0.0, 0.0)
    set u = null
endfunction
