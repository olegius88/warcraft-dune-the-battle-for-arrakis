// ---- the enemy AI's map of tiles and its defence plan (Game.exe 1.09 AiMap; config AI_MAP, AI_PLAN;
// src/emperor/ai-map.ts) ----
// A byte per Emperor tile in EmpAiMapTab (parent 0, key y * EmpAiMapW + x; unsaved: class 2): class
// (bits 0-1), road 0x4, reserved 0x8, ramp top 0x20, static rock 0x40. Directions: 0 -y, 1 +x, 2 +y,
// 3 -x, y down. A building's cells (EmpAiOcc): parent its type, child 0 / 1 the body / reserved count,
// 100 + 2i / 101 + 2i a body cell, 1000 + 2i / 1001 + 2i a reserved one. A plan: parent -1 - cluster,
// child 0 its count, 1 + 4j x, 2 + 4j y, 3 + 4j done, 4 + 4j type (list order: the traced points
// last first, Game.exe pushes them to the front, 0x42933a).

function EmpAiMapGet takes integer x, integer y returns integer
    if x < 0 or y < 0 or x >= EmpAiMapW or y >= EmpAiMapH then
        return -1
    endif
    if HaveSavedInteger(EmpAiMapTab, 0, y * EmpAiMapW + x) then
        return LoadInteger(EmpAiMapTab, 0, y * EmpAiMapW + x)
    endif
    return {{M.blocked}}
endfunction

function EmpAiMapSet takes integer x, integer y, integer v returns nothing
    if x >= 0 and y >= 0 and x < EmpAiMapW and y < EmpAiMapH then
        call SaveInteger(EmpAiMapTab, 0, y * EmpAiMapW + x, v)
    endif
endfunction

// the static layer (src/emperor/ai-map.ts aiMapRuns): rock tiles x0..x1 of row y
function EmpAiMapRun takes integer y, integer x0, integer x1, integer v returns nothing
    loop
        exitwhen x0 > x1
        call SaveInteger(EmpAiMapTab, 0, y * EmpAiMapW + x0, v)
        set x0 = x0 + 1
    endloop
endfunction

// a cell of type t (src/emperor/ai-map.ts occupyCells): the body (class 1) or reserved (0x8)
function EmpAiOcc takes integer t, integer dx, integer dy, boolean body returns nothing
    local integer k = 1
    local integer base = 1000
    if body then
        set k = 0
        set base = 100
    endif
    call SaveInteger(EmpAiMapTab, t, base + 2 * LoadInteger(EmpAiMapTab, t, k), dx)
    call SaveInteger(EmpAiMapTab, t, base + 2 * LoadInteger(EmpAiMapTab, t, k) + 1, dy)
    call SaveInteger(EmpAiMapTab, t, k, LoadInteger(EmpAiMapTab, t, k) + 1)
endfunction

// class of a tile, -1 off the map
function EmpAiMapClass takes integer x, integer y returns integer
    local integer v = EmpAiMapGet(x, y)
    if v < 0 then
        return -1
    endif
    return BlzBitAnd(v, {{M.classMask}})
endfunction

function EmpAiMapBit takes integer x, integer y, integer b returns boolean
    local integer v = EmpAiMapGet(x, y)
    return v >= 0 and BlzBitAnd(v, b) != 0
endfunction

// bits b on a tile; `free` keeps them off class 2 (0x8 never lands there in Game.exe)
function EmpAiMapOr takes integer x, integer y, integer b, boolean free returns nothing
    local integer v = EmpAiMapGet(x, y)
    if v < 0 or (free and BlzBitAnd(v, {{M.classMask}}) == {{M.blocked}}) then
        return
    endif
    call EmpAiMapSet(x, y, BlzBitOr(v, b))
endfunction

// a road tile (0x4343f0): 0x4, and 0x8 unless class 2
function EmpAiMapRoad takes integer x, integer y returns nothing
    call EmpAiMapOr(x, y, {{M.road}}, false)
    call EmpAiMapOr(x, y, {{M.reserved}}, true)
endfunction

// world <-> tile (src/emperor/terrain.ts toWorld; floor below 0 too)
function EmpAiTileX takes real x returns integer
    return R2I(x / {{real WC3_UNITS_PER_TILE}} - EmpAiMapAx + 10000.0) - 10000
endfunction

function EmpAiTileY takes real y returns integer
    return R2I(EmpAiMapAy - y / {{real WC3_UNITS_PER_TILE}} + 10000.0) - 10000
endfunction

function EmpAiTileWX takes integer x returns real
    return (EmpAiMapAx + x + 0.5) * {{real WC3_UNITS_PER_TILE}}
endfunction

function EmpAiTileWY takes integer y returns real
    return (EmpAiMapAy - y - 0.5) * {{real WC3_UNITS_PER_TILE}}
endfunction

function EmpAiDx takes integer d returns integer
    if d == 1 then
        return 1
    elseif d == 3 then
        return -1
    endif
    return 0
endfunction

function EmpAiDy takes integer d returns integer
    if d == 2 then
        return 1
    elseif d == 0 then
        return -1
    endif
    return 0
endfunction

