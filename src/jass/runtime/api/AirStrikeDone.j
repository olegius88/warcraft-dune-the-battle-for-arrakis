    local integer slot = ModuloInteger(a1, {{RT.AIRSTRIKE_SLOTS}})
    local group g = EmpStrike[slot]
    local group left
    local unit u
    local integer alive = 0
    if g == null then
        return 1
    endif
    set left = CreateGroup()
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            if EmpTick >= EmpStrikeEnd[slot] then
                call RemoveUnit(u)
            else
                set alive = alive + 1
                call GroupAddUnit(left, u)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set EmpStrike[slot] = left
    set left = null
    set g = null
    if alive == 0 then
        return 1
    endif
    return 0
