// Morph probe (src/smoke/build-morph-probe.ts): can a unit switch to a type with a longer attack range
// through a Chaos-based ability ({{morph}}, Cha1 = {{veteran}}) and stay the same unit for the scripts
// (veterancy ExtraRange, src/jass/mission/veterancy.j)? Yes: answered 2026-10-08, the morph is used there.
// Row 0: control shooter. Row 1: the same shooter with max life / base damage / armour changed and a
// hashtable entry under its handle id, then morphed. Logged right after the morph: handle id, type,
// the hashtable entry, life, max life, damage, armour, selection; after {{wait}} s: how far each
// shooter walked towards its paused target {{distance}} away and the life the target lost.
function MorphProbeLog takes string s returns nothing
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

function B2S takes boolean b returns string
    if b then
        return "true"
    endif
    return "false"
endfunction

function MorphProbeState takes string what, unit u returns nothing
    call MorphProbeLog(what + ": handle " + I2S(GetHandleId(u)) + " type " + I2S(GetUnitTypeId(u)) + " saved " + I2S(LoadInteger(udg_tab, GetHandleId(u), 0)) + " life " + R2S(GetWidgetLife(u)) + " max " + I2S(BlzGetUnitMaxHP(u)) + " damage " + I2S(BlzGetUnitBaseDamage(u, 0)) + " armour " + R2S(BlzGetUnitArmor(u)) + " in group " + B2S(IsUnitInGroup(u, udg_g)) + " speed " + R2S(GetUnitMoveSpeed(u)) + " regen " + R2S(BlzGetUnitRealField(u, UNIT_RF_HIT_POINTS_REGENERATION_RATE)) + " Apiv " + I2S(GetUnitAbilityLevel(u, 'Apiv')) + " selected " + B2S(IsUnitSelected(u, Player(0))))
endfunction

function MorphProbeRow takes integer row returns nothing
    local real y = -1000.0 + row * 1500.0
    local unit s = CreateUnit(Player(0), {{shooter}}, -{{real half}}, y, 0.0)
    local unit t = CreateUnit(Player(1), {{target}}, {{real half}}, y, 180.0)
    call PauseUnit(t, true)
    set udg_s[row] = s
    set udg_t[row] = t
    if row == 1 then
        call SaveInteger(udg_tab, GetHandleId(s), 0, 42)
        call GroupAddUnit(udg_g, s)
        call BlzSetUnitMaxHP(s, 777)
        call SetWidgetLife(s, 500.0)
        call BlzSetUnitBaseDamage(s, 55, 0)
        call BlzSetUnitArmor(s, 9.0)
        call SetUnitMoveSpeed(s, 150.0)
        call BlzSetUnitRealField(s, UNIT_RF_HIT_POINTS_REGENERATION_RATE, 5.0)
        call UnitAddAbility(s, 'Apiv')
        call SelectUnit(s, true)
        call MorphProbeState("before", s)
        call UnitAddAbility(s, {{morph}})
        call MorphProbeState("after", s)
        call MorphProbeLog("same unit variable: " + B2S(udg_s[row] == s) + " type id veteran " + I2S({{veteran}}))
    endif
    set udg_x[row] = GetUnitX(s)
    set udg_y[row] = GetUnitY(s)
    set udg_hp[row] = GetWidgetLife(t)
    call IssueTargetOrder(s, "attack", t)
    set s = null
    set t = null
endfunction

function MorphProbeRun takes nothing returns nothing
    local integer row = 0
    local real dx
    local real dy
    set udg_tab = InitHashtable()
    set udg_g = CreateGroup()
    call MorphProbeLog("start distance " + R2S(2.0 * {{real half}}))
    loop
        exitwhen row > 1
        call MorphProbeRow(row)
        set row = row + 1
    endloop
    // the stock Chaos of the grunt, as a check that the morph itself works by adding the ability
    set udg_s[2] = CreateUnit(Player(0), 'ogru', -{{real half}}, 1500.0, 0.0)
    call UnitAddAbility(udg_s[2], 'Sca1')
    call MorphProbeState("grunt after", udg_s[2])
    call TriggerSleepAction(0.0)
    call MorphProbeState("next frame", udg_s[1])
    call TriggerSleepAction(1.0)
    call MorphProbeState("1 s later", udg_s[1])
    call MorphProbeState("grunt 1 s later", udg_s[2])
    call MorphProbeLog("has morph " + I2S(GetUnitAbilityLevel(udg_s[1], {{morph}})))
    call UnitRemoveAbility(udg_s[1], {{morph}})
    call TriggerSleepAction(0.5)
    call MorphProbeState("removed", udg_s[1])
    call TriggerSleepAction({{real wait}})
    set row = 0
    loop
        exitwhen row > 1
        set dx = GetUnitX(udg_s[row]) - udg_x[row]
        set dy = GetUnitY(udg_s[row]) - udg_y[row]
        call MorphProbeLog("row " + I2S(row) + " moved " + R2S(SquareRoot(dx * dx + dy * dy)) + " target lost " + R2S(udg_hp[row] - GetWidgetLife(udg_t[row])))
        set row = row + 1
    endloop
    call MorphProbeState("end", udg_s[1])
    call MorphProbeLog("done")
endfunction
