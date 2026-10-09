// random unit of the enemy house allowed at the current tech level (vehicles if veh)
// special: Rules.txt AiSpecial types only (EmpAiSpecialTurn), else none of them (Game.exe 0x43a5bf)
function EmpEnemyPick takes boolean veh, boolean special returns integer
    local integer tries = 0
    local integer t
    loop
        if veh then
            set t = EmpEnemyVeh(GetRandomInt(0, {{vehMax}}))
        else
            set t = EmpEnemyInf(GetRandomInt(0, {{infMax}}))
        endif
        // a type that needs a building upgrade (EmpAiTab child 5, ai.j) waits until the AI has it
        if t != 0 and LoadBoolean(EmpAiTab, t, {{C.AI_TAB_SPECIAL}}) == special and GetPlayerTechMaxAllowed(Player(1), t) != 0 and (LoadInteger(EmpAiTab, t, 5) == 0 or GetPlayerTechCount(Player(1), LoadInteger(EmpAiTab, t, 5), true) > 0) then
            return t
        endif
        set tries = tries + 1
        exitwhen tries > {{C.ENEMY_PICK_TRIES}}
    endloop
    if special then
        return 0
    endif
    return EmpEnemyInf(0)
endfunction

// Rules.txt Cost of the units and buildings the enemy makes; the construction yard of every house
function EmpCostData takes nothing returns nothing
    set EmpCostTab = InitHashtable()
    set EmpWaveTab = InitHashtable()
{{costLines}}
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
    // the defending side's minimal base (Game.exe 0x47f170 -> 0x42ea80, config MIN_BASE): its yard at the
    // start point moved; the rest where the AI's site code puts it once its map stands (ai.j
    // EmpAiMinimalBase)
    set EmpAiYard = CreateUnit(Player(1), EmpAiYardType[EmpEnemyHouse], EmpBaseX[b] - {{real yardLeft}}, EmpBaseY[b] + {{real yardUp}}, {{FACING}})
    // ai.ini: the enemy keeps its units at its base between attack waves
    set EmpAIMode[1] = 8
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
// Game.exe 1.09 0x465473 (src/config/battle.ts AI_SPECIAL_UNIT): this unit is a special one
function EmpAiSpecialTurn takes nothing returns boolean
    if not EmpAiOn or EmpTechLevel < {{C.AI_SPECIAL_UNIT.tech}} or EmpTick < {{C.AI_SPECIAL_UNIT.ticks}} or EmpEnemyGold() < {{C.AI_SPECIAL_UNIT.gold}} or EmpCount(1, 1) < {{C.AI_SPECIAL_UNIT.units}} then
        return false
    endif
    if GetRandomInt(0, {{C.AI_SPECIAL_UNIT.rollMax}}) >= EmpAiSkill then
        return false
    endif
    return GetRandomInt(1, {{C.AI_SPECIAL_UNIT.superOneIn}}) != 1 or EmpTechLevel >= {{C.AI_SPECIAL_UNIT.superTech}}
endfunction

