    local boolean b = EmpAttacked[a1 * {{RT.SIDE_STRIDE}} + a2]
    set EmpAttacked[a1 * {{RT.SIDE_STRIDE}} + a2] = false
    return EF_B2I(b)
