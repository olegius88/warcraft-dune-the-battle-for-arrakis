    // (speed, direction): the shipped scripts use (2, 1) and (2, 2); direction 2 spins the other way
    set EmpCamSpin = I2R(a1) * {{real RT.CAMERA_SPIN_DEGREES}}
    if a2 == 2 then
        set EmpCamSpin = -EmpCamSpin
    endif
    if EmpCamSpinTimer == null then
        set EmpCamSpinTimer = CreateTimer()
    endif
    call TimerStart(EmpCamSpinTimer, {{real RT.CAMERA_SPIN_PERIOD}}, true, function EmpCamSpinTick)
