// ---- the Ix projector's holograms (Rules.txt Projector: IXProjector; Game.exe 1.09 class 0x17, UnitProjector)
// Deployed (deploy.j), its "projection" button on a visible ground unit of any side whose type is
// Projectable makes a replica of that type for the projector's owner beside it (0x570a70 -> 0x597c20).
// A replica (0x571b20) lives the projector's Lifespan ticks (its health counts down), vanishes at any
// hit (0x198 / 0x248 / 0x24c -> state 0x2d) and when its projector is gone, fires when
// ReplicaShouldFire, every bullet doing ReplicaBulletDamage (0x59874c). EmpProjTab[type]: 0 lifespan
// (s), 1 = not projectable; [button] 2 = 1; [replica] 3 its projector; EmpProjAll: the replicas.
// A new replica is projected [General] ReplicaProjectionTime ticks (state 0x2c), unable to act, then
// is a normal unit; a hit or the loss of its projector makes it vanish over ReplicaVanishTime ticks
// (state 0x2d), then it is gone (0x571b20). Game.exe draws both phases as a wobble of the model
// (0x571ca0); here they fade the alpha in / out (EmpProjFade). EmpProjTab[replica] 4 phase (1 projected,
// 2 normal, 3 vanishing), 5 the tick it began, 6 / 7 where it goes once projected.
// TODO(units): the AI's use of the projector is not traced. Risk: the AI's projectors never project.
// Feature test: test/emperor-mission.test.ts "projector".
function EmpProjData takes nothing returns nothing
    set EmpProjTab = InitHashtable()
    set EmpProjAll = CreateGroup()
{{projLines}}
endfunction

function EmpProjIsReplica takes unit u returns boolean
    return HaveSavedHandle(EmpProjTab, GetHandleId(u), 3)
endfunction

// a replica starts to vanish (once)
function EmpProjVanish takes unit r returns nothing
    local integer h = GetHandleId(r)
    if LoadInteger(EmpProjTab, h, 4) != 3 then
        call SaveInteger(EmpProjTab, h, 4, 3)
        call SaveInteger(EmpProjTab, h, 5, EmpTick)
        call BlzPauseUnitEx(r, true)
        call GroupAddUnit(EmpProjFading, r)
    endif
endfunction

