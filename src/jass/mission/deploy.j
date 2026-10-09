// ---- deployable units (Rules.txt DeployInf: ATKindjal, ORMortar; Kobra: ORKobra) ----
// A unit deploys into a copy of its type armed with the turret it fires when deployed, which does not
// move (units.ts deploy; Game.exe 1.09 turret check 0x550b30, move refused while deployed 0x55eea1).
// Each form has a Channel button; its cast adds the Chaos morph into the other form, which keeps the
// unit (veterancy.j). EmpDeployTab[type]: 0 = deploy button, 1 = deployed copy, 2 / 3 = the morph
// into the copy / back, 4 = the copy's range; [button] 5 = 1 deploy, 2 undeploy. The copy counts as
// its type (EmpVetBase -> EmpType); runtime helpers.j EmpDeployed / EmpDeploySet.
// Regression/feature test: test/emperor-mission.test.ts "deployable units".
function EmpDeployRegister takes integer t, integer deployed, integer deployButton, integer undeployButton, integer toDeployed, integer toNormal, real range returns nothing
    call SaveInteger(EmpVetBase, deployed, 0, t)
    call SaveInteger(EmpDeployTab, t, 0, deployButton)
    call SaveInteger(EmpDeployTab, t, 1, deployed)
    call SaveInteger(EmpDeployTab, t, 2, toDeployed)
    call SaveInteger(EmpDeployTab, t, 3, toNormal)
    call SaveReal(EmpDeployTab, t, 4, range)
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
// TODO(deploy): Game.exe waits for the model's deploy / undeploy animation before the state changes
// (0x568750 / 0x56de70 via 0x563c50); here the morph is at once. The animation length of the converted
// models was not measured; risk: a deployed Kindjal fires sooner than in Emperor.
function EmpDeployMorph takes unit u, boolean on returns nothing
    local integer t = EmpType(u)
    local integer h = GetHandleId(u)
    local timer tm
    if not EmpAlive(u) or not EmpDeployable(u) or EmpDeployed(u) == on then
        return
    endif
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
