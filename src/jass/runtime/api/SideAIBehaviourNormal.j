    // Game.exe 1.09: AI side behaviour 0 (no change to the AI's values; battle forces.j EmpAiBehave
    // logs it); a side the order-based AI runs, between aggressive and defensive: its units stay near
    // their own base and fight there
    if a1 == {{AI_RUN_SIDE}} and EmpAiOn then
        set EmpAiBehaveMode = {{AI_BEHAVIOUR.normal}}
        call ExecuteFunc("EmpAiBehave")
    elseif a1 >= 0 and a1 <= {{RT.NEUTRAL_SIDE}} then
        set EmpAIMode[a1] = 8
    endif
