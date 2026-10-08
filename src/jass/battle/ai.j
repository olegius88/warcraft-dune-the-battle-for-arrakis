// ---- enemy AI of territory battles beyond its base template (src/emperor/battle.ts, ai.ini) ----
// Base builder: while its construction yard stands and it keeps MinMoneyToConstructBuildings, the AI
// builds one building at a time, of the [BuildingConstructionRatios] category furthest below its
// share (a windtrap first when its power runs short), on the free site that scores best by the
// [PositionAlgorithmRatios*] weights; it appears after the building's Rules.txt BuildTime. Turrets
// keep MinimumGapBetweenTurrets, wait for FirstTechLevelToBuildTurrets and stay within
// MaxTurretsAtLowTech below tech AI_LOW_TECH_BELOW; refineries stop at MaxRefineries; with
// MinMoneyToStartBuildingWalls a turret gets a row of wall pieces on its outer side.
// Tactics: scouts once UnitsToBuildBeforeCreatingScoutTactic units were made (NumberOfScoutTeams,
// one unit each, roaming; the first player building they see becomes the attack target, after
// TicksUntilAISeesIntoShroud the player's base is known anyway); base defence chases enemies within
// DefenceTacticWanderDistance; harvester escorts after TicksBeforeDefendHarvesterTactic; the whole
// home guard to the construction yard when it is hit (after TicksBeforeDefendCYTactic, from tech
// FirstTechLevelForDefendCYTactic); attack waves gather at a staging point and attack when formed or
// after TicksUntilAbandonForming. Simplifications: sites are tried on rings around the base point
// (Perpendicular and Rotation weights are not used: WC3 buildings do not turn).
{{dataFunction}}
// Game.exe 1.09 (0x432040, SideAIBehaviour*): an AI value changed by pct percent of itself,
// v + v * pct * 0.01 computed in the FPU's single precision (Direct3D 7's default DDSCL_FPUSETUP;
// Emperor's SetCooperativeLevel flags 0x8 / 0x13 / 0x293 never ask for DDSCL_FPUPRESERVE 0x1000), so
// JASS reals (32-bit) give the same result, truncated like its float-to-int (0x4706c0)
function EmpAiPct takes integer v, integer pct returns integer
    return R2I(I2R(v) * I2R(pct) * 0.01 + I2R(v))
endfunction

// the row of ai_difficulty.ini for the battle's tech level (1..8)
function EmpAiT takes nothing returns integer
    return IMinBJ(IMaxBJ(EmpTechLevel, 1), {{C.AI_TECH_LEVELS}})
endfunction

