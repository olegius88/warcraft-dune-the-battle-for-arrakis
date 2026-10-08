    // Game.exe 1.09: AI side behaviour 2 (DEFENSIVE + STRONG), a re-tuning of the AI's values, not
    // an order: the base-running AI takes it (battle forces.j EmpAiBehave); a side the order-based AI
    // runs keeps its units at its base and fights there (it idled them before, mode 0)
    if a1 == {{AI_RUN_SIDE}} and EmpAiOn then
        set EmpAiBehaveMode = {{AI_BEHAVIOUR.defensive}}
        call ExecuteFunc("EmpAiBehave")
    elseif a1 >= 0 and a1 <= {{RT.NEUTRAL_SIDE}} then
        set EmpAIMode[a1] = 8
    endif
