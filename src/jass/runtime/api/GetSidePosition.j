    local unit u = EmpFirstUnit(a1, false)
    if u == null then
        return EF_GetSideBasePoint(a1)
    endif
    return GetUnitLoc(u)
