    // (obj, side)
    if not EmpAlive(a1) then
        return 0
    endif
    return EF_B2I(EmpSideNear(a2, GetUnitX(a1), GetUnitY(a1), {{real RT.NEAR_OBJECT_TO_SIDE}}))
