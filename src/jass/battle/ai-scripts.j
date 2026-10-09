// ---- AI script tactics (Game.exe 1.09 tactic type 1; src/emperor/ai-scripts.ts, C.AI_SCRIPT) ----
// The proactive picker (0x44e410 -> 0x45b5f0) runs every GapBetweenNewScripts past FirstAttackDelay
// with the player's base known, under MaxScriptsToRunAtOnce: it rolls a priority (rand % 100 against
// 51 / 81 / 96: frequency 1..4, table 0x44990c), takes the strategies of that frequency for the AI's
// house and tech, not running, whose every team finds its minunits of its object set among the home
// units beyond the defence share, and starts one at random. A running script (0x458b60) does its steps
// in turn: SEND (who: a team or all; to a target, a staging point or home; attack-moving or moving),
// WAIT ticks, GOTO a step; a step's sends are done when two in three of the units sent are at their
// destination or TicksUntilAbandonForming passed. It ends when its steps are over, at its losses %
// (when under 100), with no units left, or (no TARGET) after AI_SCRIPT.noTargetTicks; its units go
// home (the reserves, 0x45b270).
// Data: EmpScrD[EmpScrOff[i] ..] per strategy (ai-scripts.ts encode): frequency, mintech, maxtech,
// house (-1 all), losses, teams (n; set, min, max each), targets (n; kind, set), staging (n; target,
// side, tiles), steps (n; actions (n; kind, a, b, c, d each)). Slots: EmpScrSlot* arrays; a unit's
// EmpWaveTab children AI_TAB_SCRIPT (slot + 1) and AI_TAB_SCRIPT_TEAM (team), its last order at
// AI_TAB_SCRIPT_ORDER .. + 2 (kind, x, y; the deploy tick sends it on after undeploying).
// TODO(ai): not ported: reactive scripts (0x44e100: reactive=1, against threats near the base, every
// 200 manager steps), build on demand (0x45d010: a script short of units steers production), the
// fuzzy unit match (0.7, then 1.0 / 0.9 / 0.8, 0x45bae0 / 0x45d820: here the exact set), extra units
// (0x45bf40), the staging geometry (0x44d390, AI_SCRIPT.tiles / sides here), route (threat-avoiding
// paths), MONITOR / RUN / TAUNT, re-rolling a script picked before, the LARGE attack (0x44d1b5 ->
// 0x450f30, 1 in 5250 manager steps). The team types "strong" and "fast" (built in, not traced) take
// any unit here. Risk: the AI attacks in the right shapes with less choice of units, never builds for
// a script and never answers a threat with one.
// Feature test: test/emperor-mission.test.ts "AI script tactics".

function EmpScrDecodeRun takes nothing returns nothing
    local string s = EmpScrStr
    local integer n = StringLength(s)
    local integer i = 0
    local integer v = 0
    local boolean neg = false
    local boolean any = false
    local string c
    set EmpScrOff[EmpScrN] = EmpScrTop
    loop
        exitwhen i > n
        if i == n then
            set c = ","
        else
            set c = SubString(s, i, i + 1)
        endif
        if c == "," then
            if any then
                if neg then
                    set v = -v
                endif
                set EmpScrD[EmpScrTop] = v
                set EmpScrTop = EmpScrTop + 1
            endif
            set v = 0
            set neg = false
            set any = false
        elseif c == "-" then
            set neg = true
        else
            set v = v * 10 + S2I(c)
            set any = true
        endif
        set i = i + 1
    endloop
    set EmpScrN = EmpScrN + 1
endfunction

// one strategy's numbers into EmpScrD (a thread each: the op limit)
function EmpScrAdd takes string s returns nothing
    set EmpScrStr = s
    call ExecuteFunc("EmpScrDecodeRun")
endfunction

function EmpScrData takes nothing returns nothing
    set EmpScrSetTab = InitHashtable()
{{scriptSetLines}}
{{scriptLines}}
endfunction

// does type t belong to team set k (-1 all, -2 strong, -3 fast: any unit here, see the TODO)
function EmpScrInSet takes integer k, integer t returns boolean
    return k < 0 or LoadBoolean(EmpScrSetTab, k, t)
endfunction

