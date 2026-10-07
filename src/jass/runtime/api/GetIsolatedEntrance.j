    // the entrance furthest from the player's base
    local integer b = EmpBaseOfSide(0)
    local integer i = 0
    local integer best = 0
    local real bd = -1.0
    local real d
    loop
        exitwhen i >= EmpEntrCount
        set d = (EmpEntrX[i] - EmpBaseX[b]) * (EmpEntrX[i] - EmpBaseX[b]) + (EmpEntrY[i] - EmpBaseY[b]) * (EmpEntrY[i] - EmpBaseY[b])
        if d > bd then
            set bd = d
            set best = i
        endif
        set i = i + 1
    endloop
    return Location(EmpEntrX[best], EmpEntrY[best])