// what the AI did, for unattended checks: CustomMapData\{{aiReport}}, one line per entry
function EmpAiLog takes string s returns nothing
    local integer i = 0
{{#if aiReport}}    if EmpAiLogCount >= {{C.AI_REPORT_LINES}} then
        loop
            exitwhen i >= EmpAiLogCount - 1
            set EmpAiLogLine[i] = EmpAiLogLine[i + 1]
            set i = i + 1
        endloop
        set EmpAiLogCount = EmpAiLogCount - 1
    endif
    set EmpAiLogLine[EmpAiLogCount] = "t=" + I2S(EmpTick) + " " + s
    set EmpAiLogCount = EmpAiLogCount + 1
    call PreloadGenClear()
    call PreloadGenStart()
    set i = 0
    loop
        exitwhen i >= EmpAiLogCount
        call Preload(EmpAiLogLine[i])
        set i = i + 1
    endloop
    call PreloadGenEnd({{str aiReport}})
{{/if}}endfunction

// alive enemy buildings of category c (0 core, 1 defence, 2 manufacturing, 3 resource; -1 turrets,
// -2 refineries)
function EmpAiCount takes integer c returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    local integer t
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set t = EmpType(u)
        if EmpAlive(u) and HaveSavedInteger(EmpAiTab, t, 0) then
            if (c >= 0 and LoadInteger(EmpAiTab, t, 0) == c) or (c == -1 and LoadBoolean(EmpAiTab, t, 1)) or (c == -2 and LoadBoolean(EmpAiTab, t, 3)) then
                set n = n + 1
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

// no unit or building within `tiles` of (x, y), none being built there either, buildable ground
function EmpAiFree takes real x, real y, real tiles returns boolean
    local group g = CreateGroup()
    local boolean free
    local integer i = 0
    local real r = tiles * {{real WC3_UNITS_PER_TILE}}
    if x < EmpMapMinX + r or x > EmpMapMaxX - r or y < EmpMapMinY + r or y > EmpMapMaxY - r then
        call DestroyGroup(g)
        set g = null
        return false
    endif
    call GroupEnumUnitsInRange(g, x, y, r, null)
    set free = FirstOfGroup(g) == null
    call DestroyGroup(g)
    set g = null
    loop
        exitwhen i >= EmpAiPending or not free
        if SquareRoot((EmpAiPendX[i] - x) * (EmpAiPendX[i] - x) + (EmpAiPendY[i] - y) * (EmpAiPendY[i] - y)) < r * 2.0 then
            set free = false
        endif
        set i = i + 1
    endloop
    // PATHING_TYPE_BUILDABILITY is "not buildable" when true
    return free and not IsTerrainPathable(x, y, PATHING_TYPE_BUILDABILITY) and not IsTerrainPathable(x + r * 0.5, y + r * 0.5, PATHING_TYPE_BUILDABILITY) and not IsTerrainPathable(x - r * 0.5, y - r * 0.5, PATHING_TYPE_BUILDABILITY)
endfunction

// an enemy turret within `tiles` of (x, y)
function EmpAiTurretNear takes real x, real y, real tiles returns boolean
    local group g = CreateGroup()
    local unit u
    local boolean near = false
    call GroupEnumUnitsInRange(g, x, y, tiles * {{real WC3_UNITS_PER_TILE}}, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetOwningPlayer(u) == Player(1) and LoadBoolean(EmpAiTab, EmpType(u), 1) then
            set near = true
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return near
endfunction

// [PositionAlgorithmRatios*] score of a site for type t at ring r (tiles) of the base point
function EmpAiScore takes integer t, real x, real y, real r returns real
    local boolean ex = LoadBoolean(EmpAiTab, t, 2)
    local group g = CreateGroup()
    local unit u
    local real s = 0.0
    local real minX = 1000000.0
    local real maxX = -1000000.0
    local real minY = 1000000.0
    local real maxY = -1000000.0
    local real edge
    local boolean aligned = false
    local real tile = {{real WC3_UNITS_PER_TILE}}
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and IsUnitType(u, UNIT_TYPE_STRUCTURE) then
            set minX = RMinBJ(minX, GetUnitX(u))
            set maxX = RMaxBJ(maxX, GetUnitX(u))
            set minY = RMinBJ(minY, GetUnitY(u))
            set maxY = RMaxBJ(maxY, GetUnitY(u))
            if EmpType(u) == t and (RAbsBJ(GetUnitX(u) - x) < {{real C.AI_ALIGN_TILES}} * tile or RAbsBJ(GetUnitY(u) - y) < {{real C.AI_ALIGN_TILES}} * tile) then
                set aligned = true
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    // distance to the map edge, as a share of the reach of the rings
    set edge = RMinBJ(RMinBJ(x - EmpMapMinX, EmpMapMaxX - x), RMinBJ(y - EmpMapMinY, EmpMapMaxY - y)) / (tile * {{real C.AI_SITE_MAX}})
    if ex then
        set s = {{real ai.positionExits.distanceFromCentre}} * (1.0 - r / {{real C.AI_SITE_MAX}}) + {{real ai.positionExits.furtherFromEdge}} * RMinBJ(edge, 1.0) + {{real ai.positionExits.outerPerimeter}} * (r / {{real C.AI_SITE_MAX}}) + {{real ai.positionExits.random}} * GetRandomReal(0.0, 1.0)
        if aligned then
            set s = s + {{real ai.positionExits.aligned}}
        endif
        if x >= minX and x <= maxX and y >= minY and y <= maxY then
            set s = s + {{real ai.positionExits.withinExistingBounds}}
        endif
    else
        set s = {{real ai.positionNoExits.distanceFromCentre}} * (1.0 - r / {{real C.AI_SITE_MAX}}) + {{real ai.positionNoExits.furtherFromEdge}} * RMinBJ(edge, 1.0) + {{real ai.positionNoExits.outerPerimeter}} * (r / {{real C.AI_SITE_MAX}}) + {{real ai.positionNoExits.random}} * GetRandomReal(0.0, 1.0)
        if aligned then
            set s = s + {{real ai.positionNoExits.aligned}}
        endif
        if x >= minX and x <= maxX and y >= minY and y <= maxY then
            set s = s + {{real ai.positionNoExits.withinExistingBounds}}
        endif
    endif
    return s
endfunction

// best free site for type t around the base point (EmpAiX / EmpAiY); false when there is none
function EmpAiPlace takes integer t returns boolean
    local integer b = EmpBaseOfSide(1)
    local real r = {{real C.AI_SITE_MIN}}
    local integer a
    local real x
    local real y
    local real s
    local real best = -1.0
    local boolean turret = LoadBoolean(EmpAiTab, t, 1)
    loop
        exitwhen r > {{real C.AI_SITE_MAX}}
        set a = 0
        loop
            exitwhen a >= {{C.AI_SITE_ANGLES}}
            set x = EmpBaseX[b] + r * {{real WC3_UNITS_PER_TILE}} * Cos(a * 2.0 * bj_PI / {{C.AI_SITE_ANGLES}})
            set y = EmpBaseY[b] + r * {{real WC3_UNITS_PER_TILE}} * Sin(a * 2.0 * bj_PI / {{C.AI_SITE_ANGLES}})
            if EmpAiFree(x, y, {{real C.AI_SITE_CLEAR}}) and not (turret and EmpAiTurretNear(x, y, {{real ai.minTurretGapTiles}})) then
                set s = EmpAiScore(t, x, y, r)
                if s > best then
                    set best = s
                    set EmpAiX = x
                    set EmpAiY = y
                endif
            endif
            set a = a + 1
        endloop
        set r = r + {{real C.AI_SITE_STEP}}
    endloop
    return best >= 0.0
endfunction

// a building whose BuildTime has passed: it stands now (when the construction yard still does)
function EmpAiFinish takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer h = GetHandleId(tm)
    local integer t = LoadInteger(EmpAiTab, h, 10)
    local real x = LoadReal(EmpAiTab, h, 11)
    local real y = LoadReal(EmpAiTab, h, 12)
    local integer i = 0
    local unit u
    // free the site
    loop
        exitwhen i >= EmpAiPending
        if EmpAiPendX[i] == x and EmpAiPendY[i] == y then
            set EmpAiPending = EmpAiPending - 1
            set EmpAiPendX[i] = EmpAiPendX[EmpAiPending]
            set EmpAiPendY[i] = EmpAiPendY[EmpAiPending]
        endif
        set i = i + 1
    endloop
    if EmpAlive(EmpTplUnit[EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}]) then
        set u = CreateUnit(Player(1), t, x, y, {{FACING}})
        call EmpAiLog("built " + GetUnitName(u))
        set u = null
    else
        call EmpAiLog("lost (no construction yard) " + GetObjectName(t))
    endif
    call FlushChildHashtable(EmpAiTab, h)
    call DestroyTimer(tm)
    set tm = null
endfunction

// pay for type t and start it at (x, y); it stands after its build time
function EmpAiStart takes integer t, real x, real y returns nothing
    local timer tm = CreateTimer()
    local integer h = GetHandleId(tm)
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, EmpEnemyGold() - LoadInteger(EmpCostTab, t, 0))
    call SaveInteger(EmpAiTab, h, 10, t)
    call SaveReal(EmpAiTab, h, 11, x)
    call SaveReal(EmpAiTab, h, 12, y)
    set EmpAiPendX[EmpAiPending] = x
    set EmpAiPendY[EmpAiPending] = y
    set EmpAiPending = EmpAiPending + 1
    call TimerStart(tm, LoadReal(EmpAiTab, t, 4), false, function EmpAiFinish)
    set tm = null
endfunction

// the type of category c the AI may build now that it has fewest of, random among equals (0: none).
// A random type every turn let a cheap one win whenever a dear one was not affordable yet (5 barracks
// and no factory, HK_A02 2026-10-08); now the builder saves for the one it lacks (test in
// test/emperor-mission.test.ts).
function EmpAiPick takes integer c returns integer
    local integer i = EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}
    local integer last = i + EmpAiBCount[EmpEnemyHouse]
    local integer n = 0
    local integer t
    local integer have
    local integer fewest = 1000000
    local integer pick = 0
    loop
        exitwhen i >= last
        set t = EmpAiBType[i]
        if LoadInteger(EmpAiTab, t, 0) == c and GetPlayerTechMaxAllowed(Player(1), t) != 0 then
            set have = EmpCount(1, t)
            if have < fewest then
                set fewest = have
                set n = 1
                set pick = t
            elseif have == fewest then
                // reservoir sampling among the equally few
                set n = n + 1
                if GetRandomInt(1, n) == 1 then
                    set pick = t
                endif
            endif
        endif
        set i = i + 1
    endloop
    return pick
