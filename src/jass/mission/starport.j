// ---- starport prices (Rules.txt [General] StarportCostUpdateDelay, StarportCostVariationPercent):
// every update the price of each starport type changes to 100 % +- the variation; a WC3 type has one
// cost everywhere, so a purchase at a starport pays the difference to the current price (or gets it
// back), and is cancelled when the player cannot pay it.
// A starport trains orders (src/emperor/units.ts portOrders, ready in a second); a finished order goes
// to the starport's frigate, which lands after [General] FrigateCountdown with up to
// StarportMaxDeliverySingle units, the next frigate brings the rest.
// EmpPortTab[order type]: 0 index, 1 Rules.txt Cost, 3 the unit delivered; EmpPortTab[starport type]:
// 2 true; EmpPortTab[starport handle]: [type] the difference fixed at the start of that type's
// purchase, 1 units waiting for the frigate, 2 its timer, PORT_SLOT + i the waiting types;
// EmpPortTab[frigate timer]: 1/2 x / y of the starport, 3 owner id, 4 starport handle id.
// TODO(starport): two units of one type queued at different prices share one record (the later
// start wins) if TRAIN_START fires at queueing rather than at the start of training; which one 1.31
// does is not checked. Risk: a few credits off for such a queue.
// TODO(starport): the stock (StarportStockIncreaseProb / Delay) is not modelled: how much of each type a
// starport starts with and holds at most is not in Rules.txt. Risk: every type is always available.
// TODO(starport): the frigate is not shown (units appear at the starport when it lands).
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

// a frigate lands: up to StarportMaxDeliverySingle waiting units at the starport (where it stood, also
// if it fell meanwhile: they are paid for); the rest waits for the next frigate
function EmpPortFrigate takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer th = GetHandleId(tm)
    local integer h = LoadInteger(EmpPortTab, th, 4)
    local integer n = LoadInteger(EmpPortTab, h, 1)
    local player p = Player(LoadInteger(EmpPortTab, th, 3))
    local real x = LoadReal(EmpPortTab, th, 1)
    local real y = LoadReal(EmpPortTab, th, 2)
    local integer k = 0
    loop
        exitwhen k >= {{portMaxDelivery}}
        exitwhen k >= n
        call CreateUnit(p, LoadInteger(EmpPortTab, h, {{RT.PORT_SLOT}} + k), x + GetRandomReal(-{{RT.PORT_DELIVERY_SPREAD}}, {{RT.PORT_DELIVERY_SPREAD}}), y - {{real RT.PORT_DELIVERY_OFFSET}}, {{FACING}})
        set k = k + 1
    endloop
    if p == Player(0) and k > 0 then
        call EmpUiSay({{UI.unitReady}})
    endif
    // the rest moves up
    set n = n - k
    set k = 0
    loop
        exitwhen k >= n
        call SaveInteger(EmpPortTab, h, {{RT.PORT_SLOT}} + k, LoadInteger(EmpPortTab, h, {{RT.PORT_SLOT}} + k + {{portMaxDelivery}}))
        set k = k + 1
    endloop
    call SaveInteger(EmpPortTab, h, 1, n)
    if n > 0 then
        call TimerStart(tm, {{real portFrigateSeconds}}, false, function EmpPortFrigate)
        if p == Player(0) then
            call EmpUiSay({{UI.delivery}})
        endif
    else
        call RemoveSavedHandle(EmpPortTab, h, 2)
        call FlushChildHashtable(EmpPortTab, th)
        call DestroyTimer(tm)
    endif
    set tm = null
    set p = null
endfunction

// a paid order of starport b: its unit waits for the frigate, which is called if none is on its way
function EmpPortQueue takes unit b, integer t returns nothing
    local integer h = GetHandleId(b)
    local integer n = LoadInteger(EmpPortTab, h, 1)
    local timer tm
    call SaveInteger(EmpPortTab, h, {{RT.PORT_SLOT}} + n, t)
    call SaveInteger(EmpPortTab, h, 1, n + 1)
    if not HaveSavedHandle(EmpPortTab, h, 2) then
        set tm = CreateTimer()
        call SaveTimerHandle(EmpPortTab, h, 2, tm)
        call SaveReal(EmpPortTab, GetHandleId(tm), 1, GetUnitX(b))
        call SaveReal(EmpPortTab, GetHandleId(tm), 2, GetUnitY(b))
        call SaveInteger(EmpPortTab, GetHandleId(tm), 3, GetPlayerId(GetOwningPlayer(b)))
        call SaveInteger(EmpPortTab, GetHandleId(tm), 4, h)
        call TimerStart(tm, {{real portFrigateSeconds}}, false, function EmpPortFrigate)
        if GetOwningPlayer(b) == Player(0) then
            call EmpUiSay({{UI.delivery}})
        endif
        set tm = null
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
    local integer i = 0
    set EmpPortTab = InitHashtable()
{{portLines}}
    call EmpPortPrices()
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_TRAIN_START, null)
        call TriggerRegisterPlayerUnitEvent(fin, Player(i), EVENT_PLAYER_UNIT_TRAIN_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpPortTrain)
    call TriggerAddAction(fin, function EmpPortFinish)
    set fin = null
    call TimerStart(CreateTimer(), {{real updateSeconds}}, true, function EmpPortPrices)
    set tr = null
endfunction
