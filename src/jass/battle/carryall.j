// ---- carryalls carry harvesters (Rules.txt Carryall: Carryall, IMDropShip; Game.exe 1.09 class 7) ----
// A harvester asks for a carryall when its destination (the refinery it returns to, the field it goes
// to) is more than [General] MinCarryTileDist tiles away (unitHarvester.cpp 0x56c0ad / 0x56c5e2 /
// 0x56cbd1); the nearest idle carryall of its owner answers (0x53c040), flies to it, and if the
// harvester is still that far gives up or else picks it up (0x442aa0), flies it to its destination and
// sets it down there (0x567f40), the harvester going on with its errand. A carryall killed while
// carrying takes the harvester with it (0x560fc5). EmpCarryTab[carryall]: 0 the harvester, 1 state
// (1 to it, 2 carrying), 2 / 3 destination, 4 errand (1 return, 2 harvest); [harvester] 5 its carryall,
// 6 the field it was last sent to (a WC3 order's target cannot be read back: kept from the order
// event; probe --carryall 2026-10-09: without it the carryall took it to the nearest field, over and
// over).
// TODO(units): Game.exe also calls a carryall for a harvester whose ground path is blocked (move result
// 2); a WC3 harvester gives no such result, so only the distance asks. Carryalls are not selectable in
// Emperor (Selectable=FALSE); here the player can select and order them. Risk: a harvester stuck behind
// a wall walks on; a player's order takes a carryall off its service.
// Feature test: test/emperor-mission.test.ts "carryall".

function EmpCarryIsCarryall takes integer t returns boolean
    return {{isCarryall}}
endfunction

