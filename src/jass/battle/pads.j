// ---- refinery pads (Game.exe 1.09; src/emperor/units.ts padOrders, config REFINERY_PAD) ----
// A pad order is trained by a refinery (Game.exe: the dock type's upgrade order, UpgradeCost /
// UpgradeBuildTime / UpgradeTechLevel, 0x4c21c0 -> 0x53cb90); done, it fills a slot of a refinery:
// the one that trained it, else the first of its owner's with a free slot (Game.exe takes the first
// in its list, 0x53e33c), else the credits come back (0x53e3b8). EmpPadTab: parent the order type,
// child 0 its refinery type, 1 the hit points a pad adds, 2 its GetUnitWhenBuilt, 3 its cost;
// parent a refinery's handle, child 10 its pads.
// TODO(ai): a pad shows on the refinery only by its "Refinery Pad 1 / 2" animation in Game.exe
// (0x485c00 plays animation 0x43 + slot); the converted refinery model is not changed here, and
// harvesters unload at once in WC3 (no docks to share: 0x485c90 picks the dock with fewest
// harvesters). Risk: a pad is not seen on the refinery and adds a harvester, not unloading room.

function EmpPadCountOf takes unit r returns integer
    return LoadInteger(EmpPadTab, GetHandleId(r), 10)
endfunction

// pads of player p on its refineries standing (the AI counts them as refineries, 0x44cc40)
function EmpPadCount takes player p returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    call GroupEnumUnitsOfPlayer(g, p, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            set n = n + EmpPadCountOf(u)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

// a refinery of p of type t with a free slot, `first` preferred; null none
function EmpPadFree takes player p, integer t, unit first returns unit
    local group g
    local unit u
    local unit found = null
    if first != null and EmpAlive(first) and EmpType(first) == t and EmpPadCountOf(first) < {{REFINERY_PAD.slots}} then
        return first
    endif
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, p, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if found == null and EmpAlive(u) and EmpType(u) == t and EmpPadCountOf(u) < {{REFINERY_PAD.slots}} then
            set found = u
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return found
endfunction

// pad order o done for player p (r: the refinery that trained it, or null)
function EmpPadAttach takes player p, integer o, unit r returns nothing
    local real pct
    local integer slot
    local unit u = EmpPadFree(p, LoadInteger(EmpPadTab, o, 0), r)
    if u == null then
        call SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) + LoadInteger(EmpPadTab, o, 3))
        return
    endif
    set slot = EmpPadCountOf(u)
    if slot < {{REFINERY_PAD.slots}} then
        call SaveInteger(EmpPadTab, GetHandleId(u), 10, slot + 1)
        // + the pad's Health, keeping the share (0x485e30, 0x485c00)
        set pct = GetWidgetLife(u) / BlzGetUnitMaxHP(u)
        call BlzSetUnitMaxHP(u, BlzGetUnitMaxHP(u) + LoadInteger(EmpPadTab, o, 1))
        call SetWidgetLife(u, pct * BlzGetUnitMaxHP(u))
        if LoadInteger(EmpPadTab, o, 2) != 0 then
            call CreateUnit(p, LoadInteger(EmpPadTab, o, 2), GetUnitX(u) + {{real C.NEW_HARVESTER_OFFSET}}, GetUnitY(u) - {{real C.NEW_HARVESTER_OFFSET}}, {{FACING}})
        endif
    endif
    set u = null
endfunction

function EmpPadTrained takes nothing returns nothing
    local unit t = GetTrainedUnit()
    local integer o = EmpType(t)
    if HaveSavedInteger(EmpPadTab, o, 0) then
        call RemoveUnit(t)
        call EmpPadAttach(GetOwningPlayer(GetTriggerUnit()), o, GetTriggerUnit())
    endif
    set t = null
endfunction

function EmpPadInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    set EmpPadTab = InitHashtable()
{{padLines}}
    loop
        exitwhen i >= bj_MAX_PLAYERS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_TRAIN_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpPadTrained)
    set tr = null
endfunction
