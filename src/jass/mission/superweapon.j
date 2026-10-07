// ---- palace super weapons (src/emperor/superweapons.ts): a palace trains its charge for the
// charge's BuildTime (one at a time); the charge's attack-ground order is the strike, at any distance
// (probe src/smoke/build-superweapon-probe.ts), and the charge is used up. EmpSwStrike: runtime helpers.j.
function EmpSwData takes nothing returns nothing
    set EmpSwTab = InitHashtable()
{{swLines}}
endfunction

function EmpSwOrder takes nothing returns nothing
    local unit u = GetTriggerUnit()
    if GetIssuedOrderId() == OrderId("attackground") and HaveSavedInteger(EmpSwTab, GetUnitTypeId(u), 0) then
        call EmpSwStrike(GetUnitTypeId(u), GetOwningPlayer(u), GetOrderPointX(), GetOrderPointY())
        call RemoveUnit(u)
    endif
    set u = null
endfunction

function EmpSwInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpSwData()
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER, null)
{{swLimitLines}}
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpSwOrder)
    set tr = null
endfunction