// the three road strips before side f of the box EmpAiBb* (DrawApron 0x435690)
function EmpAiApron takes integer f returns nothing
    local integer k = 1
    local integer i
    loop
        exitwhen k > {{M.apron}}
        if f == 0 or f == 2 then
            set i = EmpAiBbX0
            loop
                exitwhen i > EmpAiBbX1
                if f == 0 then
                    call EmpAiMapRoad(i, EmpAiBbY0 - k)
                else
                    call EmpAiMapRoad(i, EmpAiBbY1 + k)
                endif
                set i = i + 1
            endloop
        else
            set i = EmpAiBbY0
            loop
                exitwhen i > EmpAiBbY1
                if f == 1 then
                    call EmpAiMapRoad(EmpAiBbX1 + k, i)
                else
                    call EmpAiMapRoad(EmpAiBbX0 - k, i)
                endif
                set i = i + 1
            endloop
        endif
        set k = k + 1
    endloop
endfunction

// strip k (0..2) of a road leaving the apron of side f towards d: its start in EmpAiRsX / EmpAiRsY.
// TODO(ai): Game.exe's table of the strips' starts (0x435780, 0x435990..0x4359c0) is not decoded; taken
// as the apron's three rows / middle columns at its edge on side d. Risk: links start one tile off.
function EmpAiRoadStart takes integer f, integer d, integer k returns nothing
    local integer mx = (EmpAiBbX0 + EmpAiBbX1) / 2
    local integer my = (EmpAiBbY0 + EmpAiBbY1) / 2
    if d == f then
        if f == 0 or f == 2 then
            set EmpAiRsX = mx - 1 + k
            set EmpAiRsY = EmpAiBbY1 + {{M.apron}}
            if f == 0 then
                set EmpAiRsY = EmpAiBbY0 - {{M.apron}}
            endif
        else
            set EmpAiRsY = my - 1 + k
            set EmpAiRsX = EmpAiBbX1 + {{M.apron}}
            if f == 3 then
                set EmpAiRsX = EmpAiBbX0 - {{M.apron}}
            endif
        endif
    elseif f == 0 or f == 2 then
        // the apron's rows, from its end on side d
        set EmpAiRsY = EmpAiBbY1 + 1 + k
        if f == 0 then
            set EmpAiRsY = EmpAiBbY0 - 1 - k
        endif
        set EmpAiRsX = EmpAiBbX1
        if d == 3 then
            set EmpAiRsX = EmpAiBbX0
        endif
    else
        set EmpAiRsX = EmpAiBbX1 + 1 + k
        if f == 3 then
            set EmpAiRsX = EmpAiBbX0 - 1 - k
        endif
        set EmpAiRsY = EmpAiBbY1
        if d == 0 then
            set EmpAiRsY = EmpAiBbY0
        endif
    endif
endfunction

// a ray from (x, y) towards d to the first road tile (0x434fa0): its length, -1 at class 1 / 2 or the edge
function EmpAiRoadRay takes integer x, integer y, integer d returns integer
    local integer n = 0
    local integer c
    loop
        set x = x + EmpAiDx(d)
        set y = y + EmpAiDy(d)
        set n = n + 1
        set c = EmpAiMapClass(x, y)
        if c < 0 or c == {{M.body}} or c == {{M.blocked}} then
            return -1
        endif
        if EmpAiMapBit(x, y, {{M.road}}) then
            return n
        endif
    endloop
    return -1
endfunction

// FindRoadLink (0x435150) and DrawLink (0x435290): every direction but back whose three strips all
// reach a road; Game.exe keeps the last fitting one (0x435240), with the last strip's length
function EmpAiRoadLink takes integer f returns nothing
    local integer d = 0
    local integer k
    local integer n
    local integer best = -1
    local integer len = 0
    local boolean ok
    loop
        exitwhen d > 3
        if d != ModuloInteger(f + 2, 4) then
            set ok = true
            set k = 0
            loop
                exitwhen k > 2 or not ok
                call EmpAiRoadStart(f, d, k)
                set n = EmpAiRoadRay(EmpAiRsX, EmpAiRsY, d)
                set ok = n > 0
                set k = k + 1
            endloop
            if ok then
                set best = d
                set len = n
            endif
        endif
        set d = d + 1
    endloop
    if best < 0 then
        call EmpAiLog("map: no road link")
        return
    endif
    set k = 0
    loop
        exitwhen k > 2
        call EmpAiRoadStart(f, best, k)
        set n = 1
        loop
            exitwhen n > len
            call EmpAiMapRoad(EmpAiRsX + n * EmpAiDx(best), EmpAiRsY + n * EmpAiDy(best))
            set n = n + 1
        endloop
        set k = k + 1
    endloop
endfunction