// the harvester's errand and destination (EmpCarryX / Y): 1 back to the nearest refinery of its owner,
// 2 to its spice field, 0 none. The engine's orders through a harvest cycle (probe --harvorders,
// 2026-10-09, 1.31.1): "resumeharvesting" when it is full and goes back, "harvest" when it has
// delivered and goes out again; "returnresources" only when ordered.
function EmpCarryErrand takes unit h returns integer
    local integer o = GetUnitCurrentOrder(h)
    local group g
    local unit u
    local unit best = null
    local real bd = 1000000000.0
    local real d
    local integer t
    if o == OrderId("returnresources") or o == OrderId("resumeharvesting") then
        set g = CreateGroup()
        call GroupEnumUnitsOfPlayer(g, GetOwningPlayer(h), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            set t = EmpType(u)
            if EmpAlive(u) and ({{isRefinery}}) then
                set d = (GetUnitX(u) - GetUnitX(h)) * (GetUnitX(u) - GetUnitX(h)) + (GetUnitY(u) - GetUnitY(h)) * (GetUnitY(u) - GetUnitY(h))
                if d < bd then
                    set bd = d
                    set best = u
                endif
            endif
        endloop
        call DestroyGroup(g)
        set g = null
        if best == null then
            return 0
        endif
        set EmpCarryX = GetUnitX(best)
        set EmpCarryY = GetUnitY(best)
        set best = null
        return 1
    elseif o == OrderId("harvest") then
        set best = LoadUnitHandle(EmpCarryTab, GetHandleId(h), 6)
        if not EmpAlive(best) or GetResourceAmount(best) <= 0 then
            set best = EmpNearestMine(GetUnitX(h), GetUnitY(h))
        endif
        if best == null then
            return 0
        endif
        set EmpCarryX = GetUnitX(best)
        set EmpCarryY = GetUnitY(best)
        set best = null
        return 2
    endif
    return 0
endfunction

function EmpCarryFar takes unit h returns boolean
    return SquareRoot((EmpCarryX - GetUnitX(h)) * (EmpCarryX - GetUnitX(h)) + (EmpCarryY - GetUnitY(h)) * (EmpCarryY - GetUnitY(h))) > {{minCarryTiles}} * {{real WC3_UNITS_PER_TILE}}
endfunction

// the nearest carryall of p serving nobody
function EmpCarryFree takes player p, real x, real y returns unit
    local group g = CreateGroup()
    local unit u
    local unit best = null
    local real bd = 1000000000.0
    local real d
    call GroupEnumUnitsOfPlayer(g, p, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and EmpCarryIsCarryall(EmpType(u)) and not HaveSavedHandle(EmpCarryTab, GetHandleId(u), 0) then
            set d = (GetUnitX(u) - x) * (GetUnitX(u) - x) + (GetUnitY(u) - y) * (GetUnitY(u) - y)
            if d < bd then
                set bd = d
                set best = u
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return best
endfunction

function EmpCarryRelease takes unit c returns nothing
    local unit h = LoadUnitHandle(EmpCarryTab, GetHandleId(c), 0)
    if h != null then
        call RemoveSavedHandle(EmpCarryTab, GetHandleId(h), 5)
    endif
    call FlushChildHashtable(EmpCarryTab, GetHandleId(c))
    call GroupRemoveUnit(EmpCarryBusy, c)
    set h = null
endfunction

// harvesters ask (each side's)
function EmpCarryAsk takes nothing returns nothing
    local integer i = 0
    local group g = CreateGroup()
    local unit h
    local unit c
    local integer k
    loop
        exitwhen i > {{MAX_SIDE}}
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set h = FirstOfGroup(g)
            exitwhen h == null
            call GroupRemoveUnit(g, h)
            if EmpAlive(h) and EmpType(h) == '{{harvester}}' and not HaveSavedHandle(EmpCarryTab, GetHandleId(h), 5) and IsUnitVisible(h, GetOwningPlayer(h)) then
                set k = EmpCarryErrand(h)
                if k > 0 and EmpCarryFar(h) then
                    set c = EmpCarryFree(Player(i), GetUnitX(h), GetUnitY(h))
                    if c != null then
                        call SaveUnitHandle(EmpCarryTab, GetHandleId(c), 0, h)
                        call SaveInteger(EmpCarryTab, GetHandleId(c), 1, 1)
                        call SaveInteger(EmpCarryTab, GetHandleId(c), 4, k)
                        call SaveUnitHandle(EmpCarryTab, GetHandleId(h), 5, c)
                        call GroupAddUnit(EmpCarryBusy, c)
                        call IssuePointOrder(c, "move", GetUnitX(h), GetUnitY(h))
                    endif
                endif
            endif
        endloop
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
    set c = null
endfunction

// a carryall at work: to the harvester, then with it to its destination
function EmpCarryWork takes unit c returns nothing
    local integer hc = GetHandleId(c)
    local unit h = LoadUnitHandle(EmpCarryTab, hc, 0)
    local integer k
    local unit m
    if not EmpAlive(h) then
        call EmpCarryRelease(c)
        set h = null
        return
    endif
    if LoadInteger(EmpCarryTab, hc, 1) == 1 then
        if IsUnitInRange(c, h, {{real C.CARRYALL.pickup}}) then
            // there: still far from its destination? (0x442aa0) then up it goes
            set k = EmpCarryErrand(h)
            if k == 0 or not EmpCarryFar(h) then
                call EmpCarryRelease(c)
            else
                call SaveInteger(EmpCarryTab, hc, 4, k)
                call SaveReal(EmpCarryTab, hc, 2, EmpCarryX)
                call SaveReal(EmpCarryTab, hc, 3, EmpCarryY)
                call SaveInteger(EmpCarryTab, hc, 1, 2)
                call ShowUnit(h, false)
                call IssuePointOrder(c, "move", EmpCarryX, EmpCarryY)
            endif
        else
            call IssuePointOrder(c, "move", GetUnitX(h), GetUnitY(h))
        endif
    else
        call SetUnitX(h, GetUnitX(c))
        call SetUnitY(h, GetUnitY(c))
        if SquareRoot((GetUnitX(c) - LoadReal(EmpCarryTab, hc, 2)) * (GetUnitX(c) - LoadReal(EmpCarryTab, hc, 2)) + (GetUnitY(c) - LoadReal(EmpCarryTab, hc, 3)) * (GetUnitY(c) - LoadReal(EmpCarryTab, hc, 3))) < {{real C.CARRYALL.drop}} then
            // set down by the destination, the harvester goes on with its errand
            call SetUnitPosition(h, GetUnitX(c), GetUnitY(c))
            call ShowUnit(h, true)
            if LoadInteger(EmpCarryTab, hc, 4) == 1 then
                call IssueImmediateOrder(h, "returnresources")
            else
                set m = LoadUnitHandle(EmpCarryTab, GetHandleId(h), 6)
                if not EmpAlive(m) or GetResourceAmount(m) <= 0 then
                    set m = EmpNearestMine(GetUnitX(h), GetUnitY(h))
                endif
                if m != null then
                    call IssueTargetOrder(h, "harvest", m)
                endif
            endif
            call EmpCarryRelease(c)
        elseif GetUnitCurrentOrder(c) == 0 then
            call IssuePointOrder(c, "move", LoadReal(EmpCarryTab, hc, 2), LoadReal(EmpCarryTab, hc, 3))
        endif
    endif
    set h = null
    set m = null
endfunction

function EmpCarryTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit c
    call EmpCarryAsk()
    call GroupAddGroup(EmpCarryBusy, g)
    loop
        set c = FirstOfGroup(g)
        exitwhen c == null
        call GroupRemoveUnit(g, c)
        if EmpAlive(c) then
            call EmpCarryWork(c)
        else
            call EmpCarryRelease(c)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

// a carryall shot down with a harvester aboard: the harvester goes with it
function EmpCarryDeath takes nothing returns nothing
    local unit c = GetTriggerUnit()
    local unit h = LoadUnitHandle(EmpCarryTab, GetHandleId(c), 0)
    if h != null and LoadInteger(EmpCarryTab, GetHandleId(c), 1) == 2 then
        call ShowUnit(h, true)
        call KillUnit(h)
    endif
    if HaveSavedHandle(EmpCarryTab, GetHandleId(c), 0) then
        call EmpCarryRelease(c)
    endif
    set c = null
    set h = null
endfunction

// the field a harvester is sent to (EmpCarryTab[harvester] 6)
function EmpCarryOrder takes nothing returns nothing
    local unit h = GetTriggerUnit()
    if EmpType(h) == '{{harvester}}' and GetIssuedOrderId() == OrderId("harvest") and EmpType(GetOrderTargetUnit()) == '{{spiceField}}' then
        call SaveUnitHandle(EmpCarryTab, GetHandleId(h), 6, GetOrderTargetUnit())
    endif
    set h = null
endfunction

function EmpCarryInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local trigger ord = CreateTrigger()
    local integer i = 0
    set EmpCarryTab = InitHashtable()
    set EmpCarryBusy = CreateGroup()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        call TriggerRegisterPlayerUnitEvent(ord, Player(i), EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpCarryDeath)
    call TriggerAddAction(ord, function EmpCarryOrder)
    set ord = null
    call TimerStart(CreateTimer(), {{real C.CARRYALL.tick}}, true, function EmpCarryTick)
    set tr = null
endfunction
