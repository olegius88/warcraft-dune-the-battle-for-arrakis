// ---- starport prices (Rules.txt [General] StarportCostUpdateDelay, StarportCostVariationPercent):
// every update the price of each starport type changes to 100 % +- the variation; a WC3 type has one
// cost everywhere, so a purchase at a starport pays the difference to the current price (or gets it
// back), and is cancelled when the player cannot pay it.
// A starport trains orders (src/emperor/units.ts portOrders, ready in a second); a finished order goes
// to the starport's frigate, which lands after [General] FrigateCountdown with up to
// StarportMaxDeliverySingle units, the next frigate brings the rest.
// EmpPortTab[order type]: 0 index, 1 Rules.txt Cost, 3 the unit delivered; EmpPortTab[starport type]:
// 2 true; EmpPortTab[starport handle]: [type] the difference fixed at the start of that type's
// purchase, 2 its frigate's delivery timer; EmpPortTab[delivery timer]: 1/2 x / y of the starport,
// 3 owner id, 4 starport handle id, 5 the frigate, 6 units waiting, 7 the starport, PORT_SLOT + i the
// waiting types.
// TRAIN_START fires when an order starts training, not when it is queued: two orders queued at 70 %
// and 130 % paid 9400 of 10000 (src/smoke/build-territory-probe.ts --portqueue, 1.31.1, 2026-10-08),
// so each order keeps its own price in the record.
// TODO(starport): the stock (StarportStockIncreaseProb / Delay) is not modelled: how much of each type a
// starport starts with and holds at most is not in Rules.txt. Risk: every type is always available.
function EmpPortPrices takes nothing returns nothing
    local integer i = 0
    loop
        exitwhen i >= {{portTypes}}
        set EmpPortPct[i] = GetRandomInt({{pctMin}}, {{pctMax}})
        set i = i + 1
    endloop
endfunction

function EmpPortTrain takes nothing returns nothing
    local unit b = GetTriggerUnit()
    local integer t = GetTrainedUnitType()
    local integer cost
    local integer delta
    local player p = GetOwningPlayer(b)
    if LoadBoolean(EmpPortTab, GetUnitTypeId(b), 2) and HaveSavedInteger(EmpPortTab, t, 0) then
        set cost = LoadInteger(EmpPortTab, t, 1)
        set delta = cost * EmpPortPct[LoadInteger(EmpPortTab, t, 0)] / 100 - cost
        if delta > GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) then
            // cancel: WC3 gives the stock price back
            call IssueImmediateOrderById(b, {{ORDER_CANCEL}})
        else
            // the price is fixed now and settled when the unit is out (EmpPortFinish). A cancel then
            // needs nothing: WC3 gives back the stock price it took and the difference was never
            // paid. (Regression, third audit: paid here, a cancel gave the full stock price back
            // and kept a discount, so every buy-and-cancel below 100 % made money.)
            call SaveInteger(EmpPortTab, GetHandleId(b), t, delta)
            if p == Player(0) then
                call EmpShow({{str PORT_PRICE_TEXT}} + I2S(cost + delta))
            endif
        endif
    endif
    set b = null
    set p = null
endfunction

// the nearest map edge to (x, y), in EmpTmpX / EmpTmpY: where a frigate comes from and goes to
function EmpPortEdge takes real x, real y returns nothing
    local real best = x - EmpMapMinX
    set EmpTmpX = EmpMapMinX
    set EmpTmpY = y
    if EmpMapMaxX - x < best then
        set best = EmpMapMaxX - x
        set EmpTmpX = EmpMapMaxX
    endif
    if y - EmpMapMinY < best then
        set best = y - EmpMapMinY
        set EmpTmpX = x
        set EmpTmpY = EmpMapMinY
    endif
    if EmpMapMaxY - y < best then
        set EmpTmpX = x
        set EmpTmpY = EmpMapMaxY
    endif
endfunction

// the frigate's timers: 0 the frigate, 1/2 where it flies to
function EmpPortFrigateFly takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local unit f = LoadUnitHandle(EmpPortTab, GetHandleId(tm), 0)
    call ShowUnit(f, true)
    call IssuePointOrder(f, "move", LoadReal(EmpPortTab, GetHandleId(tm), 1), LoadReal(EmpPortTab, GetHandleId(tm), 2))
    call FlushChildHashtable(EmpPortTab, GetHandleId(tm))
    call DestroyTimer(tm)
    set tm = null
    set f = null
endfunction

function EmpPortFrigateGone takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    call RemoveUnit(LoadUnitHandle(EmpPortTab, GetHandleId(tm), 0))
    call FlushChildHashtable(EmpPortTab, GetHandleId(tm))
    call DestroyTimer(tm)
    set tm = null
endfunction

