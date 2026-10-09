// ---- special abilities (src/emperor/specials.ts, Rules.txt) ----
// EmpSpTab[type]: 0 kind of the shooter (1 Deviator, 2 Leech, 3 Contaminator, 4 Engineer,
// 5 Saboteur), 1 damage per second to a taken unit, 3/4 saboteur damage / radius; flags 7 cannot be
// deviated, 8 can be engineered, 9 crushes, 10 can be crushed, 11 infantry, 12 wall (not sabotaged),
// 13 cannot be repaired, 14 story character (not leeched, not contaminated).
// EmpSpTab[handle]: 30 deviated from (player id + 1), 31 leeched by (player id + 1), 32 leech type,
// 33/34 crusher position at the last crush check.
function EmpSpData takes nothing returns nothing
    set EmpSpTab = InitHashtable()
    set EmpSpLeeched = CreateGroup()
    set EmpSpCrushers = CreateGroup()
    set EmpSpCrushNear = CreateGroup()
{{spLines}}
endfunction

// a deviated unit goes back to its side when DeviateDuration is over
function EmpSpUndeviate takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local unit u = LoadUnitHandle(EmpSpTab, GetHandleId(tm), 0)
    // the side is kept with the timer: a unit removed meanwhile still gives its count back
    local integer p = LoadInteger(EmpSpTab, GetHandleId(tm), 1)
    if p > 0 then
        if u != null and EmpAlive(u) then
            call SetUnitOwner(u, Player(p - 1), true)
        endif
        // the lose rule counts it for its side meanwhile (helpers.j EmpNormalCheck)
        set EmpSwBerserk[p - 1] = EmpSwBerserk[p - 1] - 1
    endif
    if u != null then
        call RemoveSavedInteger(EmpSpTab, GetHandleId(u), 30)
    endif
    call FlushChildHashtable(EmpSpTab, GetHandleId(tm))
    call DestroyTimer(tm)
    set tm = null
    set u = null
endfunction

// hits of the Deviator, the Leech and the Contaminator
function EmpSpDamaged takes nothing returns nothing
    local unit s = GetEventDamageSource()
    local unit u = GetTriggerUnit()
    local integer k
    local integer tu
    local timer tm
    if s == null or u == null or not EmpAlive(u) or IsUnitType(u, UNIT_TYPE_STRUCTURE) or IsUnitAlly(u, GetOwningPlayer(s)) then
        set s = null
        set u = null
        return
    endif
    set k = LoadInteger(EmpSpTab, EmpType(s), 0)
    set tu = EmpType(u)
    if k == 1 and not LoadBoolean(EmpSpTab, tu, 7) and not HaveSavedInteger(EmpSpTab, GetHandleId(u), 30) and GetOwningPlayer(u) != Player(PLAYER_NEUTRAL_AGGRESSIVE) then
        call SaveInteger(EmpSpTab, GetHandleId(u), 30, GetPlayerId(GetOwningPlayer(u)) + 1)
        set EmpSwBerserk[GetPlayerId(GetOwningPlayer(u))] = EmpSwBerserk[GetPlayerId(GetOwningPlayer(u))] + 1
        call SetUnitOwner(u, GetOwningPlayer(s), false)
        set tm = CreateTimer()
        call SaveUnitHandle(EmpSpTab, GetHandleId(tm), 0, u)
        call SaveInteger(EmpSpTab, GetHandleId(tm), 1, LoadInteger(EmpSpTab, GetHandleId(u), 30))
        call TimerStart(tm, {{real deviateSeconds}}, false, function EmpSpUndeviate)
    elseif k == 2 and not LoadBoolean(EmpSpTab, tu, 11) and not LoadBoolean(EmpSpTab, tu, 14) and u != EmpWorm and not IsUnitType(u, UNIT_TYPE_FLYING) and GetOwningPlayer(u) != Player(PLAYER_NEUTRAL_AGGRESSIVE) and not HaveSavedInteger(EmpSpTab, GetHandleId(u), 31) then
        // the leech holds on and drains the vehicle; when it dies a new leech comes out (EmpSpTick)
        call SaveInteger(EmpSpTab, GetHandleId(u), 31, GetPlayerId(GetOwningPlayer(s)) + 1)
        call SaveInteger(EmpSpTab, GetHandleId(u), 32, EmpType(s))
        call GroupAddUnit(EmpSpLeeched, u)
        if GetOwningPlayer(u) == Player(0) then
            call EmpUiSay({{UI.leechAttack}})
        endif
    elseif k == 3 and LoadBoolean(EmpSpTab, tu, 11) and not LoadBoolean(EmpSpTab, tu, 14) then
        // the contaminated infantryman dies and turns into a contaminator of the shooter's side
        if GetOwningPlayer(u) == Player(0) then
            call EmpUiSay({{UI.contAttack}})
        endif
        call CreateUnit(GetOwningPlayer(s), EmpType(s), GetUnitX(u), GetUnitY(u), GetUnitFacing(u))
        call KillUnit(u)
    endif
    set s = null
    set u = null
    set tm = null
