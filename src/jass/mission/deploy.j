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
    if deployButton != 0 then
        call SaveInteger(EmpDeployTab, deployButton, 5, 1)
        call SaveInteger(EmpDeployTab, undeployButton, 5, 2)
    endif
endfunction

// a form the game switches itself (Rules.txt AdvancedSardaukar, Game.exe 0x567190): [type] 11 = it is
// one, 13 = the range enemy infantry ([type] 12) switches it within
function EmpDeployAuto takes integer t, real range returns nothing
    call SaveBoolean(EmpDeployTab, t, 11, true)
    call SaveReal(EmpDeployTab, t, 13, range)
    set EmpDeployAutoAny = true
endfunction

function EmpDeployData takes nothing returns nothing
    set EmpDeployTab = InitHashtable()
{{deployLines}}
endfunction

// into the other form: the Chaos morph turns the unit at once; it resets damage, speed and
// regeneration to the new form's own, so the veterancy is put back once the type changed
// (veterancy.j EmpVetMorphed: child 15 = the type before the morph; bug fixed 2026-10-09: the type it
// turns into was saved, and the restore came only with the timer's last try, about a second late;
// test "a deploy morph puts the veterancy back at once")
function EmpDeployApply takes unit u, boolean on returns nothing
    local integer t = EmpType(u)
    local integer h = GetHandleId(u)
    local timer tm
    call SaveInteger(EmpVetUnit, h, 15, GetUnitTypeId(u))
    if on then
        call UnitAddAbility(u, LoadInteger(EmpDeployTab, t, 2))
    else
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

// enemy infantry of u's owner within r (what the ADV Sardaukar's knife goes for)
function EmpDeployInfantryNear takes unit u, real r returns boolean
    local group g = CreateGroup()
    local unit e
    local boolean found = false
    call GroupEnumUnitsInRange(g, GetUnitX(u), GetUnitY(u), r, null)
    loop
        set e = FirstOfGroup(g)
        exitwhen e == null or found
        call GroupRemoveUnit(g, e)
        if EmpAlive(e) and IsUnitEnemy(e, GetOwningPlayer(u)) and LoadBoolean(EmpDeployTab, EmpType(e), 12) and IsUnitVisible(e, GetOwningPlayer(u)) then
            set found = true
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set e = null
    return found
endfunction

// every DEPLOY_AUTO_PERIOD: a knife form while enemy infantry is within its range, else the gun
// (Game.exe asks it of the current target each tick, 0x567190; here of any enemy infantry it sees)
function EmpDeployAutoTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local boolean near
    call GroupEnumUnitsInRect(g, bj_mapInitialPlayableArea, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and LoadBoolean(EmpDeployTab, EmpType(u), 11) then
            set near = EmpDeployInfantryNear(u, LoadReal(EmpDeployTab, EmpType(u), 13))
            if near != EmpDeployed(u) then
                call EmpDeployApply(u, near)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
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
    if EmpDeployAutoAny then
        call TimerStart(CreateTimer(), {{real RT.DEPLOY_AUTO_PERIOD}}, true, function EmpDeployAutoTick)
    endif
endfunction