// MarkBuilding (0x434030): the body class 1, the n / s cells reserved; with `add` an exit gets its road
// link and apron; a building that is no defence and no wall reserves its box +- AI_MAP.reserve.
// The box of its body is left in EmpAiBb*.
function EmpAiMapMark takes unit u, boolean add returns nothing
    local integer t = EmpType(u)
    local integer cx = EmpAiTileX(GetUnitX(u))
    local integer cy = EmpAiTileY(GetUnitY(u))
    local integer n = LoadInteger(EmpAiMapTab, t, 0)
    local integer i = 0
    local integer x
    local integer y
    local integer v
    set EmpAiBbX0 = cx
    set EmpAiBbY0 = cy
    set EmpAiBbX1 = cx
    set EmpAiBbY1 = cy
    loop
        exitwhen i >= n
        set x = cx + LoadInteger(EmpAiMapTab, t, 100 + 2 * i)
        set y = cy + LoadInteger(EmpAiMapTab, t, 101 + 2 * i)
        set v = EmpAiMapGet(x, y)
        if v >= 0 then
            call EmpAiMapSet(x, y, BlzBitAnd(v, 252) + {{M.body}})
        endif
        set EmpAiBbX0 = IMinBJ(EmpAiBbX0, x)
        set EmpAiBbY0 = IMinBJ(EmpAiBbY0, y)
        set EmpAiBbX1 = IMaxBJ(EmpAiBbX1, x)
        set EmpAiBbY1 = IMaxBJ(EmpAiBbY1, y)
        set i = i + 1
    endloop
    set n = LoadInteger(EmpAiMapTab, t, 1)
    set i = 0
    loop
        exitwhen i >= n
        call EmpAiMapOr(cx + LoadInteger(EmpAiMapTab, t, 1000 + 2 * i), cy + LoadInteger(EmpAiMapTab, t, 1001 + 2 * i), {{M.reserved}}, true)
        set i = i + 1
    endloop
    if add and LoadBoolean(EmpAiTab, t, 2) then
        call EmpAiRoadLink({{P.facing}})
        call EmpAiApron({{P.facing}})
    endif
    if not LoadBoolean(EmpAiTab, t, 1) and t != EmpAiWall[EmpEnemyHouse] then
        set y = EmpAiBbY0 - {{M.reserve}}
        loop
            exitwhen y > EmpAiBbY1 + {{M.reserve}}
            set x = EmpAiBbX0 - {{M.reserve}}
            loop
                exitwhen x > EmpAiBbX1 + {{M.reserve}}
                call EmpAiMapOr(x, y, {{M.reserved}}, true)
                set x = x + 1
            endloop
            set y = y + 1
        endloop
    endif
endfunction

// three tiles (x, y .. y + 2) on the map and not class 2 (Probe 0x436b70)
function EmpAiProbeOk takes integer x, integer y returns boolean
    local integer k = 0
    local integer c
    loop
        exitwhen k > 2
        set c = EmpAiMapClass(x, y + k)
        if c < 0 or c == {{M.blocked}} then
            return false
        endif
        set k = k + 1
    endloop
    return true
endfunction

// a road three wide from (x, y) n tiles towards d
function EmpAiRoadStrip takes integer x, integer y, integer d, integer n returns nothing
    local integer i = 0
    local integer k
    loop
        exitwhen i > n
        set k = 0
        loop
            exitwhen k > 2
            if d == 0 or d == 2 then
                call EmpAiMapRoad(x + k, y + i * EmpAiDy(d))
            else
                call EmpAiMapRoad(x + i * EmpAiDx(d), y + k)
            endif
            set k = k + 1
        endloop
        set i = i + 1
    endloop
endfunction

// Probe (0x436b70): from P = (px, py), which must be road three tiles down, straight on towards d and,
// past AI_MAP.probeTurn steps, turning to a strip that reaches a ramp top (0x4373c0); the direction
// found, -1 none. Directions ex1 / ex2 are left out.
// TODO(ai): Game.exe's drawing of the two segments (0x436d18..0x436f27) is read only in part.
function EmpAiProbe takes integer px, integer py, integer ex1, integer ex2 returns integer
    local integer d = 0
    local integer s
    local integer e
    local integer d2
    local integer x
    local integer y
    local integer c
    local boolean go
    if not (EmpAiMapBit(px, py, {{M.road}}) and EmpAiMapBit(px, py + 1, {{M.road}}) and EmpAiMapBit(px, py + 2, {{M.road}})) then
        call EmpAiLog("map: no road in default position")
        return -1
    endif
    loop
        exitwhen d > 3
        if d != ex1 and d != ex2 then
            set s = 0
            set go = true
            loop
                exitwhen not go
                set s = s + 1
                set x = px + s * EmpAiDx(d)
                set y = py + s * EmpAiDy(d)
                set go = EmpAiProbeOk(x, y)
                if go and s > {{M.probeTurn}} then
                    set d2 = ModuloInteger(d + 1, 4)
                    loop
                        exitwhen d2 == -1
                        set e = 0
                        loop
                            set e = e + 1
                            set c = EmpAiMapClass(x + e * EmpAiDx(d2), y + e * EmpAiDy(d2))
                            exitwhen c < 0 or c == {{M.blocked}} or EmpAiMapBit(x + e * EmpAiDx(d2), y + e * EmpAiDy(d2), {{M.rampTop}})
                        endloop
                        if c >= 0 and c != {{M.blocked}} then
                            call EmpAiRoadStrip(px, py, d, s)
                            call EmpAiRoadStrip(x, y, d2, e)
                            call EmpAiLog("map: road to a ramp, directions " + I2S(d) + " " + I2S(d2))
                            return d
                        endif
                        if d2 == ModuloInteger(d + 1, 4) then
                            set d2 = ModuloInteger(d + 3, 4)
                        else
                            set d2 = -1
                        endif
                    endloop
                endif
            endloop
        endif
        set d = d + 1
    endloop
    return -1
endfunction