// the replicas in their projection or vanish phase, every tick
function EmpProjFade takes nothing returns nothing
    local group g = CreateGroup()
    local unit r
    local integer h
    local integer n
    call GroupAddGroup(EmpProjFading, g)
    loop
        set r = FirstOfGroup(g)
        exitwhen r == null
        call GroupRemoveUnit(g, r)
        set h = GetHandleId(r)
        set n = EmpTick - LoadInteger(EmpProjTab, h, 5)
        if not EmpAlive(r) then
            call GroupRemoveUnit(EmpProjFading, r)
        elseif LoadInteger(EmpProjTab, h, 4) == 1 then
            if n >= {{replicaIn}} then
                call SetUnitVertexColor(r, 255, 255, 255, {{RT.PROJ_ALPHA}})
                call BlzPauseUnitEx(r, false)
                call SaveInteger(EmpProjTab, h, 4, 2)
                call GroupRemoveUnit(EmpProjFading, r)
                call IssuePointOrder(r, "move", LoadReal(EmpProjTab, h, 6), LoadReal(EmpProjTab, h, 7))
            else
                call SetUnitVertexColor(r, 255, 255, 255, {{RT.PROJ_ALPHA}} * n / IMaxBJ({{replicaIn}}, 1))
            endif
        elseif n >= {{replicaOut}} then
            call GroupRemoveUnit(EmpProjFading, r)
            call KillUnit(r)
        else
            call SetUnitVertexColor(r, 255, 255, 255, {{RT.PROJ_ALPHA}} * ({{replicaOut}} - n) / IMaxBJ({{replicaOut}}, 1))
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpProjCast takes nothing returns nothing
    local unit p = GetTriggerUnit()
    local unit t = GetSpellTargetUnit()
    local unit r
    local real a
    if LoadInteger(EmpProjTab, GetSpellAbilityId(), 2) == 1 and t != null and t != p and EmpAlive(t) and not IsUnitType(t, UNIT_TYPE_STRUCTURE) and not IsUnitType(t, UNIT_TYPE_FLYING) and not LoadBoolean(EmpProjTab, EmpType(t), 1) and not EmpProjIsReplica(t) and IsUnitVisible(t, GetOwningPlayer(p)) then
        set a = GetUnitFacing(p) * bj_DEGTORAD
        set r = CreateUnit(GetOwningPlayer(p), EmpType(t), GetUnitX(p) + {{real RT.PROJ_OFFSET}} * Cos(a), GetUnitY(p) + {{real RT.PROJ_OFFSET}} * Sin(a), GetUnitFacing(p))
        call SaveUnitHandle(EmpProjTab, GetHandleId(r), 3, p)
        call GroupAddUnit(EmpProjAll, r)
        call UnitApplyTimedLife(r, 'BTLF', LoadReal(EmpProjTab, EmpType(p), 0))
        call SetUnitVertexColor(r, 255, 255, 255, 0)
        {{#if replicaNoFire}}call BlzUnitDisableAbility(r, 'Aatk', true, false)
        {{/if}}call SaveReal(EmpProjTab, GetHandleId(r), 6, GetUnitX(r) + {{real RT.PROJ_OFFSET}} * Cos(a))
        call SaveReal(EmpProjTab, GetHandleId(r), 7, GetUnitY(r) + {{real RT.PROJ_OFFSET}} * Sin(a))
        // projected first, unable to act (Game.exe state 0x2c)
        call SaveInteger(EmpProjTab, GetHandleId(r), 4, 1)
        call SaveInteger(EmpProjTab, GetHandleId(r), 5, EmpTick)
        call BlzPauseUnitEx(r, true)
        call GroupAddUnit(EmpProjFading, r)
    endif
    set p = null
    set t = null
    set r = null
endfunction

// a replica hit vanishes; a replica's shot does ReplicaBulletDamage
function EmpProjDamage takes nothing returns nothing
    local unit v = GetTriggerUnit()
    local unit s = GetEventDamageSource()
    if EmpProjIsReplica(v) then
        call BlzSetEventDamage(0.0)
        call EmpProjVanish(v)
    elseif s != null and EmpProjIsReplica(s) then
        call BlzSetEventDamage({{real replicaDamage}})
    endif
    set v = null
    set s = null
endfunction

// replicas whose projector is gone vanish; dead ones leave the list
function EmpProjTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit r
    call GroupAddGroup(EmpProjAll, g)
    loop
        set r = FirstOfGroup(g)
        exitwhen r == null
        call GroupRemoveUnit(g, r)
        if not EmpAlive(r) then
            call GroupRemoveUnit(EmpProjAll, r)
            call FlushChildHashtable(EmpProjTab, GetHandleId(r))
        elseif not EmpAlive(LoadUnitHandle(EmpProjTab, GetHandleId(r), 3)) then
            call EmpProjVanish(r)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpProjInit takes nothing returns nothing
    local trigger cast = CreateTrigger()
    local trigger dmg = CreateTrigger()
    local integer i = 0
    call EmpProjData()
    set EmpProjFading = CreateGroup()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(cast, Player(i), EVENT_PLAYER_UNIT_SPELL_EFFECT, null)
        call TriggerRegisterPlayerUnitEvent(dmg, Player(i), EVENT_PLAYER_UNIT_DAMAGING, null)
        set i = i + 1
    endloop
    call TriggerAddAction(cast, function EmpProjCast)
    call TriggerAddAction(dmg, function EmpProjDamage)
    call TimerStart(CreateTimer(), {{real RT.PROJ_TICK}}, true, function EmpProjTick)
    call TimerStart(CreateTimer(), {{real TICK_SECONDS}}, true, function EmpProjFade)
    set cast = null
    set dmg = null
endfunction
