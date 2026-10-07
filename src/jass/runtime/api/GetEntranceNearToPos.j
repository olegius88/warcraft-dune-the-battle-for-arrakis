    local integer i = 0
    local integer best = 0
    local real bd = 1000000000.0
    local real d
    loop
        exitwhen i >= EmpEntrCount
        set d = (EmpEntrX[i] - GetLocationX(a1)) * (EmpEntrX[i] - GetLocationX(a1)) + (EmpEntrY[i] - GetLocationY(a1)) * (EmpEntrY[i] - GetLocationY(a1))
        if d < bd then
            set bd = d
            set best = i
        endif
        set i = i + 1
    endloop
    return Location(EmpEntrX[best], EmpEntrY[best])