// ConnectRoadsToRamp (0x4345f0), for the building that founded a cluster (its box EmpAiBb*): roads
// AI_MAP.rampRoad tiles each way along both sides f and f - 1; when none meets a ramp top, the corner
// opposite the exits probes for a road to one, up to three; with none the AI builds no walls
// (AiBuildsDefences 0, 0x434ab3: "Cannot connect roads to ramp", "So disabling wall building")
function EmpAiRoadsToRamp takes integer f returns nothing
    local integer o = ModuloInteger(f + 2, 4)
    local integer d = f
    local integer k
    local integer i
    local integer s
    local integer x
    local integer y
    local integer c
    local boolean met = false
    local integer px
    local integer py
    local integer d1
    local integer d2
    loop
        set k = 1
        loop
            exitwhen k > {{M.roadWidth}}
            set s = -1
            loop
                exitwhen s > 1
                set i = 0
                loop
                    if d == 0 then
                        set x = EmpAiBbX0 + s * i
                        set y = EmpAiBbY0 - k
                    elseif d == 1 then
                        set x = EmpAiBbX1 + k
                        set y = EmpAiBbY1 + 1 + s * i
                    elseif d == 2 then
                        set x = EmpAiBbX0 + s * i
                        set y = EmpAiBbY1 + k
                    else
                        set x = EmpAiBbX0 + 1 - k
                        set y = EmpAiBbY0 + s * i
                    endif
                    set c = EmpAiMapClass(x, y)
                    exitwhen i > {{M.rampRoad}} or c < 0 or c == {{M.blocked}}
                    call EmpAiMapRoad(x, y)
                    set met = met or EmpAiMapBit(x, y, {{M.rampTop}})
                    set i = i + 1
                endloop
                set s = s + 2
            endloop
            set k = k + 1
        endloop
        exitwhen d == ModuloInteger(f + 3, 4)
        set d = ModuloInteger(f + 3, 4)
    endloop
    if met then
        call EmpAiLog("map: roads have met with a ramp")
        return
    endif
    set px = EmpAiBbX1 + 1
    set py = EmpAiBbY1 + 1
    if o == 1 or o == 2 then
        set px = EmpAiBbX0 - 4
    endif
    if o == 2 or o == 3 then
        set py = EmpAiBbY0 - 4
    endif
    set px = IMinBJ(EmpAiMapW - 1, IMaxBJ(0, px))
    set py = IMinBJ(EmpAiMapH - 3, IMaxBJ(0, py))
    set d1 = EmpAiProbe(px, py, -1, -1)
    if d1 < 0 then
        call EmpAiLog("map: cannot connect roads to ramp, so disabling wall building")
        set EmpAiBuildsDef = false
        return
    endif
    set d2 = EmpAiProbe(px, py, d1, -1)
    if d2 >= 0 then
        call EmpAiProbe(px, py, d1, d2)
    endif
endfunction

// a building of side 1 on the map and in a cluster (0x42af20, 0x42c69a): EmpAiMapUnit (ExecuteFunc)
function EmpAiMapAdd takes nothing returns nothing
    local unit u = EmpAiMapUnit
    local integer t
    local integer c
    local integer found = -1
    local boolean defence
    set EmpAiMapUnit = null
    if u == null or EmpAiMapW == 0 or not IsUnitType(u, UNIT_TYPE_STRUCTURE) or LoadBoolean(EmpAiMapTab, GetHandleId(u), 0) then
        set u = null
        return
    endif
    call SaveBoolean(EmpAiMapTab, GetHandleId(u), 0, true)
    set t = EmpType(u)
    set defence = LoadBoolean(EmpAiTab, t, 1)
    call EmpAiMapMark(u, true)
    set c = EmpAiClN - 1
    loop
        exitwhen c < 0 or found >= 0
        if (EmpAiBbX0 >= EmpAiClX0[c] - {{M.join}} and EmpAiBbX0 <= EmpAiClX1[c] + {{M.join}} or EmpAiBbX1 >= EmpAiClX0[c] - {{M.join}} and EmpAiBbX1 <= EmpAiClX1[c] + {{M.join}}) and (EmpAiBbY0 >= EmpAiClY0[c] - {{M.join}} and EmpAiBbY0 <= EmpAiClY1[c] + {{M.join}} or EmpAiBbY1 >= EmpAiClY0[c] - {{M.join}} and EmpAiBbY1 <= EmpAiClY1[c] + {{M.join}}) then
            set found = c
        endif
        set c = c - 1
    endloop
    if found >= 0 then
        // AiDefence types do not grow the box (0x43c100), but for a cluster's first building
        if not defence then
            set EmpAiClX0[found] = IMinBJ(EmpAiClX0[found], EmpAiBbX0)
            set EmpAiClY0[found] = IMinBJ(EmpAiClY0[found], EmpAiBbY0)
            set EmpAiClX1[found] = IMaxBJ(EmpAiClX1[found], EmpAiBbX1)
            set EmpAiClY1[found] = IMaxBJ(EmpAiClY1[found], EmpAiBbY1)
        endif
    elseif EmpAiClN < {{M.maxClusters}} then
        set c = EmpAiClN
        set EmpAiClN = EmpAiClN + 1
        set EmpAiClX0[c] = EmpAiBbX0
        set EmpAiClY0[c] = EmpAiBbY0
        set EmpAiClX1[c] = EmpAiBbX1
        set EmpAiClY1[c] = EmpAiBbY1
        set EmpAiClMade[c] = false
        set EmpAiClDone[c] = false
        call EmpAiLog("map: new cluster " + I2S(c) + " by " + GetUnitName(u))
        call EmpAiRoadsToRamp({{P.facing}})
    endif
    set u = null
endfunction

