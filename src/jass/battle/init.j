function EmpBattleInit takes nothing returns nothing
    local trigger tr
    local integer i
    call EmpTechLimits()
    call EmpSpiceFields()
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > {{MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnBuildingDone)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > {{MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_START, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnConstructStart)
    call TimerStart(CreateTimer(), {{real C.HARVEST_CHECK_PERIOD}}, true, function EmpHarvestTick)
    call EmpPowerData()
    call TimerStart(CreateTimer(), {{real C.POWER_CHECK_PERIOD}}, true, function EmpPowerTick)
{{#if attackBattle}}    call EmpStartForces()
    call TimerStart(CreateTimer(), {{real C.ENEMY_PRODUCE_PERIOD}}, true, function EmpEnemyProduce)
    call TimerStart(CreateTimer(), {{real C.ENEMY_WAVE_PERIOD}}, true, function EmpEnemyWave){{/if}}
{{#if defendBattle}}    call EmpDefendStart()
    call TimerStart(CreateTimer(), {{real C.DEFEND_WAVE_PERIOD}}, true, function EmpDefendWave){{/if}}
    set tr = null
endfunction
