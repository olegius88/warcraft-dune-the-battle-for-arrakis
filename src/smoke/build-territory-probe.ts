// Territory probe: a plain mission (no scripts) on one territory's map, to tell a map that does not
// load (terrain / pathing data) from a script or object data problem.
// Usage: node src/smoke/build-territory-probe.ts 7, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\Territory7.w3x -Seconds 30

import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '../emperor/build-mission.ts';
import { readMeta } from '../emperor/mapxbf.ts';
import { ensureMap } from '../emperor/preview-map.ts';
import { buildMission } from '../emperor/mission.ts';
import { BUILD_DIR, RAW_DIR } from '../config/paths.ts';
import { territoryMapPrefix } from '../config/story.ts';
import { ART_ABILITY } from '../config/wc3.ts';

// node src/smoke/build-territory-probe.ts <territory> [script ...]: the scripts (phase 1, 2, ...) too
// flags as build-campaign.ts sets them: --briefing (of the first script), --no-icons, --autowin
const n = Number(process.argv[2] ?? 7);
const args = process.argv.slice(3);
const names = args.filter((a) => !a.startsWith('--'));
const flag = (f: string): boolean => args.includes(f);
const all = loadAll();
const meta = readMeta(path.join(ensureMap(territoryMapPrefix(n))[0] as string, 'test.xbf'));
const scripts = names.map((s, i) => ({ tok: fs.readFileSync(path.join(RAW_DIR, `${s}.tok`)), phase: i + 1, name: s }));
const m = buildMission({
  scripts, meta, ...all, name: `Territory ${n}`, playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x', debugName: `Territory${n}`,
  ...(flag('--briefing') && names[0] ? { briefing: all.ctx.textByKey(names[0]) ?? '' } : {}),
  ...(flag('--no-icons') ? { iconsInMap: false } : {}), ...(flag('--autowin') ? { autoWinSeconds: 15 } : {}),
  // --storm: a sandstorm at once; units of the enemy at it; is it there, does it move, what it does
  ...(flag('--storm') ? {
    extraStart: 'StormProbeRun',
    extraFunctions: `function StormProbeRun takes nothing returns nothing
    local real x0
    local real y0
    local integer k = 0
    local integer alive = 0
    local unit array us
    set EmpNormalConditions = false
    set EmpStormNext = 0
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set x0 = EmpStormX
    set y0 = EmpStormY
    call SetCameraPositionForPlayer(Player(0), x0, y0)
    call TriggerSleepAction(1.0)
    call SetCameraPositionForPlayer(Player(0), EmpStormX, EmpStormY)
    loop
        exitwhen k >= 8
        set us[k] = CreateUnit(Player(1), '${all.units.rawcode.get('ATTrike')}', x0 + GetRandomReal(-100, 100), y0 + GetRandomReal(-100, 100), 0.0)
        call PauseUnit(us[k], true)
        set k = k + 1
    endloop
    call TriggerSleepAction(6.0)
    set k = 0
    loop
        exitwhen k >= 8
        if EmpAlive(us[k]) then
            set alive = alive + 1
        endif
        set k = k + 1
    endloop
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("art:"${Object.entries(ART_ABILITY).map(([k, a]) => ` + " ${k}=" + GetAbilityEffectById('${a.id}', ${a.type}, 0)`).join('')})
    call Preload("storm on=" + I2S(IntegerTertiaryOp(EmpStormFx != null, 1, 0)) + " at " + I2S(R2I(x0)) + "," + I2S(R2I(y0)) + " moved=" + I2S(R2I(SquareRoot((EmpStormX - x0) * (EmpStormX - x0) + (EmpStormY - y0) * (EmpStormY - y0)))) + " trikes alive=" + I2S(alive) + "/8")
    call PreloadGenEnd("DuneSmoke\\\\storm.pld")
endfunction`,
  } : {}),
  // --mounds: spice mounds and fields at 5 s and after the first bursts (Size + Cost ticks = 60 s)
  ...(flag('--mounds') ? {
    extraStart: 'MoundProbeRun',
    extraFunctions: `function MoundProbeCount takes nothing returns string
    local group g = CreateGroup()
    local unit u
    local integer mounds = 0
    local integer fields = 0
    call GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_PASSIVE), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '${all.units.ids.spiceMound}' then
            set mounds = mounds + 1
        elseif GetUnitTypeId(u) == '${all.units.ids.spiceField}' then
            set fields = fields + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return "game s " + I2S(EmpTick / 25) + " mounds=" + I2S(mounds) + " fields=" + I2S(fields)
endfunction

function MoundProbeRun takes nothing returns nothing
    local string a
    set EmpNormalConditions = false
    call TriggerSleepAction(5.0)
    set a = MoundProbeCount()
    call TriggerSleepAction(65.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(a)
    call Preload(MoundProbeCount())
    call PreloadGenEnd("DuneSmoke\\\\mounds.pld")
endfunction`,
  } : {}),
});
const out = path.join(BUILD_DIR, 'test', `Territory${n}${args.map((s) => `-${s.replace(/^--/, '')}`).join('')}.w3x`);
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('territory probe ->', out);
