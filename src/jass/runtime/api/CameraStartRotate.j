    // (speed, direction): speed degrees a game tick (Game.exe 1.09, RT.CAMERA_SPIN_DEGREES); direction
    // 0 turns the other way, the scripts' 1 and 2 the same way
    set EmpCamSpin = I2R(a1) * {{real RT.CAMERA_SPIN_DEGREES}}
    if a2 == 0 then
        set EmpCamSpin = -EmpCamSpin
    endif
    if EmpCamSpinTimer == null then
        set EmpCamSpinTimer = CreateTimer()
    endif
    call TimerStart(EmpCamSpinTimer, {{real RT.CAMERA_SPIN_PERIOD}}, true, function EmpCamSpinTick)
