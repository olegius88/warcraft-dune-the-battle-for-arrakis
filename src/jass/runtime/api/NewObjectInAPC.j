    // (side, type, transport unit): spawn next to the transport
    if not EmpAlive(a3) or a2 <= 0 then
        return null
    endif
    return CreateUnit(EmpSidePlayer(a1), a2, GetUnitX(a3), GetUnitY(a3), GetUnitFacing(a3))
