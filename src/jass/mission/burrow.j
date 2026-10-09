// ---- the dust scout burrows (Rules.txt DustScout: ORDustScout; Game.exe 1.09 class 0xc, 0x568d10) ----
// Idle on its SpecialGround (DustBowl) it burrows by itself (states 4 / 5 -> 0x22 -> 0x23): burrowed
// it is hidden from every other player (0x55e3c8), does not fire or move; an order other than a stop
// brings it up first, and so does a target within [General] GuardTileRange of it (0x554040, aircraft
// too if a weapon is AntiAircraft): it surfaces and attacks. Its deploy command is refused (no button).
// Going under takes its Sink, coming up its Surface animation (0x22 / 0x24 wait for them, vcall +0x278;
// models.ts burrow), unable to act; an order given to a burrowed scout is kept and given again once it is
// up (EmpBurrowOrder). Nothing detects a burrowed scout (no unit here has WC3 detection).
// EmpBurrowTab[type]: 0 = burrows, 2 = hits aircraft, 4 / 5 the ticks of going under / coming up;
// [unit]: 1 = burrowed, 5 its phase (1 going under, 2 coming up), 6 the tick it ends, 7 a kept order's
// kind (0 none-target, 1 point, 2 unit), 8 its id, 9 / 10 its point, 11 its unit.
// Feature test: test/emperor-mission.test.ts "dust scout".
function EmpBurrowTimes takes integer t, integer sink, integer surface returns nothing
    call SaveInteger(EmpBurrowTab, t, 4, sink)
    call SaveInteger(EmpBurrowTab, t, 5, surface)
endfunction

function EmpBurrowData takes nothing returns nothing
    set EmpBurrowTab = InitHashtable()
{{burrowLines}}
endfunction

function EmpBurrowSet takes unit u, boolean down returns nothing
    call SaveBoolean(EmpBurrowTab, GetHandleId(u), 1, down)
    call BlzUnitDisableAbility(u, 'Aatk', down, false)
    if down then
        call UnitAddAbility(u, '{{ABILITY.invisibility}}')
    else
        call UnitRemoveAbility(u, '{{ABILITY.invisibility}}')
    endif
endfunction

// a phase begins (1 going under, 2 coming up) for its animation's time, the scout unable to act
function EmpBurrowBegin takes unit u, integer phase returns nothing
    local integer h = GetHandleId(u)
    call SaveInteger(EmpBurrowTab, h, 5, phase)
    call SaveInteger(EmpBurrowTab, h, 6, EmpTick + LoadInteger(EmpBurrowTab, EmpType(u), 3 + phase))
    call BlzPauseUnitEx(u, true)
    call BlzUnitDisableAbility(u, 'Aatk', true, false)
    if phase == 1 then
        call SetUnitAnimation(u, "spell")
    else
        call EmpBurrowSet(u, false)
        call BlzUnitDisableAbility(u, 'Aatk', true, false)
        call SetUnitAnimation(u, "spell slam")
    endif
endfunction

// a phase ends: under (an order kept meanwhile brings it up at once) or up (its kept order given again)
function EmpBurrowEnd takes unit u returns nothing
    local integer h = GetHandleId(u)
    local integer phase = LoadInteger(EmpBurrowTab, h, 5)
    local integer k = LoadInteger(EmpBurrowTab, h, 7)
    call RemoveSavedInteger(EmpBurrowTab, h, 5)
    call BlzPauseUnitEx(u, false)
    if phase == 1 then
        call EmpBurrowSet(u, true)
        call SetUnitAnimation(u, "stand channel")
        if k > 0 then
            call EmpBurrowBegin(u, 2)
        endif
        return
    endif
    call EmpBurrowSet(u, false)
    call SetUnitAnimation(u, "stand")
    set EmpBurrowReissue = true
    if k == 1 then
        call IssuePointOrderById(u, LoadInteger(EmpBurrowTab, h, 8), LoadReal(EmpBurrowTab, h, 9), LoadReal(EmpBurrowTab, h, 10))
    elseif k == 2 and EmpAlive(LoadUnitHandle(EmpBurrowTab, h, 11)) then
        call IssueTargetOrderById(u, LoadInteger(EmpBurrowTab, h, 8), LoadUnitHandle(EmpBurrowTab, h, 11))
    elseif k == 3 then
        call IssueImmediateOrderById(u, LoadInteger(EmpBurrowTab, h, 8))
    endif
    set EmpBurrowReissue = false
    call RemoveSavedInteger(EmpBurrowTab, h, 7)
