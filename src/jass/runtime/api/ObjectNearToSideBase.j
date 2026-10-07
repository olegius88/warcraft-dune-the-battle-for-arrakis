    // (obj, side)
    local integer b = EmpBaseOfSide(a2)
    if not EmpAlive(a1) then
        return 0
    endif
    return EF_B2I(IsUnitInRangeXY(a1, EmpBaseX[b], EmpBaseY[b], {{real RT.NEAR_OBJECT_TO_BASE}}))