endfunction

function EmpSpLeechEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local integer h = GetHandleId(u)
    local real dmg = LoadReal(EmpSpTab, LoadInteger(EmpSpTab, h, 32), 1) * {{real RT.SP_TICK}}
    if not EmpAlive(u) then
        // a new leech comes out of a host that died, not of one removed from the game (an MCV that
        // deployed: its place is gone)
        if GetUnitTypeId(u) != 0 then
            call CreateUnit(Player(LoadInteger(EmpSpTab, h, 31) - 1), LoadInteger(EmpSpTab, h, 32), GetUnitX(u), GetUnitY(u), {{FACING}})
        endif
        call GroupRemoveUnit(EmpSpLeeched, u)
        call RemoveSavedInteger(EmpSpTab, h, 31)
    elseif GetWidgetLife(u) <= dmg then
        call KillUnit(u)
    else
        call SetWidgetLife(u, GetWidgetLife(u) - dmg)
    endif
    set u = null
endfunction

// enemy building that u stands at (within RT.SP_TOUCH of its edge), the first one; null if none
function EmpSpBuildingAt takes unit u, boolean needEngineerable returns unit
    local group g = CreateGroup()
    local unit b
    local unit found = null
    call GroupEnumUnitsInRange(g, GetUnitX(u), GetUnitY(u), {{real RT.SP_REACH}}, null)
    loop
        set b = FirstOfGroup(g)
        exitwhen b == null or found != null
        call GroupRemoveUnit(g, b)
        if EmpAlive(b) and IsUnitType(b, UNIT_TYPE_STRUCTURE) and IsUnitEnemy(b, GetOwningPlayer(u)) and IsUnitInRange(u, b, {{real RT.SP_TOUCH}}) and not LoadBoolean(EmpPowerTab, GetHandleId(b), 2) and ((needEngineerable and LoadBoolean(EmpSpTab, EmpType(b), 8)) or (not needEngineerable and not LoadBoolean(EmpSpTab, EmpType(b), 12))) then
            set found = b
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return found
endfunction

// repair vehicle: the most damaged vehicle of its side within range regains health
function EmpSpRepair takes unit r, real heal, real range returns nothing
    local group g = CreateGroup()
    local unit v
    local unit best = null
    local real worst = 1.0
    local real f
    call GroupEnumUnitsInRange(g, GetUnitX(r), GetUnitY(r), range, null)
    loop
        set v = FirstOfGroup(g)
        exitwhen v == null
        call GroupRemoveUnit(g, v)
        if v != r and EmpAlive(v) and GetOwningPlayer(v) == GetOwningPlayer(r) and not IsUnitType(v, UNIT_TYPE_STRUCTURE) and not LoadBoolean(EmpSpTab, EmpType(v), 11) and not LoadBoolean(EmpSpTab, EmpType(v), 13) then
            set f = GetWidgetLife(v) / GetUnitState(v, UNIT_STATE_MAX_LIFE)
            if f < worst then
                set worst = f
                set best = v
            endif
        endif
    endloop
    if best != null then
        call SetWidgetLife(best, RMinBJ(GetUnitState(best, UNIT_STATE_MAX_LIFE), GetWidgetLife(best) + heal))
    endif
    call DestroyGroup(g)
    set g = null
    set best = null
endfunction

