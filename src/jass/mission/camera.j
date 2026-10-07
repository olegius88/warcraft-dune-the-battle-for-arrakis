// Emperor starts the main camera on the player's forces; story scripts only pan the PIP
// window. Unless a script or the battle setup placed the camera, centre it on Player(0)'s
// units (regression test: test/emperor-mission.test.ts).
function EmpInitialCamera takes nothing returns nothing
    local group g
    local unit u
    local real x = 0.0
    local real y = 0.0
    local integer n = 0
    call DestroyTimer(GetExpiredTimer())
    if EmpCamSet then
        return
    endif
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            set x = x + GetUnitX(u)
            set y = y + GetUnitY(u)
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if n > 0 then
        call SetCameraPositionForPlayer(Player(0), x / n, y / n)
    endif
endfunction
