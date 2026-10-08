// Flow test of a mission's own win rule (build-contest.ts --killwin): {{seconds}} s after the mission
// starts every unit of the computer players dies; the mission script must then end the game itself.
function EmpKillWinRun takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer i = 1
    loop
        exitwhen i >= bj_MAX_PLAYERS
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            call SetUnitInvulnerable(u, false)
            call KillUnit(u)
        endloop
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpKillWin takes nothing returns nothing
    call TimerStart(CreateTimer(), {{real seconds}}, false, function EmpKillWinRun)
endfunction
