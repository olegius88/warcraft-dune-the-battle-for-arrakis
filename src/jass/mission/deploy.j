// ---- deployable units (Rules.txt DeployInf: ATKindjal, ORMortar; Kobra: ORKobra) ----
// A unit deploys into a copy of its type armed with the turret it fires when deployed, which does not
// move (units.ts deploy; Game.exe 1.09 turret check 0x550b30, move refused while deployed 0x55eea1).
// Each form has a Channel button; its cast adds the Chaos morph into the other form, which keeps the
// unit (veterancy.j). EmpDeployTab[type]: 0 = deploy button, 1 = deployed copy, 2 / 3 = the morph
// into the copy / back, 4 = the copy's range, 6 / 7 = seconds a deploy / an undeploy take (the model's
// animations, models.ts deploy); [button] 5 = 1 deploy, 2 undeploy; [unit] 8 = deploying now; [timer]
// 9 = the unit, 10 = into the deployed form. The copy counts as its type (EmpVetBase -> EmpType);
// runtime helpers.j EmpDeployed / EmpDeploySet.
// Regression/feature test: test/emperor-mission.test.ts "deployable units", test/mdx.test.ts
// "deploy animations".
function EmpDeployRegister takes integer t, integer deployed, integer deployButton, integer undeployButton, integer toDeployed, integer toNormal, real range, real deploySecs, real undeploySecs returns nothing
    call SaveInteger(EmpVetBase, deployed, 0, t)
    call SaveInteger(EmpDeployTab, t, 0, deployButton)
    call SaveInteger(EmpDeployTab, t, 1, deployed)
    call SaveInteger(EmpDeployTab, t, 2, toDeployed)
    call SaveInteger(EmpDeployTab, t, 3, toNormal)
    call SaveReal(EmpDeployTab, t, 4, range)
    call SaveReal(EmpDeployTab, t, 6, deploySecs)
    call SaveReal(EmpDeployTab, t, 7, undeploySecs)
    call SaveInteger(EmpDeployTab, deployButton, 5, 1)
    call SaveInteger(EmpDeployTab, undeployButton, 5, 2)
endfunction

function EmpDeployData takes nothing returns nothing
    set EmpDeployTab = InitHashtable()
{{deployLines}}
endfunction

// into the other form: the Chaos morph turns the unit at once; it resets damage, speed and
// regeneration to the new form's own, so the veterancy is put back once the type changed
// (veterancy.j EmpVetMorphed, child 15 = the type it waits for)
function EmpDeployApply takes unit u, boolean on returns nothing
    local integer t = EmpType(u)
    local integer h = GetHandleId(u)
    local timer tm
    if on then
        call SaveInteger(EmpVetUnit, h, 15, LoadInteger(EmpDeployTab, t, 1))
        call UnitAddAbility(u, LoadInteger(EmpDeployTab, t, 2))
    else
        call SaveInteger(EmpVetUnit, h, 15, t)
        call UnitAddAbility(u, LoadInteger(EmpDeployTab, t, 3))
    endif
    set tm = CreateTimer()
    call SaveUnitHandle(EmpVetUnit, GetHandleId(tm), 0, u)
    call TimerStart(tm, {{real RT.VET_MORPH_CHECK}}, true, function EmpVetMorphed)
    set tm = null
endfunction

// the deploy / undeploy animation is over: the unit acts again, in its new form
function EmpDeployDone takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer k = GetHandleId(tm)
    local unit u = LoadUnitHandle(EmpDeployTab, k, 9)
    local boolean on = LoadBoolean(EmpDeployTab, k, 10)
    call FlushChildHashtable(EmpDeployTab, k)
    call DestroyTimer(tm)
    if EmpAlive(u) then
        call RemoveSavedBoolean(EmpDeployTab, GetHandleId(u), 8)
        call BlzPauseUnitEx(u, false)
        call EmpDeployApply(u, on)
    endif
    set tm = null
    set u = null
endfunction

// Game.exe 1.09 changes the state when the deploy / undeploy animation ends (0x568750 / 0x56de70 via
// 0x563c50): the unit plays it (Morph; Morph Alternate in the deployed form, which requires
// "alternate") and does nothing else meanwhile, then turns. Without a converted model: at once.
function EmpDeployMorph takes unit u, boolean on returns nothing
    local integer t = EmpType(u)
    local real secs
    local timer tm
    if not EmpAlive(u) or not EmpDeployable(u) or EmpDeployed(u) == on or LoadBoolean(EmpDeployTab, GetHandleId(u), 8) then
        return
    endif
    if on then
        set secs = LoadReal(EmpDeployTab, t, 6)
    else
        set secs = LoadReal(EmpDeployTab, t, 7)
    endif
    if secs <= 0.0 then
        call EmpDeployApply(u, on)
        return
    endif
    call SaveBoolean(EmpDeployTab, GetHandleId(u), 8, true)
    call IssueImmediateOrder(u, "stop")
    call BlzPauseUnitEx(u, true)
    call SetUnitAnimation(u, "morph")
    set tm = CreateTimer()
    call SaveUnitHandle(EmpDeployTab, GetHandleId(tm), 9, u)
    call SaveBoolean(EmpDeployTab, GetHandleId(tm), 10, on)
    call TimerStart(tm, secs, false, function EmpDeployDone)
    set tm = null
endfunction

// runtime helpers.j EmpDeploySet (the AI, the scripts' ObjectDeploy / ObjectUndeploy)
function EmpDeployArgs takes nothing returns nothing
    call EmpDeployMorph(EmpDeployArgUnit, EmpDeployArgOn)
endfunction

// a deploy / undeploy button used
function EmpDeployCast takes nothing returns nothing
    local integer k = LoadInteger(EmpDeployTab, GetSpellAbilityId(), 5)
    if k > 0 then
        call EmpDeployMorph(GetTriggerUnit(), k == 1)
    endif
endfunction

function EmpDeployInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpDeployData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_SPELL_EFFECT, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpDeployCast)
    set tr = null
endfunction
