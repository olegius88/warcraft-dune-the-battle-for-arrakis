    set EmpCamSpin = 0.0
    if EmpCamSpinTimer != null then
        call PauseTimer(EmpCamSpinTimer)
    endif
    call SetCameraFieldForPlayer(Player(0), CAMERA_FIELD_ROTATION, {{real RT.CAMERA_DEFAULT_ROTATION}}, 1.0)
