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
        if t != 0 and GetPlayerTechMaxAllowed(Player(1), t) != 0 then
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

// The enemy pays for what it makes (Rules.txt Cost; its harvesters earn its credits like the
// player's). Every period: a unit of the ai.ini mix (Foot / Tank) from a barracks or factory, and,
// while its construction yard stands and it keeps MinMoneyToConstructBuildings, one destroyed
// building of its template rebuilt.
function EmpEnemyProduce takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local unit at = null
    local boolean veh = GetRandomInt(1, {{ai.foot}} + {{ai.tank}}) > {{ai.foot}}
    local integer t
    local integer n
    local integer c
    local integer k
    local integer b = EmpBaseOfSide(1)
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set t = GetUnitTypeId(u)
        if EmpAlive(u) and ((veh and ({{isFactory}})) or (not veh and ({{isBarracks}}))) then
            set at = u
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if at != null then
        set n = EmpEnemyPick(veh)
        set c = LoadInteger(EmpCostTab, n, 0)
        if n != 0 and EmpEnemyGold() >= c then
            call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, EmpEnemyGold() - c)
            if veh then
                call CreateUnit(Player(1), n, GetUnitX(at), GetUnitY(at) - {{real C.PRODUCED_VEHICLE_OFFSET}}, {{FACING}})
            else
                call CreateUnit(Player(1), n, GetUnitX(at), GetUnitY(at) - {{real C.PRODUCED_INFANTRY_OFFSET}}, {{FACING}})
            endif
        endif
        set at = null
    endif
    // entry 0 of a template is the construction yard
    set k = EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}
    if not EmpAlive(EmpTplUnit[k]) then
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
            endif
            return
        endif
    endloop
endfunction

// Attack wave: ai.ini PercentageOfUnitsForDefence of the enemy's units stay at its base, the others
// attack the player's base; with ChanceOfRetreating the wave falls back afterwards (the base
// behaviour brings idle units home), otherwise it fights where it is (EmpWaveTab marks them).
function EmpEnemyWave takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer b = EmpBaseOfSide(0)
    local boolean stay = GetRandomInt(1, 100) > {{ai.retreatChance}}
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and GetUnitTypeId(u) != '{{harvester}}' and GetRandomInt(1, 100) > {{ai.defencePercent}} then
            call IssuePointOrder(u, "attack", EmpBaseX[b], EmpBaseY[b])
            call SaveBoolean(EmpWaveTab, GetHandleId(u), 0, stay)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

// ---- defence battles: the player holds a base; the attacker's army (UnitValueAttacker) arrives
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
