    local unit u
    // construction yard back into an MCV of its house (resolved at build time: EmpUndeployType)
    if EmpAlive(a1) and EmpUndeployType(EmpType(a1)) != 0 then
        set u = CreateUnit(GetOwningPlayer(a1), EmpUndeployType(EmpType(a1)), GetUnitX(a1), GetUnitY(a1), {{FACING}})
        call RemoveUnit(a1)
        set u = null
    elseif EmpAlive(a1) and EmpDeployable(a1) then
        call EmpDeploySet(a1, false)
    endif
