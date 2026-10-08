    local unit u
    // MCV deploys into a construction yard of its house (resolved at build time: EmpDeployType)
    if EmpAlive(a1) and EmpDeployType(EmpType(a1)) != 0 then
        set u = CreateUnit(GetOwningPlayer(a1), EmpDeployType(EmpType(a1)), GetUnitX(a1), GetUnitY(a1), {{FACING}})
        call RemoveUnit(a1)
        set u = null
    endif
