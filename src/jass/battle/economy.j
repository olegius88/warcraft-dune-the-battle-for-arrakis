// ---- economy & construction glue ----
function EmpNearestMine takes real x, real y returns unit
    local group g = CreateGroup()
    local unit u
    local unit best = null
    local real bd = 1000000000.0
    local real d
    call GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_PASSIVE), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '{{spiceField}}' and GetResourceAmount(u) > 0 then
            set d = (GetUnitX(u) - x) * (GetUnitX(u) - x) + (GetUnitY(u) - y) * (GetUnitY(u) - y)
            if d < bd then
                set bd = d
                set best = u
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return best
endfunction

function EmpHarvestIdleEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    local unit m
    if GetUnitTypeId(u) == '{{harvester}}' and EmpAlive(u) and GetUnitCurrentOrder(u) == 0 then
        set m = EmpNearestMine(GetUnitX(u), GetUnitY(u))
        if m != null then
            call IssueTargetOrder(u, "harvest", m)
        endif
    endif
    set u = null
    set m = null
    return false
endfunction

function EmpHarvestTick takes nothing returns nothing
    local integer i = 0
    loop
        exitwhen i > {{MAX_SIDE}}
        call GroupEnumUnitsOfPlayer(EmpTmpGroup, Player(i), Filter(function EmpHarvestIdleEnum))
        set i = i + 1
    endloop
endfunction

// the builders of a construction yard, once per yard (EmpYardsServed)
function EmpGiveBuilders takes unit b returns nothing
    local integer t = GetUnitTypeId(b)
    if IsUnitInGroup(b, EmpYardsServed) then
        return
    endif
    call GroupAddUnit(EmpYardsServed, b)
{{builderLines}}
endfunction

// Builders came only with a yard the player built (CONSTRUCT_FINISH); yards made with CreateUnit
// (defence bases, placed story bases, BuildObject) got none, so there the player could build nothing.
// Every yard of the player gets them whenever it appears (test/emperor-mission.test.ts).
function EmpYardTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit b
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set b = FirstOfGroup(g)
        exitwhen b == null
        call GroupRemoveUnit(g, b)
        if EmpAlive(b) and ({{isConYard}}) and not LoadBoolean(EmpPowerTab, GetHandleId(b), 2) then
            call EmpGiveBuilders(b)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpOnBuildingDone takes nothing returns nothing
    local unit b = GetConstructedStructure()
    local integer t = GetUnitTypeId(b)
    call RemoveSavedBoolean(EmpPowerTab, GetHandleId(b), 2)
    if {{isConYard}} then
        call EmpGiveBuilders(b)
    endif
    if {{isRefinery}} then
        call CreateUnit(GetOwningPlayer(b), '{{harvester}}', GetUnitX(b) + {{real C.NEW_HARVESTER_OFFSET}}, GetUnitY(b) - {{real C.NEW_HARVESTER_OFFSET}}, {{FACING}})
    endif
    set b = null
endfunction

function EmpOnConstructStart takes nothing returns nothing
    // the MCV is consumed by the construction yard it starts
    local unit b = GetConstructingStructure()
    local group g
    local unit u
    // under construction: no power until it is finished (EmpPowerTick)
    call SaveBoolean(EmpPowerTab, GetHandleId(b), 2, true)
    if {{isConYard}} then
        set g = CreateGroup()
        call GroupEnumUnitsInRange(g, GetUnitX(b), GetUnitY(b), {{real C.MCV_CONSUME_RADIUS}}, null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if GetUnitTypeId(u) == '{{mcv}}' and GetOwningPlayer(u) == GetOwningPlayer(b) then
                call RemoveUnit(u)
                exitwhen true
            endif
        endloop
        call DestroyGroup(g)
        set g = null
    endif
    set b = null
endfunction

// [General] HarvReplacementDelay ("ticks before harvester gets replaced"): a side with a refinery and
// no harvester gets one at the refinery after that many ticks. CashDeliveryWhenNoSpice*: once no
// spice is left on the map, every side with a refinery gets AmountMin..Max credits every
// FrequencyMin..Max ticks.
// TODO(economy): the conditions are read from the key names: whether Emperor replaces every lost
// harvester or only the last one, and pays the cash per refinery or per side, is not in Rules.txt.
function EmpHarvReplaceTick takes nothing returns nothing
    local integer i = 0
    local group g = CreateGroup()
    local unit u
    local unit refinery
    local integer harvesters
    local integer t
    local integer spice = 0
    call GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_PASSIVE), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '{{spiceField}}' then
            set spice = spice + GetResourceAmount(u)
        endif
    endloop
    loop
        exitwhen i > {{MAX_SIDE}}
        set refinery = null
        set harvesters = 0
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            set t = GetUnitTypeId(u)
            if EmpAlive(u) and ({{isRefinery}}) and not LoadBoolean(EmpPowerTab, GetHandleId(u), 2) then
                set refinery = u
            elseif EmpAlive(u) and t == '{{harvester}}' then
                set harvesters = harvesters + 1
            endif
        endloop
        if refinery == null or harvesters > 0 then
            set EmpHarvGone[i] = 0
        elseif EmpHarvGone[i] == 0 then
            set EmpHarvGone[i] = EmpTick
        elseif EmpTick - EmpHarvGone[i] >= {{harvReplaceTicks}} then
            call CreateUnit(Player(i), '{{harvester}}', GetUnitX(refinery) + {{real C.NEW_HARVESTER_OFFSET}}, GetUnitY(refinery) - {{real C.NEW_HARVESTER_OFFSET}}, {{FACING}})
            set EmpHarvGone[i] = 0
        endif
        if refinery != null and spice == 0 then
            if EmpCashNext[i] == 0 then
                set EmpCashNext[i] = EmpTick + GetRandomInt({{cash.freqMin}}, {{cash.freqMax}})
            elseif EmpTick >= EmpCashNext[i] then
                call SetPlayerState(Player(i), PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(Player(i), PLAYER_STATE_RESOURCE_GOLD) + GetRandomInt({{cash.min}}, {{cash.max}}))
                set EmpCashNext[i] = EmpTick + GetRandomInt({{cash.freqMin}}, {{cash.freqMax}})
            endif
        endif
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
    set refinery = null
endfunction