// ---- the contour (Trace 0x435d50): tiles next to the reserved zone of a cluster's box grown ----
// AddPoint (0x4364b0): on the map past AI_MAP.edge across the phase's way, class 0, not reserved, new
function EmpAiTrAdd takes integer x, integer y returns nothing
    local integer i = 0
    if (EmpAiTrPh == 1 or EmpAiTrPh == 3) and (x < {{M.edge}} or x > EmpAiMapW - 1 - {{M.edge}}) then
        return
    endif
    if (EmpAiTrPh == 2 or EmpAiTrPh == 4) and (y < {{M.edge}} or y > EmpAiMapH - 1 - {{M.edge}}) then
        return
    endif
    if EmpAiMapClass(x, y) != {{M.free}} or EmpAiMapBit(x, y, {{M.reserved}}) then
        return
    endif
    loop
        exitwhen i >= EmpAiTrN
        if EmpAiTrX[i] == x and EmpAiTrY[i] == y then
            return
        endif
        set i = i + 1
    endloop
    set EmpAiTrX[EmpAiTrN] = x
    set EmpAiTrY[EmpAiTrN] = y
    set EmpAiTrN = EmpAiTrN + 1
endfunction

// Ray (0x436570): from (x, y) towards d within the box; at a reserved tile the one before it in
// EmpAiTrHit (its x for d 1 / 3, its y for 0 / 2), false when it leaves the box
function EmpAiTrRay takes integer d, integer x, integer y returns boolean
    loop
        if x < EmpAiTrX0 or x > EmpAiTrX1 or y < EmpAiTrY0 or y > EmpAiTrY1 then
            return false
        endif
        if EmpAiMapBit(x, y, {{M.reserved}}) then
            if d == 1 or d == 3 then
                set EmpAiTrHit = x - EmpAiDx(d)
            else
                set EmpAiTrHit = y - EmpAiDy(d)
            endif
            return true
        endif
        set x = x + EmpAiDx(d)
        set y = y + EmpAiDy(d)
    endloop
    return false
endfunction

// a reserved tile on rows (vertical false) / columns a..b of the box (0x436630)
function EmpAiTrAny takes integer a, integer b, boolean columns returns boolean
    local integer i
    local integer j
    loop
        exitwhen a > b
        if columns then
            set j = EmpAiTrY0
            loop
                exitwhen j > EmpAiTrY1
                if EmpAiMapBit(a, j, {{M.reserved}}) then
                    return true
                endif
                set j = j + 1
            endloop
        else
            set i = EmpAiTrX0
            loop
                exitwhen i > EmpAiTrX1
                if EmpAiMapBit(i, a, {{M.reserved}}) then
                    return true
                endif
                set i = i + 1
            endloop
        endif
        set a = a + 1
    endloop
    return false
endfunction

// one step of the four phases (0x435dc0; phase 1 0x435dc0, 2 0x435f65, 3 0x4360d5, 4 0x43626a):
// along the west side north, the north side east, the east side south, the south side west
function EmpAiTrStep takes nothing returns boolean
    local integer cand
    local integer i
    if EmpAiTrPh == 1 then
        set cand = EmpAiTrCy - 1
        if cand <= EmpAiTrY0 then
            set EmpAiTrPh = 2
        elseif not EmpAiTrRay(1, EmpAiTrX0 + 1, cand) then
            call EmpAiTrAdd(EmpAiTrCx, cand)
            set EmpAiTrCy = cand
            if not EmpAiTrAny(EmpAiTrY0 + 1, cand, false) then
                set EmpAiTrPh = 2
            endif
        elseif EmpAiTrHit == EmpAiTrCx then
            call EmpAiTrAdd(EmpAiTrHit, cand)
            set EmpAiTrCy = cand
        elseif EmpAiTrHit < EmpAiTrCx then
            set i = EmpAiTrHit
            loop
                exitwhen i > EmpAiTrCx
                call EmpAiTrAdd(i, EmpAiTrCy)
                set i = i + 1
            endloop
            set EmpAiTrCx = EmpAiTrHit
        else
            set i = EmpAiTrCx
            loop
                exitwhen i > EmpAiTrHit
                call EmpAiTrAdd(i, cand)
                set i = i + 1
            endloop
            set EmpAiTrCx = EmpAiTrHit
        endif
        return true
    elseif EmpAiTrPh == 2 then
        set cand = EmpAiTrCx + 1
        if cand >= EmpAiTrX1 then
            set EmpAiTrPh = 3
        elseif not EmpAiTrRay(2, cand, EmpAiTrY0 + 1) then
            call EmpAiTrAdd(cand, EmpAiTrCy)
            set EmpAiTrCx = cand
            if not EmpAiTrAny(cand, EmpAiTrX1 - 1, true) then
                set EmpAiTrPh = 3
            endif
        elseif EmpAiTrHit == EmpAiTrCy then
            call EmpAiTrAdd(cand, EmpAiTrHit)
            set EmpAiTrCx = cand
        elseif EmpAiTrHit < EmpAiTrCy then
            set i = EmpAiTrHit
            loop
                exitwhen i > EmpAiTrCy
                call EmpAiTrAdd(EmpAiTrCx, i)
                set i = i + 1
            endloop
            set EmpAiTrCy = EmpAiTrHit
        else
            set i = EmpAiTrCy
            loop
                exitwhen i > EmpAiTrHit
                call EmpAiTrAdd(cand, i)
                set i = i + 1
            endloop
            set EmpAiTrCy = EmpAiTrHit
        endif
        return true
    elseif EmpAiTrPh == 3 then
        set cand = EmpAiTrCy + 1
        if cand >= EmpAiTrY1 then
            set EmpAiTrPh = 4
        elseif not EmpAiTrRay(3, EmpAiTrX1 - 1, cand) then
            call EmpAiTrAdd(EmpAiTrCx, cand)
            set EmpAiTrCy = cand
            if not EmpAiTrAny(cand, EmpAiTrY1 - 1, false) then
                set EmpAiTrPh = 4
            endif
        elseif EmpAiTrHit == EmpAiTrCx then
            call EmpAiTrAdd(EmpAiTrHit, cand)
            set EmpAiTrCy = cand
        elseif EmpAiTrHit > EmpAiTrCx then
            set i = EmpAiTrCx
            loop
                exitwhen i > EmpAiTrHit
                call EmpAiTrAdd(i, EmpAiTrCy)
                set i = i + 1
            endloop
            set EmpAiTrCx = EmpAiTrHit
        else
            set i = EmpAiTrHit
            loop
                exitwhen i > EmpAiTrCx
                call EmpAiTrAdd(i, cand)
                set i = i + 1
            endloop
            set EmpAiTrCx = EmpAiTrHit
        endif
        return true
    endif
    set cand = EmpAiTrCx - 1
    if cand <= EmpAiTrX0 or cand == EmpAiTrSx then
        return false
    elseif not EmpAiTrRay(0, cand, EmpAiTrY1 - 1) then
        call EmpAiTrAdd(cand, EmpAiTrCy)
        set EmpAiTrCx = cand
        if not EmpAiTrAny(EmpAiTrX0 + 1, cand, true) then
            return false
        endif
    elseif EmpAiTrHit == EmpAiTrCy then
        call EmpAiTrAdd(cand, EmpAiTrHit)
        set EmpAiTrCx = cand
    elseif EmpAiTrHit > EmpAiTrCy then
        set i = EmpAiTrCy
        loop
            exitwhen i > EmpAiTrHit
            call EmpAiTrAdd(EmpAiTrCx, i)
            set i = i + 1
        endloop
        set EmpAiTrCy = EmpAiTrHit
    else
        set i = EmpAiTrHit
        loop
            exitwhen i > EmpAiTrCy
            call EmpAiTrAdd(cand, i)
            set i = i + 1
        endloop
        set EmpAiTrCy = EmpAiTrHit
    endif
    return true