// positions in EmpScrD: of team k / target k / staging k / step k of strategy i
function EmpScrTeamAt takes integer i, integer k returns integer
    return EmpScrOff[i] + 6 + k * 3
endfunction

function EmpScrTargetsAt takes integer i returns integer
    return EmpScrOff[i] + 6 + EmpScrD[EmpScrOff[i] + 5] * 3
endfunction

function EmpScrStagingAt takes integer i returns integer
    local integer p = EmpScrTargetsAt(i)
    return p + 1 + EmpScrD[p] * 2
endfunction

function EmpScrStepsAt takes integer i returns integer
    local integer p = EmpScrStagingAt(i)
    return p + 1 + EmpScrD[p] * 3
endfunction

// the first action of step k of strategy i (EmpScrD there: its action count)
function EmpScrStepAt takes integer i, integer k returns integer
    local integer p = EmpScrStepsAt(i) + 1
    local integer j = 0
    loop
        exitwhen j >= k
        set p = p + 1 + EmpScrD[p] * 5
        set j = j + 1
    endloop
    return p
endfunction

function EmpScrRunning takes integer i returns boolean
    local integer s = 0
    loop
        exitwhen s >= {{C.AI_SCRIPT.slots}}
        if EmpScrSlotOn[s] and EmpScrSlotScript[s] == i then
            return true
        endif
        set s = s + 1
    endloop
    return false
endfunction

function EmpScrCount takes nothing returns integer
    local integer s = 0
    local integer n = 0
    loop
        exitwhen s >= {{C.AI_SCRIPT.slots}}
        if EmpScrSlotOn[s] then
            set n = n + 1
        endif
        set s = s + 1
    endloop
    return n
endfunction

// the home units that may go (all home units but the defence share), into EmpScrPool
function EmpScrPoolFill takes nothing returns integer
    local group g = CreateGroup()
    local unit u
    local integer home = 0
    local integer keep
    call GroupClear(EmpScrPool)
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAiHomeUnit(u) then
            set home = home + 1
            call GroupAddUnit(EmpScrPool, u)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    // PercentageOfUnitsForDefence stay home, within Minimum / MaximumUnitsForDefence (ai_difficulty.ini)
    set keep = IMinBJ(IMaxBJ(home * EmpAiDefPct / 100, EmpAiTMinDef[EmpAiT()]), EmpAiTMaxDef[EmpAiT()])
    return home - keep
endfunction

// can strategy i fill its teams from the pool (at most `free` units, each unit in one team)?
// take = true: assign them to slot s
function EmpScrFill takes integer i, integer free, boolean take, integer s returns boolean
    local integer nt = EmpScrD[EmpScrOff[i] + 5]
    local integer k = 0
    local integer p
    local integer got
    local integer used = 0
    local group g = CreateGroup()
    local group left = CreateGroup()
    local unit u
    local boolean ok = true
    call GroupAddGroup(EmpScrPool, left)
    loop
        exitwhen k >= nt or not ok
        set p = EmpScrTeamAt(i, k)
        set got = 0
        call GroupClear(g)
        call GroupAddGroup(left, g)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null or got >= EmpScrD[p + 2] or used >= free
            call GroupRemoveUnit(g, u)
            if EmpScrInSet(EmpScrD[p], EmpType(u)) then
                set got = got + 1
                set used = used + 1
                call GroupRemoveUnit(left, u)
                if take then
                    call SaveInteger(EmpWaveTab, GetHandleId(u), 1, 3)
                    call SaveInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT}}, s + 1)
                    call SaveInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT_TEAM}}, k)
                    call EmpDeploySet(u, false)
                endif
            endif
        endloop
        if got < EmpScrD[p + 1] then
            set ok = false
        endif
        set k = k + 1
    endloop
    call DestroyGroup(g)
    call DestroyGroup(left)
    set g = null
    set left = null
    return ok
endfunction

