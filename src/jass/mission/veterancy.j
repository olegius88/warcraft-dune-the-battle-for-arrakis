// Veterancy (Rules.txt): the killer gets the victim's Score (assumed: Emperor's own docs are not
// available; thresholds such as ATKindjal 2/10/20 against Score = 1..2 per kill fit it).
// EmpVet[type]: child 0 = Score, 1 = level count, 2 = StealthedWhenStill of the type,
// level L at L*VET_SLOT_STRIDE + 1..9.
// EmpVetUnit[handle id]: 0 = score so far, 1 = level, 2..3 = original damage/armour,
// 6 = stealthed when still (veterancy), 7..8 = last x/y, 10 = still since (tick), 9 = last shot (tick),
// 11..13 = damage / speed / regeneration the veterancy set (put back after a morph), 14 = ExtraRange %
// the unit has, 15 = its WC3 type before the morph, 16 = the elite effect.
// ExtraRange: a level with it turns the unit into the veteran copy of its type (EmpVetRangeType,
// child RT.VET_MORPH_KEY + % = the Chaos ability). The unit stays the same one, but the morph resets
// damage, speed, regeneration and added abilities (src/smoke/build-morph-probe.ts, 2026-10-08):
// EmpVetMorphed puts them back once the type changed.
// Regression/feature test: test/emperor-mission.test.ts.
// regen: WC3 health per second (CanSelfRepair per Rules.txt repair period)
function EmpVetLevel takes integer t, integer lv, integer score, integer hp, integer dmg, integer arm, integer rng, integer spd, real regen, boolean elite, boolean stealth returns nothing
    local integer b = lv * {{RT.VET_SLOT_STRIDE}}
    call SaveInteger(EmpVet, t, b + 1, score)
    call SaveInteger(EmpVet, t, b + 2, hp)
    call SaveInteger(EmpVet, t, b + 3, dmg)
    call SaveInteger(EmpVet, t, b + 4, arm)
    call SaveInteger(EmpVet, t, b + 5, rng)
    call SaveInteger(EmpVet, t, b + 6, spd)
    call SaveReal(EmpVet, t, b + 7, regen)
    call SaveBoolean(EmpVet, t, b + 8, elite)
    call SaveBoolean(EmpVet, t, b + 9, stealth)
    if lv > LoadInteger(EmpVet, t, 1) then
        call SaveInteger(EmpVet, t, 1, lv)
    endif
endfunction

// t's copy with pct % more range (vet) and the Chaos ability that turns a unit of t into it (morph)
function EmpVetRangeType takes integer t, integer pct, integer vet, integer morph returns nothing
    call SaveInteger(EmpVet, t, {{RT.VET_MORPH_KEY}} + pct, morph)
    call SaveInteger(EmpVetBase, vet, 0, t)
endfunction

// type data of Rules.txt besides the levels: Score, StealthedWhenStill, AIThreat (the AI's default
// target priority, SetThreatLevel overrides it)
function EmpVetData takes nothing returns nothing
    set EmpVet = InitHashtable()
    set EmpVetUnit = InitHashtable()
    set EmpVetBase = InitHashtable()
    if EmpThreat == null then
        set EmpThreat = InitHashtable()
    endif
{{vetLines}}
endfunction

