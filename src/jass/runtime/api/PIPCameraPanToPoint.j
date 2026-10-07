    if a1 != null then
        set EmpPipUnit = null
        set EmpPipMoveEnd = EmpTick + IMaxBJ(a2, 1)
        call EmpPipShow(GetLocationX(a1), GetLocationY(a1), true)
    endif
