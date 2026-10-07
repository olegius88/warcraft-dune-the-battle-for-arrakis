    local unit u
    // construction yard back into an MCV of its house (resolved at build time: EmpUndeployType)
    if EmpAlive(a1) and EmpUndeployType(GetUnitTypeId(a1)) != 0 then
        set u = CreateUnit(GetOwningPlayer(a1), EmpUndeployType(GetUnitTypeId(a1)), GetUnitX(a1), GetUnitY(a1), {{FACING}})
        call RemoveUnit(a1)
        set u = null
    endif
