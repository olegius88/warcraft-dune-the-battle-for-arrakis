// ---- starport prices (Rules.txt [General] StarportCostUpdateDelay, StarportCostVariationPercent):
// every update the price of each starport type changes to 100 % +- the variation; a WC3 type has one
// cost everywhere, so a purchase at a starport pays the difference to the current price (or gets it
// back), and is cancelled when the player cannot pay it.
// EmpPortTab[type]: 0 index, 1 Rules.txt Cost; EmpPortTab[starport type]: 2 true;
// EmpPortTab[starport handle][type]: the difference fixed at the start of that type's purchase.
// TODO(starport): two units of one type queued at different prices share one record (the later
// start wins) if TRAIN_START fires at queueing rather than at the start of training; which one 1.31
// does is not checked. Risk: a few credits off for such a queue.
// TODO(starport): the stock (StarportStockIncrease*, StarportMaxDeliverySingle) and the frigate
// delivery (FrigateCountdown) are not modelled: units come after their BuildTime.
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

// a starport unit is out: the difference to the price fixed at its start is paid or given back; one
// the player cannot pay for is sent back (the stock price returned)
function EmpPortFinish takes nothing returns nothing
    local unit b = GetTriggerUnit()
    local unit u = GetTrainedUnit()
    local integer t = GetUnitTypeId(u)
    local integer delta
    local player p = GetOwningPlayer(b)
    // only a starport settles, and the record goes: a factory reusing the handle id of a destroyed
    // starport took its old price for its own trike (fourth audit, test/emperor-mission.test.ts)
    if LoadBoolean(EmpPortTab, GetUnitTypeId(b), 2) and HaveSavedInteger(EmpPortTab, GetHandleId(b), t) then
        set delta = LoadInteger(EmpPortTab, GetHandleId(b), t)
        call RemoveSavedInteger(EmpPortTab, GetHandleId(b), t)
        if delta > GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) then
            call SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) + LoadInteger(EmpPortTab, t, 1))
            call RemoveUnit(u)
        else
            call SetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(p, PLAYER_STATE_RESOURCE_GOLD) - delta)
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