endfunction

// gaps of 1..AI_MAP.gapFill tiles between reserved tiles of a row / column of the box, past the
// first reserved one, are reserved too (0x435b70)
function EmpAiTrGaps takes boolean columns returns nothing
    local integer a
    local integer b
    local integer gap
    local integer k
    local boolean seen
    local integer x
    local integer y
    if columns then
        set a = EmpAiTrX0
    else
        set a = EmpAiTrY0
    endif
    loop
        exitwhen (columns and a > EmpAiTrX1) or (not columns and a > EmpAiTrY1)
        set seen = false
        set gap = 0
        if columns then
            set b = EmpAiTrY0
        else
            set b = EmpAiTrX0
        endif
        loop
            exitwhen (columns and b > EmpAiTrY1) or (not columns and b > EmpAiTrX1)
            set x = b
            set y = a
            if columns then
                set x = a
                set y = b
            endif
            if EmpAiMapBit(x, y, {{M.reserved}}) then
                if seen and gap >= 1 and gap <= {{M.gapFill}} then
                    set k = 1
                    loop
                        exitwhen k > gap
                        if columns then
                            call EmpAiMapOr(x, y - k, {{M.reserved}}, true)
                        else
                            call EmpAiMapOr(x - k, y, {{M.reserved}}, true)
                        endif
                        set k = k + 1
                    endloop
                endif
                set seen = true
                set gap = 0
            elseif seen then
                set gap = gap + 1
            endif
            set b = b + 1
        endloop
        set a = a + 1
    endloop
endfunction

// the contour of cluster c into EmpAiTrX / EmpAiTrY (EmpAiTrN points)
function EmpAiPlanTrace takes integer c returns nothing
    local integer y
    local integer steps = 0
    set EmpAiTrN = 0
    set EmpAiTrX0 = IMaxBJ(0, EmpAiClX0[c] - {{M.grow}})
    set EmpAiTrY0 = IMaxBJ(0, EmpAiClY0[c] - {{M.grow}})
    set EmpAiTrX1 = IMinBJ(EmpAiMapW - 1, EmpAiClX1[c] + {{M.grow}})
    set EmpAiTrY1 = IMinBJ(EmpAiMapH - 1, EmpAiClY1[c] + {{M.grow}})
    call EmpAiTrGaps(false)
    call EmpAiTrGaps(true)
    set EmpAiTrPh = 1
    // FindStart (0x436410): the lowest row whose ray from the west meets the reserved zone
    set y = EmpAiTrY1
    loop
        exitwhen y <= EmpAiTrY0
        if EmpAiTrRay(1, EmpAiTrX0 + 1, y) then
            set EmpAiTrCx = EmpAiTrHit
            set EmpAiTrCy = IMinBJ(y + 1, EmpAiTrY1 - 1)
            call EmpAiTrAdd(EmpAiTrCx, EmpAiTrCy)
            set EmpAiTrSx = EmpAiTrCx
            set EmpAiTrSy = EmpAiTrCy
            exitwhen true
        endif
        set y = y - 1
    endloop
    if y <= EmpAiTrY0 then
        call EmpAiLog("map: impossible, no contour start")
        return
    endif
    loop
        set steps = steps + 1
        exitwhen not EmpAiTrStep() or steps > 4 * (EmpAiTrX1 - EmpAiTrX0 + EmpAiTrY1 - EmpAiTrY0) + 8
    endloop
