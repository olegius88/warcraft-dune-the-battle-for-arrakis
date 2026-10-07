    if a3 == null or a2 <= 0 then
        return null
    endif
    return CreateUnit(EmpSidePlayer(a1), a2, GetLocationX(a3) + GetRandomReal(-{{RT.SPAWN_SPREAD}}, {{RT.SPAWN_SPREAD}}), GetLocationY(a3) + GetRandomReal(-{{RT.SPAWN_SPREAD}}, {{RT.SPAWN_SPREAD}}), {{FACING}})
