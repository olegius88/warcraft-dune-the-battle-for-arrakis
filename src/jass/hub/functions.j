
function EmpData takes nothing returns nothing
{{dataLines}}
endfunction

function EmpSay takes string s returns nothing
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, {{real V.HUB_MESSAGE_SECONDS}}, s)
endfunction

function EmpSave takes nothing returns nothing
    local integer n = 1
    call StoreInteger(EmpCache, {{CAT}}, {{K.init}}, 1)
    call StoreInteger(EmpCache, {{CAT}}, {{K.phase}}, EmpPhase)
    call StoreInteger(EmpCache, {{CAT}}, {{K.tech}}, EmpTech)
    call StoreInteger(EmpCache, {{CAT}}, {{K.captured}}, EmpCaptured)
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        call StoreInteger(EmpCache, {{CAT}}, {{K.ownerPrefix}} + I2S(n), EmpOwner[n])
        set n = n + 1
    endloop
    call SaveGameCache(EmpCache)
endfunction

function EmpLoad takes nothing returns nothing
    local integer n = 1
    set EmpCache = InitGameCache({{str CACHE_FILE}})
    if GetStoredInteger(EmpCache, {{CAT}}, {{K.init}}) != 1 or GetStoredInteger(EmpCache, {{CAT}}, {{K.house}}) != {{me}} then
        // new campaign for this house
        loop
            exitwhen n > {{TERRITORY_COUNT}}
            set EmpOwner[n] = EmpInitOwner[n]
            set n = n + 1
        endloop
        set EmpPhase = {{PHASE.first}}
        set EmpTech = {{START_TECH}}
        set EmpCaptured = 0
        call StoreInteger(EmpCache, {{CAT}}, {{K.house}}, {{me}})
        call StoreInteger(EmpCache, {{CAT}}, {{K.result}}, -1){{#if story.civilWar}}
        call StoreInteger(EmpCache, {{CAT}}, {{K.storyStep}}, 0){{/if}}
        call EmpSave()
        return
    endif
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        set EmpOwner[n] = GetStoredInteger(EmpCache, {{CAT}}, {{K.ownerPrefix}} + I2S(n))
        set n = n + 1
    endloop
    set EmpPhase = GetStoredInteger(EmpCache, {{CAT}}, {{K.phase}})
    set EmpTech = GetStoredInteger(EmpCache, {{CAT}}, {{K.tech}})
    set EmpCaptured = GetStoredInteger(EmpCache, {{CAT}}, {{K.captured}})
endfunction

function EmpAdjacentToMe takes integer n returns boolean
    local integer i = 0
    loop
        exitwhen i >= EmpAdjCount[n]
        if EmpOwner[EmpAdj[n * {{ADJ_STRIDE}} + i]] == {{me}} then
            return true
        endif
        set i = i + 1
    endloop
    return false
endfunction

function EmpMyNeighbourOf takes integer n returns integer
    local integer i = 0
    loop
        exitwhen i >= EmpAdjCount[n]
        if EmpOwner[EmpAdj[n * {{ADJ_STRIDE}} + i]] == {{me}} then
            return EmpAdj[n * {{ADJ_STRIDE}} + i]
        endif
        set i = i + 1
    endloop
    return 0
endfunction

function EmpCount takes integer house returns integer
    local integer n = 1
    local integer c = 0
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        if EmpOwner[n] == house then
            set c = c + 1
        endif
        set n = n + 1
    endloop
    return c
endfunction

function EmpDraw takes nothing returns nothing
    local integer n = 1
    local integer i
    local integer m
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        if EmpMarker[n] != null then
            call RemoveUnit(EmpMarker[n])
        endif
        set EmpMarker[n] = CreateUnit(Player(EmpOwner[n]), '{{markerId}}', EmpTX[n], EmpTY[n], {{real DEFAULT_FACING}})
        call BlzSetUnitName(EmpMarker[n], EmpTName[n])
        if EmpLabel[n] == null then
            set EmpLabel[n] = CreateTextTag()
            set i = 0
            loop
                exitwhen i >= EmpAdjCount[n]
                set m = EmpAdj[n * {{ADJ_STRIDE}} + i]
                if m > n then
                    call SetLightningColor(AddLightningEx({{str V.LINK_LIGHTNING}}, false, EmpTX[n], EmpTY[n], {{real V.LINK_HEIGHT}}, EmpTX[m], EmpTY[m], {{real V.LINK_HEIGHT}}), {{linkColor}})
                endif
                set i = i + 1
            endloop
        endif
        call SetTextTagText(EmpLabel[n], I2S(n) + ". " + EmpTName[n], {{real V.LABEL_SIZE}})
        call SetTextTagPos(EmpLabel[n], EmpTX[n] - {{labelDx}}, EmpTY[n] - {{labelDy}}, {{real V.LABEL_HEIGHT}})
        call SetTextTagVisibility(EmpLabel[n], true)
        set n = n + 1
    endloop
endfunction

function EmpStatus takes nothing returns nothing
    call EmpSay("|cffffcc00{{houseName}}|r — фаза " + I2S(EmpPhase) + ", тех. уровень " + I2S(EmpTech) + ", территорий: " + I2S(EmpCount({{me}})) + " из {{TERRITORY_COUNT}}")
endfunction

function EmpGo takes nothing returns nothing
    // hand the pending battle to the next map through the cache, then change level
    call StoreInteger(EmpCache, {{CAT}}, {{K.inCampaign}}, 1)
    call StoreInteger(EmpCache, {{CAT}}, {{K.pendingTerritory}}, EmpPendTerr)
    call StoreInteger(EmpCache, {{CAT}}, {{K.pendingKind}}, EmpPendKind)
    call StoreInteger(EmpCache, {{CAT}}, {{K.pendingEnemy}}, EmpPendEnemy)
    if EmpPendKind == {{KIND_ID.defend}} then
        // defence: the attacker comes from its own neighbouring territory
        call StoreInteger(EmpCache, {{CAT}}, {{K.pendingFrom}}, EmpPendFrom)
    else
        call StoreInteger(EmpCache, {{CAT}}, {{K.pendingFrom}}, EmpMyNeighbourOf(EmpPendTerr))
    endif
    call StoreInteger(EmpCache, {{CAT}}, {{K.result}}, -1)
    call EmpSave()
    call SetNextLevelBJ(EmpNextMap)
    call CustomVictoryBJ(Player(0), false, false)
endfunction

function EmpAsk takes string question, string yes, string no returns nothing
    call DialogClear(EmpDialog)
    call DialogSetMessage(EmpDialog, question)
    set EmpBtnYes = DialogAddButton(EmpDialog, yes, 0)
    set EmpBtnNo = DialogAddButton(EmpDialog, no, 0)
    call DialogDisplay(Player(0), EmpDialog, true)
endfunction

// phases: 1, 2, 3 = territory war; 4 = home-world attack (house in "haenemy"); 5 = final battle
function EmpStoryMap takes nothing returns string
    if EmpPhase == {{PHASE.first}} then
        return {{jHeighliner}}
    elseif EmpPhase == {{PHASE.second}} then{{#if story.civilWar}}
        if GetStoredInteger(EmpCache, {{CAT}}, {{K.storyStep}}) == 1 then
            return {{str story.civilWar}}
        endif{{/if}}
        return {{jHomeDefence}}
    elseif EmpPhase == {{PHASE.homeAttack}} then
        if GetStoredInteger(EmpCache, {{CAT}}, {{K.homeAttackEnemy}}) == {{foes.0}} then
            return {{jHomeAttack0}}
        endif
        return {{jHomeAttack1}}
    elseif EmpPhase == {{PHASE.final}} then
        return {{jEnd}}
    endif
    return ""
endfunction

function EmpOfferStory takes nothing returns boolean
    local string m = EmpStoryMap()
    if m == "" then
        return false
    endif
    if (EmpPhase == {{PHASE.first}} or EmpPhase == {{PHASE.second}}) and EmpCaptured < {{CAPTURES_FOR_STORY}}{{#if story.civilWar}} and GetStoredInteger(EmpCache, {{CAT}}, {{K.storyStep}}) == 0{{/if}} then
        return false
    endif
    set EmpNextMap = m
    set EmpPendTerr = 0
    set EmpPendKind = {{KIND_ID.story}}
    set EmpPendEnemy = {{nextHouse}}
    set EmpDialogMode = 2
    call EmpAsk("Доступна сюжетная миссия. Начать?", "В бой!", "Позже")
    return true
endfunction

function EmpCounterAttack takes nothing returns boolean
    // an enemy house attacks one of my territories adjacent to it (50 %)
    local integer n = 1
    local integer i
    local integer foe
    if GetRandomInt(0, {{counterMax}}) == 0 then
        return false
    endif
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        if EmpOwner[n] == {{me}} and n != {{jpMe}} then
            set i = 0
            loop
                exitwhen i >= EmpAdjCount[n]
                set foe = EmpOwner[EmpAdj[n * {{ADJ_STRIDE}} + i]]
                if foe != {{me}} and EmpMapD[n] != "" then
                    set EmpPendTerr = n
                    set EmpPendKind = {{KIND_ID.defend}}
                    set EmpPendEnemy = foe
                    set EmpPendFrom = EmpAdj[n * {{ADJ_STRIDE}} + i]
                    set EmpNextMap = EmpMapD[n]
                    set EmpDialogMode = 1
                    if foe == 0 then
                        call EmpAsk("Атрейдесы атакуют территорию «" + EmpTName[n] + "»! Оборонять?", "Оборонять", "Отступить")
                    elseif foe == 1 then
                        call EmpAsk("Харконнены атакуют территорию «" + EmpTName[n] + "»! Оборонять?", "Оборонять", "Отступить")
                    else
                        call EmpAsk("Ордосы атакуют территорию «" + EmpTName[n] + "»! Оборонять?", "Оборонять", "Отступить")
                    endif
                    return true
                endif
                set i = i + 1
            endloop
        endif
        set n = n + 1
    endloop
    return false
endfunction

function EmpApplyResult takes nothing returns boolean
    local integer r = GetStoredInteger(EmpCache, {{CAT}}, {{K.result}})
    local integer kind = GetStoredInteger(EmpCache, {{CAT}}, {{K.resultKind}})
    local integer t = GetStoredInteger(EmpCache, {{CAT}}, {{K.resultTerritory}})
    local integer foe = GetStoredInteger(EmpCache, {{CAT}}, {{K.pendingEnemy}})
    if r < 0 then
        return false
    endif
    call StoreInteger(EmpCache, {{CAT}}, {{K.result}}, -1)
    if kind == {{KIND_ID.attack}} then
        if r == 1 then
            set EmpOwner[t] = {{me}}
            set EmpCaptured = EmpCaptured + 1
            call EmpSay("Территория «" + EmpTName[t] + "» захвачена!")
            if EmpCaptured == 1 then
                set EmpTech = EmpTech + 1
            endif
            if EmpPhase == {{PHASE.lastWar}} and ({{enemyCapitalIsT}}) then
                // an enemy capital fell: home-world attack on that house (offered by EmpOfferStory)
                set EmpPhase = {{PHASE.homeAttack}}
                set EmpTech = {{HOME_ATTACK_TECH}}
                if t == {{jpFoe0}} then
                    call StoreInteger(EmpCache, {{CAT}}, {{K.homeAttackEnemy}}, {{foes.0}})
                else
                    call StoreInteger(EmpCache, {{CAT}}, {{K.homeAttackEnemy}}, {{foes.1}})
                endif
                call EmpSay("Вражеская столица захвачена. Готовьтесь к вторжению на их родную планету!")
            endif
        else
            call EmpSay("Атака на «" + EmpTName[t] + "» отбита. Наши силы отошли.")
        endif
    elseif kind == {{KIND_ID.defend}} then
        if r == 1 then
            call EmpSay("Территория «" + EmpTName[t] + "» удержана!")
        else
            set EmpOwner[t] = foe
            call EmpSay("Территория «" + EmpTName[t] + "» потеряна.")
        endif
    elseif kind == {{KIND_ID.story}} then
        if r == 1 then
            if EmpPhase == {{PHASE.final}} then
                // final mission won
                call EmpSave()
                call EmpSay("|cffffcc00Арракис принадлежит вам! Кампания завершена.|r")
                call CustomVictoryBJ(Player(0), true, true)
                return true
            endif
{{#if story.civilWar}}            if EmpPhase == {{PHASE.second}} and GetStoredInteger(EmpCache, {{CAT}}, {{K.storyStep}}) == 0 then
                // the home defence is won: the civil war attack follows before phase {{PHASE.lastWar}}
                call StoreInteger(EmpCache, {{CAT}}, {{K.storyStep}}, 1)
                call EmpSay("|cffffcc00Гражданская война! Сюжетная миссия доступна.|r")
                call EmpSave()
                return false
            endif
            call StoreInteger(EmpCache, {{CAT}}, {{K.storyStep}}, 0)
{{/if}}            if EmpPhase < {{PHASE.lastWar}} then
                set EmpPhase = EmpPhase + 1
                set EmpCaptured = 0
                set EmpTech = IMaxBJ(EmpTech, 2 * EmpPhase - 1)
                call EmpSay("|cffffcc00Начинается фаза " + I2S(EmpPhase) + ".|r")
            elseif EmpPhase == {{PHASE.homeAttack}} then
                set EmpPhase = {{PHASE.final}}
                call EmpSay("|cffffcc00Родной мир врага пал. Остался последний бой — Император!|r")
            endif
        else
            call EmpSay("Сюжетная миссия провалена. Попробуйте снова.")
        endif
    endif
    // kind {{KIND_ID.start}} = the house start mission: nothing to apply
    call EmpSave()
    return false
endfunction

function EmpOnDialog takes nothing returns nothing
    local boolean yes = GetClickedButton() == EmpBtnYes
    call DialogDisplay(Player(0), EmpDialog, false)
    if EmpDialogMode == 1 then
        if yes then
            call EmpGo()
            return
        endif
        // retreat: the territory is lost
        set EmpOwner[EmpPendTerr] = EmpPendEnemy
        call EmpSay("Мы отступили с территории «" + EmpTName[EmpPendTerr] + "».")
        call EmpSave()
        call EmpDraw()
    elseif EmpDialogMode == 2 or EmpDialogMode == 3 then
        if yes then
            call EmpGo()
            return
        endif
    endif
    set EmpBusy = false
endfunction

function EmpOnSelect takes nothing returns nothing
    local unit u = GetTriggerUnit()
    local integer n = 1
    if EmpBusy or GetUnitTypeId(u) != '{{markerId}}' then
        return
    endif
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        exitwhen EmpMarker[n] == u
        set n = n + 1
    endloop
    if n > {{TERRITORY_COUNT}} then
        return
    endif
    if EmpOwner[n] == {{me}} then
        call EmpSay("«" + EmpTName[n] + "» — наша территория.")
        return
    endif
    if not EmpAdjacentToMe(n) then
        call EmpSay("«" + EmpTName[n] + "» не граничит с нашими землями.")
        return
    endif
    if EmpPhase < {{PHASE.lastWar}} and ({{enemyCapitalIsN}}) then
        call EmpSay("Вражеская столица пока недоступна (фаза {{PHASE.lastWar}}).")
        return
    endif
    if EmpMapA[n] == "" then
        call EmpSay("Для этой территории нет карты боя.")
        return
    endif
    set EmpBusy = true
    set EmpPendTerr = n
    set EmpPendKind = {{KIND_ID.attack}}
    set EmpPendEnemy = EmpOwner[n]
    set EmpNextMap = EmpMapA[n]
    set EmpDialogMode = 3
    call EmpAsk("Атаковать «" + EmpTName[n] + "»?", "В бой!", "Отмена")
endfunction

{{autoTestFunctions}}function EmpHubStart takes nothing returns nothing
    local trigger tr = CreateTrigger()
    set EmpDialog = DialogCreate()
    call TriggerRegisterDialogEvent(tr, EmpDialog)
    call TriggerAddAction(tr, function EmpOnDialog)
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_SELECTED, null)
    call TriggerAddAction(tr, function EmpOnSelect)
    call SetPlayerColorBJ(Player(0), ConvertPlayerColor({{colorMe}}), true)
    call SetPlayerColorBJ(Player(1), ConvertPlayerColor({{colorNext}}), true)
    call SetPlayerColorBJ(Player(2), ConvertPlayerColor({{colorNext2}}), true)
    call SetTimeOfDay({{real TIME_OF_DAY}})
    call SuspendTimeOfDay(true){{#if musicList}}
    call ClearMapMusic()
    call SetMapMusic({{musicList}}, false, 0)
    call PlayMusic({{musicList}}){{/if}}
    call FogEnable(false)
    call FogMaskEnable(false)
    call EmpData()
    call EmpLoad()
    call EmpDraw()
    call SetCameraField(CAMERA_FIELD_TARGET_DISTANCE, {{real V.HUB_CAMERA_DISTANCE}}, 0.0)
    call SetCameraPosition((EmpTX[{{jpMe}}] * {{real V.CAMERA_TOWARDS_CAPITAL_NUM}}) / {{real V.CAMERA_TOWARDS_CAPITAL_DEN}}, (EmpTY[{{jpMe}}] * {{real V.CAMERA_TOWARDS_CAPITAL_NUM}}) / {{real V.CAMERA_TOWARDS_CAPITAL_DEN}})
    call EmpStatus()
    call EmpSay("Выберите вражескую территорию рядом с вашими землями, чтобы атаковать.")
    set EmpBusy = true
    if EmpApplyResult() then
        call EmpDraw()
        return
    endif
    call EmpDraw()
    call EmpStatus(){{#if o.autoTest}}
    call EmpAutoReport(){{/if}}
    if EmpOfferStory() then
        return
    endif
    if {{#if o.autoTest}}false and {{/if}}GetStoredInteger(EmpCache, {{CAT}}, {{K.lastKind}}) == 0 and EmpCounterAttack() then
        call StoreInteger(EmpCache, {{CAT}}, {{K.lastKind}}, 1)
        return
    endif
    call StoreInteger(EmpCache, {{CAT}}, {{K.lastKind}}, 0)
    set EmpBusy = false
endfunction
