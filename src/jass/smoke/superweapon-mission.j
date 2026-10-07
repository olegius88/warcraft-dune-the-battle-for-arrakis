// Super weapons in a real mission map (src/smoke/build-superweapon-mission.ts): the player's palace
// trains a Death Hand charge; Death Hand, Chaos Lightning and Hawk Strike charges fire by
// attack-ground on enemy units placed for the test. Report: CustomMapData\{{report}}.
function SwmLog takes string s returns nothing
    local integer i = 0
    set EmpAiLogLine[EmpAiLogCount] = s
    set EmpAiLogCount = EmpAiLogCount + 1
    call PreloadGenClear()
    call PreloadGenStart()
    loop
        exitwhen i >= EmpAiLogCount
        call Preload(EmpAiLogLine[i])
        set i = i + 1
    endloop
    call PreloadGenEnd({{str report}})
endfunction

// count Player(1) units within r of (x, y), alive; owners: also those now owned by Neutral Hostile
function SwmCount takes player p, real x, real y, real r returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    call GroupEnumUnitsInRange(g, x, y, r, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and GetOwningPlayer(u) == p then
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

function SwmFire takes integer t, real x, real y returns nothing
    local unit c = CreateUnit(Player(0), t, x - 1500.0, y, 0.0)
    local boolean ok = IssuePointOrder(c, "attackground", x, y)
    call SwmLog("fire " + GetObjectName(t) + " order=" + I2S(IntegerTertiaryOp(ok, 1, 0)) + " charge used=" + I2S(IntegerTertiaryOp(GetUnitTypeId(c) == 0, 1, 0)))
    set c = null
endfunction

function SwmGroup takes real x, real y returns nothing
    local integer k = 0
    loop
        exitwhen k >= 4
        call CreateUnit(Player(1), {{victim}}, x + k * 60.0, y, 0.0)
        set k = k + 1
    endloop
endfunction

function SwMissionRun takes nothing returns nothing
    local unit pal
    local unit u
    local boolean ok
    local real x = EmpMapMinX + 2500.0
    local real y = EmpMapMinY + 2500.0
    call TriggerSleepAction(6.0)
    set pal = CreateUnit(Player(0), {{palace}}, x, y + 2500.0, 270.0)
    set ok = IssueImmediateOrderById(pal, {{dh}})
    call SwmLog("palace trains Death Hand=" + I2S(IntegerTertiaryOp(ok, 1, 0)) + " second=" + I2S(IntegerTertiaryOp(IssueImmediateOrderById(pal, {{dh}}), 1, 0)))
    // Death Hand: blast, then fallout
    call SwmGroup(x, y)
    call SwmLog("death hand: enemy before=" + I2S(SwmCount(Player(1), x, y, 600.0)))
    call SwmFire({{dh}}, x, y)
    call TriggerSleepAction(1.0)
    call SwmLog("death hand: enemy after blast=" + I2S(SwmCount(Player(1), x, y, 600.0)))
    // Chaos Lightning: units go berserk (owned by Neutral Hostile), then come back
    set y = y + 900.0
    call SwmGroup(x, y)
    call SwmFire({{beam}}, x, y)
    call TriggerSleepAction(0.5)
    call SwmLog("chaos: enemy left=" + I2S(SwmCount(Player(1), x, y, 400.0)) + " berserk=" + I2S(SwmCount(Player(PLAYER_NEUTRAL_AGGRESSIVE), x, y, 400.0)))
    call TriggerSleepAction({{real beamSeconds}} + 1.0)
    call SwmLog("chaos after effect: enemy=" + I2S(SwmCount(Player(1), x, y, 1500.0)) + " berserk=" + I2S(SwmCount(Player(PLAYER_NEUTRAL_AGGRESSIVE), x, y, 1500.0)))
    // Hawk Strike: units flee from the point (a tank that outlives the strike's damage)
    set y = y + 1200.0
    set u = CreateUnit(Player(1), {{tank}}, x + 60.0, y, 0.0)
    call SwmFire({{hawk}}, x, y)
    call TriggerSleepAction(3.0)
    call SwmLog("hawk: tank alive=" + I2S(IntegerTertiaryOp(EmpAlive(u), 1, 0)) + " moved away=" + I2S(R2I(SquareRoot((GetUnitX(u) - x) * (GetUnitX(u) - x) + (GetUnitY(u) - y) * (GetUnitY(u) - y)))))
    set u = null
    call SwmLog("done")
    set pal = null
endfunction
