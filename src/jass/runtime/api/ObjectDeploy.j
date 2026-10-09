    local unit u
    // MCV deploys into a construction yard of its house (resolved at build time: EmpDeployType)
    if EmpAlive(a1) and EmpDeployType(EmpType(a1)) != 0 then
        set u = CreateUnit(GetOwningPlayer(a1), EmpDeployType(EmpType(a1)), GetUnitX(a1), GetUnitY(a1), {{FACING}})
        call RemoveUnit(a1)
        set u = null
    elseif EmpAlive(a1) and (EmpDeployable(a1) or (EmpBoomTab != null and HaveSavedInteger(EmpBoomTab, EmpType(a1), 0)) or (EmpRideTab != null and LoadBoolean(EmpRideTab, EmpType(a1), 1))) then
        // a deployable unit (Rules.txt DeployInf / Kobra; Game.exe 0x4f30b0 / 0x4f310b set the deploy /
        // undeploy state of any unit that can deploy): mission deploy.j
        call EmpDeploySet(a1, true)
    endif
