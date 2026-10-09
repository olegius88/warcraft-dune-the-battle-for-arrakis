// ---- the Ix projector's holograms (Rules.txt Projector: IXProjector; Game.exe 1.09 class 0x17, UnitProjector)
// Deployed (deploy.j), its "projection" button on a visible ground unit of any side whose type is
// Projectable makes a replica of that type for the projector's owner beside it (0x570a70 -> 0x597c20).
// A replica (0x571b20) lives the projector's Lifespan ticks (its health counts down), vanishes at any
// hit (0x198 / 0x248 / 0x24c -> state 0x2d) and when its projector is gone, fires when
// ReplicaShouldFire, every bullet doing ReplicaBulletDamage (0x59874c). EmpProjTab[type]: 0 lifespan
// (s), 1 = not projectable; [button] 2 = 1; [replica] 3 its projector; EmpProjAll: the replicas.
// TODO(units): the fade in / out (ReplicaProjectionTime / ReplicaVanishTime) is not shown; the AI's use
// of the projector is not traced. Risk: replicas pop up at once; the AI's projectors never project.
// Feature test: test/emperor-mission.test.ts "projector".
function EmpProjData takes nothing returns nothing
    set EmpProjTab = InitHashtable()
    set EmpProjAll = CreateGroup()
{{projLines}}
endfunction

function EmpProjIsReplica takes unit u returns boolean
    return HaveSavedHandle(EmpProjTab, GetHandleId(u), 3)
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
        call SetUnitVertexColor(r, 255, 255, 255, {{RT.PROJ_ALPHA}})
        {{#if replicaNoFire}}call BlzUnitDisableAbility(r, 'Aatk', true, false)
        {{/if}}call IssuePointOrder(r, "move", GetUnitX(r) + {{real RT.PROJ_OFFSET}} * Cos(a), GetUnitY(r) + {{real RT.PROJ_OFFSET}} * Sin(a))
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
        call KillUnit(v)
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
            call KillUnit(r)
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
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(cast, Player(i), EVENT_PLAYER_UNIT_SPELL_EFFECT, null)
        call TriggerRegisterPlayerUnitEvent(dmg, Player(i), EVENT_PLAYER_UNIT_DAMAGING, null)
        set i = i + 1
    endloop
    call TriggerAddAction(cast, function EmpProjCast)
    call TriggerAddAction(dmg, function EmpProjDamage)
    call TimerStart(CreateTimer(), {{real RT.PROJ_TICK}}, true, function EmpProjTick)
    set cast = null
    set dmg = null
endfunction