// target k of slot s: where it is (EmpScrTab[s] 10 + 2k / 11 + 2k)
function EmpScrNearestOf takes integer setk, integer kind, real x, real y returns boolean
    local group g = CreateGroup()
    local unit u
    local real bd = 1000000000.0
    local real d
    local boolean found = false
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and IsUnitVisible(u, Player(1)) and ((kind == {{C.AI_SCRIPT.targetAny}}) or (kind == {{C.AI_SCRIPT.targetHarvester}} and EmpType(u) == '{{harvester}}') or (kind == {{C.AI_SCRIPT.targetSet}} and LoadBoolean(EmpScrSetTab, setk, EmpType(u)))) then
            set d = (GetUnitX(u) - x) * (GetUnitX(u) - x) + (GetUnitY(u) - y) * (GetUnitY(u) - y)
            if d < bd then
                set bd = d
                set EmpScrPtX = GetUnitX(u)
                set EmpScrPtY = GetUnitY(u)
                set found = true
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return found
endfunction

function EmpScrResolve takes integer s returns nothing
    local integer i = EmpScrSlotScript[s]
    local integer p = EmpScrTargetsAt(i)
    local integer n = EmpScrD[p]
    local integer k = 0
    local integer kind
    local integer b = EmpBaseOfSide(1)
    local real dx
    local real dy
    local real len
    local real tx
    local real ty
    local real d
    local integer side
    loop
        exitwhen k >= n
        set kind = EmpScrD[p + 1 + k * 2]
        set EmpScrPtX = EmpAiKnownX
        set EmpScrPtY = EmpAiKnownY
        if kind == {{C.AI_SCRIPT.targetThreat}} and EmpAiThreat != null and EmpAlive(EmpAiThreat) then
            set EmpScrPtX = GetUnitX(EmpAiThreat)
            set EmpScrPtY = GetUnitY(EmpAiThreat)
        elseif kind != {{C.AI_SCRIPT.targetBase}} and kind != {{C.AI_SCRIPT.targetThreat}} then
            if not EmpScrNearestOf(EmpScrD[p + 2 + k * 2], kind, EmpBaseX[b], EmpBaseY[b]) then
                set EmpScrPtX = EmpAiKnownX
                set EmpScrPtY = EmpAiKnownY
            endif
        endif
        call SaveReal(EmpScrTab, s, 10 + 2 * k, EmpScrPtX)
        call SaveReal(EmpScrTab, s, 11 + 2 * k, EmpScrPtY)
        set k = k + 1
    endloop
    // staging points: by their target, along the way from it to the AI's base (front), behind it (rear)
    // or to a side (TODO above: Game.exe's geometry not traced)
    set p = EmpScrStagingAt(i)
    set n = EmpScrD[p]
    set k = 0
    loop
        exitwhen k >= n
        set tx = LoadReal(EmpScrTab, s, 10 + 2 * EmpScrD[p + 1 + k * 3])
        set ty = LoadReal(EmpScrTab, s, 11 + 2 * EmpScrD[p + 1 + k * 3])
        set side = EmpScrD[p + 2 + k * 3]
        set d = EmpScrD[p + 3 + k * 3] * {{real WC3_UNITS_PER_TILE}}
        set dx = EmpBaseX[b] - tx
        set dy = EmpBaseY[b] - ty
        set len = RMaxBJ(1.0, SquareRoot(dx * dx + dy * dy))
        set dx = dx / len
        set dy = dy / len
        if side == 1 then
            set len = dx
            set dx = -dy
            set dy = len
        elseif side == 2 then
            set len = dx
            set dx = dy
            set dy = -len
        elseif side == 3 then
            set dx = -dx
            set dy = -dy
        endif
        call SaveReal(EmpScrTab, s, 100 + 2 * k, EmpClampX(tx + dx * d))
        call SaveReal(EmpScrTab, s, 101 + 2 * k, EmpClampY(ty + dy * d))
        set k = k + 1
    endloop
endfunction

// a send's destination into EmpScrPtX / Y: 0 target k, 1 staging k, 2 home
function EmpScrDest takes integer s, integer kind, integer k returns nothing
    local integer b = EmpBaseOfSide(1)
    if kind == 0 then
        set EmpScrPtX = LoadReal(EmpScrTab, s, 10 + 2 * k)
        set EmpScrPtY = LoadReal(EmpScrTab, s, 11 + 2 * k)
    elseif kind == 1 then
        set EmpScrPtX = LoadReal(EmpScrTab, s, 100 + 2 * k)
        set EmpScrPtY = LoadReal(EmpScrTab, s, 101 + 2 * k)
    else
        set EmpScrPtX = EmpBaseX[b]
        set EmpScrPtY = EmpBaseY[b]
    endif