endfunction

// IsGateEnd (0x436780): a point with fewer than two neighbours among the others, beside a road
function EmpAiGateEnd takes integer i returns boolean
    local integer j = 0
    local integer n = 0
    local integer x = EmpAiTrX[i]
    local integer y = EmpAiTrY[i]
    loop
        exitwhen j >= EmpAiTrN
        if j != i and IAbsBJ(EmpAiTrX[j] - x) + IAbsBJ(EmpAiTrY[j] - y) == 1 then
            set n = n + 1
        endif
        set j = j + 1
    endloop
    if n >= 2 then
        return false
    endif
    return EmpAiMapBit(x + 1, y, {{M.road}}) or EmpAiMapBit(x - 1, y, {{M.road}}) or EmpAiMapBit(x, y + 1, {{M.road}}) or EmpAiMapBit(x, y - 1, {{M.road}})
endfunction

// type t fits at tile (x, y): its body on class 0 tiles, nobody there (CanPlace 0x5999e0)
// TODO(ai): CanPlace's rule near the own base (0x599660, kinds 0x34..0x37) is not traced.
function EmpAiPlanFits takes integer t, integer x, integer y returns boolean
    local integer n = LoadInteger(EmpAiMapTab, t, 0)
    local integer i = 0
    if n == 0 then
        return EmpAiMapClass(x, y) == {{M.free}} and EmpAiFree(EmpAiTileWX(x), EmpAiTileWY(y), {{real M.fitClear}})
    endif
    loop
        exitwhen i >= n
        if EmpAiMapClass(x + LoadInteger(EmpAiMapTab, t, 100 + 2 * i), y + LoadInteger(EmpAiMapTab, t, 101 + 2 * i)) != {{M.free}} then
            return false
        endif
        set i = i + 1
    endloop
    return EmpAiFree(EmpAiTileWX(x), EmpAiTileWY(y), {{real M.fitClear}})
endfunction

// Create (0x429230) for cluster EmpAiPlanC (ExecuteFunc: a thread of its own for the op limit): walls
// along the contour, the plan turret where a wall's end meets a road
function EmpAiPlanMake takes nothing returns nothing
    local integer c = EmpAiPlanC
    local integer i = 0
    local integer j
    local integer t
    local integer turrets = 0
    local integer wall = EmpAiWall[EmpEnemyHouse]
    local integer turret = EmpAiPlanTurret[EmpEnemyHouse]
    call EmpAiLog("map: creating new defence plan for cluster " + I2S(c))
    call EmpAiPlanTrace(c)
    set EmpAiClMade[c] = true
    if EmpAiTrN == 0 or wall == 0 then
        call EmpAiLog("map: defence plan has no points, disabling")
        set EmpAiClDone[c] = true
        return
    endif
    loop
        exitwhen i >= EmpAiTrN
        set t = wall
        if turret != 0 and EmpAiGateEnd(i) and EmpAiPlanFits(turret, EmpAiTrX[i], EmpAiTrY[i]) then
            set t = turret
            set turrets = turrets + 1
        endif
        set j = EmpAiTrN - 1 - i
        call SaveInteger(EmpAiMapTab, -1 - c, 1 + 4 * j, EmpAiTrX[i])
        call SaveInteger(EmpAiMapTab, -1 - c, 2 + 4 * j, EmpAiTrY[i])
        call SaveInteger(EmpAiMapTab, -1 - c, 3 + 4 * j, 0)
        call SaveInteger(EmpAiMapTab, -1 - c, 4 + 4 * j, t)
        set i = i + 1
    endloop
    call SaveInteger(EmpAiMapTab, -1 - c, 0, EmpAiTrN)
    set EmpAiClDone[c] = false
    call EmpAiLog("map: plan " + I2S(EmpAiTrN) + " points, " + I2S(turrets) + " turrets")
endfunction

// ChooseClusterWithDefencePlan (0x42e5d0): the newest cluster first; -1 none
function EmpAiPlanChoose takes nothing returns integer
    local integer c = EmpAiClN - 1
    loop
        exitwhen c < 0
        if EmpAiClMade[c] and not EmpAiClDone[c] then
            return c
        endif
        set c = c - 1
    endloop
    set c = EmpAiClN - 1
    loop
        exitwhen c < 0
        if not EmpAiClMade[c] then
            set EmpAiPlanC = c
            call ExecuteFunc("EmpAiPlanMake")
            if EmpAiClMade[c] and not EmpAiClDone[c] then
                return c
            endif
        endif
        set c = c - 1
    endloop
    call EmpAiLog("map: no cluster found")
    return -1
endfunction

