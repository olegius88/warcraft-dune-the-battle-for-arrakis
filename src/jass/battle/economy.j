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
        if EmpType(u) == '{{spiceField}}' and GetResourceAmount(u) > 0 then
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
    if EmpType(u) == '{{harvester}}' and EmpAlive(u) and GetUnitCurrentOrder(u) == 0 then
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
    local integer t = EmpType(b)
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
    local boolean builders = false
    // Regression (third audit): builders came once per yard; when they all died (storm, worm, a
    // battle) the player could not build again. With none left every yard gives them again.
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set b = FirstOfGroup(g)
        exitwhen b == null or builders
        call GroupRemoveUnit(g, b)
        set builders = EmpAlive(b) and ({{isBuilder}})
    endloop
    if not builders then
        call GroupClear(EmpYardsServed)
    endif
    call GroupClear(g)
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
    local integer t = EmpType(b)
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
            if EmpType(u) == '{{mcv}}' and GetOwningPlayer(u) == GetOwningPlayer(b) then
                call RemoveUnit(u)
                exitwhen true
            endif
        endloop
        call DestroyGroup(g)
        set g = null
    endif
    set b = null
endfunction

// [General] HarvReplacementDelay and CashDeliveryWhenNoSpice*, as Game.exe 1.09 does them
// (test/emperor-mission.test.ts):
// - harvesters (side update 0x53bb30..0x53bb6f, 0x53f490): while a side has fewer harvesters than
//   refineries, its timer (from HarvReplacementDelay) goes down by the shortfall every tick; at its
//   end one harvester comes at the refinery with the fewest harvesters near it and the timer starts
//   again. Every missing harvester is replaced, up to one per refinery.
// - cash (0x53ec20): once the map has no spice, every side gets AmountMin + rand % (Max - Min) credits
//   every FrequencyMin + rand % (Max - Min) ticks, refinery or not, with the GenResources line.
function EmpHarvReplaceTick takes nothing returns nothing
    local integer i = 0
    local group g = CreateGroup()
    local group near = CreateGroup()
    local unit u
    local unit refinery
    local unit array refs
    local integer refineries
    local integer harvesters
    local integer t
    local integer k
    local integer n
    local integer fewest
    local integer spice = 0
    call GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_PASSIVE), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpType(u) == '{{spiceField}}' then
            set spice = spice + GetResourceAmount(u)
        endif
    endloop
    loop
        exitwhen i > {{MAX_SIDE}}
        set refineries = 0
        set harvesters = 0
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            set t = EmpType(u)
            if EmpAlive(u) and ({{isRefinery}}) then
                if refineries < {{C.HARV_MAX_REFINERIES}} then
                    set refs[refineries] = u
                endif
                set refineries = refineries + 1
            elseif EmpAlive(u) and t == '{{harvester}}' then
                set harvesters = harvesters + 1
            endif
        endloop
        if refineries > harvesters then
            set EmpHarvLeft[i] = EmpHarvLeft[i] - (refineries - harvesters) * {{harvCheckTicks}}
            if EmpHarvLeft[i] <= 0 then
                // the refinery with the fewest harvesters near it
                set refinery = null
                set fewest = 0
                set k = 0
                loop
                    exitwhen k >= refineries or k >= {{C.HARV_MAX_REFINERIES}}
                    call GroupEnumUnitsInRange(near, GetUnitX(refs[k]), GetUnitY(refs[k]), {{real C.HARV_HOME_RANGE}}, null)
                    set n = 0
                    loop
                        set u = FirstOfGroup(near)
                        exitwhen u == null
                        call GroupRemoveUnit(near, u)
                        if EmpAlive(u) and GetOwningPlayer(u) == Player(i) and EmpType(u) == '{{harvester}}' then
                            set n = n + 1
                        endif
                    endloop
                    if refinery == null or n < fewest then
                        set refinery = refs[k]
                        set fewest = n
                    endif
                    set k = k + 1
                endloop
                call CreateUnit(Player(i), '{{harvester}}', GetUnitX(refinery) + {{real C.NEW_HARVESTER_OFFSET}}, GetUnitY(refinery) - {{real C.NEW_HARVESTER_OFFSET}}, {{FACING}})
                set EmpHarvLeft[i] = {{harvReplaceTicks}}
            endif
        endif
        if spice == 0 and GetPlayerSlotState(Player(i)) == PLAYER_SLOT_STATE_PLAYING then
            if EmpCashNext[i] == 0 then
                set EmpCashNext[i] = EmpTick + GetRandomInt({{cash.freqMin}}, {{cash.freqLast}})
            elseif EmpTick >= EmpCashNext[i] then
                call SetPlayerState(Player(i), PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(Player(i), PLAYER_STATE_RESOURCE_GOLD) + GetRandomInt({{cash.min}}, {{cash.last}}))
                if i == 0 then
                    call EmpUiSay({{UI.cashDelivery}})
                endif
                set EmpCashNext[i] = EmpTick + GetRandomInt({{cash.freqMin}}, {{cash.freqLast}})
            endif
        endif
        set i = i + 1
    endloop
    call DestroyGroup(g)
    call DestroyGroup(near)
    set g = null
    set near = null
    set refinery = null
endfunction
