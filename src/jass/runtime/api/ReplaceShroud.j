    // (point, radius in tiles): close the areas RemoveShroud opened there and cover the area again
    local integer i = 0
    local real r
    if a1 == null then
        return
    endif
    set r = EmpTiles(a2)
    loop
        exitwhen i >= EmpShroudCount
        if EmpShroudMod[i] != null and (EmpShroudX[i] - GetLocationX(a1)) * (EmpShroudX[i] - GetLocationX(a1)) + (EmpShroudY[i] - GetLocationY(a1)) * (EmpShroudY[i] - GetLocationY(a1)) <= r * r then
            call DestroyFogModifier(EmpShroudMod[i])
            set EmpShroudMod[i] = null
        endif
        set i = i + 1
    endloop
    call SetFogStateRadiusLoc(Player(0), FOG_OF_WAR_MASKED, a1, r, true)
