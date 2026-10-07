    local integer s = EmpNextSide
    if EmpNextSide < {{RT.MAX_SIDE}} then
        set EmpNextSide = EmpNextSide + 1
    endif
    set EmpSideBase[s] = -1
    return s