endfunction

function EmpScrOrder takes unit u, integer kind, real x, real y returns nothing
    call SaveInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT_ORDER}}, kind)
    call SaveReal(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT_ORDER}} + 1, x)
    call SaveReal(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT_ORDER}} + 2, y)
    if kind == 1 then
        call IssuePointOrder(u, "attack", x, y)
    else
        call IssuePointOrder(u, "move", x, y)
    endif
endfunction

// the units of slot s (team k, or all with k < 0) into EmpScrUnits; their count
function EmpScrUnitsOf takes integer s, integer k returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    call GroupClear(EmpScrUnits)
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and LoadInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT}}) == s + 1 and (k < 0 or LoadInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT_TEAM}}) == k) then
            call GroupAddUnit(EmpScrUnits, u)
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

// slot s ends: its units go home
function EmpScrEnd takes integer s, string why returns nothing
    local unit u
    call EmpScrUnitsOf(s, -1)
    loop
        set u = FirstOfGroup(EmpScrUnits)
        exitwhen u == null
        call GroupRemoveUnit(EmpScrUnits, u)
        call SaveInteger(EmpWaveTab, GetHandleId(u), 1, 0)
        call RemoveSavedInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT}})
        call RemoveSavedInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT_TEAM}})
        call RemoveSavedInteger(EmpWaveTab, GetHandleId(u), {{C.AI_TAB_SCRIPT_ORDER}})
    endloop
    set EmpScrSlotOn[s] = false
    call FlushChildHashtable(EmpScrTab, s)
    call EmpAiLog("script ends (" + why + "): " + LoadStr(EmpScrSetTab, -1, EmpScrSlotScript[s]))
endfunction

// the step of slot s begins: its sends are given
function EmpScrStepStart takes integer s returns nothing
    local integer i = EmpScrSlotScript[s]
    local integer p = EmpScrStepAt(i, EmpScrSlotStep[s])
    local integer n = EmpScrD[p]
    local integer a = 0
    local integer q
    local unit u
    set EmpScrSlotStepAt[s] = EmpTick
    loop
        exitwhen a >= n
        set q = p + 1 + a * 5
        if EmpScrD[q] == 1 then
            call EmpScrDest(s, EmpScrD[q + 2], EmpScrD[q + 3])
            call EmpScrUnitsOf(s, EmpScrD[q + 1])
            loop
                set u = FirstOfGroup(EmpScrUnits)
                exitwhen u == null
                call GroupRemoveUnit(EmpScrUnits, u)
                call EmpScrOrder(u, EmpScrD[q + 4], EmpScrPtX, EmpScrPtY)
            endloop
        endif
        set a = a + 1
    endloop
    call EmpAiLog("script " + LoadStr(EmpScrSetTab, -1, i) + " step " + I2S(EmpScrSlotStep[s]))
endfunction

// is the step of slot s done (sends arrived or abandoned, waits over); a GOTO moves the step
function EmpScrStepDone takes integer s returns boolean
    local integer i = EmpScrSlotScript[s]
    local integer p = EmpScrStepAt(i, EmpScrSlotStep[s])
    local integer n = EmpScrD[p]
    local integer a = 0
    local integer q
    local integer sent
    local integer there
    local unit u
    local real r = {{real C.AI_SCRIPT.arriveTiles}} * {{real WC3_UNITS_PER_TILE}}
    loop
        exitwhen a >= n
        set q = p + 1 + a * 5
        if EmpScrD[q] == 1 then
            call EmpScrDest(s, EmpScrD[q + 2], EmpScrD[q + 3])
            set sent = EmpScrUnitsOf(s, EmpScrD[q + 1])
            set there = 0
            loop
                set u = FirstOfGroup(EmpScrUnits)
                exitwhen u == null
                call GroupRemoveUnit(EmpScrUnits, u)
                if IsUnitInRangeXY(u, EmpScrPtX, EmpScrPtY, r) then
                    set there = there + 1
                endif
            endloop
            if there * 3 < sent * 2 and EmpTick - EmpScrSlotStepAt[s] < {{ai.ticksAbandonForming}} then
                return false
            endif
        elseif EmpScrD[q] == 2 then
            if EmpTick - EmpScrSlotStepAt[s] < EmpScrD[q + 1] then
                return false
            endif
        elseif EmpScrD[q] == 3 then
            // GOTO: the step after this one is the one named (minus one: StepNext adds it)
            set EmpScrSlotStep[s] = EmpScrD[q + 1] - 1
        endif
        set a = a + 1
    endloop
    return true
