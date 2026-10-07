    local integer i = 0
    local integer pick = -1
    loop
        exitwhen i >= EmpEntrCount
        if EmpEntrTag[i] == {{RT.NEUTRAL_TAG}} and (pick < 0 or GetRandomInt(0, 1) == 0) then
            set pick = i
        endif
        set i = i + 1
    endloop
    if pick < 0 then
        set pick = EmpEntrCount - 1
    endif
    return Location(EmpEntrX[pick], EmpEntrY[pick])
