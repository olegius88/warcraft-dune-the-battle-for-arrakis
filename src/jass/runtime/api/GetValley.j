    // not called by the shipped scripts, and no shipped map has a GameElements group for it:
    // script point 0 (map centre when the map has none)
    if EmpScriptX[0] != 0.0 or EmpScriptY[0] != 0.0 then
        return Location(EmpScriptX[0], EmpScriptY[0])
    endif
    return Location((EmpMapMinX + EmpMapMaxX) / 2, (EmpMapMinY + EmpMapMaxY) / 2)
