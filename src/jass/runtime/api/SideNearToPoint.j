    if a2 == null then
        return 0
    endif
    return EF_B2I(EmpSideNear(a1, GetLocationX(a2), GetLocationY(a2), {{real RT.NEAR_SIDE_TO_POINT}}))
