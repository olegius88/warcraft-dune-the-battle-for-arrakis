    local unit u = EmpFirstUnit(a2, false)
    if u == null then
        return 0
    endif
    return EF_B2I(EmpSideNear(a1, GetUnitX(u), GetUnitY(u), {{real RT.NEAR_SIDE_TO_OBJECT}}))