function EmpEnemyProduce takes nothing returns nothing
    local group g
    local unit u
    local unit at = null
    local boolean veh = GetRandomInt(1, {{ai.foot}} + {{ai.tank}}) > {{ai.foot}}
    local boolean special = false
    local integer t
    local integer n
    local integer c
    local integer m
    if EmpCount(1, 1) >= EmpAiTMax[EmpAiT()]{{#if storyAi}} + {{C.STORY_AI_EXTRA_UNITS}}{{/if}} then
        return
    endif
    // the special units are vehicles (Devastator, Missile tank, Minotaurus, Kobra)
    set special = EmpAiSpecialTurn()
    if special then
        set veh = true
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
        set n = EmpEnemyPick(veh, special)
        if special and n != 0 then
            call EmpAiLog("special unit " + GetObjectName(n))
        endif
        set c = LoadInteger(EmpCostTab, n, 0)
        // the units' share of the credits (ai.j EmpAiUnitMoney): over the cost, and one over a third of
        // it is turned down on 1 in 4 (Game.exe 0x4650f8 / 0x4651c1)
        set m = EmpAiUnitMoney()
        if n != 0 and m > c and (c <= m / {{C.AI_MONEY.expensive}} or GetRandomInt(0, {{C.AI_MONEY.expensiveRollMax}}) != 0) then
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

// Every BuildingDelay (ai_difficulty.ini): the base builder's turn (ai.j) while its construction yard
// stands; lost buildings come back only by its choices, as in Game.exe
function EmpEnemyBuildTurn takes nothing returns nothing
    local real d
    if not EmpAiYardAlive() then
        return
    endif
    // pace by builder state (Game.exe 0x430e95): start script a tenth of BuildingDelay, maintenance
    // MaintenanceDelay, else BuildingDelay
    call EmpAiBuild()
    if EmpAiStartState == 1 then
        set d = EmpAiTBuildDelay[EmpAiT()] / 10
    elseif EmpAiMaintaining then
        set d = EmpAiTMaintDelay[EmpAiT()]
    else
        set d = EmpAiTBuildDelay[EmpAiT()]
    endif
    if TimerGetTimeout(EmpAiBuildTimer) != d then
        call TimerStart(EmpAiBuildTimer, d, true, function EmpEnemyBuildTurn)
    endif
endfunction

// the pace of the enemy by its tech level (ai_difficulty.ini; after EmpAiInit, which loads it)
function EmpAiStartPace takes nothing returns nothing
    call TimerStart(CreateTimer(), EmpAiTUnitDelay[EmpAiT()], true, function EmpEnemyProduce)
    set EmpAiBuildTimer = CreateTimer()
    call TimerStart(EmpAiBuildTimer, EmpAiTBuildDelay[EmpAiT()], true, function EmpEnemyBuildTurn)
endfunction

// Game.exe 1.09 0x432040: a personality m (1 AGGRESSIVE, 2 DEFENSIVE, else none) and a strength
// (2 STRONG) re-tune the AI's values (src/config/battle.ts AI_BEHAVIOUR_PCT), each on its current
// value, so a second call compounds; the attack waves and the builder keep the new pace. The skill is
// the side's difficulty -2 / 0 / +2 by the strength (AI_SKILL).
function EmpAiTune takes boolean strong, integer m, integer strength returns nothing
    local integer l = 1
    call EmpAiLog("tune strength " + I2S(strength) + " personality " + I2S(m))
    loop
        exitwhen l > {{C.AI_TECH_LEVELS}}
        if strong then
{{strongTech}}
        endif
        if m == {{C.AI_BEHAVIOUR.aggressive}} then
{{aggressiveTech}}
        elseif m == {{C.AI_BEHAVIOUR.defensive}} then
{{defensiveTech}}
        endif
        set EmpAiTBuildDelay[l] = I2R(IMaxBJ(1, EmpAiTBuildTicks[l])) / {{TPS}}
        set EmpAiTMaintDelay[l] = I2R(IMaxBJ(1, EmpAiTMaintTicks[l])) / {{TPS}}
        set EmpAiTGap[l] = I2R(IMaxBJ(1, EmpAiTGapTicks[l])) / {{TPS}} * {{real gapFactor}}
        set l = l + 1
    endloop
    if m == {{C.AI_BEHAVIOUR.aggressive}} then
{{aggressiveSide}}
    elseif m == {{C.AI_BEHAVIOUR.defensive}} then
{{defensiveSide}}
    endif
    set EmpAiStrength = strength
    set EmpAiPersonality = m
    set EmpAiSkill = IMinBJ({{C.AI_SKILL.max}}, IMaxBJ({{C.AI_SKILL.min}}, EmpAiSkillBase + (strength - 1) * {{C.AI_SKILL.step}}))
    call EmpAiLog("skill " + I2S(EmpAiSkill))
    if EmpAiWaveTimer != null then
        call TimerStart(EmpAiWaveTimer, EmpAiTGap[EmpAiT()], true, function EmpAiWave)
    endif
    if EmpAiBuildTimer != null and EmpAiMaintaining then
        call TimerStart(EmpAiBuildTimer, EmpAiTMaintDelay[EmpAiT()], true, function EmpEnemyBuildTurn)
    elseif EmpAiBuildTimer != null then
        call TimerStart(EmpAiBuildTimer, EmpAiTBuildDelay[EmpAiT()], true, function EmpEnemyBuildTurn)
    endif
endfunction

// SideAIBehaviourNormal / Aggressive / Defensive on side 1 while the AI runs it (EmpAiBehaveMode 0 /
// 1 / 2): Game.exe 1.09 calls 0x432040 with the personality and STRONG (normal: no call).
function EmpAiBehave takes nothing returns nothing
    local integer m = EmpAiBehaveMode
    call EmpAiLog("behaviour " + I2S(m))
    if m == {{C.AI_BEHAVIOUR.normal}} then
        return
    endif
    call EmpAiTune(true, m, {{C.AI_CAMPAIGN.strong}})
endfunction

// The territory battle's enemy at its start (src/config/battle.ts AI_CAMPAIGN, AI_SKILL): Game.exe
// 1.09 CreateGame rolls its personality and strength by the PhaseRules phase (the hub's phases 1..3
// are PhaseRules phases 1..3), the player attacking; the ai.ini load applies them (0x4310e0).
function EmpAiCampaignTune takes nothing returns nothing
    local integer strength = {{C.AI_CAMPAIGN.other.strength}}
    local integer mode = {{C.AI_CAMPAIGN.other.personality}}
    local integer low = 0
{{campaignPhases}}
    set EmpAiSkillBase = IMinBJ({{C.AI_SKILL.baseMax}}, EmpTechLevel + 1 - low)
    call EmpAiTune(strength == {{C.AI_CAMPAIGN.strong}}, mode, strength)
endfunction

{{#if storyAi}}// ---- story missions: the base of side 1 placed on the map (battle.ts storyAiHouse) is run by the AI
// of territory battles with ai.ini and ai_<house>_<map>.ini; its credits are what the script gives
// (AddSideCash).
// The template is only its construction yard: destroyed map buildings come back by the base builder's
// ratios (ai.j), not at their map places, as in Game.exe 1.09: its AI picks a building by the groups'
// ratios both when building ("Choosing building group based on ratios", 0x42d260) and when replacing
// ("ChooseNextBuildingBasedOnMaintenance", 0x42fca0: the group short of its share by over 0.15 on a
// coin flip, after a sub-house building); neither path looks up a lost building or its site.
// The units the map places for side 1 count towards its unit limit, MaxAiUnits + 100 here (Game.exe,
// EmpEnemyProduce). Game.exe takes them like the units it makes: every 11th AI update (0x45a340, the
// counter starts at side * 5) 0x45a3d0 walks the side's live objects from id +0xc on (0 at start,
// 0x45a2e0) into AddNewOwnedUnit (0x45a460, task 1), and task 1 (0x45a600) hands a unit to the reserve
// tactic (type 2, NumReserveTeams teams of MaxUnitsPerReserveTeam, the last 200: 0x44d980) or the free
// unit tactic (type 4). A reserve team's target is a defensive assembly point of the base
// (0x45fc10: GetAnAssemblyPointLocation 0x42ba50, ePointDefensive k), where it goes back after each
// battle (0x452940 -> reserve +0x60, 0x460880 -> "Team <%s> moving to <%s>", 0x460740); an armed unit
// joining a team gets no order (0x45fd50), and the reserve has no other move (its methods 0x458060..,
// vtable 0x5d1418; 0x452e20 / 0x452e40 are other tactics'). Here: ai.j EmpAiResTeam (5 teams of 3), a
// team in a fight goes to its point once the fight is over; the points are computed from the map
// (src/emperor/ai-points.ts, probe --reserve). TODO(ai): approximations there: the flood order, the
// first part of 0x4369a0, 0x46b2f0 "made reachable", the cluster box and the enemy zone (0x439cf0);
// "over" here is no threat at a tactics turn (Game.exe: the team state machine 0x460930). Those near
// the yard go with the waves (#A1 before the posts: 68 of 74 sent at 140 s), guards beyond
// DefenceTacticWanderDistance keep their posts. Risk: early waves stronger or weaker than in the
// original.
function EmpStoryAiStart takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer b
    set EmpEnemyHouse = {{storyHouse}}
    set EmpAiYard = null
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAiYard == null and EmpAlive(u) and EmpType(u) == EmpAiYardType[EmpEnemyHouse] then
            set EmpAiYard = u
        endif
    endloop
    if EmpAiYard == null then
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
    set EmpBaseX[b] = GetUnitX(EmpAiYard)
    set EmpBaseY[b] = GetUnitY(EmpAiYard)
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
