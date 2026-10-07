    if a1 != null then
        set EmpCamSet = true
        set EmpCamMoveEnd = EmpTick + IMaxBJ(a2, 1)
        call PanCameraToTimedLocForPlayer(Player(0), a1, I2R(IMaxBJ(a2, 1)) / {{TPS}})
    endif