// seconds the frigate f needs from (x0, y0) to (x1, y1)
function EmpPortFlight takes unit f, real x0, real y0, real x1, real y1 returns real
    return SquareRoot((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) / RMaxBJ(1.0, GetUnitDefaultMoveSpeed(f))
endfunction

// the frigate of delivery timer th ([Frigate]: flies, cannot die): it waits at the nearest map edge
// and sets off so that it is over the starport (x, y) when FrigateCountdown is over
function EmpPortFrigateCall takes integer th, real x, real y, player p returns nothing
    local unit f
    local timer go = CreateTimer()
    call EmpPortEdge(x, y)
    set f = CreateUnit(p, '{{portFrigateUnit}}', EmpTmpX, EmpTmpY, bj_RADTODEG * Atan2(y - EmpTmpY, x - EmpTmpX))
    call UnitAddAbility(f, '{{ABILITY.locust}}')
    call SetUnitInvulnerable(f, true)
    call ShowUnit(f, false)
    call SaveUnitHandle(EmpPortTab, th, 5, f)
    call SaveUnitHandle(EmpPortTab, GetHandleId(go), 0, f)
    call SaveReal(EmpPortTab, GetHandleId(go), 1, x)
    call SaveReal(EmpPortTab, GetHandleId(go), 2, y)
    // it arrives PORT_FRIGATE_HOVER seconds early and hangs over the starport until the units are out
    call TimerStart(go, RMaxBJ(0.0, {{real portFrigateSeconds}} - {{real RT.PORT_FRIGATE_HOVER}} - EmpPortFlight(f, EmpTmpX, EmpTmpY, x, y)), false, function EmpPortFrigateFly)
    set f = null
    set go = null
endfunction

// the frigate of delivery timer th has landed its load: it flies off to the nearest edge and is gone
function EmpPortFrigateLeave takes integer th, real x, real y returns nothing
    local unit f = LoadUnitHandle(EmpPortTab, th, 5)
    local timer gone
    if f == null then
        return
    endif
    set gone = CreateTimer()
    call EmpPortEdge(x, y)
    call IssuePointOrder(f, "move", EmpTmpX, EmpTmpY)
    call SaveUnitHandle(EmpPortTab, GetHandleId(gone), 0, f)
    call TimerStart(gone, EmpPortFlight(f, x, y, EmpTmpX, EmpTmpY) + 1.0, false, function EmpPortFrigateGone)
    call RemoveSavedHandle(EmpPortTab, th, 5)
    set f = null
    set gone = null
endfunction

// a frigate lands: up to StarportMaxDeliverySingle waiting units at the starport, for its owner now
// (an engineer may have taken it); a fallen starport's units land where it stood (they are paid
// for); the rest waits for the next frigate
function EmpPortFrigate takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer th = GetHandleId(tm)
    local integer n = LoadInteger(EmpPortTab, th, 6)
    local unit b = LoadUnitHandle(EmpPortTab, th, 7)
    local player p = Player(LoadInteger(EmpPortTab, th, 3))
    local real x = LoadReal(EmpPortTab, th, 1)
    local real y = LoadReal(EmpPortTab, th, 2)
    local integer k = 0
    if EmpAlive(b) then
        set p = GetOwningPlayer(b)
        set x = GetUnitX(b)
        set y = GetUnitY(b)
        call SaveInteger(EmpPortTab, th, 3, GetPlayerId(p))
        call SaveReal(EmpPortTab, th, 1, x)
        call SaveReal(EmpPortTab, th, 2, y)
    endif
    loop
        exitwhen k >= {{portMaxDelivery}}
        exitwhen k >= n
        call CreateUnit(p, LoadInteger(EmpPortTab, th, {{RT.PORT_SLOT}} + k), x + GetRandomReal(-{{RT.PORT_DELIVERY_SPREAD}}, {{RT.PORT_DELIVERY_SPREAD}}), y - {{real RT.PORT_DELIVERY_OFFSET}}, {{FACING}})
        set k = k + 1
    endloop
    if p == Player(0) and k > 0 then
        call EmpUiSay({{UI.unitReady}})
    endif
    call EmpPortFrigateLeave(th, x, y)
    // the rest moves up
    set n = n - k
    set k = 0
    loop
        exitwhen k >= n
        call SaveInteger(EmpPortTab, th, {{RT.PORT_SLOT}} + k, LoadInteger(EmpPortTab, th, {{RT.PORT_SLOT}} + k + {{portMaxDelivery}}))
        set k = k + 1
    endloop
    call SaveInteger(EmpPortTab, th, 6, n)
    if n > 0 then
        call EmpPortFrigateCall(th, x, y, p)
        call TimerStart(tm, {{real portFrigateSeconds}}, false, function EmpPortFrigate)
        if p == Player(0) then
            call EmpUiSay({{UI.delivery}})
        endif
    else
        // the starport (if it still has this frigate) calls a new one for its next order
        if LoadTimerHandle(EmpPortTab, LoadInteger(EmpPortTab, th, 4), 2) == tm then
            call RemoveSavedHandle(EmpPortTab, LoadInteger(EmpPortTab, th, 4), 2)
        endif
        call FlushChildHashtable(EmpPortTab, th)
        call DestroyTimer(tm)
    endif
    set tm = null
    set b = null
    set p = null
endfunction

// a paid order of starport b: its unit waits for the starport's frigate, which is called if none is
// on its way. The queue goes with the frigate's timer, not with the starport's handle id (fifth
// audit: a new starport with a fallen one's id joined its queue; test/emperor-mission.test.ts).
function EmpPortQueue takes unit b, integer t returns nothing
    local integer h = GetHandleId(b)
    local timer tm = LoadTimerHandle(EmpPortTab, h, 2)
    local integer th
    local integer n
    if tm == null then
        set tm = CreateTimer()
        set th = GetHandleId(tm)
        call SaveTimerHandle(EmpPortTab, h, 2, tm)
        call SaveReal(EmpPortTab, th, 1, GetUnitX(b))
        call SaveReal(EmpPortTab, th, 2, GetUnitY(b))
        call SaveInteger(EmpPortTab, th, 3, GetPlayerId(GetOwningPlayer(b)))
        call SaveInteger(EmpPortTab, th, 4, h)
        call SaveUnitHandle(EmpPortTab, th, 7, b)
        call EmpPortFrigateCall(th, GetUnitX(b), GetUnitY(b), GetOwningPlayer(b))
        call TimerStart(tm, {{real portFrigateSeconds}}, false, function EmpPortFrigate)
        if GetOwningPlayer(b) == Player(0) then
            call EmpUiSay({{UI.delivery}})
        endif
    endif
    set th = GetHandleId(tm)
    set n = LoadInteger(EmpPortTab, th, 6)
    call SaveInteger(EmpPortTab, th, {{RT.PORT_SLOT}} + n, t)
    call SaveInteger(EmpPortTab, th, 6, n + 1)
    set tm = null
endfunction

// a starport falls: it lets go of its frigate (its units still land) and of its price records
function EmpPortDeath takes nothing returns nothing
    local integer h = GetHandleId(GetTriggerUnit())
    if LoadBoolean(EmpPortTab, GetUnitTypeId(GetTriggerUnit()), 2) then
        call RemoveSavedHandle(EmpPortTab, h, 2)
        call FlushChildHashtable(EmpPortTab, h)
    endif
endfunction

// an order is ready: the difference to the price fixed at its start is paid or given back and the
// unit goes to the frigate; an order the player cannot pay for is sent back (the stock price returned)
function EmpPortFinish takes nothing returns nothing
    local unit b = GetTriggerUnit()
    local unit u = GetTrainedUnit()
    local integer t = GetUnitTypeId(u)
    local integer delta = 0
    local player p = GetOwningPlayer(b)
    // only a starport settles, and the record goes: a factory reusing the handle id of a destroyed
    // starport took its old price for its own trike (fourth audit, test/emperor-mission.test.ts)
    if LoadBoolean(EmpPortTab, GetUnitTypeId(b), 2) and HaveSavedInteger(EmpPortTab, t, 3) then
        if HaveSavedInteger(EmpPortTab, GetHandleId(b), t) then
            set delta = LoadInteger(EmpPortTab, GetHandleId(b), t)
            call RemoveSavedInteger(EmpPortTab, GetHandleId(b), t)
        endif
        call RemoveUnit(u)
        if delta > GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) then
            call SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) + LoadInteger(EmpPortTab, t, 1))
        else
            call SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) - delta)
            call EmpPortQueue(b, LoadInteger(EmpPortTab, t, 3))
        endif
    endif
    set b = null
    set u = null
    set p = null
endfunction

function EmpPortInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local trigger fin = CreateTrigger()
    local trigger die = CreateTrigger()
    local integer i = 0
    set EmpPortTab = InitHashtable()
{{portLines}}
    call EmpPortPrices()
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_TRAIN_START, null)
        call TriggerRegisterPlayerUnitEvent(fin, Player(i), EVENT_PLAYER_UNIT_TRAIN_FINISH, null)
        call TriggerRegisterPlayerUnitEvent(die, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpPortTrain)
    call TriggerAddAction(fin, function EmpPortFinish)
    call TriggerAddAction(die, function EmpPortDeath)
    set fin = null
    set die = null
    call TimerStart(CreateTimer(), {{real updateSeconds}}, true, function EmpPortPrices)
    set tr = null
endfunction
