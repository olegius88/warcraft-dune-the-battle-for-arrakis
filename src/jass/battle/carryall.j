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
    local unit v = LoadUnitHandle(EmpCarryTab, GetHandleId(c), 33)
    // an ADV carryall's cargo too
    if v != null and EmpAlive(v) and LoadInteger(EmpCarryTab, GetHandleId(c), 34) == 2 then
        call ShowUnit(v, true)
        call KillUnit(v)
    elseif v != null and EmpAlive(v) then
        call BlzPauseUnitEx(v, false)
    endif
    set v = null
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

// ---- ADV carryalls (Rules.txt AdvancedCarryall; Game.exe 1.09 class 8, 0x566b90 / 0x566c00) ----
// Its pick button on a carriable unit of any side (EmpCarryTab[type] 32; not infantry, not flying, not
// a worm) flies it there (the button's short cast range) and lifts it: an enemy only after
// [General] AdvCarryallPickupEnemyDelay ticks hovering low, both held meanwhile (0x566b90 -> state 0x18).
// It hovers loaded until its drop button on a point sets the cargo down there (command 0x2f, state
// 0x22). Shot down, the cargo dies with it. EmpCarryTab[button] 31: 1 pick, 2 drop; [ADV carryall] 33 its
// cargo, 34 = 2 carrying, 1 lifting; EmpCarryAdv: the ADV carryalls with a cargo.
// TODO(units): the AI's air lift (AirLift tactic 0x453ed0, CAiUnitCarryall 0x463f00) is not ported;
// the UI's pickup button on a selected vehicle (0x4bce79, the nearest idle ADV carryall) neither. Risk:
// the AI's ADV carryalls stand idle.
function EmpAdvData takes nothing returns nothing
{{advLines}}
endfunction

function EmpAdvLift takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local unit c = LoadUnitHandle(EmpCarryTab, GetHandleId(tm), 35)
    local unit v = LoadUnitHandle(EmpCarryTab, GetHandleId(c), 33)
    call FlushChildHashtable(EmpCarryTab, GetHandleId(tm))
    call DestroyTimer(tm)
    if EmpAlive(c) then
        call BlzPauseUnitEx(c, false)
    endif
    if EmpAlive(c) and EmpAlive(v) then
        call BlzPauseUnitEx(v, false)
        call ShowUnit(v, false)
        call SaveInteger(EmpCarryTab, GetHandleId(c), 34, 2)
    else
        call RemoveSavedHandle(EmpCarryTab, GetHandleId(c), 33)
        call RemoveSavedInteger(EmpCarryTab, GetHandleId(c), 34)
        call GroupRemoveUnit(EmpCarryAdv, c)
        if EmpAlive(v) then
            call BlzPauseUnitEx(v, false)
        endif
    endif
    set tm = null
    set c = null
    set v = null
endfunction

function EmpAdvCast takes nothing returns nothing
    local unit c = GetTriggerUnit()
    local unit v = GetSpellTargetUnit()
    local integer k = LoadInteger(EmpCarryTab, GetSpellAbilityId(), 31)
    local unit cargo = LoadUnitHandle(EmpCarryTab, GetHandleId(c), 33)
    local timer tm
    if k == 1 and cargo == null and EmpAlive(v) and LoadBoolean(EmpCarryTab, EmpType(v), 32) and not IsUnitHidden(v) then
        call SaveUnitHandle(EmpCarryTab, GetHandleId(c), 33, v)
        call GroupAddUnit(EmpCarryAdv, c)
        if IsUnitEnemy(v, GetOwningPlayer(c)) then
            // an enemy: held low a while first
            call SaveInteger(EmpCarryTab, GetHandleId(c), 34, 1)
            call BlzPauseUnitEx(c, true)
            call BlzPauseUnitEx(v, true)
            set tm = CreateTimer()
            call SaveUnitHandle(EmpCarryTab, GetHandleId(tm), 35, c)
            call TimerStart(tm, {{real advEnemyDelay}}, false, function EmpAdvLift)
            set tm = null
        else
            call SaveInteger(EmpCarryTab, GetHandleId(c), 34, 2)
            call ShowUnit(v, false)
        endif
    elseif k == 2 and cargo != null and LoadInteger(EmpCarryTab, GetHandleId(c), 34) == 2 then
        call SetUnitPosition(cargo, GetSpellTargetX(), GetSpellTargetY())
        call ShowUnit(cargo, true)
        call RemoveSavedHandle(EmpCarryTab, GetHandleId(c), 33)
        call RemoveSavedInteger(EmpCarryTab, GetHandleId(c), 34)
        call GroupRemoveUnit(EmpCarryAdv, c)
    endif
    set c = null
    set v = null
    set cargo = null
endfunction

// the cargo goes along; a carryall gone takes it along (EmpCarryDeath)
function EmpAdvTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit c
    local unit v
    call GroupAddGroup(EmpCarryAdv, g)
    loop
        set c = FirstOfGroup(g)
        exitwhen c == null
        call GroupRemoveUnit(g, c)
        set v = LoadUnitHandle(EmpCarryTab, GetHandleId(c), 33)
        if not EmpAlive(c) or not EmpAlive(v) then
            call GroupRemoveUnit(EmpCarryAdv, c)
        elseif LoadInteger(EmpCarryTab, GetHandleId(c), 34) == 2 then
            call SetUnitX(v, GetUnitX(c))
            call SetUnitY(v, GetUnitY(c))
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set v = null
endfunction

function EmpCarryInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local trigger ord = CreateTrigger()
    local integer i = 0
    set EmpCarryTab = InitHashtable()
    set EmpCarryBusy = CreateGroup()
    set EmpCarryAdv = CreateGroup()
    call EmpAdvData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        call TriggerRegisterPlayerUnitEvent(ord, Player(i), EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpCarryDeath)
    call TriggerAddAction(ord, function EmpCarryOrder)
    set ord = CreateTrigger()
    set i = 0
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(ord, Player(i), EVENT_PLAYER_UNIT_SPELL_EFFECT, null)
        set i = i + 1
    endloop
    call TriggerAddAction(ord, function EmpAdvCast)
    call TimerStart(CreateTimer(), {{real C.CARRYALL.tick}} / 2.0, true, function EmpAdvTick)
    set ord = null
    call TimerStart(CreateTimer(), {{real C.CARRYALL.tick}}, true, function EmpCarryTick)
    set tr = null
endfunction