endfunction

// an order to a burrowed (or burrowing) scout other than stop / hold: kept, and up it comes (0x568d10)
function EmpBurrowOrder takes nothing returns nothing
    local unit u = GetTriggerUnit()
    local integer h = GetHandleId(u)
    local integer o = GetIssuedOrderId()
    if not EmpBurrowReissue and LoadBoolean(EmpBurrowTab, EmpType(u), 0) and (LoadBoolean(EmpBurrowTab, h, 1) or LoadInteger(EmpBurrowTab, h, 5) == 1) and o != OrderId("stop") and o != OrderId("holdposition") and o != {{RT.STUN_ORDER}} then
        call SaveInteger(EmpBurrowTab, h, 8, o)
        if GetOrderTargetUnit() != null then
            call SaveInteger(EmpBurrowTab, h, 7, 2)
            call SaveUnitHandle(EmpBurrowTab, h, 11, GetOrderTargetUnit())
        elseif GetTriggerEventId() == EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER then
            call SaveInteger(EmpBurrowTab, h, 7, 1)
            call SaveReal(EmpBurrowTab, h, 9, GetOrderPointX())
            call SaveReal(EmpBurrowTab, h, 10, GetOrderPointY())
        else
            call SaveInteger(EmpBurrowTab, h, 7, 3)
        endif
        if LoadInteger(EmpBurrowTab, h, 5) == 0 then
            call EmpBurrowBegin(u, 2)
        endif
    endif
    set u = null
endfunction

// an enemy it could hit within GuardTileRange (aircraft only with an AntiAircraft weapon)
function EmpBurrowTarget takes unit u returns unit
    local group g = CreateGroup()
    local unit e
    local unit found = null
    call GroupEnumUnitsInRange(g, GetUnitX(u), GetUnitY(u), {{real burrowGuard}}, null)
    loop
        set e = FirstOfGroup(g)
        exitwhen e == null or found != null
        call GroupRemoveUnit(g, e)
        if EmpAlive(e) and IsUnitEnemy(e, GetOwningPlayer(u)) and IsUnitVisible(e, GetOwningPlayer(u)) and (not IsUnitType(e, UNIT_TYPE_FLYING) or LoadBoolean(EmpBurrowTab, EmpType(u), 2)) then
            set found = e
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set e = null
    return found
endfunction

function EmpBurrowTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local unit e
    call GroupEnumUnitsInRect(g, bj_mapInitialPlayableArea, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and LoadBoolean(EmpBurrowTab, EmpType(u), 0) then
            if LoadInteger(EmpBurrowTab, GetHandleId(u), 5) != 0 then
                if EmpTick >= LoadInteger(EmpBurrowTab, GetHandleId(u), 6) then
                    call EmpBurrowEnd(u)
                endif
            elseif LoadBoolean(EmpBurrowTab, GetHandleId(u), 1) then
                // a target in GuardTileRange: up it comes and attacks it
                set e = EmpBurrowTarget(u)
                if e != null then
                    call SaveInteger(EmpBurrowTab, GetHandleId(u), 7, 2)
                    call SaveInteger(EmpBurrowTab, GetHandleId(u), 8, OrderId("attack"))
                    call SaveUnitHandle(EmpBurrowTab, GetHandleId(u), 11, e)
                    call EmpBurrowBegin(u, 2)
                endif
            elseif GetUnitCurrentOrder(u) == 0 and GetTerrainType(GetUnitX(u), GetUnitY(u)) == '{{dustTile}}' then
                call EmpBurrowBegin(u, 1)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set e = null
endfunction

function EmpBurrowInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpBurrowData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ISSUED_ORDER, null)
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER, null)
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpBurrowOrder)
    set tr = null
    call TimerStart(CreateTimer(), {{real RT.BURROW_TICK}}, true, function EmpBurrowTick)
endfunction
