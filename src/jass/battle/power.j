// ---- power (Rules.txt PowerGenerated / PowerUsed / DisableWithLowPower), as Game.exe 1.09 does it
// (test/emperor-mission.test.ts): a side makes the PowerGenerated of its buildings times their health
// share and uses their PowerUsed (0x53f3c0); its status is low when it uses more than it makes or
// makes nothing (0x53f640, x = 100 - 50 * used / made below 50, or no generation at all), and then
// DisableWithLowPower objects stop (0x486010). That holds for a side without any generator too.
// Buildings under construction neither use nor make power (EmpOnConstructStart marks them).
// EmpPowerTab[type]: 0 PowerGenerated, 3 PowerUsed, 1 DisableWithLowPower.
function EmpPowerType takes integer t, integer made, integer used, boolean lowOff returns nothing
    call SaveInteger(EmpPowerTab, t, 0, made)
    call SaveInteger(EmpPowerTab, t, 3, used)
    call SaveBoolean(EmpPowerTab, t, 1, lowOff)
endfunction

function EmpPowerData takes nothing returns nothing
    set EmpPowerTab = InitHashtable()
{{powerLines}}
endfunction

function EmpPowerTick takes nothing returns nothing
    local integer i = 0
    local real made
    local integer used
    local boolean low
    local group g = CreateGroup()
    local unit u
    local integer t
    loop
        exitwhen i > {{MAX_SIDE}}
        set made = 0.0
        set used = 0
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if EmpAlive(u) and not LoadBoolean(EmpPowerTab, GetHandleId(u), 2) then
                set t = EmpType(u)
                set made = made + LoadInteger(EmpPowerTab, t, 0) * GetUnitLifePercent(u) / 100.0
                set used = used + LoadInteger(EmpPowerTab, t, 3)
            endif
        endloop
        set low = made <= 0.0 or used > made
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if LoadBoolean(EmpPowerTab, EmpType(u), 1) then
                call PauseUnit(u, low)
            endif
        endloop
        if i == 0 then
            call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_LUMBER, IMaxBJ(R2I(made) - used, 0))
            if low and used > 0 and not EmpLowPower[0] then
                // the original line of the player's house (Uispoken.txt ATLowPower...; helpers.j EmpUiSay)
                call EmpUiSay({{UI.lowPower}})
            endif
        endif
        set EmpLowPower[i] = low
        set EmpPowerSum[i] = R2I(made) - used
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
endfunction
