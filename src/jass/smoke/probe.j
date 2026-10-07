// Engine probe: answers questions the docs do not settle, written to CustomMapData\{{file}}.
// Results of 2026-10-07 (1.31.1): BlzGetUnitBaseDamage index 0 = first weapon (footman 11) and
// BlzSetUnitBaseDamage(.., 0) works; BlzGet/SetUnitWeaponRealField(ATTACK_RANGE) read 0 and do not
// change the footman's range at index 0 or 1; UnitAddAbility('Apiv') succeeds; GetAbilityEffectById
// TARGET art of AUin/AHfs is empty, CASTER art of AOws is set.
//   rifleman (range 400): range / cooldown / damage-point at index 0..1, range after set at 0 and 1
//   art<code><type>: GetAbilityEffectById of the art abilities for effect types 0..5
function ProbeArt takes integer a returns string
    local string s = ""
    local integer t = 0
    loop
        exitwhen t > 5
        set s = s + " " + I2S(t) + ":" + GetAbilityEffectById(a, ConvertEffectType(t), 0)
        set t = t + 1
    endloop
    return s
endfunction

function ProbeRun takes nothing returns nothing
    local unit u = CreateUnit(Player(0), 'hrif', 0.0, 0.0, 270.0)
    local string s = "rng0=" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 0)) + " rng1=" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 1))
    set s = s + " cd0=" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_BASE_COOLDOWN, 0)) + " cd1=" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_BASE_COOLDOWN, 1))
    set s = s + " acq=" + R2S(GetUnitAcquireRange(u))
    call BlzSetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 1, 777.0)
    set s = s + " set1=" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 0)) + "/" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 1))
    call BlzSetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 0, 666.0)
    set s = s + " set0=" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 0)) + "/" + R2S(BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 1))
    set s = s + " |artNuke" + ProbeArt('{{ART_ABILITY.nuke.id}}') + " |artBomb" + ProbeArt('{{ART_ABILITY.bomb.id}}')
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s)
    call PreloadGenEnd({{str file}})
    set u = null
endfunction
