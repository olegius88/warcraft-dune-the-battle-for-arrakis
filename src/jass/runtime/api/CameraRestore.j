    if EmpCamStore != null then
        set EmpCamMoveEnd = EmpTick + IMaxBJ(a1, 1)
        call PanCameraToTimedLocForPlayer(Player(0), EmpCamStore, I2R(IMaxBJ(a1, 1)) / {{TPS}})
    endif
