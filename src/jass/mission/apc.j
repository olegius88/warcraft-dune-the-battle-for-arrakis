// ---- APCs (Rules.txt APC: ATAPC, ORAPC, IMAPC; Game.exe 1.09 class 0xf) ----
// Five infantry ride an APC (units.ts: cargo hold, Load, Unload; only infantry fits). Inside they are
// hidden and do not fire, as in WC3; when the APC dies they die with it (Game.exe: a passenger whose
// APC is gone is deleted, 0x560fde). WC3 drops a dead transport's cargo before the death event (probe
// --apc, 2026-10-09: all six alive), so each APC's passengers are kept in a group that a tick
// prunes of those no longer inside (EmpApcTab[APC handle] 0; EmpApcAll: the APCs with one).
// Feature test: test/emperor-mission.test.ts "APCs carry five infantry".
function EmpApcLoaded takes nothing returns nothing
    local unit t = GetTransportUnit()
    if not HaveSavedHandle(EmpApcTab, GetHandleId(t), 0) then
        call SaveGroupHandle(EmpApcTab, GetHandleId(t), 0, CreateGroup())
    endif
    call GroupAddUnit(LoadGroupHandle(EmpApcTab, GetHandleId(t), 0), GetTriggerUnit())
    call GroupAddUnit(EmpApcAll, t)
    set t = null
endfunction

// passengers that got out (Unload) leave the APC's group
function EmpApcTick takes nothing returns nothing
    local group all = CreateGroup()
    local group g
    local group keep
    local unit t
    local unit u
    call GroupAddGroup(EmpApcAll, all)
    loop
        set t = FirstOfGroup(all)
        exitwhen t == null
        call GroupRemoveUnit(all, t)
        if EmpAlive(t) then
            set g = LoadGroupHandle(EmpApcTab, GetHandleId(t), 0)
            set keep = CreateGroup()
            loop
                set u = FirstOfGroup(g)
                exitwhen u == null
                call GroupRemoveUnit(g, u)
                if EmpAlive(u) and IsUnitInTransport(u, t) then
                    call GroupAddUnit(keep, u)
                endif
            endloop
            call GroupAddGroup(keep, g)
            call DestroyGroup(keep)
            if FirstOfGroup(g) == null then
                call GroupRemoveUnit(EmpApcAll, t)
            endif
        endif
    endloop
    call DestroyGroup(all)
    set all = null
    set g = null
    set keep = null
endfunction

function EmpApcDeath takes nothing returns nothing
    local unit t = GetTriggerUnit()
    local group g
    local unit u
    if not HaveSavedHandle(EmpApcTab, GetHandleId(t), 0) then
        set t = null
        return
    endif
    set g = LoadGroupHandle(EmpApcTab, GetHandleId(t), 0)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            call KillUnit(u)
        endif
    endloop
    call DestroyGroup(g)
    call FlushChildHashtable(EmpApcTab, GetHandleId(t))
    call GroupRemoveUnit(EmpApcAll, t)
    set g = null
    set t = null
endfunction

function EmpApcInit takes nothing returns nothing
    local trigger load = CreateTrigger()
    local trigger death = CreateTrigger()
    local integer i = 0
    set EmpApcTab = InitHashtable()
    set EmpApcAll = CreateGroup()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(load, Player(i), EVENT_PLAYER_UNIT_LOADED, null)
        call TriggerRegisterPlayerUnitEvent(death, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(load, function EmpApcLoaded)
    call TriggerAddAction(death, function EmpApcDeath)
    call TimerStart(CreateTimer(), {{real RT.APC_TICK}}, true, function EmpApcTick)
    set load = null
    set death = null
endfunction
