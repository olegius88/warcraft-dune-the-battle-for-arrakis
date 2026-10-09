
{{movieFunctions}}
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
    call StoreInteger(EmpCache, {{CAT}}, {{K.battles}}, EmpBattles)
    call StoreInteger(EmpCache, {{CAT}}, {{K.noGain}}, EmpNoGain)
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        call StoreInteger(EmpCache, {{CAT}}, {{K.ownerPrefix}} + I2S(n), EmpOwner[n])
        set n = n + 1
    endloop
    set n = 1
    loop
        exitwhen n > {{RESERVE.slots}}
        call StoreInteger(EmpCache, {{CAT}}, {{K.stackPrefix}} + I2S(n), EmpStack[n])
        set n = n + 1
    endloop
    call SaveGameCache(EmpCache)
endfunction

// ---- PhaseRules.txt (src/emperor/phase-rules.ts) ----
// tech level when a phase begins
function EmpPhaseTech takes nothing returns nothing
{{phaseTechLines}}
endfunction

// tech level after the n-th capture of the phase
function EmpCaptureTech takes nothing returns nothing
{{captureTechLines}}
endfunction

// phases 1 and 2 are over (their story mission is offered) after Battles battles with Captured
// captures, or after MaxBattles battles
function EmpPhaseDone takes nothing returns boolean
{{phaseDoneLines}}
    return false
endfunction

