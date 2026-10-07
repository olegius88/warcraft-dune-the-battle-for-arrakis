    if EmpAlive(a1) then
        call DestroyEffect(AddSpecialEffect("Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl", GetUnitX(a1), GetUnitY(a1)))
        call KillUnit(a1)
    endif
