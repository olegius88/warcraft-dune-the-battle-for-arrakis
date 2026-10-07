// Super weapon probe (src/smoke/build-superweapon-probe.ts): can a palace train a charge marker
// (cost 0) whose attack-ground order the trigger catches as the strike point, in 1.31.1?
// Reported: the train orders, the trained unit, the point order event (order, point), the marker.
function SwProbeLog takes string s returns nothing
    set udg_log[udg_n] = s
    set udg_n = udg_n + 1
    call PreloadGenClear()
    call PreloadGenStart()
    set udg_i = 0
    loop
        exitwhen udg_i >= udg_n
        call Preload(udg_log[udg_i])
        set udg_i = udg_i + 1
    endloop
    call PreloadGenEnd({{str report}})
endfunction

function SwProbeTrained takes nothing returns nothing
    set udg_m = GetTrainedUnit()
    call SwProbeLog("trained " + GetUnitName(udg_m) + " id ok=" + I2S(IntegerTertiaryOp(GetUnitTypeId(udg_m) == {{marker}}, 1, 0)))
endfunction

function SwProbeOrder takes nothing returns nothing
    if GetIssuedOrderId() == OrderId("attackground") then
        call SwProbeLog("attackground event at " + I2S(R2I(GetOrderPointX())) + "," + I2S(R2I(GetOrderPointY())))
        call RemoveUnit(GetTriggerUnit())
    endif
endfunction

function SwProbeRun takes nothing returns nothing
    local unit b = CreateUnit(Player(0), {{palace}}, 0.0, 0.0, 270.0)
    local trigger t = CreateTrigger()
    local boolean ok
    call TriggerRegisterPlayerUnitEvent(t, Player(0), EVENT_PLAYER_UNIT_TRAIN_FINISH, null)
    call TriggerAddAction(t, function SwProbeTrained)
    set t = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t, Player(0), EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER, null)
    call TriggerAddAction(t, function SwProbeOrder)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_FOOD_CAP, 50)
    call SetPlayerTechMaxAllowed(Player(0), {{marker}}, 1)
    set ok = IssueImmediateOrderById(b, {{marker}})
    call SwProbeLog("train order=" + I2S(IntegerTertiaryOp(ok, 1, 0)))
    call TriggerSleepAction({{real wait}})
    if udg_m == null then
        call SwProbeLog("nothing trained")
        return
    endif
    // far beyond any attack range: the order event still carries the point
    set ok = IssuePointOrder(udg_m, "attackground", 1500.0, -1200.0)
    call SwProbeLog("attackground order=" + I2S(IntegerTertiaryOp(ok, 1, 0)))
    call TriggerSleepAction(1.0)
    call SwProbeLog("marker removed=" + I2S(IntegerTertiaryOp(GetUnitTypeId(udg_m) == 0, 1, 0)))
    call SwProbeLog("done")
    set b = null
    set t = null
endfunction