// what the veterancy set on u, again: a morph resets it to the veteran type's own values
function EmpVetRestore takes unit u returns nothing
    local integer h = GetHandleId(u)
    if HaveSavedInteger(EmpVetUnit, h, 11) then
        call BlzSetUnitBaseDamage(u, LoadInteger(EmpVetUnit, h, 11), 0)
    endif
    if HaveSavedInteger(EmpVetUnit, h, 12) then
        call SetUnitMoveSpeed(u, LoadInteger(EmpVetUnit, h, 12))
    endif
    if HaveSavedReal(EmpVetUnit, h, 13) then
        call BlzSetUnitRealField(u, UNIT_RF_HIT_POINTS_REGENERATION_RATE, LoadReal(EmpVetUnit, h, 13))
    endif
    // a stealth crate's invisibility (EmpStealthGroup); stealth when still adds its own back each tick
    if EmpStealthGroup != null and IsUnitInGroup(u, EmpStealthGroup) and GetUnitAbilityLevel(u, '{{ABILITY.invisibility}}') == 0 then
        call UnitAddAbility(u, '{{ABILITY.invisibility}}')
    endif
    // the elite mark again (whether an attachment outlives the morph was not checked)
    if HaveSavedHandle(EmpVetUnit, h, 16) then
        call DestroyEffect(LoadEffectHandle(EmpVetUnit, h, 16))
        call SaveEffectHandle(EmpVetUnit, h, 16, AddSpecialEffectTarget({{str EFFECT.elite}}, u, "origin"))
    endif
endfunction

// a morph shows a frame later: wait for the new type, then put the veterancy back
function EmpVetMorphed takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer k = GetHandleId(tm)
    local unit u = LoadUnitHandle(EmpVetUnit, k, 0)
    local integer n = LoadInteger(EmpVetUnit, k, 1) + 1
    if not EmpAlive(u) or GetUnitTypeId(u) != LoadInteger(EmpVetUnit, GetHandleId(u), 15) or n >= {{RT.VET_MORPH_TRIES}} then
        if EmpAlive(u) then
            call EmpVetRestore(u)
        endif
        call FlushChildHashtable(EmpVetUnit, k)
        call DestroyTimer(tm)
    else
        call SaveInteger(EmpVetUnit, k, 1, n)
    endif
    set tm = null
    set u = null
endfunction

function EmpVetApply takes unit u, integer lv returns nothing
    local integer t = EmpType(u)
    local timer tm
    local integer h = GetHandleId(u)
    local integer b = lv * {{RT.VET_SLOT_STRIDE}}
    local integer v
    local real r
    local real pct
    if not LoadBoolean(EmpVetUnit, h, 5) then
        call SaveInteger(EmpVetUnit, h, 2, BlzGetUnitBaseDamage(u, 0))
        call SaveReal(EmpVetUnit, h, 3, BlzGetUnitArmor(u))
        call SaveBoolean(EmpVetUnit, h, 5, true)
    endif
    set v = LoadInteger(EmpVet, t, b + 2)
    if v > 0 then
        set pct = GetUnitLifePercent(u)
        call BlzSetUnitMaxHP(u, v)
        call SetUnitLifePercentBJ(u, pct)
    endif
    set v = LoadInteger(EmpVet, t, b + 3)
    if v > 0 then
        call SaveInteger(EmpVetUnit, h, 11, R2I(LoadInteger(EmpVetUnit, h, 2) * (100 + v) / 100.0))
        call BlzSetUnitBaseDamage(u, LoadInteger(EmpVetUnit, h, 11), 0)
    endif
    set v = LoadInteger(EmpVet, t, b + 4)
    if v > 0 and v < 100 then
        // "v% less damage received": WC3 armour a absorbs 0.06a / (1 + 0.06a)
        set r = v / 100.0
        call BlzSetUnitArmor(u, LoadReal(EmpVetUnit, h, 3) + r / ({{real ARMOR_REDUCTION}} * (1.0 - r)))
    endif
    set v = LoadInteger(EmpVet, t, b + 6)
    if v > 0 then
        call SaveInteger(EmpVetUnit, h, 12, v)
        call SetUnitMoveSpeed(u, v)
    endif
    if LoadReal(EmpVet, t, b + 7) > 0.0 then
        call SaveReal(EmpVetUnit, h, 13, LoadReal(EmpVet, t, b + 7))
        call BlzSetUnitRealField(u, UNIT_RF_HIT_POINTS_REGENERATION_RATE, LoadReal(EmpVet, t, b + 7))
    endif
    if LoadBoolean(EmpVet, t, b + 9) then
        call SaveBoolean(EmpVetUnit, h, 6, true)
    endif
    if LoadBoolean(EmpVet, t, b + 8) and not HaveSavedHandle(EmpVetUnit, h, 16) then
        call SaveEffectHandle(EmpVetUnit, h, 16, AddSpecialEffectTarget({{str EFFECT.elite}}, u, "origin"))
    endif
    // ExtraRange: into the veteran copy of the type (1.31.1 cannot lengthen one unit's range: the
    // weapon range setter changes nothing, src/smoke/build-range-probe.ts); the stats come back in
    // EmpVetMorphed once the type changed
    set v = LoadInteger(EmpVet, t, b + 5)
    if v > 0 and v != LoadInteger(EmpVetUnit, h, 14) and HaveSavedInteger(EmpVet, t, {{RT.VET_MORPH_KEY}} + v) then
        call SaveInteger(EmpVetUnit, h, 14, v)
        call SaveInteger(EmpVetUnit, h, 15, GetUnitTypeId(u))
        call UnitAddAbility(u, LoadInteger(EmpVet, t, {{RT.VET_MORPH_KEY}} + v))
        set tm = CreateTimer()
        call SaveUnitHandle(EmpVetUnit, GetHandleId(tm), 0, u)
        call TimerStart(tm, {{real RT.VET_MORPH_CHECK}}, true, function EmpVetMorphed)
        set tm = null
    endif
    call DestroyEffect(AddSpecialEffectTarget({{str EFFECT.levelUp}}, u, "origin"))
