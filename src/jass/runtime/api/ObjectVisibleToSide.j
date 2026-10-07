    // (obj, side)
    if not EmpAlive(a1) then
        return 0
    endif
    return EF_B2I(IsUnitVisible(a1, EmpSidePlayer(a2)))
