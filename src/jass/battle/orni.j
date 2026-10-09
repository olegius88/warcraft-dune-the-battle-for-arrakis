// ---- ornithopters: rounds and rearming (Rules.txt Ornithoptor: ATOrni, HKGunship; Game.exe 1.09 class 5)
// A turret holds TurretBulletCount rounds (0x550994 full at the start, 0x551980 one a shot); empty, the
// craft goes back to a helipad (state 0xa, 0x57009c): the nearest own one with nobody on it, or one
// with a fully armed craft when it needs rounds (that one is sent off; 0x442520, 0x444160); one craft a
// pad. On the pad it gains a round every [General] RearmRate ticks (0x442f21) and stays there until it
// is given an order. Without a pad it hovers, unarmed. The AI sends a craft to rearm as soon as it is
// short of rounds and back to its group once full (0x469820). EmpOrniTab[type]: 0 rounds when full,
// 1 a helipad type; [craft]: 2 rounds left, 3 its pad, 4 state (0 free, 1 to its pad, 2 on it);
// [pad]: 5 the craft on it. WC3 units here have one weapon: one turret's rounds.
// TODO(units): a shot is counted by EVENT_PLAYER_UNIT_ATTACKED of the target's owner, registered for
// every player slot; one at a neutral of no slot listed would not count. Risk: none on the maps here.
// Feature test: test/emperor-mission.test.ts "ornithopters".
function EmpOrniType takes integer t, integer rounds returns nothing
    call SaveInteger(EmpOrniTab, t, 0, rounds)
endfunction

function EmpOrniData takes nothing returns nothing
    set EmpOrniTab = InitHashtable()
    set EmpOrniAll = CreateGroup()
{{orniLines}}
endfunction

function EmpOrniMax takes unit u returns integer
    return LoadInteger(EmpOrniTab, EmpType(u), 0)
endfunction

function EmpOrniRounds takes unit u returns integer
    if not HaveSavedInteger(EmpOrniTab, GetHandleId(u), 2) then
        return EmpOrniMax(u)
    endif
    return LoadInteger(EmpOrniTab, GetHandleId(u), 2)
endfunction

function EmpOrniArm takes unit u, boolean on returns nothing
    call BlzUnitDisableAbility(u, 'Aatk', not on, false)
endfunction

function EmpOrniLeavePad takes unit u returns nothing
    local unit p = LoadUnitHandle(EmpOrniTab, GetHandleId(u), 3)
    if p != null and LoadUnitHandle(EmpOrniTab, GetHandleId(p), 5) == u then
        call RemoveSavedHandle(EmpOrniTab, GetHandleId(p), 5)
    endif
    call RemoveSavedHandle(EmpOrniTab, GetHandleId(u), 3)
    call SaveInteger(EmpOrniTab, GetHandleId(u), 4, 0)
    call EmpOrniArm(u, EmpOrniRounds(u) > 0)
    set p = null
endfunction

// to the nearest own helipad free for it; false without one
function EmpOrniGoRearm takes unit u returns boolean
    local group g = CreateGroup()
    local unit p
    local unit best = null
    local unit on
    local real bd = 1000000000.0
    local real d
    call GroupEnumUnitsOfPlayer(g, GetOwningPlayer(u), null)
    loop
        set p = FirstOfGroup(g)
        exitwhen p == null
        call GroupRemoveUnit(g, p)
        if EmpAlive(p) and LoadBoolean(EmpOrniTab, EmpType(p), 1) then
            set on = LoadUnitHandle(EmpOrniTab, GetHandleId(p), 5)
            if on == null or on == u or not EmpAlive(on) or EmpOrniRounds(on) >= EmpOrniMax(on) then
                set d = (GetUnitX(p) - GetUnitX(u)) * (GetUnitX(p) - GetUnitX(u)) + (GetUnitY(p) - GetUnitY(u)) * (GetUnitY(p) - GetUnitY(u))
                if d < bd then
                    set bd = d
                    set best = p
                endif
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if best == null then
        return false
    endif
    // a fully armed craft on it is sent off (0x442520)
    set on = LoadUnitHandle(EmpOrniTab, GetHandleId(best), 5)
    if on != null and on != u and EmpAlive(on) then
        call EmpOrniLeavePad(on)
        call IssuePointOrder(on, "move", GetUnitX(best) + {{real C.ORNI.evict}}, GetUnitY(best) + {{real C.ORNI.evict}})
    endif
    call SaveUnitHandle(EmpOrniTab, GetHandleId(best), 5, u)
    call SaveUnitHandle(EmpOrniTab, GetHandleId(u), 3, best)
    call SaveInteger(EmpOrniTab, GetHandleId(u), 4, 1)
    call EmpOrniArm(u, false)
    call IssuePointOrder(u, "move", GetUnitX(best), GetUnitY(best))
    set best = null
    set on = null
    set p = null
    return true
