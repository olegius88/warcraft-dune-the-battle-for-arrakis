    local integer b = EmpBaseOfSide(a2)
    return EF_B2I(EmpSideNear(a1, EmpBaseX[b], EmpBaseY[b], {{real RT.NEAR_SIDE_TO_BASE}}))
