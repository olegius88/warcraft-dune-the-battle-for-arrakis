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

// ---- starting forces / enemy base (territory battles) ----
function EmpStartForces takes nothing returns nothing
    local location p = EF_GetEntrancePoint(0)
    local integer b = EmpBaseOfSide(1)
{{playerArmyLines}}
    call SetCameraPositionLocForPlayer(Player(0), p)
    set EmpCamSet = true
{{enemyBaseByHouse}}
    call CreateUnit(Player(1), '{{harvester}}', EmpBaseX[b] + {{real C.BASE_HARVESTER_OFFSET}}, EmpBaseY[b] - {{real C.BASE_HARVESTER_OFFSET}}, {{FACING}})
    call CreateUnit(Player(1), EmpEnemyPick(false), EmpBaseX[b] + {{real C.BASE_GUARD_OFFSET}}, EmpBaseY[b] + {{real C.BASE_GUARD_OFFSET}}, {{FACING}})
    call CreateUnit(Player(1), EmpEnemyPick(false), EmpBaseX[b] - {{real C.BASE_GUARD_OFFSET}}, EmpBaseY[b] + {{real C.BASE_GUARD_OFFSET}}, {{FACING}})
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, {{C.START_CREDITS}})
    call RemoveLocation(p)
    set p = null
endfunction

function EmpEnemyProduce takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer t
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set t = GetUnitTypeId(u)
        if EmpAlive(u) and ({{isBarracks}}) then
            call CreateUnit(Player(1), EmpEnemyPick(false), GetUnitX(u), GetUnitY(u) - {{real C.PRODUCED_INFANTRY_OFFSET}}, {{FACING}})
        elseif EmpAlive(u) and ({{isFactory}}) then
            call CreateUnit(Player(1), EmpEnemyPick(true), GetUnitX(u), GetUnitY(u) - {{real C.PRODUCED_VEHICLE_OFFSET}}, {{FACING}})
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

// ---- defence battles: the player holds a base, the enemy arrives in waves from its entrance ----
function EmpDefendStart takes nothing returns nothing
    local integer b = EmpBaseOfSide(0)
    local location e = EF_GetEntrancePoint(1)
{{playerBase}}
    call CreateUnit(Player(0), '{{harvester}}', EmpBaseX[b] + {{real C.BASE_HARVESTER_OFFSET}}, EmpBaseY[b] - {{real C.BASE_HARVESTER_OFFSET}}, {{FACING}})
{{defendArmyLines}}
    call SetCameraPositionForPlayer(Player(0), EmpBaseX[b], EmpBaseY[b])
    set EmpCamSet = true
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, {{C.DEFEND_CREDITS}})
    set EmpDefendMode = true
    set EmpWavesLeft = {{C.DEFEND_WAVES}}
    call RemoveLocation(e)
    set e = null
endfunction

function EmpDefendWave takes nothing returns nothing
    local location e
    local integer k = 0
    if EmpWavesLeft <= 0 then
        return
    endif
    set e = EF_GetEntrancePoint(1)
    loop
        exitwhen k >= {{C.DEFEND_WAVE_BASE}} + EmpTechLevel / 2
        call CreateUnit(Player(1), EmpEnemyPick(GetRandomInt(0, 2) > 0), GetLocationX(e) + GetRandomReal(-{{C.DEFEND_WAVE_SPREAD}}, {{C.DEFEND_WAVE_SPREAD}}), GetLocationY(e) + GetRandomReal(-{{C.DEFEND_WAVE_SPREAD}}, {{C.DEFEND_WAVE_SPREAD}}), {{FACING}})
        set k = k + 1
    endloop
    set EmpWavesLeft = EmpWavesLeft - 1
    set EmpAIMode[1] = 1
    set EmpAITargetSide[1] = 0
    call PingMinimapLocForForce(GetPlayersAll(), e, {{real C.DEFEND_WAVE_PING_SECONDS}})
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, {{real C.DEFEND_WAVE_MESSAGE_SECONDS}}, {{str C.DEFEND_WAVE_MESSAGE}} + I2S(EmpWavesLeft))
    call RemoveLocation(e)
    set e = null
endfunction