endfunction

// wall pieces in a row on the outer side of a turret that has none yet
function EmpAiWalls takes nothing returns boolean
    local group g = CreateGroup()
    local unit u
    local integer b = EmpBaseOfSide(1)
    local real a
    local integer k
    local real x
    local real y
    local boolean done = false
    local integer w = EmpAiWall[EmpEnemyHouse]
    if w == 0 or GetPlayerTechMaxAllowed(Player(1), w) == 0 then
        call DestroyGroup(g)
        set g = null
        return false
    endif
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null or done
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and LoadBoolean(EmpAiTab, EmpType(u), 1) and not LoadBoolean(EmpAiTab, GetHandleId(u), 20) then
            call SaveBoolean(EmpAiTab, GetHandleId(u), 20, true)
            set a = Atan2(GetUnitY(u) - EmpBaseY[b], GetUnitX(u) - EmpBaseX[b])
            set k = 0
            loop
                exitwhen k >= {{C.AI_WALL_PIECES}}
                // across the line from the base: pieces either side of the point 2 tiles outside
                set x = GetUnitX(u) + 2.0 * {{real WC3_UNITS_PER_TILE}} * Cos(a) + (k - {{C.AI_WALL_PIECES}} / 2) * {{real WC3_UNITS_PER_TILE}} * Cos(a + bj_PI / 2.0)
                set y = GetUnitY(u) + 2.0 * {{real WC3_UNITS_PER_TILE}} * Sin(a) + (k - {{C.AI_WALL_PIECES}} / 2) * {{real WC3_UNITS_PER_TILE}} * Sin(a + bj_PI / 2.0)
                if EmpAiFree(x, y, 0.4) and EmpEnemyGold() >= LoadInteger(EmpCostTab, w, 0) then
                    call EmpAiStart(w, x, y)
                endif
                set k = k + 1
            endloop
            call EmpAiLog("walls by a turret")
            set done = true
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return done
endfunction

