    // countdown of a1 ticks shown as a timer window
    if EmpTimer == null then
        set EmpTimer = CreateTimer()
        set EmpTimerWindow = CreateTimerDialog(EmpTimer)
        call TimerDialogSetTitle(EmpTimerWindow, "Осталось:")
    endif
    call TimerStart(EmpTimer, I2R(IMaxBJ(a1, 0)) / {{TPS}}, false, null)
    call TimerDialogDisplay(EmpTimerWindow, true)
