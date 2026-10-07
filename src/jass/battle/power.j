// ---- power (Rules.txt): balance per side, DisableWithLowPower turrets pause while short ----
// TODO(power): buildings under construction count as finished; sides with no generator at all
// (scripted story bases) are exempt — how Emperor treats them is not established.
function EmpPowerType takes integer t, integer power, boolean lowOff returns nothing
    call SaveInteger(EmpPowerTab, t, 0, power)
    call SaveBoolean(EmpPowerTab, t, 1, lowOff)
endfunction

function EmpPowerData takes nothing returns nothing
    set EmpPowerTab = InitHashtable()
{{powerLines}}
endfunction

function EmpPowerTick takes nothing returns nothing
    local integer i = 0
    local integer sum
    local integer p
    local boolean gen
    local boolean low
    local group g = CreateGroup()
    local unit u
    loop
        exitwhen i > {{MAX_SIDE}}
        set sum = 0
        set gen = false
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if EmpAlive(u) then
                set p = LoadInteger(EmpPowerTab, GetUnitTypeId(u), 0)
                set sum = sum + p
                if p > 0 then
                    set gen = true
                endif
            endif
        endloop
        set low = gen and sum < 0
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if LoadBoolean(EmpPowerTab, GetUnitTypeId(u), 1) then
                call PauseUnit(u, low)
            endif
        endloop
        if i == 0 then
            call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_LUMBER, IMaxBJ(sum, 0))
            if low and not EmpLowPower[0] then
                call EmpShow({{str C.LOW_POWER_MESSAGE}})
            endif
        endif
        set EmpLowPower[i] = low
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
endfunction