// why the base builder is idle, logged when it changes (0 building; reasons in EmpAiBuild)
function EmpAiWait takes integer why, string s returns nothing
    if why != EmpAiWhy then
        set EmpAiWhy = why
        call EmpAiLog("wait: " + s)
    endif
endfunction

// a building upgrade whose research time has passed (EmpAiUpgrade)
function EmpAiUpgradeDone takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer u = LoadInteger(EmpAiTab, GetHandleId(tm), 13)
    call SetPlayerTechResearched(Player(1), u, 1)
    call EmpAiLog("upgraded " + GetObjectName(u))
    call FlushChildHashtable(EmpAiTab, GetHandleId(tm))
    call DestroyTimer(tm)
    set tm = null
endfunction

// building upgrades (Rules.txt UpgradeCost, units.ts): the first one the AI may research now (its
// tech level reached, its building standing) is bought before new buildings, since the house's
// better units need it; while short of its price the builder saves for it. True: the turn is used.
function EmpAiUpgrade takes nothing returns boolean
    local integer i = EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}
    local integer last = i + EmpAiUpgCount[EmpEnemyHouse]
    local integer u
    local timer tm
    loop
        exitwhen i >= last
        set u = EmpAiUpg[i]
        if GetPlayerTechCount(Player(1), u, true) == 0 and not LoadBoolean(EmpAiTab, u, 6) and GetPlayerTechMaxAllowed(Player(1), u) != 0 and EmpCount(1, EmpAiUpgB[i]) > 0 then
            if EmpEnemyGold() < EmpAiUpgCost[i] + {{ai.minMoneyToBuild}} then
                set EmpAiReserve = EmpAiUpgCost[i] + {{ai.minMoneyToBuild}}
                call EmpAiWait(6, "gold " + I2S(EmpEnemyGold()) + " < upgrade " + I2S(EmpAiUpgCost[i]) + " of " + GetObjectName(u))
                return true
            endif
            call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, EmpEnemyGold() - EmpAiUpgCost[i])
            call SaveBoolean(EmpAiTab, u, 6, true)
            set tm = CreateTimer()
            call SaveInteger(EmpAiTab, GetHandleId(tm), 13, u)
            call TimerStart(tm, EmpAiUpgTime[i], false, function EmpAiUpgradeDone)
            set EmpAiWhy = 0
            call EmpAiLog("upgrade " + GetObjectName(u) + " gold " + I2S(EmpEnemyGold()))
            set tm = null
            return true
        endif
        set i = i + 1
    endloop
    return false
endfunction

// the base builder's turn (EmpEnemyProduce, when no template building was rebuilt)
// Game.exe 1.09 (0x430930): the buildings standing cover every [StartScript] step (a building of its
// category each), the start script is then off ("detected pre built base")
function EmpAiStartCovered takes nothing returns boolean
    local integer array need
    local integer i = 0
    loop
        exitwhen i > 3
        set need[i] = 0
        set i = i + 1
    endloop
    set i = 0
    loop
        exitwhen i >= EmpAiStartCount
        set need[EmpAiStartCat[i]] = need[EmpAiStartCat[i]] + 1
        set i = i + 1
    endloop
    set i = 0
    loop
        exitwhen i > 3
        if need[i] > EmpAiCount(i) then
            return false
        endif
        set i = i + 1
    endloop
    return true
endfunction

// one [StartScript] step (Game.exe 0x42f230): a building of the step's category; with none to pick the
// step waits (AI_START_WAITS turns at most) and is then skipped; one it cannot afford ends the script
function EmpAiStartStep takes nothing returns nothing
    local integer t
    if EmpAiStartAt >= EmpAiStartCount then
        set EmpAiStartState = 2
        call EmpAiLog("start script complete")
        return
    endif
    set t = EmpAiPick(EmpAiStartCat[EmpAiStartAt])
    if t == 0 then
        set EmpAiStartWait = EmpAiStartWait + 1
        if EmpAiStartWait >= {{C.AI_START_WAITS}} then
            call EmpAiLog("start script step " + I2S(EmpAiStartAt) + " skipped")
            set EmpAiStartWait = 0
            set EmpAiStartAt = EmpAiStartAt + 1
        endif
        return
    endif
    set EmpAiStartWait = 0
    if EmpEnemyGold() < LoadInteger(EmpCostTab, t, 0) then
        set EmpAiStartState = 2
        call EmpAiLog("start script ends: cannot afford")
        return
    endif
    if not EmpAiPlace(t) then
        call EmpAiWait(5, "no free site for " + GetObjectName(t))
        return
    endif
    set EmpAiStartAt = EmpAiStartAt + 1
    set EmpAiWhy = 0
    call EmpAiLog("start script step " + I2S(EmpAiStartAt) + ": " + GetObjectName(t))
    call EmpAiStart(t, EmpAiX, EmpAiY)
endfunction

