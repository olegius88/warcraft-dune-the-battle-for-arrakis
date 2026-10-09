// ---- attack damage by Emperor warhead (Rules.txt [<warhead>]: percentage per armour class) ----
// The WC3 combat table is neutral (units.ts combatTable): an attack is scaled here by the attacker's
// warhead percentage for the target's armour (data mission.ts: EmpDmgTab, the type's armour index at
// child {{RT.DMG_ARMOUR_KEY}}, its weapon's percentages from child {{RT.DMG_PCT_KEY}} + index). Only
// attacks (DAMAGE_TYPE_NORMAL): super weapons set the life themselves (helpers.j EmpSwDamage).
function EmpDmgData takes nothing returns nothing
    set EmpDmgTab = InitHashtable()
{{dmgLines}}
endfunction

function EmpDmgHit takes nothing returns nothing
    local unit s = GetEventDamageSource()
    local integer a
    local integer t
    if s != null and BlzGetEventDamageType() == DAMAGE_TYPE_NORMAL then
        // the attacker's own WC3 type first: a deployed copy (deploy.j) fires another turret than its
        // Emperor type; veteran copies have no entry and fall back to it
        set t = GetUnitTypeId(s)
        if not HaveSavedInteger(EmpDmgTab, t, {{RT.DMG_PCT_KEY}} + 1) then
            set t = EmpType(s)
        endif
        set a = LoadInteger(EmpDmgTab, EmpType(GetTriggerUnit()), {{RT.DMG_ARMOUR_KEY}})
        if a > 0 and HaveSavedInteger(EmpDmgTab, t, {{RT.DMG_PCT_KEY}} + a) then
            call BlzSetEventDamage(GetEventDamage() * LoadInteger(EmpDmgTab, t, {{RT.DMG_PCT_KEY}} + a) / 100.0)
        endif
    endif
    set s = null
endfunction

function EmpDmgInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpDmgData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_DAMAGING, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpDmgHit)
    set tr = null
endfunction