endfunction

// a shot: a round less; the last one sends the craft home
function EmpOrniShot takes nothing returns nothing
    local unit u = GetAttacker()
    local integer n
    if u == null or not HaveSavedInteger(EmpOrniTab, EmpType(u), 0) then
        set u = null
        return
    endif
    set n = IMaxBJ(0, EmpOrniRounds(u) - 1)
    call SaveInteger(EmpOrniTab, GetHandleId(u), 2, n)
    call GroupAddUnit(EmpOrniAll, u)
    // empty: unarmed; EmpOrniTick sends it to a pad (an order given inside the attack event did not
    // move it, probe --orni 2026-10-09)
    if n == 0 then
        call EmpOrniArm(u, false)
    endif
    set u = null
endfunction

// landing, leaving a pad on an order, the AI's rearming, looking for a pad when there was none
function EmpOrniTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local unit p
    local integer h
    local integer s
    call GroupAddGroup(EmpOrniAll, g)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set h = GetHandleId(u)
        if not EmpAlive(u) then
            call EmpOrniLeavePad(u)
            call GroupRemoveUnit(EmpOrniAll, u)
            call FlushChildHashtable(EmpOrniTab, h)
        else
            set s = LoadInteger(EmpOrniTab, h, 4)
            set p = LoadUnitHandle(EmpOrniTab, h, 3)
            if s > 0 and not EmpAlive(p) then
                call EmpOrniLeavePad(u)
                set s = 0
            endif
            if s == 1 then
                if IsUnitInRange(u, p, {{real C.ORNI.land}}) then
                    // landed: its move order ends here, a later order is a new one
                    call SaveInteger(EmpOrniTab, h, 4, 2)
                    call IssueImmediateOrder(u, "stop")
                elseif GetUnitCurrentOrder(u) == 0 then
                    call IssuePointOrder(u, "move", GetUnitX(p), GetUnitY(p))
                endif
            elseif s == 2 then
                if GetUnitCurrentOrder(u) != 0 then
                    // given an order: off the pad
                    call EmpOrniLeavePad(u)
                elseif GetPlayerController(GetOwningPlayer(u)) == MAP_CONTROL_COMPUTER and EmpOrniRounds(u) >= EmpOrniMax(u) then
                    // the AI's craft goes back to its group once full (0x469784)
                    call EmpOrniLeavePad(u)
                endif
            elseif EmpOrniRounds(u) == 0 or (GetPlayerController(GetOwningPlayer(u)) == MAP_CONTROL_COMPUTER and EmpOrniRounds(u) < EmpOrniMax(u)) then
                call EmpOrniGoRearm(u)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set p = null
endfunction

// every RearmRate ticks a round to each craft on a pad
function EmpOrniRearmTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    call GroupAddGroup(EmpOrniAll, g)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and LoadInteger(EmpOrniTab, GetHandleId(u), 4) == 2 and EmpOrniRounds(u) < EmpOrniMax(u) then
            call SaveInteger(EmpOrniTab, GetHandleId(u), 2, EmpOrniRounds(u) + 1)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpOrniInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpOrniData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ATTACKED, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOrniShot)
    call TimerStart(CreateTimer(), {{real C.ORNI.tick}}, true, function EmpOrniTick)
    call TimerStart(CreateTimer(), {{real rearmSeconds}}, true, function EmpOrniRearmTick)
    set tr = null
endfunction