function EmpAiBuild takes nothing returns nothing
    local integer c
    local integer best
    local real deficit
    local real d
    local integer total
    local integer t = 0
    local integer tries = 0
    local integer array count
    local boolean array skip
    // what unit production must leave (forces.j): set below while the builder saves for a building;
    // without it every unit bought first and the builder never reached a refinery's cost (HK_A02
    // report 2026-10-08: one building in 7 minutes, gold 5..805 against a cost of 1500)
    set EmpAiReserve = 0
    if EmpAiPending > 0 then
        return
    endif
    if not EmpAlive(EmpTplUnit[EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}]) then
        call EmpAiWait(1, "no construction yard")
        return
    endif
    // Game.exe's builder states 0 / 1 (0x42ef30): the [StartScript] first, unless the base covers it
    if EmpAiStartState == 0 then
        if EmpAiStartCount == 0 or EmpAiStartCovered() then
            set EmpAiStartState = 2
            call EmpAiLog("start script off: the base covers it")
        else
            set EmpAiStartState = 1
        endif
    endif
    if EmpAiStartState == 1 then
        call EmpAiStartStep()
        return
    endif
    if EmpEnemyGold() < {{ai.minMoneyToBuild}} then
        set EmpAiReserve = {{ai.minMoneyToBuild}}
        call EmpAiWait(2, "gold " + I2S(EmpEnemyGold()) + " < MinMoneyToConstructBuildings")
        return
    endif
    // Game.exe's builder state (0x42ef30) moves on to maintenance whatever it builds next
    if not EmpAiMaintaining and EmpAiCount(0) + EmpAiCount(1) + EmpAiCount(2) + EmpAiCount(3) >= EmpAiTBuildings[EmpAiT()] then
        set EmpAiMaintaining = true
        call EmpAiLog("maintains")
    endif
    // short of power: a windtrap first (MinMoneyToBuildMaintenanceBuildings)
    if EmpPowerSum[1] < 0 and EmpAiPower[EmpEnemyHouse] != 0 and EmpEnemyGold() >= {{ai.minMoneyMaintenance}} then
        set t = EmpAiPower[EmpEnemyHouse]
    elseif EmpAiUpgrade() then
        return
    else
        set c = 0
        set total = 0
        loop
            exitwhen c > 3
            set count[c] = EmpAiCount(c)
            set total = total + count[c]
            set skip[c] = EmpAiRatio[c] <= 0
            set c = c + 1
        endloop
        // Game.exe 1.09 (0x42ef30): by ratio until NumBuildings buildings but walls (0x42f042), then it
        // maintains (every MaintenanceDelay, forces.j): on a coin flip (0x42fd51) the category whose
        // share of all buildings is short of its ratio share by over AI_MAINTAIN_SHORT (0x4307e0)
        if EmpAiMaintaining or total >= EmpAiTBuildings[EmpAiT()] then
            set EmpAiMaintaining = true
            if GetRandomInt(0, 1) != 0 then
                call EmpAiWait(6, "maintenance: not this time")
                return
            endif
            set c = 0
            set d = 0.0
            loop
                exitwhen c > 3
                set d = d + EmpAiRatio[c]
                set c = c + 1
            endloop
            set c = 0
            loop
                exitwhen c > 3
                // short: its share minus its ratio share, Game.exe's group diff
                set skip[c] = skip[c] or I2R(count[c]) / IMaxBJ(1, total) - EmpAiRatio[c] / RMaxBJ(1.0, d) >= {{real C.AI_MAINTAIN_SHORT}}
                set c = c + 1
            endloop
        endif
        // the category furthest below its share; one that cannot be built now (turrets before
        // their tech level or over the low-tech limit, refineries at the limit, no allowed type)
        // gives way to the next one instead of stopping the builder for good
        loop
            exitwhen t != 0 or tries > 3
            set tries = tries + 1
            set best = -1
            set deficit = -1000.0
            set c = 0
            loop
                exitwhen c > 3
                set d = EmpAiRatio[c] * (total + 1) / 100.0 - count[c]
                if not skip[c] and d > deficit then
                    set deficit = d
                    set best = c
                endif
                set c = c + 1
            endloop
            exitwhen best < 0
            set skip[best] = true
            if best == 1 then
                if EmpAiBuildsDef and EmpTechLevel >= {{ai.firstTechTurrets}} and (EmpTechLevel >= {{C.AI_LOW_TECH_BELOW}} or EmpAiCount(-1) < {{ai.maxTurretsLowTech}}) and EmpAiCount(-1) < EmpAiTTurrets[EmpAiT()] then
                    set t = EmpAiPick(1)
                elseif EmpAiBuildsDef and EmpEnemyGold() >= {{ai.minMoneyWalls}} and EmpAiWalls() then
                    return
                endif
            elseif best != 3 or EmpAiCount(-2) < {{ai.maxRefineries}} then
                set t = EmpAiPick(best)
            endif
        endloop
    endif
    if t == 0 then
        call EmpAiWait(3, "no category can be built")
        return
    endif
    if EmpEnemyGold() < LoadInteger(EmpCostTab, t, 0) then
        set EmpAiReserve = LoadInteger(EmpCostTab, t, 0)
        call EmpAiWait(4, "gold " + I2S(EmpEnemyGold()) + " < cost " + I2S(LoadInteger(EmpCostTab, t, 0)) + " of " + GetObjectName(t))
        return
    endif
    if not EmpAiPlace(t) then
        call EmpAiWait(5, "no free site for " + GetObjectName(t))
        return
    endif
    set EmpAiWhy = 0
    call EmpAiLog("start " + GetObjectName(t) + " cat " + I2S(LoadInteger(EmpAiTab, t, 0)) + " gold " + I2S(EmpEnemyGold()))
    call EmpAiStart(t, EmpAiX, EmpAiY)
