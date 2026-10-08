// ---- effects (src/emperor/effects.ts; Rules.txt ExplosionType / TurretMuzzleFlash, ArtIni.txt Xaf):
// EmpFxTab[type]: 0 the model where it dies, 1 where it fires (at its "weapon" attachment), 2 where
// its bullet hits. An effect model plays its one animation as Death: DestroyEffect right away.
function EmpFxData takes nothing returns nothing
    set EmpFxTab = InitHashtable()
{{fxLines}}
endfunction

function EmpFxDeath takes nothing returns nothing
    local unit u = GetTriggerUnit()
    local integer t = GetUnitTypeId(u)
    if HaveSavedString(EmpFxTab, t, 0) then
        call DestroyEffect(AddSpecialEffect(LoadStr(EmpFxTab, t, 0), GetUnitX(u), GetUnitY(u)))
    endif
    set u = null
endfunction

// an attack starts: the attacker's muzzle flash
function EmpFxFire takes nothing returns nothing
    local unit u = GetAttacker()
    local integer t = GetUnitTypeId(u)
    if HaveSavedString(EmpFxTab, t, 1) then
        call DestroyEffect(AddSpecialEffectTarget(LoadStr(EmpFxTab, t, 1), u, "weapon"))
    endif
    set u = null
endfunction

// damage dealt: the shooter's bullet explodes on the target
function EmpFxHit takes nothing returns nothing
    local unit s = GetEventDamageSource()
    local unit u = GetTriggerUnit()
    if s != null and HaveSavedString(EmpFxTab, GetUnitTypeId(s), 2) then
        call DestroyEffect(AddSpecialEffect(LoadStr(EmpFxTab, GetUnitTypeId(s), 2), GetUnitX(u), GetUnitY(u)))
    endif
    set s = null
    set u = null
endfunction

function EmpFxInit takes nothing returns nothing
    local trigger die = CreateTrigger()
    local trigger fire = CreateTrigger()
    local trigger hit = CreateTrigger()
    local integer i = 0
    call EmpFxData()
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(die, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        call TriggerRegisterPlayerUnitEvent(fire, Player(i), EVENT_PLAYER_UNIT_ATTACKED, null)
        call TriggerRegisterPlayerUnitEvent(hit, Player(i), EVENT_PLAYER_UNIT_DAMAGED, null)
        set i = i + 1
    endloop
    call TriggerRegisterPlayerUnitEvent(die, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH, null)
    call TriggerAddAction(die, function EmpFxDeath)
    call TriggerAddAction(fire, function EmpFxFire)
    call TriggerAddAction(hit, function EmpFxHit)
    set die = null
    set fire = null
    set hit = null
endfunction
