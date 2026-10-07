    if not EmpAlive(a1) or not EmpAlive(a2) then
        return 0
    endif
    return EF_B2I(IsUnitInRange(a1, a2, {{real RT.NEAR_OBJECT_TO_OBJECT}}))
