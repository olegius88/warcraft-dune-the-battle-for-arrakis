// ---- the NIAB tank teleports (Rules.txt NiabTank: GUNIABTank; Game.exe 1.09 class 0x15, 0x56ecb0) ----
// Game.exe: deploy (animation 0x18), then a move order to a point the owner has revealed (0x56ebe0; no
// distance limit): Enter Portal, it is put at the nearest free place by the point (0x598b80), Exit
// Portal, then it sleeps TeleportSleepTime ticks (state 0x29) unable to move, fire or deploy. Here one
// point-target button does the whole: the deploy and the portal animations' time (the model's, units.ts
// teleporters) and the sleep, unable to act (paused). EmpTeleTab[type]: 0 time before it goes, 1 time
// after, 2 = a teleporter; [button] 3 = 1.
// TODO(units): Game.exe's tile check wants the per-player map state 3 at the target (0x56ebe0, meaning
// "revealed" assumed: here the owner's explored ground); it can also teleport with a deploy and a
// separate move order, the port's button joins them. Risk: a target Emperor would refuse.
// Feature test: test/emperor-mission.test.ts "NIAB".
function EmpTeleData takes nothing returns nothing
    set EmpTeleTab = InitHashtable()
{{teleLines}}
endfunction

function EmpTeleWake takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local unit u = LoadUnitHandle(EmpTeleTab, GetHandleId(tm), 0)
    call FlushChildHashtable(EmpTeleTab, GetHandleId(tm))
    call DestroyTimer(tm)
    if EmpAlive(u) then
        call BlzPauseUnitEx(u, false)
    endif
    set tm = null
    set u = null
endfunction

function EmpTeleJump takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer k = GetHandleId(tm)
    local unit u = LoadUnitHandle(EmpTeleTab, k, 0)
    if EmpAlive(u) then
        call SetUnitPosition(u, LoadReal(EmpTeleTab, k, 1), LoadReal(EmpTeleTab, k, 2))
        call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.bomb.id}}', {{ART_ABILITY.bomb.type}}, 0), GetUnitX(u), GetUnitY(u)))
        call TimerStart(tm, LoadReal(EmpTeleTab, EmpType(u), 1), false, function EmpTeleWake)
    else
        call FlushChildHashtable(EmpTeleTab, k)
        call DestroyTimer(tm)
    endif
    set tm = null
    set u = null
endfunction

function EmpTeleCast takes nothing returns nothing
    local unit u = GetTriggerUnit()
    local real x = GetSpellTargetX()
    local real y = GetSpellTargetY()
    local timer tm
    if LoadInteger(EmpTeleTab, GetSpellAbilityId(), 3) == 1 and LoadBoolean(EmpTeleTab, EmpType(u), 2) then
        if IsMaskedToPlayer(x, y, GetOwningPlayer(u)) then
            if GetOwningPlayer(u) == Player(0) then
                call EmpShow({{str RT.TELEPORT_UNSEEN}})
            endif
        else
            call BlzPauseUnitEx(u, true)
            call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.bomb.id}}', {{ART_ABILITY.bomb.type}}, 0), GetUnitX(u), GetUnitY(u)))
            set tm = CreateTimer()
            call SaveUnitHandle(EmpTeleTab, GetHandleId(tm), 0, u)
            call SaveReal(EmpTeleTab, GetHandleId(tm), 1, x)
            call SaveReal(EmpTeleTab, GetHandleId(tm), 2, y)
            call TimerStart(tm, LoadReal(EmpTeleTab, EmpType(u), 0), false, function EmpTeleJump)
            set tm = null
        endif
    endif
    set u = null
endfunction

function EmpTeleInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpTeleData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_SPELL_EFFECT, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpTeleCast)
    set tr = null
endfunction
