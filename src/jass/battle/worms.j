// ---- sandworms (territory battles; Rules.txt [General] worm keys) ----
// A surface worm surfaces near a random unit on sand and hunts units on sand within the
// attraction radius until its life ends or its health drops to the disappear threshold; a vertical
// worm strikes a random unit on sand from below (EF_ForceWormStrike). Chances are per tick, so
// perCheck = ticks per check.
// TODO(worms): only one surface worm at a time (Rules.txt MaximumSurfaceWorms = 1, so exact for
// the shipped data); the worm may cross rock (WC3 pathing does not separate sand from rock for it).
function EmpOnSand takes real x, real y returns boolean
    local integer t = GetTerrainType(x, y)
    return {{isSand}}
endfunction

function EmpSandTarget takes unit u returns boolean
    // SideRepelsWorms: that side's units are left alone
    return u != null and EmpAlive(u) and u != EmpWorm and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and not IsUnitType(u, UNIT_TYPE_FLYING) and GetPlayerId(GetOwningPlayer(u)) <= {{MAX_SIDE}} and not EmpWormRepel[GetPlayerId(GetOwningPlayer(u))] and EmpOnSand(GetUnitX(u), GetUnitY(u))
endfunction

// a random unit standing on sand (reservoir sampling over all sides), or null; units of the sides
// that attract worms (SideAttractsWorms) are picked first when any of them is on sand
function EmpSandVictim takes nothing returns unit
    local group g = CreateGroup()
    local unit u
    local unit pick = null
    local unit lure = null
    local integer n = 0
    local integer nl = 0
    local integer i = 0
    loop
        exitwhen i > {{MAX_SIDE}}
        call GroupEnumUnitsOfPlayer(g, Player(i), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if EmpSandTarget(u) then
                set n = n + 1
                if GetRandomInt(1, n) == 1 then
                    set pick = u
                endif
                if EmpWormAttract[i] then
                    set nl = nl + 1
                    if GetRandomInt(1, nl) == 1 then
                        set lure = u
                    endif
                endif
            endif
        endloop
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
    if lure != null then
        set pick = lure
    endif
    set lure = null
    return pick
endfunction

function EmpNearestSandUnit takes real x, real y, real r returns unit
    local group g = CreateGroup()
    local unit u
    local unit best = null
    local real bd = r * r
    local real d
    call GroupEnumUnitsInRange(g, x, y, r, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpSandTarget(u) then
            set d = (GetUnitX(u) - x) * (GetUnitX(u) - x) + (GetUnitY(u) - y) * (GetUnitY(u) - y)
            if d <= bd then
                set bd = d
                set best = u
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return best
endfunction

function EmpWormTick takes nothing returns nothing
    local unit v
    local location l
    local real a
    local real x
    local real y
    if EmpTick < {{w.minTick}} then
        return
    endif
    if EmpWorm != null and (not EmpAlive(EmpWorm) or EmpTick >= EmpWormEnd or GetUnitLifePercent(EmpWorm) <= {{real w.disappearHealth}}) then
        call RemoveUnit(EmpWorm)
        set EmpWorm = null
    endif
    if EmpWorm == null and GetRandomInt(1, {{w.surfaceChance}}) <= {{perCheck}} then
        set v = EmpSandVictim()
        if v != null then
            set a = GetRandomReal(0.0, 6.2832)
            set x = GetUnitX(v) + EmpTiles({{C.WORM_SURFACE_OFFSET_TILES}}) * Cos(a)
            set y = GetUnitY(v) + EmpTiles({{C.WORM_SURFACE_OFFSET_TILES}}) * Sin(a)
            if EmpOnSand(x, y) then
                set EmpWorm = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), '{{wormId}}', x, y, {{FACING}})
                set EmpWormEnd = EmpTick + GetRandomInt({{w.minLife}}, {{w.maxLife}})
            endif
        endif
    endif
    if EmpWorm != null then
        set v = EmpNearestSandUnit(GetUnitX(EmpWorm), GetUnitY(EmpWorm), EmpTiles({{w.attractionRadius}}))
        if v != null then
            call IssueTargetOrder(EmpWorm, "attack", v)
        endif
    endif
    if GetRandomInt(1, {{w.verticalChance}}) <= {{perCheck}} then
        set v = EmpSandVictim()
        if v != null then
            set l = GetUnitLoc(v)
            call EF_ForceWormStrike(l)
            call RemoveLocation(l)
            set l = null
        endif
    endif
    set v = null
endfunction
