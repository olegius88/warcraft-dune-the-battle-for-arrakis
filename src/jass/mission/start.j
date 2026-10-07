function EmpStart takes nothing returns nothing
    local trigger tr
    local integer i = 0
    set EmpTmpGroup = CreateGroup()
    call EmpCampaignLoad()
    call EmpData()
    call EmpDefaultDiplomacy()
    call EmpPlaced()
    call EmpVetData()
    call EmpReinfData()
{{pickScript}}{{#if hasBriefingSpeech}}
    call EmpBriefingSpeech(){{/if}}
{{#if briefing}}    call CreateQuestBJ(bj_QUESTTYPE_REQ_DISCOVERED, {{str name}}, {{str briefing}}, {{str ICON.briefingQuest}})
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, {{real RT.BRIEFING_SECONDS}}, "|cffffcc00" + {{str name}} + "|r|n" + {{str briefing}}){{/if}}
    call SetPlayerColorBJ(Player(0), ConvertPlayerColor({{colorPlayer}}), true)
    if EmpEnemyHouse == {{HOUSE_ID.Atreides}} then
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor({{colorAtreides}}), true)
    elseif EmpEnemyHouse == {{HOUSE_ID.Harkonnen}} then
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor({{colorHarkonnen}}), true)
    else
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor({{OTHER_ENEMY_COLOR}}), true)
    endif
    call TimerStart(CreateTimer(), {{real RT.DEBUG_REPORT_PERIOD}}, true, function EmpDebugReport)
    call SetTimeOfDay({{real RT.TIME_OF_DAY}})
    call SuspendTimeOfDay(true){{#if musicList}}
    call ClearMapMusic()
    call SetMapMusic({{musicList}}, {{SHUFFLE_BATTLE_MUSIC}}, 0)
    call PlayMusic({{musicList}}){{/if}}
    set tr = CreateTrigger()
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ATTACKED, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnAttacked)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnConstructed)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnKill)
{{battleInit}}
    call TimerStart(CreateTimer(), {{real TICK_SECONDS}}, true, function EmpTickRun)
    call TimerStart(CreateTimer(), {{real RT.AI_TICK}}, true, function EmpAITick)
    call TimerStart(CreateTimer(), {{real RT.NORMAL_CHECK_PERIOD}}, true, function EmpNormalCheck)
    call TimerStart(CreateTimer(), {{real RT.INITIAL_CAMERA_DELAY}}, false, function EmpInitialCamera)
    call TimerStart(CreateTimer(), {{real RT.STEALTH_TICK}}, true, function EmpStillTick)
    call TimerStart(CreateTimer(), {{real RT.CRATE_TICK}}, true, function EmpCrateTick){{#if autoWinSeconds}}
    call TimerStart(CreateTimer(), {{real autoWinSeconds}}, false, function EmpAutoWin){{/if}}
    set tr = null
endfunction
