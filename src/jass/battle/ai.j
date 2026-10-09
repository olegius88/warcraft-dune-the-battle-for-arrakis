// ---- enemy AI of territory battles beyond its base template (src/emperor/battle.ts, ai.ini) ----
// Base builder: while its construction yard stands and it keeps MinMoneyToConstructBuildings, the AI
// builds one building at a time, of the [BuildingConstructionRatios] category furthest below its
// share (its critical needs first: refineries by time, power, helipads, barracks; EmpAiCritical), on
// the free site that scores best by the
// [PositionAlgorithmRatios*] weights; it appears after the building's Rules.txt BuildTime. Turrets
// keep MinimumGapBetweenTurrets, wait for FirstTechLevelToBuildTurrets and stay within
// MaxTurretsAtLowTech below tech AI_LOW_TECH_BELOW; refineries stop at MaxRefineries. Walls come from
// the defence plan (ai-map.j) in builder state 3.
// Tactics: scouts once UnitsToBuildBeforeCreatingScoutTactic units were made (NumberOfScoutTeams,
// one unit each, roaming; the first player building they see becomes the attack target, after
// TicksUntilAISeesIntoShroud the player's base is known anyway); base defence chases enemies within
// DefenceTacticWanderDistance; harvester escorts after TicksBeforeDefendHarvesterTactic; the whole
// home guard to the construction yard when it is hit (after TicksBeforeDefendCYTactic, from tech
// FirstTechLevelForDefendCYTactic); attack waves gather at a staging point and attack when formed or
// after TicksUntilAbandonForming. Sites: ai-map.j EmpAiPlace (Game.exe's square rings and weights;
// WC3 buildings do not turn, so the rotation terms take the fixed facing).
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
    // refineries: their pads count too (Game.exe 0x44cc40)
    if c == -2 then
        set n = n + EmpPadCount(Player(1))
    endif
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
        set EmpAiMapUnit = u
        call ExecuteFunc("EmpAiMapAdd")
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
        if LoadInteger(EmpAiTab, t, 0) == c and GetPlayerTechMaxAllowed(Player(1), t) != 0 and LoadInteger(EmpAiTab, t, {{C.AI_TAB_NO_ROOM}}) != EmpAiRoomEpoch then
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

{{aiMapFunctions}}

// why the base builder is idle, logged when it changes (0 building; reasons in EmpAiBuild)
function EmpAiWait takes integer why, string s returns nothing
    if why != EmpAiWhy then
        set EmpAiWhy = why
        call EmpAiLog("wait: " + s)
    endif
endfunction

// the builder's critical need for barracks (src/config/battle.ts AI_CRITICAL_BARRACKS, Game.exe 1.09
// 0x42db2d): the house's barracks type when the side has none, else 0
function EmpAiCriticalBarracks takes nothing returns integer
    local integer m = {{C.AI_CRITICAL_BARRACKS.early}}
    local integer t = 0
    local group g
    local unit u
    local boolean have = false
    if EmpAiStrength == 0 or EmpAiSkill < {{C.AI_CRITICAL_BARRACKS.skillUnder}} then
        set m = {{C.AI_CRITICAL_BARRACKS.late}}
    endif
    if EmpTick <= m * {{C.AI_CRITICAL_BARRACKS.ticksPerMinute}} or GetRandomInt(0, {{C.AI_CRITICAL_BARRACKS.rollMax}}) >= EmpAiSkill then
        return 0
    endif
{{barracksPick}}
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and EmpType(u) == t then
            set have = true
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if have then
        return 0
    endif
    call EmpAiLog("critical: more barracks required")
    return t
endfunction

// a refinery pad done (EmpAiPadOrder)
function EmpAiPadDone takes nothing returns nothing
    set EmpAiPadBusy = false
    call EmpPadAttach(Player(1), EmpAiPadType[EmpEnemyHouse], null)
    call EmpAiLog("pad done, refineries and pads " + I2S(EmpAiCount(-2)))
    call DestroyTimer(GetExpiredTimer())
endfunction

