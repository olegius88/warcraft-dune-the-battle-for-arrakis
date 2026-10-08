    // Game.exe 1.09: AI side behaviour 1 (AGGRESSIVE + STRONG), a re-tuning of the AI's values, not
    // an order: the base-running AI takes it (battle forces.j EmpAiBehave); a side the order-based AI
    // runs attacks the enemy base
    if a1 == {{AI_RUN_SIDE}} and EmpAiOn then
        set EmpAiBehaveMode = {{AI_BEHAVIOUR.aggressive}}
        call ExecuteFunc("EmpAiBehave")
    else
        set EmpAIMode[a1] = 1
    endif
