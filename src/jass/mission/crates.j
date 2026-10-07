// Crate pickup (crates are created by EmpAddCrate in the runtime helpers): a unit of a real side
// within CRATE_RADIUS takes it (regression test: test/emperor-mission.test.ts). Crates of the
// scripts (NewCrate*) disappear after Rules.txt [Crate] Lifespan; crates placed in the map stay.
function EmpCrateTick takes nothing returns nothing
    local integer i = 0
    local group g = CreateGroup()
    local unit u
    local unit taker
    local player who
    call EmpStealthExpire()
    loop
        exitwhen i >= EmpCrateCount
        if EmpCrateItem[i] != null and EmpCrateEnd[i] > 0 and EmpTick >= EmpCrateEnd[i] then
            call RemoveItem(EmpCrateItem[i])
            set EmpCrateItem[i] = null
        endif
        if EmpCrateItem[i] != null then
            set taker = null
            call GroupEnumUnitsInRange(g, GetItemX(EmpCrateItem[i]), GetItemY(EmpCrateItem[i]), {{real RT.CRATE_RADIUS}}, null)
            loop
                set u = FirstOfGroup(g)
                exitwhen u == null
                call GroupRemoveUnit(g, u)
                if taker == null and EmpAlive(u) and GetPlayerId(GetOwningPlayer(u)) < {{RT.NEUTRAL_SIDE}} and not IsUnitType(u, UNIT_TYPE_STRUCTURE) then
                    set taker = u
                endif
            endloop
            if taker != null then
                set who = GetOwningPlayer(taker)
                if EmpCrateGift[i] > 0 then
                    call CreateUnit(who, EmpCrateGift[i], GetUnitX(taker), GetUnitY(taker), {{FACING}})
                elseif EmpCrateGift[i] == {{RT.CRATE_KIND.bomb}} then
                    call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.bomb.id}}', {{ART_ABILITY.bomb.type}}, 0), GetUnitX(taker), GetUnitY(taker)))
                    call EmpDamageArea(GetUnitX(taker), GetUnitY(taker), {{real RT.CRATE_BOMB_RADIUS}}, {{real RT.CRATE_BOMB_DAMAGE}})
                elseif EmpCrateGift[i] == {{RT.CRATE_KIND.stealth}} then
                    call EmpStealthAround(taker)
                elseif EmpCrateGift[i] == {{RT.CRATE_KIND.shroud}} then
                    // the taker's map is covered by the shroud again
                    call SetFogStateRect(who, FOG_OF_WAR_MASKED, bj_mapInitialPlayableArea, false)
                else
                    call SetPlayerState(who, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(who, PLAYER_STATE_RESOURCE_GOLD) + EmpCrateCash[i])
                endif
                call DestroyEffect(AddSpecialEffect({{str EFFECT.crateTaken}}, GetItemX(EmpCrateItem[i]), GetItemY(EmpCrateItem[i])))
                call RemoveItem(EmpCrateItem[i])
                set EmpCrateItem[i] = null
            endif
        endif
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
    set taker = null
    set who = null
endfunction
