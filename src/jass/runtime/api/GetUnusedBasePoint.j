    local integer i = 0
    loop
        exitwhen i >= EmpBaseCount
        if EmpBaseOwner[i] < 0 then
            set EmpBaseOwner[i] = {{RT.NEUTRAL_TAG}}
            return Location(EmpBaseX[i], EmpBaseY[i])
        endif
        set i = i + 1
    endloop
    return Location(EmpBaseX[0], EmpBaseY[0])
