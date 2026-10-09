// ---- units that blow themselves up (units.ts detonators; Game.exe 1.09 deploy command 9) ----
// HKDevastator (class 0x1c, 0x568b20): at once its DeathHandBomb at its feet, it dies. IXInfiltrator
// (0x1b, 0x56cf2c): Lifespan ticks later its SaboteurBomb, then a reveal pulse (0x4c1a90): every unit
// not its owner's within its BlastRadius tiles loses its stealth for Damage ticks; it also goes off
// on reaching an enemy building (specials.j, the saboteur's code 0x565cc0). OREITS (9, 0x56916a): ten
// EITSBomb_B round it, an ORSaboteur of its owner left where it was, it dies. The bomb's warhead %
// per armour is at EmpSwTab[type] RT.BOOM_PCT_KEY + armour; no falloff (ReduceDamageWithDistance False).
// EmpBoomTab[type]: 0 kind (1 / 2 / 3), 1 damage, 2 radius, 3 delay, 4 bombs, 5 pulse radius, 6 pulse
// ticks, 7 the unit left; [button] 10 = 1; [timer] 11 the unit.
// TODO(units): the EITS bombs' spread is not read (RT.BOOM_EITS_SPREAD_TILES), the Infiltrator goes off
// on buildings only (Game.exe: any visible ground target within BlastRadius + its Size); the AI's
// EITS (0x466bb0: flies to the enemy building of most value and blows up there) and Infiltrator
// (0x468410) are not ported, the port's AI makes neither. Risk: bombs fall nearer or farther than in
// Emperor; an Infiltrator walks past units.
// Feature test: test/emperor-mission.test.ts "detonate".
function EmpBoomType takes integer t, integer kind, real dmg, real r, real delay, integer bombs, real pulseR, integer pulseTicks, integer leaves, integer button returns nothing
    call SaveInteger(EmpBoomTab, t, 0, kind)
    call SaveReal(EmpBoomTab, t, 1, dmg)
    call SaveReal(EmpBoomTab, t, 2, r)
    call SaveReal(EmpBoomTab, t, 3, delay)
    call SaveInteger(EmpBoomTab, t, 4, bombs)
    call SaveReal(EmpBoomTab, t, 5, pulseR)
    call SaveInteger(EmpBoomTab, t, 6, pulseTicks)
    call SaveInteger(EmpBoomTab, t, 7, leaves)
    call SaveInteger(EmpBoomTab, button, 10, 1)
endfunction

function EmpBoomData takes nothing returns nothing
    set EmpBoomTab = InitHashtable()
{{boomLines}}
endfunction

// the Infiltrator's pulse: units not of p within r show for `ticks` (stealth.j, EmpVetUnit child 18)
function EmpBoomPulse takes player p, real x, real y, real r, integer ticks returns nothing
    local group g = CreateGroup()
    local unit u
    call GroupEnumUnitsInRange(g, x, y, r, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and GetOwningPlayer(u) != p then
            call SaveInteger(EmpVetUnit, GetHandleId(u), 18, EmpTick + ticks)
            if GetUnitAbilityLevel(u, '{{ABILITY.invisibility}}') > 0 and not IsUnitInGroup(u, EmpStealthGroup) then
                call UnitRemoveAbility(u, '{{ABILITY.invisibility}}')
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpBoomBlast takes unit u returns nothing
    local integer t = EmpType(u)
    local player p = GetOwningPlayer(u)
    local real x = GetUnitX(u)
    local real y = GetUnitY(u)
    local real bx = x
    local real by = y
    local integer i = 0
    local integer n = LoadInteger(EmpBoomTab, t, 4)
    local real spread = {{real RT.BOOM_EITS_SPREAD_TILES}} * {{real WC3_UNITS_PER_TILE}}
    loop
        exitwhen i >= n
        if n > 1 then
            set bx = x + GetRandomReal(-spread, spread)
            set by = y + GetRandomReal(-spread, spread)
        endif
        call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.bomb.id}}', {{ART_ABILITY.bomb.type}}, 0), bx, by))
        call EmpSwDamage(p, bx, by, LoadReal(EmpBoomTab, t, 2), LoadReal(EmpBoomTab, t, 1), true, t, {{RT.BOOM_PCT_KEY}})
        set i = i + 1
    endloop
    if LoadReal(EmpBoomTab, t, 5) > 0.0 then
        call EmpBoomPulse(p, x, y, LoadReal(EmpBoomTab, t, 5), LoadInteger(EmpBoomTab, t, 6))
    endif
    if LoadInteger(EmpBoomTab, t, 7) != 0 then
        call CreateUnit(p, LoadInteger(EmpBoomTab, t, 7), x, y, {{FACING}})
    endif
    if EmpAlive(u) then
        call KillUnit(u)
    endif
    set p = null
endfunction

function EmpBoomLater takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local unit u = LoadUnitHandle(EmpBoomTab, GetHandleId(tm), 11)
    call FlushChildHashtable(EmpBoomTab, GetHandleId(tm))
    call DestroyTimer(tm)
    if EmpAlive(u) then
        call EmpBoomBlast(u)
    endif
    set tm = null
    set u = null
endfunction

// u blows up (its button, ObjectDeploy, an Infiltrator at a building)
function EmpBoom takes unit u returns nothing
    local timer tm
    if not EmpAlive(u) or not HaveSavedInteger(EmpBoomTab, EmpType(u), 0) or LoadBoolean(EmpBoomTab, GetHandleId(u), 12) then
        return
    endif
    call SaveBoolean(EmpBoomTab, GetHandleId(u), 12, true)
    if LoadReal(EmpBoomTab, EmpType(u), 3) > 0.0 then
        call IssueImmediateOrder(u, "stop")
        call PauseUnit(u, true)
        set tm = CreateTimer()
        call SaveUnitHandle(EmpBoomTab, GetHandleId(tm), 11, u)
        call TimerStart(tm, LoadReal(EmpBoomTab, EmpType(u), 3), false, function EmpBoomLater)
        set tm = null
    else
        call EmpBoomBlast(u)
    endif
endfunction

// deploy.j EmpDeployArgs (ObjectDeploy of the scripts)
function EmpBoomArgs takes nothing returns nothing
    call EmpBoom(EmpDeployArgUnit)
endfunction

function EmpBoomCast takes nothing returns nothing
    if LoadInteger(EmpBoomTab, GetSpellAbilityId(), 10) == 1 then
        call EmpBoom(GetTriggerUnit())
    endif
endfunction

function EmpBoomInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpBoomData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_SPELL_EFFECT, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpBoomCast)
    set tr = null
endfunction
