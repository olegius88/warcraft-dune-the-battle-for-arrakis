// ---- campaign glue: game cache in (EmpCampaignLoad), result out and back to the hub ----
function EmpCampaignLoad takes nothing returns nothing
    set EmpCache = InitGameCache({{str CACHE_FILE}})
{{#if isTutorial}}    // the tutorial is a standalone mission (own campaign button), never part of a house campaign
    return{{/if}}
{{#if isStart}}    // the house start mission is opened from the campaign screen: always part of the campaign
    set EmpInCampaign = true
    set EmpPhase = {{START_MISSION_PHASE}}
    set EmpTechLevel = {{START_MISSION_TECH}}
    return{{/if}}
    if GetStoredInteger(EmpCache, {{CAT}}, {{K.inCampaign}}) == 1 then
        set EmpInCampaign = true
        set EmpPhase = GetStoredInteger(EmpCache, {{CAT}}, {{K.phase}})
        set EmpTechLevel = GetStoredInteger(EmpCache, {{CAT}}, {{K.tech}})
        set EmpEnemyHouse = GetStoredInteger(EmpCache, {{CAT}}, {{K.pendingEnemy}})
        set EmpTerritory = GetStoredInteger(EmpCache, {{CAT}}, {{K.pendingTerritory}})
        set EmpPlayerTerritory = GetStoredInteger(EmpCache, {{CAT}}, {{K.pendingFrom}})
        // consumed: a later standalone test run must not think it is inside the campaign
        call StoreInteger(EmpCache, {{CAT}}, {{K.inCampaign}}, 0)
        call SaveGameCache(EmpCache)
    endif
{{#if isDefend}}    // defence: the attacker enters from its own territory (pendfrom); the player is already here
    set EmpEnemyTerritory = EmpPlayerTerritory
    set EmpPlayerTerritory = 0{{else}}    set EmpEnemyTerritory = EmpTerritory{{/if}}
endfunction

function EmpReturnToHub takes nothing returns nothing
    call SetNextLevelBJ({{str hubMap}})
    call CustomVictoryBJ(Player(0), false, false)
endfunction

// Called by EmpEnd (runtime) when the mission is decided.
function EmpCampaignResult takes boolean win returns nothing
    if not EmpInCampaign then{{#if hasDebrief}}
        call EmpDebriefSpeech(win){{/if}}
        if win then
            call CustomVictoryBJ(Player(0), true, true)
        else
            call CustomDefeatBJ(Player(0), "Миссия провалена")
        endif
        return
    endif
    call StoreInteger(EmpCache, {{CAT}}, {{K.inCampaign}}, 1)
    call StoreInteger(EmpCache, {{CAT}}, {{K.result}}, EF_B2I(win))
    call StoreInteger(EmpCache, {{CAT}}, {{K.outcome}}, EmpOutcome)
    call StoreInteger(EmpCache, {{CAT}}, {{K.resultTerritory}}, EmpTerritory)
    call StoreInteger(EmpCache, {{CAT}}, {{K.resultKind}}, {{kindId}})
{{#if breakLines}}{{breakLines}}
{{/if}}{{#if wonLines}}    if win then
{{wonLines}}
    endif
{{/if}}{{#if territoryBattle}}    // the winner's base stays on the territory (battle forces.j)
    call EmpBaseSave(win)
    call EmpSpiceSave()
{{/if}}    call SaveGameCache(EmpCache)
    if win then
        call EmpShow("Победа! Возвращение на карту Арракиса...")
    else
        call EmpShow("Поражение. Возвращение на карту Арракиса...")
    endif
    call TimerStart(CreateTimer(), {{real RT.RETURN_TO_HUB_DELAY}}{{#if hasDebrief}} + EmpDebriefSpeech(win){{/if}}, false, function EmpReturnToHub)
endfunction
