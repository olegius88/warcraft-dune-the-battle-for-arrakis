// random unit of the enemy house allowed at the current tech level (vehicles if veh)
function EmpEnemyPick takes boolean veh returns integer
    local integer tries = 0
    local integer t
    loop
        if veh then
            set t = EmpEnemyVeh(GetRandomInt(0, {{vehMax}}))
        else
            set t = EmpEnemyInf(GetRandomInt(0, {{infMax}}))
        endif
        // a type that needs a building upgrade (EmpAiTab child 5, ai.j) waits until the AI has it
        if t != 0 and GetPlayerTechMaxAllowed(Player(1), t) != 0 and (LoadInteger(EmpAiTab, t, 5) == 0 or GetPlayerTechCount(Player(1), LoadInteger(EmpAiTab, t, 5), true) > 0) then
            return t
        endif
        set tries = tries + 1
        exitwhen tries > {{C.ENEMY_PICK_TRIES}}
    endloop
    return EmpEnemyInf(0)
endfunction

// Rules.txt Cost of the units the enemy produces; the enemy base template of every house
// (config BASE_TEMPLATE: type, offset in tiles from the base point; index = house * TEMPLATE_SLOTS)
function EmpCostData takes nothing returns nothing
    set EmpCostTab = InitHashtable()
    set EmpWaveTab = InitHashtable()
{{costLines}}
{{templateLines}}
endfunction

// (re)builds template entry k of the enemy house at the base b
function EmpTplBuild takes integer k, integer b returns nothing
    set EmpTplUnit[k] = CreateUnit(Player(1), EmpTplType[k], EmpBaseX[b] + EmpTiles(EmpTplDx[k]), EmpBaseY[b] - EmpTiles(EmpTplDy[k]), {{FACING}})
endfunction

// ---- starting forces / enemy base (territory battles). Armies are sets of the house's units worth
// Rules.txt UnitValueAttacker (the side that attacks) / UnitValueDefender (the side that holds the
// base), credits CampaignAttackMoney / CampaignDefendMoney.
function EmpStartForces takes nothing returns nothing
    local location p = EF_GetEntrancePoint(0)
    local integer b = EmpBaseOfSide(1)
    local integer i
{{supportLines}}
    call EmpSpawnSet(0, {{army.attacker}}, GetLocationX(p), GetLocationY(p), {{real C.START_ARMY_SPREAD}})
    call SetCameraPositionLocForPlayer(Player(0), p)
    set EmpCamSet = true
    set i = EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}
    loop
        exitwhen i >= EmpEnemyHouse * {{C.TEMPLATE_SLOTS}} + EmpTplCount[EmpEnemyHouse]
        call EmpTplBuild(i, b)
        set i = i + 1
    endloop
    // ai.ini: the enemy keeps its units at its base between attack waves
    set EmpAIMode[1] = 8
    call CreateUnit(Player(1), '{{harvester}}', EmpBaseX[b] + {{real C.BASE_HARVESTER_OFFSET}}, EmpBaseY[b] - {{real C.BASE_HARVESTER_OFFSET}}, {{FACING}})
    call EmpSpawnSet(1, {{army.defender}}, EmpBaseX[b], EmpBaseY[b], {{real C.BASE_GUARD_OFFSET}})
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, {{money.attack}})
    call SetPlayerStateBJ(Player(1), PLAYER_STATE_RESOURCE_GOLD, {{money.defend}})
    call RemoveLocation(p)
    set p = null
endfunction

function EmpEnemyGold takes nothing returns integer
    return GetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD)
endfunction

{{aiFunctions}}

