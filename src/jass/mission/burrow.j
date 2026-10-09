// ---- the dust scout burrows (Rules.txt DustScout: ORDustScout; Game.exe 1.09 class 0xc, 0x568d10) ----
// Idle on its SpecialGround (DustBowl) it burrows by itself (states 4 / 5 -> 0x22 -> 0x23): burrowed
// it is hidden from every other player (0x55e3c8), does not fire or move; an order other than a stop
// brings it up first, and so does a target within [General] GuardTileRange of it (0x554040, aircraft
// too if a weapon is AntiAircraft): it surfaces and attacks. Its deploy command is refused (no button).
// EmpBurrowTab[type]: 0 = burrows; [unit]: 1 = burrowed.
// TODO(units): the burrow / surface animations (0x27 / 0) take their time in Game.exe, here it is at
// once; detectors (UnstealthRange) see a burrowed scout here (WC3 invisibility), in Game.exe nothing
// does. Risk: a scout pops up quicker and can be found by a turret.
// Feature test: test/emperor-mission.test.ts "dust scout".
function EmpBurrowData takes nothing returns nothing
    set EmpBurrowTab = InitHashtable()
{{burrowLines}}
endfunction

function EmpBurrowSet takes unit u, boolean down returns nothing
    call SaveBoolean(EmpBurrowTab, GetHandleId(u), 1, down)
    call BlzUnitDisableAbility(u, 'Aatk', down, false)
    if down then
        call UnitAddAbility(u, '{{ABILITY.invisibility}}')
    else
        call UnitRemoveAbility(u, '{{ABILITY.invisibility}}')
    endif
endfunction

// an enemy it could hit within GuardTileRange (aircraft only with an AntiAircraft weapon)
function EmpBurrowTarget takes unit u returns unit
    local group g = CreateGroup()
    local unit e
    local unit found = null
    call GroupEnumUnitsInRange(g, GetUnitX(u), GetUnitY(u), {{real burrowGuard}}, null)
    loop
        set e = FirstOfGroup(g)
        exitwhen e == null or found != null
        call GroupRemoveUnit(g, e)
        if EmpAlive(e) and IsUnitEnemy(e, GetOwningPlayer(u)) and IsUnitVisible(e, GetOwningPlayer(u)) and (not IsUnitType(e, UNIT_TYPE_FLYING) or LoadBoolean(EmpBurrowTab, EmpType(u), 2)) then
            set found = e
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set e = null
    return found
endfunction

function EmpBurrowTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local unit e
    call GroupEnumUnitsInRect(g, bj_mapInitialPlayableArea, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and LoadBoolean(EmpBurrowTab, EmpType(u), 0) then
            if LoadBoolean(EmpBurrowTab, GetHandleId(u), 1) then
                if GetUnitCurrentOrder(u) != 0 and GetUnitCurrentOrder(u) != OrderId("stop") and GetUnitCurrentOrder(u) != OrderId("holdposition") then
                    call EmpBurrowSet(u, false)
                else
                    set e = EmpBurrowTarget(u)
                    if e != null then
                        call EmpBurrowSet(u, false)
                        call IssueTargetOrder(u, "attack", e)
                    endif
                endif
            elseif GetUnitCurrentOrder(u) == 0 and GetTerrainType(GetUnitX(u), GetUnitY(u)) == '{{dustTile}}' then
                call EmpBurrowSet(u, true)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set e = null
endfunction

function EmpBurrowInit takes nothing returns nothing
    call EmpBurrowData()
    call TimerStart(CreateTimer(), {{real RT.BURROW_TICK}}, true, function EmpBurrowTick)
endfunction
