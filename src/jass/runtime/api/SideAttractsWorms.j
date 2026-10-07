    // worms prefer this side's units (EmpSandVictim on territory battle maps)
    if a1 >= 0 and a1 <= {{RT.NEUTRAL_SIDE}} then
        set EmpWormAttract[a1] = true
        set EmpWormRepel[a1] = false
    endif