endfunction

// SetVeterancy(obj, level) of the scripts (EF_SetVeterancy hands the arguments over in globals):
// apply the missing levels up to the wanted one and give the unit the score of that level.
function EmpVetSetFromArgs takes nothing returns nothing
    local unit u = EmpVetArgUnit
    local integer t
    local integer h
    local integer lv
    local integer n
    if u == null or not EmpAlive(u) then
        set u = null
        return
    endif
    set t = EmpType(u)
    set h = GetHandleId(u)
    set lv = LoadInteger(EmpVetUnit, h, 1)
    set n = LoadInteger(EmpVet, t, 1)
    loop
        exitwhen lv >= EmpVetArgLevel or lv >= n
        set lv = lv + 1
        call EmpVetApply(u, lv)
    endloop
    call SaveInteger(EmpVetUnit, h, 1, lv)
    if lv > 0 then
        call SaveInteger(EmpVetUnit, h, 0, IMaxBJ(LoadInteger(EmpVetUnit, h, 0), LoadInteger(EmpVet, t, lv * {{RT.VET_SLOT_STRIDE}} + 1)))
    endif
    set u = null
endfunction

function EmpOnKill takes nothing returns nothing
    local unit k = GetKillingUnit()
    local unit d = GetTriggerUnit()
    local integer t
    local integer h
    local integer s = 1
    local integer lv
    local integer n
    // handle ids are reused: forget the dead unit's veterancy
    call FlushChildHashtable(EmpVetUnit, GetHandleId(d))
    if k == null or not EmpAlive(k) or IsUnitType(k, UNIT_TYPE_STRUCTURE) or GetOwningPlayer(k) == GetOwningPlayer(d) then
        set k = null
        set d = null
        return
    endif
    set t = EmpType(d)
    if HaveSavedInteger(EmpVet, t, 0) then
        set s = LoadInteger(EmpVet, t, 0)
    endif
    set t = EmpType(k)
    set h = GetHandleId(k)
    set s = LoadInteger(EmpVetUnit, h, 0) + s
    call SaveInteger(EmpVetUnit, h, 0, s)
    set lv = LoadInteger(EmpVetUnit, h, 1)
    set n = LoadInteger(EmpVet, t, 1)
    loop
        exitwhen lv >= n
        exitwhen LoadInteger(EmpVet, t, (lv + 1) * {{RT.VET_SLOT_STRIDE}} + 1) > s
        set lv = lv + 1
        call EmpVetApply(k, lv)
    endloop
    call SaveInteger(EmpVetUnit, h, 1, lv)
    set k = null
    set d = null
endfunction
