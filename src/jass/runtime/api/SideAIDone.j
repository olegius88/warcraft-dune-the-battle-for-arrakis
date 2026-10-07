    local unit u = EmpFirstUnit(a1, true)
    if u == null then
        return 1
    endif
    if EmpAIMode[a1] == 2 and EmpAITarget[a1] != null then
        return EF_B2I(IsUnitInRangeLoc(u, EmpAITarget[a1], {{real RT.AI_TARGET_REACHED}}))
    endif
    return EF_B2I(GetUnitCurrentOrder(u) == 0)
