// Veterancy (Rules.txt): the killer gets the victim's Score (assumed: Emperor's own docs are not
// available; thresholds such as ATKindjal 2/10/20 against Score = 1..2 per kill fit it).
// EmpVet[type]: child 0 = Score, 1 = level count, 2 = StealthedWhenStill of the type,
// level L at L*VET_SLOT_STRIDE + 1..9.
// EmpVetUnit[handle id]: 0 = score so far, 1 = level, 2..3 = original damage/armour,
// 6 = stealthed when still (veterancy), 7..8 = last x/y, 10 = still since (tick), 9 = last shot (tick).
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

// type data of Rules.txt besides the levels: Score, StealthedWhenStill, AIThreat (the AI's default
// target priority, SetThreatLevel overrides it)
function EmpVetData takes nothing returns nothing
    set EmpVet = InitHashtable()
    set EmpVetUnit = InitHashtable()
    if EmpThreat == null then
        set EmpThreat = InitHashtable()
    endif
{{vetLines}}
endfunction

function EmpVetApply takes unit u, integer lv returns nothing
    local integer t = GetUnitTypeId(u)
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
        call BlzSetUnitBaseDamage(u, R2I(LoadInteger(EmpVetUnit, h, 2) * (100 + v) / 100.0), 0)
    endif
    set v = LoadInteger(EmpVet, t, b + 4)
    if v > 0 and v < 100 then
        // "v% less damage received": WC3 armour a absorbs 0.06a / (1 + 0.06a)
        set r = v / 100.0
        call BlzSetUnitArmor(u, LoadReal(EmpVetUnit, h, 3) + r / ({{real ARMOR_REDUCTION}} * (1.0 - r)))
    endif
    // TODO(veterancy): ExtraRange (8 levels in Rules.txt, +25..50 %) is not applied. In 1.31.1
    // BlzGet/SetUnitWeaponRealField(ATTACK_RANGE) read 0 (src/smoke/build-probe.ts, 2026-10-07) and do
    // not change how far the unit shoots either: a rifleman set to 900 at index 0, 1 or both still
    // walked the same 243 units up to a target 700 away before firing, like the unchanged one
    // (src/smoke/build-range-probe.ts, 2026-10-08). Swapping in a veteran unit type would break the
    // scripts' references to the unit. Needs a per-unit range bonus ability (none verified yet).
    set v = LoadInteger(EmpVet, t, b + 6)
    if v > 0 then
        call SetUnitMoveSpeed(u, v)
    endif
    if LoadReal(EmpVet, t, b + 7) > 0.0 then
        call BlzSetUnitRealField(u, UNIT_RF_HIT_POINTS_REGENERATION_RATE, LoadReal(EmpVet, t, b + 7))
    endif
    if LoadBoolean(EmpVet, t, b + 9) then
        call SaveBoolean(EmpVetUnit, h, 6, true)
    endif
    if LoadBoolean(EmpVet, t, b + 8) then
        call AddSpecialEffectTarget({{str EFFECT.elite}}, u, "origin")
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
    set t = GetUnitTypeId(u)
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
    set t = GetUnitTypeId(d)
    if HaveSavedInteger(EmpVet, t, 0) then
        set s = LoadInteger(EmpVet, t, 0)
    endif
    set t = GetUnitTypeId(k)
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
