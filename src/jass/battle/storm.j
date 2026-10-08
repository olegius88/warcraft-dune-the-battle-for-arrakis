// ---- sandstorms (Rules.txt [General] Storm*, [StormUnit], StormDamage per object): a storm comes
// StormMinWait + up to StormMaxWait ticks after the last one, wanders on the sand at the [StormUnit]
// Speed for StormMinLife..StormMaxLife ticks; a unit it reaches is picked up (killed) with
// StormKillChance in 256, else takes its StormDamage every second while inside.
// TODO(storm): how often Emperor applies the chance and the damage is not in Rules.txt: once per
// unit and storm, and per second, are assumed.
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
    local real d
    if EmpAlive(u) and u != EmpWorm and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and not IsUnitType(u, UNIT_TYPE_FLYING) then
        if not IsUnitInGroup(u, EmpStormSeen) then
            call GroupAddUnit(EmpStormSeen, u)
            if GetRandomInt(0, 255) < {{storm.killChance}} then
                call KillUnit(u)
                set u = null
                return
            endif
        endif
        set d = I2R(LoadInteger(EmpStormTab, GetUnitTypeId(u), 0)) / {{HP_DIVISOR}} * {{real C.STORM_TICK}}
        if d > 0.0 then
            if GetWidgetLife(u) <= d then
                call KillUnit(u)
            else
                call SetWidgetLife(u, GetWidgetLife(u) - d)
            endif
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
            call GroupClear(EmpStormSeen)
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
    call GroupEnumUnitsInRange(g, EmpStormX, EmpStormY, {{real radius}}, null)
    call ForGroup(g, function EmpStormHit)
    call DestroyGroup(g)
    set g = null
endfunction

function EmpStormData takes nothing returns nothing
    set EmpStormTab = InitHashtable()
    set EmpStormSeen = CreateGroup()
    set EmpStormNext = {{storm.minWait}} + GetRandomInt(0, {{storm.maxWait}})
{{damageLines}}
endfunction