endfunction

// every tactics tick: each running script
function EmpScrTick takes nothing returns nothing
    local integer s = 0
    local integer i
    local integer n
    loop
        exitwhen s >= {{C.AI_SCRIPT.slots}}
        if EmpScrSlotOn[s] then
            set i = EmpScrSlotScript[s]
            set n = EmpScrUnitsOf(s, -1)
            if n == 0 then
                call EmpScrEnd(s, "no units")
            elseif EmpScrD[EmpScrOff[i] + 4] < 100 and (EmpScrSlotUnits[s] - n) * 100 >= EmpScrD[EmpScrOff[i] + 4] * EmpScrSlotUnits[s] then
                call EmpScrEnd(s, "losses")
            elseif EmpScrD[EmpScrTargetsAt(i)] == 0 and EmpTick - EmpScrSlotStart[s] >= {{C.AI_SCRIPT.noTargetTicks}} then
                call EmpScrEnd(s, "time")
            elseif EmpScrStepDone(s) then
                set EmpScrSlotStep[s] = EmpScrSlotStep[s] + 1
                if EmpScrSlotStep[s] >= EmpScrD[EmpScrStepsAt(i)] then
                    call EmpScrEnd(s, "done")
                else
                    call EmpScrStepStart(s)
                endif
            endif
        endif
        set s = s + 1
    endloop
endfunction

// the proactive picker, every GapBetweenNewScripts (EmpAiWave)
function EmpScrPick takes nothing returns nothing
    local integer roll = GetRandomInt(0, 99)
    local integer pri = 4
    local integer i = 0
    local integer o
    local integer n = 0
    local integer free
    local integer s = 0
    local integer array cand
    if not EmpAiKnown or EmpTick < EmpAiTFirst[EmpAiT()] or EmpScrCount() >= EmpAiTScripts[EmpAiT()] then
        return
    endif
    if roll < {{C.AI_SCRIPT.priority1}} then
        set pri = 1
    elseif roll < {{C.AI_SCRIPT.priority2}} then
        set pri = 2
    elseif roll < {{C.AI_SCRIPT.priority3}} then
        set pri = 3
    endif
    set free = EmpScrPoolFill()
    loop
        exitwhen i >= EmpScrN
        set o = EmpScrOff[i]
        if EmpScrD[o] == pri and EmpScrD[o + 1] <= EmpTechLevel and EmpTechLevel <= EmpScrD[o + 2] and (EmpScrD[o + 3] < 0 or EmpScrD[o + 3] == EmpEnemyHouse) and not EmpScrRunning(i) and EmpScrFill(i, free, false, 0) then
            set cand[n] = i
            set n = n + 1
        endif
        set i = i + 1
    endloop
    if n == 0 then
        call EmpAiLog("no script of priority " + I2S(pri) + " can start")
        return
    endif
    loop
        exitwhen s >= {{C.AI_SCRIPT.slots}} or not EmpScrSlotOn[s]
        set s = s + 1
    endloop
    if s >= {{C.AI_SCRIPT.slots}} then
        return
    endif
    set i = cand[GetRandomInt(0, n - 1)]
    set EmpScrSlotOn[s] = true
    set EmpScrSlotScript[s] = i
    set EmpScrSlotStep[s] = 0
    set EmpScrSlotStart[s] = EmpTick
    call EmpScrFill(i, free, true, s)
    set EmpScrSlotUnits[s] = EmpScrUnitsOf(s, -1)
    call EmpScrResolve(s)
    call EmpAiLog("script starts: " + LoadStr(EmpScrSetTab, -1, i) + ", units " + I2S(EmpScrSlotUnits[s]))
    call EmpScrStepStart(s)
endfunction
