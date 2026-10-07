// Crates (Emperor: a unit driving over the crate gets CrateGiftObject). WC3 items need an
// inventory, which Emperor units do not have, so the pickup is a proximity check
// (regression test: test/emperor-mission.test.ts).
function EmpAddCrate takes real x, real y, integer gift, integer cash returns nothing
    set EmpCrateItem[EmpCrateCount] = CreateItem('{{ITEM.crate}}', x, y)
    call SetItemInvulnerable(EmpCrateItem[EmpCrateCount], true)
    set EmpCrateGift[EmpCrateCount] = gift
    set EmpCrateCash[EmpCrateCount] = cash
    set EmpCrateCount = EmpCrateCount + 1
endfunction

function EmpCrateTick takes nothing returns nothing
    local integer i = 0
    local group g = CreateGroup()
    local unit u
    local unit taker
    local player who
    loop
        exitwhen i >= EmpCrateCount
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
                if EmpCrateGift[i] != 0 then
                    call CreateUnit(who, EmpCrateGift[i], GetUnitX(taker), GetUnitY(taker), {{FACING}})
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
