    // side a1 visible to side a2
    local unit u = EmpFirstUnit(a1, false)
    return EF_B2I(u != null and IsUnitVisible(u, EmpSidePlayer(a2)))
