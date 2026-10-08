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
    set EmpYardsServed = CreateGroup()
    call TimerStart(CreateTimer(), {{real C.HARV_REPLACE_PERIOD}}, true, function EmpHarvReplaceTick)
    call TimerStart(CreateTimer(), {{real C.YARD_CHECK_PERIOD}}, true, function EmpYardTick)
    call EmpPowerData()
    call EmpCostData()
    call TimerStart(CreateTimer(), {{real C.POWER_CHECK_PERIOD}}, true, function EmpPowerTick)
{{#if territoryBattle}}    // both sides get reinforcement sets (Rules.txt UnitValueInitial/SubsequentReinforcements)
    call EmpReinfStart(0, EmpReinfInitial, EmpReinfSubsequent)
    call EmpReinfStart(1, EmpReinfInitial, EmpReinfSubsequent)
{{/if}}{{#if attackBattle}}    call EmpStartForces()
    // production, the builder and the tactics start with their ai_difficulty.ini pace (ai.j)
    call EmpAiInit()
    call EmpAiStartPace(){{/if}}
{{#if defendBattle}}    call EmpDefendStart()
    call TimerStart(CreateTimer(), {{real C.DEFEND_ATTACK_DELAY}}, false, function EmpDefendWave){{/if}}
    set tr = null
endfunction