// the plan's next point (GetNext 0x429380) built (0x42d3c7) when the credits are over its cost, else
// that point is lost as in Game.exe
function EmpAiPlanStep takes nothing returns nothing
    local integer c = EmpAiPlanChoose()
    local integer n
    local integer j = 0
    local integer pick = -1
    local integer t
    local integer x
    local integer y
    local integer k
    local boolean all = true
    if c < 0 then
        return
    endif
    set n = LoadInteger(EmpAiMapTab, -1 - c, 0)
    loop
        exitwhen j >= n or pick >= 0
        if LoadInteger(EmpAiMapTab, -1 - c, 3 + 4 * j) == 0 then
            set all = false
            if EmpAiPlanFits(LoadInteger(EmpAiMapTab, -1 - c, 4 + 4 * j), LoadInteger(EmpAiMapTab, -1 - c, 1 + 4 * j), LoadInteger(EmpAiMapTab, -1 - c, 2 + 4 * j)) then
                set pick = j
            endif
        endif
        set j = j + 1
    endloop
    if pick < 0 then
        if all then
            set EmpAiClDone[c] = true
            call EmpAiLog("map: defence plan is finished")
        else
            // points under a building now are given up (0x437530, "** Erasing")
            set j = 0
            loop
                exitwhen j >= n
                set x = LoadInteger(EmpAiMapTab, -1 - c, 1 + 4 * j)
                set y = LoadInteger(EmpAiMapTab, -1 - c, 2 + 4 * j)
                if LoadInteger(EmpAiMapTab, -1 - c, 3 + 4 * j) == 0 and EmpAiMapClass(x, y) == {{M.body}} then
                    call SaveInteger(EmpAiMapTab, -1 - c, 3 + 4 * j, 1)
                endif
                set j = j + 1
            endloop
            call EmpAiLog("map: could not get next defensive position")
        endif
        return
    endif
    call SaveInteger(EmpAiMapTab, -1 - c, 3 + 4 * pick, 1)
    set t = LoadInteger(EmpAiMapTab, -1 - c, 4 + 4 * pick)
    set x = LoadInteger(EmpAiMapTab, -1 - c, 1 + 4 * pick)
    set y = LoadInteger(EmpAiMapTab, -1 - c, 2 + 4 * pick)
    set k = LoadInteger(EmpCostTab, t, 0)
    if EmpEnemyGold() > k then
        call EmpAiLog("start " + GetObjectName(t) + " (defence plan)")
        call EmpAiStart(t, EmpAiTileWX(x), EmpAiTileWY(y))
    else
        call EmpAiLog("map: cannot afford " + GetObjectName(t) + ", point lost")
    endif
endfunction

// WallsMayContinue (0x42e6c0): no plan of the newest cluster yet, or plans within AI_PLAN.wallTicks
// of the first wall turn
function EmpAiWallsGo takes nothing returns boolean
    local integer c = EmpAiClN - 1
    local boolean go = false
    if c < 0 or not EmpAiClMade[c] then
        return true
    endif
    loop
        exitwhen c < 0
        if EmpAiClMade[c] and not EmpAiClDone[c] then
            if EmpTick - EmpAiWallSince > {{P.wallTicks}} then
                call EmpAiLog("map: building walls too long, so aborting")
                set EmpAiClDone[c] = true
            else
                set go = true
            endif
        endif
        set c = c - 1
    endloop
    return go
endfunction

// the units of side 1
function EmpAiUnitCount takes nothing returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) then
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

// ShouldBuildDefences (0x430c90), the critical needs asked by the caller.
// TODO(ai): Game.exe's "savings holiday" ([money + 0x1c]) and its credits less the reserve
// (0x4398e0) are the credits here. Risk: walls start a little earlier.
function EmpAiShouldDefend takes nothing returns boolean
    local integer c = EmpAiClN - 1
    local integer mins
    if not EmpAiBuildsDef or EmpTechLevel <= {{planTech}} or EmpAiMapW == 0 then
        return false
    endif
    if not EmpAiWallsGo() or EmpAiUnitCount() < {{P.units}} then
        return false
    endif
    if c >= 0 and EmpAiClMade[c] and not EmpAiClDone[c] then
        return EmpEnemyGold() >= {{P.gold}}
    endif
    set mins = GetRandomInt(0, {{P.minutesRand}}) + {{P.minutes}}
    if EmpAiPersonality == {{C.AI_BEHAVIOUR.defensive}} then
        set mins = GetRandomInt(0, {{P.minutesRand}}) + {{P.defensiveMinutes}}
    endif
    if EmpAiStrength == 0 then
        set mins = mins + {{P.weakPlus}}
    endif
    return EmpEnemyGold() >= {{ai.minMoneyWalls}} and EmpTick >= mins * {{C.AI_CRITICAL_BARRACKS.ticksPerMinute}}
endfunction

{{mapData}}
// the static layer, the building cells and the plan turrets (EmpAiInit), then the buildings standing:
// the template's first (its construction yard founds the first cluster), then the others
function EmpAiMapInit takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer k = EmpEnemyHouse * {{C.TEMPLATE_SLOTS}}
    set EmpAiMapTab = InitHashtable()
{{mapInit}}
    loop
        exitwhen k >= EmpEnemyHouse * {{C.TEMPLATE_SLOTS}} + EmpTplCount[EmpEnemyHouse]
        if EmpAlive(EmpTplUnit[k]) then
            set EmpAiMapUnit = EmpTplUnit[k]
            call ExecuteFunc("EmpAiMapAdd")
        endif
        set k = k + 1
    endloop
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            set EmpAiMapUnit = u
            call ExecuteFunc("EmpAiMapAdd")
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction
