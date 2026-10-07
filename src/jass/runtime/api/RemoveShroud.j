    local fogmodifier f
    if a1 != null then
        set f = CreateFogModifierRadiusLoc(Player(0), FOG_OF_WAR_VISIBLE, a1, EmpTiles(a2), true, false)
        call FogModifierStart(f)
        // remembered so ReplaceShroud can close the area again
        if EmpShroudCount < {{RT.SHROUD_SLOTS}} then
            set EmpShroudMod[EmpShroudCount] = f
            set EmpShroudX[EmpShroudCount] = GetLocationX(a1)
            set EmpShroudY[EmpShroudCount] = GetLocationY(a1)
            set EmpShroudCount = EmpShroudCount + 1
        endif
        set f = null
    endif
