// ---- effects (src/emperor/effects.ts; Rules.txt ExplosionType / TurretMuzzleFlash, ArtIni.txt Xaf):
// EmpFxTab[type]: 0 the model where it dies, 1 where it fires (at its "weapon" attachment), 2 where
// its bullet hits; 10 + those: the scale it is shown at (config EFFECT_MAX_RADIUS); 21 where the
// muzzle flash goes if not "weapon" (a converted model without one, config MUZZLE_FALLBACK). An effect model
// plays its one animation as Death: DestroyEffect right away.
function EmpFxData takes nothing returns nothing
    set EmpFxTab = InitHashtable()
{{fxLines}}
endfunction

// effect k of type t made e: shown at its scale, played once
function EmpFxPlay takes effect e, integer t, integer k returns nothing
    if HaveSavedReal(EmpFxTab, t, 10 + k) then
        call BlzSetSpecialEffectScale(e, LoadReal(EmpFxTab, t, 10 + k))
    endif
    call DestroyEffect(e)
endfunction

function EmpFxDeath takes nothing returns nothing
    local unit u = GetTriggerUnit()
    local integer t = GetUnitTypeId(u)
    if HaveSavedString(EmpFxTab, t, 0) then
        call EmpFxPlay(AddSpecialEffect(LoadStr(EmpFxTab, t, 0), GetUnitX(u), GetUnitY(u)), t, 0)
    endif
    set u = null
endfunction

// an attack starts: the attacker's muzzle flash
function EmpFxFire takes nothing returns nothing
    local unit u = GetAttacker()
    local integer t = GetUnitTypeId(u)
    local string at = "weapon"
    if HaveSavedString(EmpFxTab, t, 21) then
        set at = LoadStr(EmpFxTab, t, 21)
    endif
    if HaveSavedString(EmpFxTab, t, 1) then
        call EmpFxPlay(AddSpecialEffectTarget(LoadStr(EmpFxTab, t, 1), u, at), t, 1)
    endif
    set u = null
endfunction

// damage dealt: the shooter's bullet explodes on the target
function EmpFxHit takes nothing returns nothing
    local unit s = GetEventDamageSource()
    local unit u = GetTriggerUnit()
    if s != null and HaveSavedString(EmpFxTab, GetUnitTypeId(s), 2) then
        call EmpFxPlay(AddSpecialEffect(LoadStr(EmpFxTab, GetUnitTypeId(s), 2), GetUnitX(u), GetUnitY(u)), GetUnitTypeId(s), 2)
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
    // neutral hostile (the worm) too, for all three (sixth audit: only its deaths were registered)
    call TriggerRegisterPlayerUnitEvent(die, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH, null)
    call TriggerRegisterPlayerUnitEvent(fire, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_ATTACKED, null)
    call TriggerRegisterPlayerUnitEvent(hit, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DAMAGED, null)
    call TriggerAddAction(die, function EmpFxDeath)
    call TriggerAddAction(fire, function EmpFxFire)
    call TriggerAddAction(hit, function EmpFxHit)
    set die = null
    set fire = null
    set hit = null
endfunction