// the critical need's pad (0x42da33..0x42da92): -1 when one is on its way or ordered now, 0 when the
// side may order none (its tech level, no refinery with a free slot)
function EmpAiPadOrder takes nothing returns integer
    local integer o = EmpAiPadType[EmpEnemyHouse]
    if EmpAiPadBusy then
        return -1
    endif
    if o == 0 or GetPlayerTechMaxAllowed(Player(1), o) == 0 or EmpPadFree(Player(1), LoadInteger(EmpPadTab, o, 0), null) == null then
        return 0
    endif
    if EmpEnemyGold() < EmpAiPadCost[EmpEnemyHouse] then
        set EmpAiReserve = EmpAiPadCost[EmpEnemyHouse]
        call EmpAiWait(6, "gold " + I2S(EmpEnemyGold()) + " < pad " + I2S(EmpAiPadCost[EmpEnemyHouse]))
        return -1
    endif
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, EmpEnemyGold() - EmpAiPadCost[EmpEnemyHouse])
    set EmpAiPadBusy = true
    call TimerStart(CreateTimer(), EmpAiPadTime[EmpEnemyHouse], false, function EmpAiPadDone)
    call EmpAiLog("pad ordered")
    return -1
endfunction

// the builder's critical needs (Game.exe 1.09 0x42d6e0, in its order): refineries by time
// (C.AI_CRITICAL_REFINERY), power (ai.ini ExtraPower), helipads (C.AI_CRITICAL_HELIPAD), barracks;
// the type to build at once, else 0. The emergency MCV comes first there (no construction yard):
// this builder stops without a yard (EmpAiBuild).
function EmpAiCritical takes nothing returns integer
    local integer late = 0
    local integer want = 0
    local integer t
    local integer orni = 0
    local integer pads = 0
    local group g
    local unit u
    if EmpAiStrength == 0 or EmpAiSkill < {{C.AI_CRITICAL_BARRACKS.skillUnder}} then
        set late = {{C.AI_CRITICAL_REFINERY.latePlus}}
    endif
{{refineryLevels}}
    if want > EmpAiCount(-2) then
        call EmpAiLog("critical: more refineries or refinery pads required")
        // with refineries a pad where the side may order one (0x42da33: nothing more is asked then,
        // no critical building), else another refinery (0x42daa3)
        if EmpAiCount(-2) > 0 and EmpAiPadOrder() != 0 then
            return 0
        endif
        set t = EmpAiRefinery[EmpEnemyHouse]
        if t != 0 and GetPlayerTechMaxAllowed(Player(1), t) != 0 and LoadInteger(EmpAiTab, t, {{C.AI_TAB_NO_ROOM}}) != EmpAiRoomEpoch then
            return t
        endif
    endif
    // made - used below ExtraPower (0x42d9c2: no money gate)
    if EmpPowerSum[1] < {{ai.extraPower}} and EmpAiPower[EmpEnemyHouse] != 0 then
        call EmpAiLog("critical: more power is required")
        return EmpAiPower[EmpEnemyHouse]
    endif
    // ornithopters and helipads (0x465320, type kind 0x21)
    set t = EmpAiHelipad[EmpEnemyHouse]
    if t != 0 and GetPlayerTechMaxAllowed(Player(1), t) != 0 and LoadInteger(EmpAiTab, t, {{C.AI_TAB_NO_ROOM}}) != EmpAiRoomEpoch then
        set g = CreateGroup()
        call GroupEnumUnitsOfPlayer(g, Player(1), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if EmpAlive(u) and LoadBoolean(EmpAiTab, EmpType(u), {{C.AI_TAB_ORNI}}) then
                set orni = orni + 1
            elseif EmpAlive(u) and EmpType(u) == t then
                set pads = pads + 1
            endif
        endloop
        call DestroyGroup(g)
        set g = null
        if orni > 0 and (pads == 0 or I2R(orni) / pads > {{real C.AI_CRITICAL_HELIPAD.orniPerPad}}) then
            call EmpAiLog("critical: more helipads required")
            return t
        endif
    endif
    set t = EmpAiCriticalBarracks()
    return t
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
    // the critical needs first (0x42d6e0): refineries, power, helipads, barracks
    set t = EmpAiCritical()
    // Game.exe's builder states 3 / 4 (0x42f07d / 0x42f0da): in maintenance the defence plan (ai-map.j)
    if EmpAiWalling then
        if t == 0 and EmpAiWallsGo() and EmpEnemyGold() >= {{C.AI_PLAN.stayGold}} and EmpAiUnitCount() >= {{C.AI_PLAN.stayUnits}} then
            call EmpAiPlanStep()
            return
        endif
        set EmpAiWalling = false
        call EmpAiLog("walls: back to maintenance")
    elseif EmpAiMaintaining and t == 0 and EmpAiShouldDefend() then
        if EmpAiWallSince == 0 then
            set EmpAiWallSince = EmpTick
        endif
        set EmpAiWalling = true
        call EmpAiLog("walls: defence plan")
        return
    endif
    if t == 0 and EmpAiUpgrade() then
        return
    elseif t == 0 then
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
        endif
        // the skill roll (0x42f3d0, AI_MAINTAIN_RATIO): rand % 70 < the skill with the credits builds by ratio
        if EmpAiMaintaining and GetRandomInt(0, {{C.AI_MAINTAIN_RATIO.rollMax}}) < EmpAiSkill and EmpEnemyGold() >= {{C.AI_MAINTAIN_RATIO.gold}} then
            call EmpAiLog("maintenance: by ratio (skill " + I2S(EmpAiSkill) + ")")
        elseif EmpAiMaintaining then
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

// the reserve tactic (Game.exe 1.09 0x44d980, src/config/battle.ts AI_DEF_POINT): a home unit's team,
// given on first sight to the first of {{ai.reserveTeams}} teams with room for {{ai.reservePerTeam}} (the last takes any)
function EmpAiResTeam takes unit u returns integer
    local integer t = LoadInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_RESERVE_TEAM}})
    if t > 0 then
        return t
    endif
    set t = 1
    loop
        exitwhen EmpAiResN[t] < {{ai.reservePerTeam}} or t == {{ai.reserveTeams}}
        set t = t + 1
    endloop
    set EmpAiResN[t] = EmpAiResN[t] + 1
    call SaveInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_RESERVE_TEAM}}, t)
    return t
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
    local integer team
    local integer i = 1
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
    // the reserve teams' members now (EmpAiResTeam)
    loop
        exitwhen i > {{ai.reserveTeams}}
        set EmpAiResN[i] = 0
        set i = i + 1
    endloop
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set team = LoadInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_RESERVE_TEAM}})
        if team > 0 and EmpAiHomeUnit(u) then
            set EmpAiResN[team] = EmpAiResN[team] + 1
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
                set team = EmpAiResTeam(u)
                if threat != null then
                    // the team is in a fight (it goes to its point once it is over)
                    set EmpAiResFight[team] = EmpTick
                    call SaveBoolean(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_RESERVE_POSTED}}, false)
                    if GetUnitCurrentOrder(u) == 0 then
                        call IssueTargetOrder(u, "attack", threat)
                    endif
                elseif team < {{C.AI_DEF_POINT.count}} and EmpAiResFight[team] > 0 and threat == null and not LoadBoolean(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_RESERVE_POSTED}}) then
                    // the fight is over: the team goes to its defensive assembly point (0x460880)
                    call IssuePointOrder(u, "move", EmpAiDefX[b * {{C.AI_DEF_POINT.count}} + team], EmpAiDefY[b * {{C.AI_DEF_POINT.count}} + team])
                    call SaveBoolean(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_RESERVE_POSTED}}, true)
                elseif not LoadBoolean(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_RESERVE_POSTED}}) and not IsUnitInRangeXY(u, EmpBaseX[b], EmpBaseY[b], I2R(EmpAiWander) * tile) then
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

