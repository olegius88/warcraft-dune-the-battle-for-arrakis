    if a3 == null or a2 <= 0 then
        return null
    endif
    // offsets are in tiles; Emperor y grows downwards; orientation 0..3 = 90 degree steps
    return CreateUnit(EmpSidePlayer(a1), a2, GetLocationX(a3) + EmpTiles(a4), GetLocationY(a3) - EmpTiles(a5), {{FACING}} - {{real RT.ORIENTATION_STEP}} * a6)