// The enemy pays for what it makes (Rules.txt Cost; its harvesters earn its credits like the
// player's). Every UnitDelay (ai_difficulty.ini, by tech level): a unit of the ai.ini mix (Foot /
// Tank) from a barracks or factory, up to MaxAiUnits. Game.exe 1.09 (0x464473) counts every unit of
// the side (0x44c670), map-placed ones too, and allows 100 more in a story mission (the game flag that
// CCampaignManager::SetupMissionData sets, 0x4903b0).
function EmpEnemyProduce takes nothing returns nothing
    local group g
    local unit u
    local unit at = null
    local boolean veh = GetRandomInt(1, {{ai.foot}} + {{ai.tank}}) > {{ai.foot}}
    local integer t
    local integer n
    local integer c
    if EmpCount(1, 1) >= EmpAiTMax[EmpAiT()]{{#if storyAi}} + {{C.STORY_AI_EXTRA_UNITS}}{{/if}} then
        return
    endif
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set t = EmpType(u)
        if EmpAlive(u) and ((veh and ({{isFactory}})) or (not veh and ({{isBarracks}}))) then
            set at = u
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if at != null then
        set n = EmpEnemyPick(veh)
        set c = LoadInteger(EmpCostTab, n, 0)
        // units spend only what is above the money the base builder saves (EmpAiReserve, ai.j)
        if n != 0 and EmpEnemyGold() >= c + EmpAiReserve then
            call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, EmpEnemyGold() - c)
            if veh then
                call CreateUnit(Player(1), n, GetUnitX(at), GetUnitY(at) - {{real C.PRODUCED_VEHICLE_OFFSET}}, {{FACING}})
            else
                call CreateUnit(Player(1), n, GetUnitX(at), GetUnitY(at) - {{real C.PRODUCED_INFANTRY_OFFSET}}, {{FACING}})
            endif
            set EmpAiProduced = EmpAiProduced + 1
        endif
        set at = null
    endif
endfunction

// Every BuildingDelay (ai_difficulty.ini): while its construction yard stands and it keeps
// MinMoneyToConstructBuildings, one destroyed building of its template rebuilt (paid: building costs
// were missing from EmpCostTab, rebuilds were free until 2026-10-08), or else the base builder's turn
// (ai.j).
function EmpEnemyBuildTurn takes nothing returns nothing
    local integer c
    local integer k
    local integer b = EmpBaseOfSide(1)
    // entry 0 of a template is the construction yard
    set k = EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}
    // EmpAiReserve (what unit production leaves) is set on every way out: it kept a stale value
    // before (test/emperor-mission.test.ts)
    if not EmpAlive(EmpTplUnit[k]) then
        set EmpAiReserve = 0
        return
    endif
    loop
        set k = k + 1
        exitwhen k >= EmpEnemyHouse * {{C.TEMPLATE_SLOTS}} + EmpTplCount[EmpEnemyHouse]
        if not EmpAlive(EmpTplUnit[k]) then
            set c = LoadInteger(EmpCostTab, EmpTplType[k], 0)
            if EmpEnemyGold() >= c + {{ai.minMoneyToBuild}} then
                call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, EmpEnemyGold() - c)
                call EmpTplBuild(k, b)
                set EmpAiReserve = 0
            else
                set EmpAiReserve = c + {{ai.minMoneyToBuild}}
            endif
            return
        endif
    endloop
    // the template stands: the base builder grows the base (ai.j)
    call EmpAiBuild()
endfunction

// the pace of the enemy by its tech level (ai_difficulty.ini; after EmpAiInit, which loads it)
function EmpAiStartPace takes nothing returns nothing
    call TimerStart(CreateTimer(), EmpAiTUnitDelay[EmpAiT()], true, function EmpEnemyProduce)
    set EmpAiBuildTimer = CreateTimer()
    call TimerStart(EmpAiBuildTimer, EmpAiTBuildDelay[EmpAiT()], true, function EmpEnemyBuildTurn)
endfunction

// SideAIBehaviourNormal / Aggressive / Defensive on side 1 while the AI runs it (EmpAiBehaveMode 0 /
// 1 / 2): Game.exe 1.09 re-tunes the AI's values (src/config/battle.ts AI_BEHAVIOUR_PCT), each on its
// current value, so a second call compounds; the attack waves and the builder keep the new pace.
function EmpAiBehave takes nothing returns nothing
    local integer m = EmpAiBehaveMode
    local integer l = 1
    call EmpAiLog("behaviour " + I2S(m))
    if m == {{C.AI_BEHAVIOUR.normal}} then
        return
    endif
    loop
        exitwhen l > {{C.AI_TECH_LEVELS}}
{{strongTech}}
        if m == {{C.AI_BEHAVIOUR.aggressive}} then
{{aggressiveTech}}
        else
{{defensiveTech}}
        endif
        set EmpAiTBuildDelay[l] = I2R(IMaxBJ(1, EmpAiTBuildTicks[l])) / {{TPS}}
        set EmpAiTGap[l] = I2R(IMaxBJ(1, EmpAiTGapTicks[l])) / {{TPS}} * {{real gapFactor}}
        set l = l + 1
    endloop
    if m == {{C.AI_BEHAVIOUR.aggressive}} then
{{aggressiveSide}}
    else
{{defensiveSide}}
    endif
    if EmpAiWaveTimer != null then
        call TimerStart(EmpAiWaveTimer, EmpAiTGap[EmpAiT()], true, function EmpAiWave)
    endif
    if EmpAiBuildTimer != null then
        call TimerStart(EmpAiBuildTimer, EmpAiTBuildDelay[EmpAiT()], true, function EmpEnemyBuildTurn)
    endif
endfunction

