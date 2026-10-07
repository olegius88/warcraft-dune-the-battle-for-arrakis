    local group g
    local unit u
    if a1 == null then
        return
    endif
    set g = CreateGroup()
    call GroupEnumUnitsInRangeOfLoc(g, a1, EmpTiles({{RT.WORM_STRIKE_TILES}}), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if not IsUnitType(u, UNIT_TYPE_STRUCTURE) and not IsUnitType(u, UNIT_TYPE_FLYING) then
            call KillUnit(u)
        endif
    endloop
    call DestroyEffect(AddSpecialEffectLoc({{str EFFECT.wormStrike}}, a1))
    call DestroyGroup(g)
    set g = null
