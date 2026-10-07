    // returns the replacement unit (see RETURN_OVERRIDE)
    local unit u = null
    if EmpAlive(a1) then
        set u = CreateUnit(GetOwningPlayer(a1), a2, GetUnitX(a1), GetUnitY(a1), GetUnitFacing(a1))
        call RemoveUnit(a1)
    endif
    return u
