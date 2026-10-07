    set udg_t = CreateTrigger()
    call TriggerRegisterTimerEventSingle( udg_t, 0.50 )
    call TriggerAddAction( udg_t, function {{fn}} )
