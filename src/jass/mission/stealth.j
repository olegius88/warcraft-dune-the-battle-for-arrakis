// StealthedWhenStill (Rules.txt: scouts by type, ATSniper at veterancy level 3): the unit turns
// invisible StealthDelay ticks after it stopped and StealthDelayAfterFiring ticks after its last shot
// (EmpOnAttacked records the shot), and visible again when it moves or fires. Units made invisible
// by a stealth crate are left to the crate. Rules.txt UnstealthRange (turrets, scouts) is a
// detection radius: a stealthed unit shows itself while an enemy of such a type is that close.
function EmpDetected takes unit u returns boolean
    local group g = CreateGroup()
    local unit v
    local boolean seen = false
    local real r
    call GroupEnumUnitsInRange(g, GetUnitX(u), GetUnitY(u), {{detectRadius}}, null)
    loop
        set v = FirstOfGroup(g)
        exitwhen v == null
        call GroupRemoveUnit(g, v)
        set r = LoadReal(EmpVet, GetUnitTypeId(v), 3)
        if not seen and r > 0.0 and EmpAlive(v) and IsUnitEnemy(v, GetOwningPlayer(u)) and IsUnitInRange(v, u, r) then
            set seen = true
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return seen
endfunction

function EmpStillEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    local integer h = GetHandleId(u)
    local real x = GetUnitX(u)
    local real y = GetUnitY(u)
    local boolean hide
    if EmpAlive(u) and (LoadBoolean(EmpVet, GetUnitTypeId(u), 2) or LoadBoolean(EmpVetUnit, h, 6)) and not IsUnitInGroup(u, EmpStealthGroup) then
        if not HaveSavedReal(EmpVetUnit, h, 7) or (x - LoadReal(EmpVetUnit, h, 7)) * (x - LoadReal(EmpVetUnit, h, 7)) + (y - LoadReal(EmpVetUnit, h, 8)) * (y - LoadReal(EmpVetUnit, h, 8)) > 4.0 then
            call SaveReal(EmpVetUnit, h, 7, x)
            call SaveReal(EmpVetUnit, h, 8, y)
            call SaveInteger(EmpVetUnit, h, 10, EmpTick)
        endif
        set hide = EmpTick - LoadInteger(EmpVetUnit, h, 10) >= {{stealth.delay}}
        if HaveSavedInteger(EmpVetUnit, h, 9) and EmpTick - LoadInteger(EmpVetUnit, h, 9) < {{stealth.afterFiring}} then
            set hide = false
        endif
        if hide and EmpDetected(u) then
            set hide = false
        endif
        if hide and GetUnitAbilityLevel(u, '{{ABILITY.invisibility}}') == 0 then
            call UnitAddAbility(u, '{{ABILITY.invisibility}}')
        elseif not hide and GetUnitAbilityLevel(u, '{{ABILITY.invisibility}}') > 0 then
            call UnitRemoveAbility(u, '{{ABILITY.invisibility}}')
        endif
    endif
    set u = null
    return false
endfunction

function EmpStillTick takes nothing returns nothing
    local integer i = 0
    if EmpStealthGroup == null then
        set EmpStealthGroup = CreateGroup()
    endif
    loop
        exitwhen i > {{RT.MAX_SIDE}}
        call GroupEnumUnitsOfPlayer(EmpTmpGroup, Player(i), Filter(function EmpStillEnum))
        set i = i + 1
    endloop
endfunction
