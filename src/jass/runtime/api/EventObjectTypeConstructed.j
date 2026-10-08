    if EmpLastBuiltSide == a1 and EmpLastBuilt != null and EmpType(EmpLastBuilt) == a2 then
        set EmpLastBuiltSide = -1
        return 1
    endif
    return 0
