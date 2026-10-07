    // super weapon strike on every side's base (the scripts call it when the player has lost)
    local integer s = 0
    loop
        exitwhen s > {{RT.MAX_SIDE}}
        if EmpSideBase[s] >= 0 then
            call EmpNukeAt(EmpBaseX[EmpSideBase[s]], EmpBaseY[EmpSideBase[s]])
        endif
        set s = s + 1
    endloop
