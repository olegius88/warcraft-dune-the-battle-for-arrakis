    // worms leave this side's units alone (EmpSandTarget on territory battle maps)
    if a1 >= 0 and a1 <= {{RT.NEUTRAL_SIDE}} then
        set EmpWormRepel[a1] = true
        set EmpWormAttract[a1] = false
    endif
