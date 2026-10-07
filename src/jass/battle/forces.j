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

// Rules.txt Cost of the units the enemy produces
function EmpCostData takes nothing returns nothing
    set EmpCostTab = InitHashtable()
{{costLines}}
endfunction

// ---- starting forces / enemy base (territory battles). Armies are sets of the house's units worth
// Rules.txt UnitValueAttacker (the side that attacks) / UnitValueDefender (the side that holds the
// base), credits CampaignAttackMoney / CampaignDefendMoney.
function EmpStartForces takes nothing returns nothing
    local location p = EF_GetEntrancePoint(0)
    local integer b = EmpBaseOfSide(1)
{{supportLines}}
    call EmpSpawnSet(0, {{army.attacker}}, GetLocationX(p), GetLocationY(p), {{real C.START_ARMY_SPREAD}})
    call SetCameraPositionLocForPlayer(Player(0), p)
    set EmpCamSet = true
{{enemyBaseByHouse}}
    call CreateUnit(Player(1), '{{harvester}}', EmpBaseX[b] + {{real C.BASE_HARVESTER_OFFSET}}, EmpBaseY[b] - {{real C.BASE_HARVESTER_OFFSET}}, {{FACING}})
    call EmpSpawnSet(1, {{army.defender}}, EmpBaseX[b], EmpBaseY[b], {{real C.BASE_GUARD_OFFSET}})
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, {{money.attack}})
    call SetPlayerStateBJ(Player(1), PLAYER_STATE_RESOURCE_GOLD, {{money.defend}})
    call RemoveLocation(p)
    set p = null
endfunction

// the enemy's barracks and factories train units it can pay for (Rules.txt Cost; its harvesters
// earn its credits like the player's)
function EmpEnemyProduce takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer t
    local integer n
    local integer c
    local real dy
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set t = GetUnitTypeId(u)
        set n = 0
        if EmpAlive(u) and ({{isBarracks}}) then
            set n = EmpEnemyPick(false)
            set dy = {{real C.PRODUCED_INFANTRY_OFFSET}}
        elseif EmpAlive(u) and ({{isFactory}}) then
            set n = EmpEnemyPick(true)
            set dy = {{real C.PRODUCED_VEHICLE_OFFSET}}
        endif
        if n != 0 then
            set c = LoadInteger(EmpCostTab, n, 0)
            if GetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD) >= c then
                call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD) - c)
                call CreateUnit(Player(1), n, GetUnitX(u), GetUnitY(u) - dy, {{FACING}})
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpEnemyWave takes nothing returns nothing
    if EmpAIMode[1] == 0 then
        set EmpAIMode[1] = 1
        set EmpAITargetSide[1] = 0
    endif
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