{{#if storyAi}}// ---- story missions: the base of side 1 placed on the map (battle.ts storyAiHouse) is run by the AI
// of territory battles with ai.ini and ai_<house>_<map>.ini; its credits are what the script gives
// (AddSideCash).
// The template is only its construction yard: destroyed map buildings come back by the base builder's
// ratios (ai.j), not at their map places, as in Game.exe 1.09: its AI picks a building by the groups'
// ratios both when building ("Choosing building group based on ratios", 0x42d260) and when replacing
// ("ChooseNextBuildingBasedOnMaintenance", 0x42fca0: the group short of its share by over 0.6 on a
// coin flip, after a sub-house building); neither path looks up a lost building or its site.
// The units the map places for side 1 count towards its unit limit, MaxAiUnits + 100 here (Game.exe,
// EmpEnemyProduce). TODO(ai): those near the yard go with its waves (#A1 before the posts: 68 of 74
// sent at 140 s), those beyond DefenceTacticWanderDistance keep their posts. Game.exe counts every unit
// of the side for its defence share (0x455520), but how its tactics pick map-placed units for teams is
// not traced. Risk: early waves stronger or weaker than in the original.
function EmpStoryAiStart takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer b
    local integer k = {{storyHouse}} * {{C.TEMPLATE_SLOTS}}
    set EmpEnemyHouse = {{storyHouse}}
    set EmpTplCount[EmpEnemyHouse] = 1
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpTplUnit[k] == null and EmpAlive(u) and EmpType(u) == EmpTplType[k] then
            set EmpTplUnit[k] = u
        endif
    endloop
    if EmpTplUnit[k] == null then
        call DestroyGroup(g)
        set g = null
        return
    endif
    // a base point of its own at its yard (fourth audit: taking one of the map's points with
    // EmpBaseOfSide left script sides that ask for a base later the player's point); a point the
    // script gave side 1 before is free again
    if EmpSideBase[1] >= 0 and EmpSideBase[1] < EmpBaseCount then
        set EmpBaseOwner[EmpSideBase[1]] = -1
    endif
    set b = EmpBaseCount
    set EmpBaseCount = EmpBaseCount + 1
    set EmpBaseX[b] = GetUnitX(EmpTplUnit[k])
    set EmpBaseY[b] = GetUnitY(EmpTplUnit[k])
    set EmpBaseOwner[b] = 1
    set EmpSideBase[1] = b
    // guards the map places beyond DefenceTacticWanderDistance and story characters keep their posts
    // (role 4, ai.j): the tactics pulled them to the yard and sent them in waves. EmpAIMode[1] stays as
    // the script sets it for the same reason.
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and (LoadBoolean(EmpSpTab, EmpType(u), 14) or not IsUnitInRangeXY(u, EmpBaseX[b], EmpBaseY[b], EmpTiles({{ai.defenceWanderTiles}}))) then
            call SaveInteger(EmpWaveTab, GetHandleId(u), 1, 4)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    call EmpAiInit()
    call EmpAiStartPace()
endfunction

{{/if}}// ---- defence battles: the player holds a base; the attacker's army (UnitValueAttacker) arrives
// from its entrance after DEFEND_ATTACK_DELAY, then the reinforcement sets keep coming
function EmpDefendStart takes nothing returns nothing
    local integer b = EmpBaseOfSide(0)
{{playerBase}}
    call CreateUnit(Player(0), '{{harvester}}', EmpBaseX[b] + {{real C.BASE_HARVESTER_OFFSET}}, EmpBaseY[b] - {{real C.BASE_HARVESTER_OFFSET}}, {{FACING}})
    call EmpSpawnSet(0, {{army.defender}}, EmpBaseX[b], EmpBaseY[b], {{real C.DEFEND_ARMY_SPREAD}})
    call SetCameraPositionForPlayer(Player(0), EmpBaseX[b], EmpBaseY[b])
    set EmpCamSet = true
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, {{money.defend}})
    call SetPlayerStateBJ(Player(1), PLAYER_STATE_RESOURCE_GOLD, {{money.attack}})
    set EmpDefendMode = true
    set EmpWavesLeft = 1
endfunction

function EmpDefendWave takes nothing returns nothing
    local integer e = EmpEntranceFor(1)
    call DestroyTimer(GetExpiredTimer())
    call EmpSpawnSet(1, {{army.attacker}}, EmpEntrX[e], EmpEntrY[e], {{real C.DEFEND_WAVE_SPREAD}})
    set EmpWavesLeft = 0
    set EmpAIMode[1] = 1
    set EmpAITargetSide[1] = 0
    call PingMinimap(EmpEntrX[e], EmpEntrY[e], {{real C.DEFEND_WAVE_PING_SECONDS}})
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, {{real C.DEFEND_WAVE_MESSAGE_SECONDS}}, {{str C.DEFEND_WAVE_MESSAGE}})
endfunction