endfunction

// ---- tactics ----
// the role of a unit in EmpWaveTab child 1: 0 home, 1 scout, 2 escort, 3 wave, 4 post (a story map's guard
// away from the base or a story character: left alone, forces.j EmpStoryAiStart)
function EmpAiRole takes unit u returns integer
    return LoadInteger(EmpWaveTab, GetHandleId(u), 1)
endfunction

function EmpAiHomeUnit takes unit u returns boolean
    return EmpAlive(u) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and EmpType(u) != '{{harvester}}' and EmpAiRole(u) == 0
endfunction

// a random point of the map
function EmpAiRoam takes unit u returns nothing
    call IssuePointOrder(u, "move", GetRandomReal(EmpMapMinX, EmpMapMaxX), GetRandomReal(EmpMapMinY, EmpMapMaxY))
endfunction

// the CY was hit (attacked event of the AI's units)
function EmpAiOnAttacked takes nothing returns nothing
    if GetTriggerUnit() == EmpTplUnit[EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}] then
        set EmpAiCYHit = EmpTick
    endif
endfunction

// the palace super weapon (src/emperor/superweapons.ts): charged for its BuildTime while the AI's
// palace stands, fired at the player's base once the AI knows where it is
function EmpAiSuperweapon takes nothing returns nothing
    local integer t = EmpAiSw[EmpEnemyHouse]
    if t == 0 or EmpCount(1, EmpAiSwPalace[EmpEnemyHouse]) == 0 then
        set EmpAiSwFrom = -1
        return
    endif
    if EmpAiSwFrom < 0 then
        set EmpAiSwFrom = EmpTick
    elseif EmpTick - EmpAiSwFrom >= EmpAiSwTicks[EmpEnemyHouse] and EmpAiKnown then
        call EmpSwStrike(t, Player(1), EmpAiKnownX, EmpAiKnownY)
        // "Death Hand launch detected"... (helpers.j EmpUiSay)
        if LoadInteger(EmpSwTab, t, 0) == 1 then
            call EmpUiSay({{UI.incomingDHand}})
        elseif LoadInteger(EmpSwTab, t, 0) == 2 then
            call EmpUiSay({{UI.incomingHawk}})
        else
            call EmpUiSay({{UI.incomingChaos}})
        endif
        call EmpAiLog("super weapon " + GetObjectName(t))
        set EmpAiSwFrom = EmpTick
    endif
endfunction

// Game.exe 1.09 losing test (0x43f260): which case says the AI is losing, 0 none. Counted like Game.exe:
// every unit of the side (0x44c670), buildings but walls (0x42fc30), Rules.txt AiManufacturing ones
// (0x44cce0), refineries (0x44cc40), its credits; an MCV it has (0x464950; this AI makes none).
function EmpAiLosingCase takes nothing returns integer
    local group g = CreateGroup()
    local unit u
    local integer t
    local boolean yard = false
    local boolean mcv = false
    local integer units = 0
    local integer buildings = 0
    local integer factories = 0
    local integer refineries = 0
    local integer money = EmpEnemyGold()
    local integer losing = 0
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            set t = EmpType(u)
            if IsUnitType(u, UNIT_TYPE_STRUCTURE) then
                if t != EmpAiWall[EmpEnemyHouse] then
                    set buildings = buildings + 1
                endif
                if LoadBoolean(EmpAiTab, t, {{C.AI_TAB_YARD}}) then
                    set yard = true
                endif
                if LoadBoolean(EmpAiTab, t, 3) then
                    set refineries = refineries + 1
                endif
            else
                set units = units + 1
                if t == EmpAiMcv then
                    set mcv = true
                endif
            endif
            if LoadBoolean(EmpAiTab, t, {{C.AI_TAB_MANUFACTURING}}) then
                set factories = factories + 1
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if yard then
        if units >= {{C.AI_LOSING.yardUnits}} then
            return 0
        endif
        if refineries == 0 and money < {{C.AI_LOSING.lowCredits}} then
            return 6
        elseif factories == 0 and refineries == 0 and money < {{C.AI_LOSING.credits}} then
            return 7
        endif
        return 0
    endif
    if money <= EmpAiMcvCost and refineries == 0 then
        set losing = 1
    endif
    if mcv then
        return losing
    endif
    if factories == 0 then
        return 2
    elseif refineries == 0 and money < {{C.AI_LOSING.credits}} then
        return 3
    elseif money < {{C.AI_LOSING.poorCredits}} and units < {{C.AI_LOSING.fewUnits}} and buildings < {{C.AI_LOSING.fewBuildings}} then
        return 4
    elseif factories == 1 and units < {{C.AI_LOSING.fewUnits}} and buildings < {{C.AI_LOSING.fewBuildingsOneFactory}} then
        return 5
    endif
    return losing
