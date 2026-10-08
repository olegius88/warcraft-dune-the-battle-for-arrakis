// ---- spice mounds (Rules.txt [SpiceMound], the map's SpiceMound tag): a mound bursts after Size + up
// to Cost ticks, or when it is destroyed, into a spice field of SpiceCapacity, and grows again on the
// same spot after MinRange..MaxRange ticks. One timer per spot; EmpMoundTab[timer]: 0 the mound,
// 1/2 x / y, 3 what is next (0 burst, 1 grow); EmpMoundTab[mound]: 0 its timer.
// TODO(mounds): the bloom is one field (a WC3 mine) at the mound, not spice spread over BlastRadius
// tiles: harvesters gather it from one spot. Risk: looks and plays more compact than in Emperor.
function EmpMoundTimer takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer h = GetHandleId(tm)
    local unit u = LoadUnitHandle(EmpMoundTab, h, 0)
    local real x = LoadReal(EmpMoundTab, h, 1)
    local real y = LoadReal(EmpMoundTab, h, 2)
    local unit f
    if LoadInteger(EmpMoundTab, h, 3) == 0 then
        if u != null then
            call RemoveSavedHandle(EmpMoundTab, GetHandleId(u), 0)
            if GetUnitTypeId(u) != 0 then
                call RemoveUnit(u)
            endif
        endif
        call RemoveSavedHandle(EmpMoundTab, h, 0)
        call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.spiceBloom.id}}', {{ART_ABILITY.spiceBloom.type}}, 0), x, y))
        set f = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '{{spiceField}}', x, y, {{FACING}})
        call SetResourceAmount(f, {{mound.capacity}})
        call SaveInteger(EmpMoundTab, h, 3, 1)
        call TimerStart(tm, GetRandomReal({{real regrowMin}}, {{real regrowMax}}), false, function EmpMoundTimer)
    else
        set u = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '{{spiceMound}}', x, y, {{FACING}})
        call SaveUnitHandle(EmpMoundTab, h, 0, u)
        call SaveTimerHandle(EmpMoundTab, GetHandleId(u), 0, tm)
        call SaveInteger(EmpMoundTab, h, 3, 0)
        call TimerStart(tm, GetRandomReal({{real burstMin}}, {{real burstMax}}), false, function EmpMoundTimer)
    endif
    set tm = null
    set u = null
    set f = null
endfunction

// a mound on (x, y): it grows at once
function EmpMoundAdd takes real x, real y returns nothing
    local timer tm = CreateTimer()
    call SaveReal(EmpMoundTab, GetHandleId(tm), 1, x)
    call SaveReal(EmpMoundTab, GetHandleId(tm), 2, y)
    call SaveInteger(EmpMoundTab, GetHandleId(tm), 3, 1)
    call TimerStart(tm, 0.0, false, function EmpMoundTimer)
    set tm = null
endfunction

// a mound destroyed by fire bursts at once
function EmpMoundDeath takes nothing returns nothing
    local unit u = GetTriggerUnit()
    if GetUnitTypeId(u) == '{{spiceMound}}' and HaveSavedHandle(EmpMoundTab, GetHandleId(u), 0) then
        call TimerStart(LoadTimerHandle(EmpMoundTab, GetHandleId(u), 0), 0.0, false, function EmpMoundTimer)
    endif
    set u = null
endfunction

// ---- spice fields: one gold-mine-like field per spice cluster of the map ----
function EmpSpiceFields takes nothing returns nothing
    local unit m
    local trigger tr = CreateTrigger()
{{fieldLines}}
    set EmpMoundTab = InitHashtable()
    call TriggerRegisterPlayerUnitEvent(tr, Player(PLAYER_NEUTRAL_PASSIVE), EVENT_PLAYER_UNIT_DEATH, null)
    call TriggerAddAction(tr, function EmpMoundDeath)
{{moundLines}}
    set m = null
    set tr = null
endfunction