// a harvester of side 1 is hit (EmpAiHarvTick)
function EmpAiHarvHurt takes nothing returns nothing
    if EmpType(GetTriggerUnit()) == '{{harvester}}' and GetEventDamageSource() != null then
        set EmpAiHarvHit = GetTriggerUnit()
        set EmpAiHarvHitBy = GetEventDamageSource()
        set EmpAiHarvHitAt = EmpTick
    endif
endfunction

// Game.exe 1.09 0x430e30, the builder's update every tick: past its first turn, with the credits
// (0x439890: MinMoneyToConstructBuildings) and no building on its way, on rand % 1000 < skill it asks
// its critical needs (0x42f570 -> 0x42d6e0: EmpAiCritical) and builds the one it finds at once
function EmpAiCriticalTick takes nothing returns nothing
    local integer t
    if EmpAiStartState == 0 or EmpAiPending > 0 or EmpEnemyGold() < {{ai.minMoneyToBuild}} or GetRandomInt(0, {{C.AI_CRITICAL_TICK.rollMax}}) >= EmpAiSkill then
        return
    endif
    if not EmpAlive(EmpTplUnit[EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}]) then
        return
    endif
    set t = EmpAiCritical()
    if t == 0 or EmpEnemyGold() < LoadInteger(EmpCostTab, t, 0) or not EmpAiPlace(t) then
        return
    endif
    call EmpAiLog("start " + GetObjectName(t) + " (critical, update)")
    call EmpAiStart(t, EmpAiX, EmpAiY)