endfunction

// Once the AI is losing (Game.exe 0x43f4b0): with 1 - 1 / (100 / ChanceOfRetreating) odds it retreats,
// its units leave the map (SideAIBehaviourRetreat's way), else its "last gasp": AGGRESSIVE
// (SideAIBehaviourAggressive) and every unit at the enemy base.
function EmpAiLosingCheck takes nothing returns nothing
    local integer c
    local group g
    local unit u
    local integer b
    if EmpAiLost or EmpTick < {{C.AI_LOSING.fromTicks}} then
        return
    endif
    set c = EmpAiLosingCase()
    if c == 0 then
        return
    endif
    set EmpAiLost = true
    call EmpAiLog("losing, case " + I2S(c))
    if {{ai.retreatChance}} > 0 and GetRandomInt(0, 100 / {{ai.retreatChance}} - 1) != 0 then
        set EmpAiGone = true
        set EmpAIMode[1] = 3
        call EmpAiLog("retreats")
        return
    endif
    set EmpAiBehaveMode = {{C.AI_BEHAVIOUR.aggressive}}
    call ExecuteFunc("EmpAiBehave")
    set b = EmpBaseOfSide(0)
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) then
            call SaveInteger(EmpWaveTab, GetHandleId(u), 1, 3)
            call SaveBoolean(EmpWaveTab, GetHandleId(u), 0, true)
            call IssuePointOrder(u, "attack", EmpBaseX[b], EmpBaseY[b])
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    call EmpAiLog("last gasp")
endfunction

