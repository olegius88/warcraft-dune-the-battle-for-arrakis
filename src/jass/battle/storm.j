// ---- sandstorms (Rules.txt [General] Storm*, [StormUnit], StormDamage per object): a storm comes
// StormMinWait + up to StormMaxWait ticks after the last one, wanders on the sand at the [StormUnit]
// Speed for StormMinLife..StormMaxLife ticks. Game.exe 1.09 (storm update 0x52ba18..0x52bc87) every
// tick: a ground object in the 11 x 11 cells around the storm with a StormDamage class above 0 is
// picked up (killed here) if (rand & StormKillChance) < class, else it takes the damage (value mod 64);
// a flying unit within 5 cells takes the whole value. The runtime checks every STORM_TICK s
// ({{ticks}} ticks): the pick-up chance and the damage are those of that many ticks.
// (test/emperor-mission.test.ts; before, a unit was picked up once per storm with chance 127 / 256 and
// took the damage per second.)
function EmpStormSandPoint takes nothing returns boolean
    local integer i = 0
    loop
        exitwhen i >= {{C.STORM_SPAWN_TRIES}}
        set EmpStormTX = GetRandomReal(EmpMapMinX, EmpMapMaxX)
        set EmpStormTY = GetRandomReal(EmpMapMinY, EmpMapMaxY)
        if EmpOnSand(EmpStormTX, EmpStormTY) then
            return true
        endif
        set i = i + 1
    endloop
    return false
endfunction

function EmpStormHit takes nothing returns nothing
    local unit u = GetEnumUnit()
    local real d = 0.0
    if not EmpAlive(u) or u == EmpWorm then
        set u = null
        return
    endif
    if IsUnitType(u, UNIT_TYPE_FLYING) then
        if IsUnitInRangeXY(u, EmpStormX, EmpStormY, {{real air}}) then
            set d = I2R(LoadInteger(EmpStormTab, EmpType(u), 2)) * {{ticks}} / {{HP_DIVISOR}}
        endif
    elseif RAbsBJ(GetUnitX(u) - EmpStormX) <= {{real ground}} and RAbsBJ(GetUnitY(u) - EmpStormY) <= {{real ground}} then
        // only a StormDamage class above 0 is picked up (battle.ts damageLines); a building never is
        if LoadInteger(EmpStormTab, EmpType(u), 1) > 0 and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and GetRandomReal(0.0, 1.0) < EmpStormPick[LoadInteger(EmpStormTab, EmpType(u), 1)] then
            call KillUnit(u)
            set u = null
            return
        endif
        set d = I2R(LoadInteger(EmpStormTab, EmpType(u), 0)) * {{ticks}} / {{HP_DIVISOR}}
    endif
    if d > 0.0 then
        if GetWidgetLife(u) <= d then
            call KillUnit(u)
        else
            call SetWidgetLife(u, GetWidgetLife(u) - d)
        endif
    endif
    set u = null
endfunction

function EmpStormTick takes nothing returns nothing
    local real dx
    local real dy
    local real len
    local group g
    if EmpStormFx == null then
        if EmpTick >= EmpStormNext and EmpStormSandPoint() then
            set EmpStormX = EmpStormTX
            set EmpStormY = EmpStormTY
            set EmpStormFx = AddSpecialEffect({{str EFFECT.sandstorm}}, EmpStormX, EmpStormY)
            call BlzSetSpecialEffectScale(EmpStormFx, {{real C.STORM_SCALE}})
            set EmpStormEnd = EmpTick + GetRandomInt({{storm.minLife}}, {{storm.maxLife}})
            call EmpStormSandPoint()
        endif
        return
    endif
    if EmpTick >= EmpStormEnd then
        call DestroyEffect(EmpStormFx)
        set EmpStormFx = null
        set EmpStormNext = EmpTick + {{storm.minWait}} + GetRandomInt(0, {{storm.maxWait}})
        return
    endif
    set dx = EmpStormTX - EmpStormX
    set dy = EmpStormTY - EmpStormY
    set len = SquareRoot(dx * dx + dy * dy)
    if len < {{real step}} or not EmpOnSand(EmpStormX + dx / RMaxBJ(len, 1.0) * {{real step}}, EmpStormY + dy / RMaxBJ(len, 1.0) * {{real step}}) then
        call EmpStormSandPoint()
    else
        set EmpStormX = EmpStormX + dx / len * {{real step}}
        set EmpStormY = EmpStormY + dy / len * {{real step}}
        call BlzSetSpecialEffectPosition(EmpStormFx, EmpStormX, EmpStormY, 0.0)
    endif
    set g = CreateGroup()
    // (the square's corners: the ground cells reach sqrt(2) times their half side)
    call GroupEnumUnitsInRange(g, EmpStormX, EmpStormY, RMaxBJ({{real air}}, {{real ground}} * 1.4143), null)
    call ForGroup(g, function EmpStormHit)
    call DestroyGroup(g)
    set g = null
endfunction

function EmpStormData takes nothing returns nothing
    set EmpStormTab = InitHashtable()
{{pickLines}}
    set EmpStormNext = {{storm.minWait}} + GetRandomInt(0, {{storm.maxWait}})
{{damageLines}}
endfunction
