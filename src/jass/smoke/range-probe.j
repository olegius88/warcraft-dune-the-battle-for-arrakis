// Range probe (src/smoke/build-range-probe.ts): does BlzSetUnitWeaponRealField(ATTACK_RANGE) change
// how far a unit shoots in 1.31.1, even though the getter reads 0 (src/jass/smoke/probe.j)?
// Each row: a shooter of player 0 ordered to attack a paused target of player 1 placed beyond its
// base range. When the range grew, the shooter fires from where it stands; otherwise it walks up
// first. Reported after {{wait}} s: how far the shooter moved and the target's life lost.
function RangeProbeLog takes string s returns nothing
    set udg_log[udg_n] = s
    set udg_n = udg_n + 1
    call PreloadGenClear()
    call PreloadGenStart()
    set udg_i = 0
    loop
        exitwhen udg_i >= udg_n
        call Preload(udg_log[udg_i])
        set udg_i = udg_i + 1
    endloop
    call PreloadGenEnd({{str report}})
endfunction

// mode 0: control, 1: setter index 0, 2: setter index 1, 3: both indices
function RangeProbeRow takes integer row, integer mode returns nothing
    local real y = -1500.0 + row * 1000.0
    local unit s = CreateUnit(Player(0), {{shooter}}, -{{real half}}, y, 0.0)
    local unit t = CreateUnit(Player(1), {{target}}, {{real half}}, y, 180.0)
    call PauseUnit(t, true)
    call BlzSetUnitRealField(s, UNIT_RF_ACQUISITION_RANGE, {{real range}})
    if mode == 1 or mode == 3 then
        call BlzSetUnitWeaponRealField(s, UNIT_WEAPON_RF_ATTACK_RANGE, 0, {{real range}})
    endif
    if mode == 2 or mode == 3 then
        call BlzSetUnitWeaponRealField(s, UNIT_WEAPON_RF_ATTACK_RANGE, 1, {{real range}})
    endif
    set udg_s[row] = s
    set udg_t[row] = t
    set udg_x[row] = GetUnitX(s)
    set udg_y[row] = GetUnitY(s)
    set udg_hp[row] = GetWidgetLife(t)
    call IssueTargetOrder(s, "attack", t)
    set s = null
    set t = null
endfunction

function RangeProbeRun takes nothing returns nothing
    local integer row = 0
    local real dx
    local real dy
    call RangeProbeLog("start distance " + R2S(2.0 * {{real half}}) + " set range " + R2S({{real range}}))
    loop
        exitwhen row > 3
        call RangeProbeRow(row, row)
        set row = row + 1
    endloop
    call TriggerSleepAction({{real wait}})
    set row = 0
    loop
        exitwhen row > 3
        set dx = GetUnitX(udg_s[row]) - udg_x[row]
        set dy = GetUnitY(udg_s[row]) - udg_y[row]
        call RangeProbeLog("mode " + I2S(row) + " moved " + R2S(SquareRoot(dx * dx + dy * dy)) + " target lost " + R2S(udg_hp[row] - GetWidgetLife(udg_t[row])))
        set row = row + 1
    endloop
    call RangeProbeLog("done")
endfunction