function EmpAiTactics takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local unit best = null
    local integer b = EmpBaseOfSide(1)
    local integer scouts = 0
    local integer escorts = 0
    local unit harv = null
    local unit threat = null
    local real r
    local boolean formed = true
    local integer waveUnits = 0
    local real tile = {{real WC3_UNITS_PER_TILE}}
    call EmpAiLosingCheck()
    // a retreating AI no longer leads its units (they leave the map, EmpAIMode 3)
    if EmpAiGone then
        call DestroyGroup(g)
        set g = null
        return
    endif
    // the player's base is known after TicksUntilAISeesIntoShroud
    if not EmpAiKnown and EmpTick >= {{ai.ticksSeesIntoShroud}} then
        set EmpAiKnown = true
        set EmpAiKnownX = EmpBaseX[EmpBaseOfSide(0)]
        set EmpAiKnownY = EmpBaseY[EmpBaseOfSide(0)]
        call EmpAiLog("sees into the shroud")
    endif
    // what the AI sees of the player: a building gives the target; the nearest unit near its base is the threat
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        // Locust units (the starport frigate) are no threat: home units cannot attack them (fifth audit)
        if EmpAlive(u) and IsUnitVisible(u, Player(1)) and GetUnitAbilityLevel(u, '{{ABILITY.locust}}') == 0 then
            if IsUnitType(u, UNIT_TYPE_STRUCTURE) and not EmpAiKnown then
                set EmpAiKnown = true
                set EmpAiKnownX = GetUnitX(u)
                set EmpAiKnownY = GetUnitY(u)
                call EmpAiLog("target found " + GetUnitName(u))
            endif
            if IsUnitInRangeXY(u, EmpBaseX[b], EmpBaseY[b], I2R(EmpAiWander) * tile) then
                set threat = u
            endif
        endif
    endloop
    // roles: scouts and escorts, home guard orders, wave forming
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            if EmpType(u) == '{{harvester}}' then
                set harv = u
            elseif EmpAiRole(u) == 1 then
                set scouts = scouts + 1
                if GetUnitCurrentOrder(u) == 0 then
                    call EmpAiRoam(u)
                endif
            elseif EmpAiRole(u) == 2 then
                set escorts = escorts + 1
            elseif EmpAiRole(u) == 3 and EmpAiForming then
                set waveUnits = waveUnits + 1
                if not IsUnitInRangeXY(u, EmpAiStageX, EmpAiStageY, {{real C.AI_FORMED_TILES}} * tile) then
                    set formed = false
                endif
            elseif EmpAiHomeUnit(u) then
                // the fastest home unit becomes the next scout
                if best == null or GetUnitDefaultMoveSpeed(u) > GetUnitDefaultMoveSpeed(best) then
                    set best = u
                endif
                if threat != null and GetUnitCurrentOrder(u) == 0 then
                    call IssueTargetOrder(u, "attack", threat)
                elseif not IsUnitInRangeXY(u, EmpBaseX[b], EmpBaseY[b], I2R(EmpAiWander) * tile) then
                    call IssuePointOrder(u, "move", EmpBaseX[b], EmpBaseY[b])
                elseif EmpAiCYHit > 0 and EmpTick - EmpAiCYHit < R2I({{real C.AI_CY_ALARM_SECONDS}} * {{TPS}}) and EmpTick >= {{ai.ticksDefendCY}} and EmpTechLevel >= {{ai.firstTechDefendCY}} then
                    call IssuePointOrder(u, "attack", GetUnitX(EmpTplUnit[EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}]), GetUnitY(EmpTplUnit[EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}]))
                endif
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    // a new scout (one unit per team) once enough units were made
    if EmpAiProduced >= {{ai.unitsBeforeScout}} and scouts < EmpAiScoutTeams and best != null then
        call SaveInteger(EmpWaveTab, GetHandleId(best), 1, 1)
        call EmpAiRoam(best)
        call EmpAiLog("scout " + GetUnitName(best))
        set best = null
    endif
    // harvester escort
    if harv != null and EmpTick >= {{ai.ticksDefendHarvester}} then
        if escorts < {{C.AI_ESCORTS}} and best != null then
            call SaveInteger(EmpWaveTab, GetHandleId(best), 1, 2)
            call EmpAiLog("escort " + GetUnitName(best))
        endif
        set g = CreateGroup()
        call GroupEnumUnitsOfPlayer(g, Player(1), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if EmpAlive(u) and EmpAiRole(u) == 2 and not IsUnitInRangeXY(u, GetUnitX(harv), GetUnitY(harv), 4.0 * tile) then
                call IssuePointOrder(u, "attack", GetUnitX(harv), GetUnitY(harv))
            endif
        endloop
        call DestroyGroup(g)
        set g = null
    endif
    // the forming wave attacks when formed, or after TicksUntilAbandonForming
    if EmpAiForming and (waveUnits == 0 or formed or EmpTick - EmpAiFormStart >= {{ai.ticksAbandonForming}}) then
        set EmpAiForming = false
        call EmpAiLog("wave attacks, units " + I2S(waveUnits) + " formed " + I2S(IntegerTertiaryOp(formed, 1, 0)))
        set g = CreateGroup()
        call GroupEnumUnitsOfPlayer(g, Player(1), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if EmpAlive(u) and EmpAiRole(u) == 3 then
                call IssuePointOrder(u, "attack", EmpAiKnownX, EmpAiKnownY)
            endif
        endloop
        call DestroyGroup(g)
        set g = null
    endif
    set harv = null
    set threat = null
    set best = null
endfunction

// an attack wave: the home units but the defence share gather at the staging point (a share of the
// way to the target); needs a known target (scouted, or the shroud time passed)
function EmpAiWave takes nothing returns nothing
    local group g
    local unit u
    local integer b = EmpBaseOfSide(1)
    // a wave fights on at the target: Game.exe reads ChanceOfRetreating only when the AI is losing
    // (EmpAiLosingCheck), never per wave
    local boolean stay = true
    local integer n = 0
    local integer home = 0
    local integer send
    if not EmpAiKnown or EmpAiForming then
        return
    endif
    // ai_difficulty.ini FirstAttackDelay (ticks)
    if EmpTick < EmpAiTFirst[EmpAiT()] then
        return
    endif
    set EmpAiStageX = EmpBaseX[b] + (EmpAiKnownX - EmpBaseX[b]) * {{real C.AI_STAGING_SHARE}}
    set EmpAiStageY = EmpBaseY[b] + (EmpAiKnownY - EmpBaseY[b]) * {{real C.AI_STAGING_SHARE}}
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAiHomeUnit(u) then
            set home = home + 1
        endif
    endloop
    // PercentageOfUnitsForDefence stay home, within Minimum / MaximumUnitsForDefence (ai_difficulty.ini)
    set send = home - IMinBJ(IMaxBJ(home * EmpAiDefPct / 100, EmpAiTMinDef[EmpAiT()]), EmpAiTMaxDef[EmpAiT()])
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAiHomeUnit(u) and n < send then
            call SaveInteger(EmpWaveTab, GetHandleId(u), 1, 3)
            call SaveBoolean(EmpWaveTab, GetHandleId(u), 0, stay)
            call IssuePointOrder(u, "move", EmpAiStageX, EmpAiStageY)
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if n > 0 then
        set EmpAiForming = true
        set EmpAiFormStart = EmpTick
        call EmpAiLog("wave forms, units " + I2S(n) + " stay " + I2S(IntegerTertiaryOp(stay, 1, 0)))
    endif
endfunction

function EmpAiInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    call EmpAiData()
    call TriggerRegisterPlayerUnitEvent(tr, Player(1), EVENT_PLAYER_UNIT_ATTACKED, null)
    call TriggerAddAction(tr, function EmpAiOnAttacked)
    call TimerStart(CreateTimer(), {{real C.AI_TACTIC_PERIOD}}, true, function EmpAiTactics)
    call TimerStart(CreateTimer(), {{real C.AI_TACTIC_PERIOD}}, true, function EmpAiSuperweapon)
    set EmpAiWaveTimer = CreateTimer()
    call TimerStart(EmpAiWaveTimer, EmpAiTGap[EmpAiT()], true, function EmpAiWave)
    set EmpAiOn = true
    set tr = null
endfunction