// one unit of the scan: engineers take buildings over, saboteurs blow them up, repair vehicles
// mend, crushers are listed for EmpSpCrushTick
function EmpSpTickEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    local integer t = EmpType(u)
    local integer k = LoadInteger(EmpSpTab, t, 0)
    local unit b
    set EmpSpScanned = EmpSpScanned + 1
    if not EmpAlive(u) then
        set u = null
        return
    endif
    if k == 4 then
        set b = EmpSpBuildingAt(u, true)
        if b != null then
            if GetOwningPlayer(b) == Player(0) then
                call EmpUiSay({{UI.bldgStolen}})
            elseif GetOwningPlayer(u) == Player(0) then
                call EmpUiSay({{UI.bldgCaptured}})
            endif
            call SetUnitOwner(b, GetOwningPlayer(u), true)
            call RemoveUnit(u)
        endif
    elseif k == 5 then
        set b = EmpSpBuildingAt(u, false)
        if b != null and HaveSavedInteger(EmpBoomTab, t, 0) then
            // an Infiltrator: its own bomb, its delay and its reveal pulse (detonate.j)
            call EmpBoom(u)
        elseif b != null then
            call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.bomb.id}}', {{ART_ABILITY.bomb.type}}, 0), GetUnitX(b), GetUnitY(b)))
            call EmpSwDamage(GetOwningPlayer(u), GetUnitX(b), GetUnitY(b), LoadReal(EmpSpTab, t, 4), LoadReal(EmpSpTab, t, 3), true, 0, 0)
            call KillUnit(u)
        endif
    elseif k == 6 then
        call EmpSpRepair(u, LoadReal(EmpSpTab, t, 1) * {{real RT.SP_TICK}}, LoadReal(EmpSpTab, t, 2))
    endif
    if LoadBoolean(EmpSpTab, t, 9) and EmpAlive(u) then
        call GroupAddUnit(EmpSpCrushers, u)
    endif
    set u = null
    set b = null
endfunction

// The scan walks the group with ForGroup, which also passes members removed meanwhile (a FirstOfGroup
// loop ends at the first one).
function EmpSpTick takes nothing returns nothing
    local group g = CreateGroup()
    // counted in and out for unattended checks (debug-report.j)
    set EmpSpTicks = EmpSpTicks + 1
    call ForGroup(EmpSpLeeched, function EmpSpLeechEnum)
    call GroupEnumUnitsInRect(g, bj_mapInitialPlayableArea, null)
    set EmpSpScanned = 0
    call ForGroup(g, function EmpSpTickEnum)
    call DestroyGroup(g)
    set g = null
    set EmpSpTicksDone = EmpSpTicksDone + 1
endfunction

// infantry the crusher EmpSpCrusher touches (EmpSpCrushNear)
function EmpSpCrushVictim takes nothing returns nothing
    local unit v = GetEnumUnit()
    if EmpAlive(v) and LoadBoolean(EmpSpTab, EmpType(v), 10) and IsUnitEnemy(v, GetOwningPlayer(EmpSpCrusher)) and IsUnitInRange(EmpSpCrusher, v, {{real RT.SP_CRUSH}}) then
        call KillUnit(v)
    endif
    set v = null
endfunction

function EmpSpCrushEnum takes nothing returns nothing
    local unit u = GetEnumUnit()
    if not EmpAlive(u) then
        call GroupRemoveUnit(EmpSpCrushers, u)
        // handle ids are reused: a stale position would make a new unit "moved" at its first check
        call RemoveSavedReal(EmpSpTab, GetHandleId(u), 33)
        call RemoveSavedReal(EmpSpTab, GetHandleId(u), 34)
    elseif not HaveSavedReal(EmpSpTab, GetHandleId(u), 33) or RAbsBJ(GetUnitX(u) - LoadReal(EmpSpTab, GetHandleId(u), 33)) + RAbsBJ(GetUnitY(u) - LoadReal(EmpSpTab, GetHandleId(u), 34)) < 1.0 then
        // standing (or seen for the first time): it runs nobody over, even with an order (attacking
        // from where it is); the position is compared with the one at the last check
        call SaveReal(EmpSpTab, GetHandleId(u), 33, GetUnitX(u))
        call SaveReal(EmpSpTab, GetHandleId(u), 34, GetUnitY(u))
    else
        call SaveReal(EmpSpTab, GetHandleId(u), 33, GetUnitX(u))
        call SaveReal(EmpSpTab, GetHandleId(u), 34, GetUnitY(u))
        set EmpSpCrusher = u
        call GroupClear(EmpSpCrushNear)
        call GroupEnumUnitsInRange(EmpSpCrushNear, GetUnitX(u), GetUnitY(u), {{real RT.SP_REACH}}, null)
        call ForGroup(EmpSpCrushNear, function EmpSpCrushVictim)
    endif
    set u = null
endfunction

// a moving crusher runs over enemy infantry it touches (Crushes / Crushable); ForGroup, since the
// list keeps crushers that were removed
function EmpSpCrushTick takes nothing returns nothing
    call ForGroup(EmpSpCrushers, function EmpSpCrushEnum)
endfunction

function EmpSpInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpSpData()
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_DAMAGED, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpSpDamaged)
    call TimerStart(CreateTimer(), {{real RT.SP_TICK}}, true, function EmpSpTick)
    call TimerStart(CreateTimer(), {{real RT.SP_CRUSH_TICK}}, true, function EmpSpCrushTick)
    set tr = null
endfunction