endfunction

// Game.exe 1.09 0x45a8f9, every tick (src/config/battle.ts AI_HARV_FLIGHT): the harvester hit lately
// runs to a random reachable spot near its base; the builder's update (EmpAiCriticalTick) too
function EmpAiHarvTick takes nothing returns nothing
    local group g
    local unit u
    local boolean refinery = false
    local integer b
    local real r
    local real x
    local real y
    local integer i = 0
    call EmpAiCriticalTick()
    if EmpAiHarvHit == null then
        return
    endif
    if EmpTick - EmpAiHarvHitAt >= {{C.AI_HARV_FLIGHT.window}} then
        set EmpAiHarvHit = null
        set EmpAiHarvHitBy = null
        return
    endif
    if not EmpAlive(EmpAiHarvHit) or not EmpAlive(EmpAiHarvHitBy) or GetRandomInt(0, {{C.AI_HARV_FLIGHT.rollMax}}) >= EmpAiSkill then
        return
    endif
    if EmpTechLevel <= {{harvFlightTech}} and GetRandomInt(0, {{C.AI_HARV_FLIGHT.luckyMax}}) != 0 then
        return
    endif
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and LoadBoolean(EmpAiTab, EmpType(u), 3) then
            set refinery = true
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if not refinery then
        return
    endif
    set b = EmpBaseOfSide(1)
    set r = I2R(GetRandomInt(0, {{C.AI_HARV_FLIGHT.rangeRandMax}}) + {{C.AI_HARV_FLIGHT.rangeMin}}) * {{real WC3_UNITS_PER_TILE}}
    loop
        exitwhen i >= {{C.AI_HARV_FLIGHT.tries}}
        set x = EmpBaseX[b] + GetRandomReal(-r, r)
        set y = EmpBaseY[b] + GetRandomReal(-r, r)
        if x > EmpMapMinX and x < EmpMapMaxX and y > EmpMapMinY and y < EmpMapMaxY and not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) then
            call IssuePointOrder(EmpAiHarvHit, "move", x, y)
            call EmpAiLog("harvester under attack, sending to new spice")
            set EmpAiHarvHit = null
            set EmpAiHarvHitBy = null
            return
        endif
        set i = i + 1
    endloop
endfunction

function EmpAiInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    call EmpAiData()
    call EmpAiMapInit()
    call TriggerRegisterPlayerUnitEvent(tr, Player(1), EVENT_PLAYER_UNIT_ATTACKED, null)
    call TriggerAddAction(tr, function EmpAiOnAttacked)
    set EmpAiHarvHitTrig = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(EmpAiHarvHitTrig, Player(1), EVENT_PLAYER_UNIT_DAMAGED, null)
    call TriggerAddAction(EmpAiHarvHitTrig, function EmpAiHarvHurt)
    call TimerStart(CreateTimer(), {{real TICK_SECONDS}}, true, function EmpAiHarvTick)
    call TimerStart(CreateTimer(), {{real C.AI_TACTIC_PERIOD}}, true, function EmpAiTactics)
    call TimerStart(CreateTimer(), {{real C.AI_TACTIC_PERIOD}}, true, function EmpAiSuperweapon)
    set EmpAiWaveTimer = CreateTimer()
    call TimerStart(EmpAiWaveTimer, EmpAiTGap[EmpAiT()], true, function EmpAiWave)
    set EmpAiOn = true
    set tr = null
endfunction