// last war phase: Warning / Lose battles in a row without a captured territory
function EmpNoGainCheck takes nothing returns boolean
{{#if noGain.lose}}    if EmpPhase != {{PHASE.lastWar}} then
        return false
    endif
    if EmpNoGain >= {{noGain.lose}} then
        call StoreInteger(EmpCache, {{CAT}}, {{K.init}}, 0)
        call SaveGameCache(EmpCache)
        call EmpMovieAdd({{mv.lost}})
        set EmpEnding = 2
        return true
    elseif EmpNoGain == {{noGain.warning}} then
        call EmpMovieAdd({{mv.warning}})
        call EmpSay({{str NO_GAIN_WARNING}})
    endif
{{/if}}    return false
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
        set n = 1
        loop
            exitwhen n > {{RESERVE.slots}}
            set EmpStack[n] = 0
            set n = n + 1
        endloop
        set EmpPhase = {{PHASE.first}}
        set EmpTech = {{START_TECH}}
        set EmpCaptured = 0
        set EmpBattles = 0
        set EmpNoGain = 0
        call EmpPhaseTech()
        call StoreInteger(EmpCache, {{CAT}}, {{K.house}}, {{me}})
        call StoreInteger(EmpCache, {{CAT}}, {{K.result}}, -1)
{{wonClearLines}}
        call EmpMovieAdd({{mv.start}}){{#if story.civilWar}}
        call StoreInteger(EmpCache, {{CAT}}, {{K.storyStep}}, 0){{/if}}
        call EmpSave()
        return
    endif
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        set EmpOwner[n] = GetStoredInteger(EmpCache, {{CAT}}, {{K.ownerPrefix}} + I2S(n))
        set n = n + 1
    endloop
    set n = 1
    loop
        exitwhen n > {{RESERVE.slots}}
        set EmpStack[n] = GetStoredInteger(EmpCache, {{CAT}}, {{K.stackPrefix}} + I2S(n))
        set n = n + 1
    endloop
    set EmpPhase = GetStoredInteger(EmpCache, {{CAT}}, {{K.phase}})
    set EmpTech = GetStoredInteger(EmpCache, {{CAT}}, {{K.tech}})
    set EmpCaptured = GetStoredInteger(EmpCache, {{CAT}}, {{K.captured}})
    set EmpBattles = GetStoredInteger(EmpCache, {{CAT}}, {{K.battles}})
    set EmpNoGain = GetStoredInteger(EmpCache, {{CAT}}, {{K.noGain}})
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

// ---- reserve stacks (Game.exe 1.09, campaign house record +0x554; config RESERVE) ----
// A stack comes after every jump-to mission, won or not (0x491518: the start and story missions here),
// on a random territory of the player's with none on it (0x494b80, no adjacency asked). The stacks on
// the battle territory (a defence) and on the player's neighbours of it, in their order, join a battle
// (0x490d60 -> 0x491e60, at most RESERVE.join): each brings UnitValueReserves worth of units two
// veterancy levels up (mission). After the battle the first joined one moves onto the territory if it
// was won (0x491584), the other joined ones are used up (0x4915be); lost, all joined ones are gone
// (0x4915cd). The AI houses have none (0x490d60 is for house slot 0 only).
// TODO(campaign): Game.exe lets the player deselect a stack by clicking it (0x48a620 -> 0x490b50:
// joined unless deselected), move one a territory a turn (ReserveMoves 0x4923a0 -> 0x490a50) and gets
// one from a retreat of ten units or more (0x491684 / 0x4916c5; the Retreat order 0x523730 is not
// ported). Here all of them join and none move. Risk: the player cannot keep a stack back or shift it.
function EmpStackAt takes integer t returns integer
    local integer k = 1
    loop
        exitwhen k > {{RESERVE.slots}}
        if EmpStack[k] == t then
            return k
        endif
        set k = k + 1
    endloop
    return 0
endfunction

function EmpStackAdd takes nothing returns nothing
    local integer n = 1
    local integer c = 0
    local integer k
    local integer array cand
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        if EmpOwner[n] == {{me}} and EmpStackAt(n) == 0 then
            set cand[c] = n
            set c = c + 1
        endif
        set n = n + 1
    endloop
    set k = EmpStackAt(0)
    if c == 0 or k == 0 then
        return
    endif
    set n = cand[GetRandomInt(0, c - 1)]
    set EmpStack[k] = n
    call EmpSay({{str RESERVE_NEW}} + " «" + EmpTName[n] + "»")
endfunction

// the stacks joining a battle at t (a defence: the one on t first), into EmpPendRes / EmpPendResSlot
function EmpStackJoin takes integer t, boolean defend returns nothing
    local integer i = 0
    local integer m
    local integer k
    set EmpPendRes = 0
    if defend and EmpStackAt(t) > 0 then
        set EmpPendResSlot[0] = EmpStackAt(t)
        set EmpPendRes = 1
    endif
    loop
        exitwhen i >= EmpAdjCount[t] or EmpPendRes >= {{RESERVE.join}}
        set m = EmpAdj[t * {{ADJ_STRIDE}} + i]
        set k = EmpStackAt(m)
        if EmpOwner[m] == {{me}} and k > 0 then
            set EmpPendResSlot[EmpPendRes] = k
            set EmpPendRes = EmpPendRes + 1
        endif
        set i = i + 1
    endloop
endfunction

// after a battle at t: the first joined stack onto t if won, the joined ones used up
function EmpStackAfter takes integer t, boolean won returns nothing
    local integer n = GetStoredInteger(EmpCache, {{CAT}}, {{K.pendRes}})
    local integer i = 0
    local integer k
    loop
        exitwhen i >= n
        set k = GetStoredInteger(EmpCache, {{CAT}}, {{K.pendResPrefix}} + I2S(i))
        if k > 0 then
            if won and i == 0 then
                set EmpStack[k] = t
            else
                set EmpStack[k] = 0
            endif
        endif
        set i = i + 1
    endloop
    call StoreInteger(EmpCache, {{CAT}}, {{K.pendRes}}, 0)
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
    set n = 1
    loop
        exitwhen n > {{RESERVE.slots}}
        if EmpStackMarker[n] != null then
            call RemoveUnit(EmpStackMarker[n])
            set EmpStackMarker[n] = null
        endif
        if EmpStack[n] > 0 then
            set EmpStackMarker[n] = CreateUnit(Player(0), '{{stackMarkerId}}', EmpTX[EmpStack[n]] + {{real RESERVE.markerDx}}, EmpTY[EmpStack[n]] + {{real RESERVE.markerDy}}, {{real DEFAULT_FACING}})
        endif
        set n = n + 1
    endloop
endfunction

function EmpStatus takes nothing returns nothing
    call EmpSay("|cffffcc00{{houseName}}|r — фаза " + I2S(EmpPhase) + ", тех. уровень " + I2S(EmpTech) + ", территорий: " + I2S(EmpCount({{me}})) + " из {{TERRITORY_COUNT}}")
endfunction

function EmpGo takes nothing returns nothing
    local integer n
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
    // the reserve stacks joining it (a territory battle)
    set EmpPendRes = 0
    if EmpPendKind == {{KIND_ID.attack}} or EmpPendKind == {{KIND_ID.defend}} then
        call EmpStackJoin(EmpPendTerr, EmpPendKind == {{KIND_ID.defend}})
    endif
    call StoreInteger(EmpCache, {{CAT}}, {{K.pendRes}}, EmpPendRes)
    set n = 0
    loop
        exitwhen n >= EmpPendRes
        call StoreInteger(EmpCache, {{CAT}}, {{K.pendResPrefix}} + I2S(n), EmpPendResSlot[n])
        set n = n + 1
    endloop
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

// movie of the story mission of the current phase: when it is accepted, or after it was lost
function EmpStoryMovie takes boolean failed returns string
    local boolean foe0 = GetStoredInteger(EmpCache, {{CAT}}, {{K.homeAttackEnemy}}) == {{foes.0}}
    if EmpPhase == {{PHASE.first}} then
        if failed then
            return {{mv.failedHeighliner}}
        endif
        return {{mv.heighliner}}
    elseif EmpPhase == {{PHASE.second}} then{{#if story.civilWar}}
        if GetStoredInteger(EmpCache, {{CAT}}, {{K.storyStep}}) == 1 then
            if failed then
                return {{mv.failedCivilWar}}
            endif
            return {{mv.civilWar}}
        endif{{/if}}
        if failed then
            return {{mv.failedHomeDefence}}
        endif
        return {{mv.homeDefence}}
    elseif EmpPhase == {{PHASE.homeAttack}} then
        if failed and foe0 then
            return {{mv.failedHomeAttack0}}
        elseif failed then
            return {{mv.failedHomeAttack1}}
        endif
    elseif EmpPhase == {{PHASE.final}} and failed then
        if foe0 then
            return {{mv.failedFinal0}}
        endif
        return {{mv.failedFinal1}}
    endif
    return ""
endfunction

function EmpOfferStory takes nothing returns boolean
    local string m = EmpStoryMap()
    if m == "" then
        return false
    endif
    if (EmpPhase == {{PHASE.first}} or EmpPhase == {{PHASE.second}}) and not EmpPhaseDone(){{#if story.civilWar}} and GetStoredInteger(EmpCache, {{CAT}}, {{K.storyStep}}) == 0{{/if}} then
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

// sub-house alliances made or lost by the last mission (mission campaign.j), told with the house's
// debrief line; what was told is kept (allyseen<tag>)
function EmpAllyDebrief takes nothing returns nothing
{{allyDebriefLines}}
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
    call EmpAllyDebrief()
    if kind == {{KIND_ID.attack}} or kind == {{KIND_ID.defend}} then
        set EmpBattles = EmpBattles + 1
        set EmpNoGain = EmpNoGain + 1
    endif
    if kind == {{KIND_ID.attack}} or kind == {{KIND_ID.defend}} then
        call EmpStackAfter(t, r == 1)
    elseif kind == {{KIND_ID.story}} or kind == {{KIND_ID.start}} then
        // a jump-to mission, won or not: a new reserve stack (Game.exe 0x491518)
        call EmpStackAdd()
    endif
    if kind == {{KIND_ID.attack}} then
        if r == 1 then
            set EmpOwner[t] = {{me}}
            set EmpCaptured = EmpCaptured + 1
            set EmpNoGain = 0
            call EmpSay("Территория «" + EmpTName[t] + "» захвачена!")
            call EmpCaptureTech()
            if EmpPhase == {{PHASE.lastWar}} and ({{enemyCapitalIsT}}) then
                // an enemy capital fell: home-world attack on that house (offered by EmpOfferStory)
                set EmpPhase = {{PHASE.homeAttack}}
                call EmpPhaseTech()
                if t == {{jpFoe0}} then
                    call StoreInteger(EmpCache, {{CAT}}, {{K.homeAttackEnemy}}, {{foes.0}})
                    call EmpMovieAdd({{mv.homeAttack0}})
                else
                    call StoreInteger(EmpCache, {{CAT}}, {{K.homeAttackEnemy}}, {{foes.1}})
                    call EmpMovieAdd({{mv.homeAttack1}})
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
                call EmpMovieAdd({{mv.won}})
                set EmpEnding = 1
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
                set EmpBattles = 0
                set EmpNoGain = 0
                call EmpPhaseTech()
                if EmpPhase == {{PHASE.second}} then
                    call EmpMovieAdd({{mv.phase2}})
                else
                    call EmpMovieAdd({{mv.phase3}})
                endif
                call EmpSay("|cffffcc00Начинается фаза " + I2S(EmpPhase) + ".|r")
            elseif EmpPhase == {{PHASE.homeAttack}} then
                set EmpPhase = {{PHASE.final}}
                if GetStoredInteger(EmpCache, {{CAT}}, {{K.homeAttackEnemy}}) == {{foes.0}} then
                    call EmpMovieAdd({{mv.final0}})
                else
                    call EmpMovieAdd({{mv.final1}})
                endif
                call EmpSay("|cffffcc00Родной мир врага пал. Остался последний бой — Император!|r")
            endif
        else
            call EmpMovieAdd(EmpStoryMovie(true))
            call EmpSay("Сюжетная миссия провалена. Попробуйте снова.")
        endif
    endif
    // kind {{KIND_ID.start}} = the house start mission: nothing to apply
    call EmpSave()
    return EmpNoGainCheck()
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
    elseif EmpDialogMode == 2 then
        if yes then
            call EmpMovieAdd(EmpStoryMovie(false))
            call EmpMoviePlay(function EmpGo)
            return
        endif
    elseif EmpDialogMode == 3 then
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

{{autoTestFunctions}}function EmpHubResume takes nothing returns nothing
    if EmpEnding == 1 then
        call CustomVictoryBJ(Player(0), true, true)
        return
    elseif EmpEnding == 2 then
        call CustomDefeatBJ(Player(0), {{str NO_GAIN_LOST}})
        return
    endif
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

function EmpHubStart takes nothing returns nothing
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
    // frame table of the movies; was never filled, so every movie was skipped (test/movies.test.ts)
    call EmpMovieData()
    call EmpLoad()
    call EmpDraw()
    call SetCameraField(CAMERA_FIELD_TARGET_DISTANCE, {{real V.HUB_CAMERA_DISTANCE}}, 0.0)
    call SetCameraPosition((EmpTX[{{jpMe}}] * {{real V.CAMERA_TOWARDS_CAPITAL_NUM}}) / {{real V.CAMERA_TOWARDS_CAPITAL_DEN}}, (EmpTY[{{jpMe}}] * {{real V.CAMERA_TOWARDS_CAPITAL_NUM}}) / {{real V.CAMERA_TOWARDS_CAPITAL_DEN}})
    call EmpStatus()
    call EmpSay("Выберите вражескую территорию рядом с вашими землями, чтобы атаковать.")
    set EmpBusy = true
    call EmpApplyResult()
    call EmpDraw()
    call EmpMoviePlay(function EmpHubResume)
endfunction
