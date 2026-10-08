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
import { ART_ABILITY, TERRAIN } from '../config/wc3.ts';
import { TEX } from '../config/terrain.ts';
import * as BATTLE from '../config/battle.ts';

// node src/smoke/build-territory-probe.ts <territory> [script ...]: the scripts (phase 1, 2, ...) too
// flags as build-campaign.ts sets them: --briefing (of the first script), --no-icons, --autowin
const n = Number(process.argv[2] ?? 7);
const args = process.argv.slice(3);
const names = args.filter((a) => !a.startsWith('--'));
const flag = (f: string): boolean => args.includes(f);
const all = loadAll();
const trike = all.units.rawcode.get('ATTrike') as string;
const trikeOrder = [...all.units.portOrders].find(([, real]) => real === trike)?.[0] as string;
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
    local integer infAlive = 0
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
        exitwhen k >= 16
        // even: trikes (StormDamage class 0, never picked up), odd: infantry (class 2)
        set us[k] = CreateUnit(Player(1), IntegerTertiaryOp(ModuloInteger(k, 2) == 0, '${all.units.rawcode.get('ATTrike')}', '${all.units.rawcode.get('ATInfantry')}'), x0 + GetRandomReal(-100, 100), y0 + GetRandomReal(-100, 100), 0.0)
        call PauseUnit(us[k], true)
        set k = k + 1
    endloop
    call TriggerSleepAction(6.0)
    set k = 0
    loop
        exitwhen k >= 16
        if EmpAlive(us[k]) and ModuloInteger(k, 2) == 0 then
            set alive = alive + 1
        elseif EmpAlive(us[k]) then
            set infAlive = infAlive + 1
        endif
        set k = k + 1
    endloop
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("art:"${Object.entries(ART_ABILITY).map(([k, a]) => ` + " ${k}=" + GetAbilityEffectById('${a.id}', ${a.type}, 0)`).join('')})
    call Preload("storm on=" + I2S(IntegerTertiaryOp(EmpStormFx != null, 1, 0)) + " at " + I2S(R2I(x0)) + "," + I2S(R2I(y0)) + " moved=" + I2S(R2I(SquareRoot((EmpStormX - x0) * (EmpStormX - x0) + (EmpStormY - y0) * (EmpStormY - y0)))) + " trikes alive=" + I2S(alive) + "/8 infantry alive=" + I2S(infAlive) + "/8")
    call PreloadGenEnd("DuneSmoke\\\\storm.pld")
endfunction`,
  } : {}),
  // --port: a starport sells trike orders at the current price (Rules.txt Cost * EmpPortPct %); a
  // frigate brings them after FrigateCountdown, StarportMaxDeliverySingle at a time
  ...(flag('--port') ? {
    extraStart: 'PortProbeRun',
    extraFunctions: `function PortProbeTrikes takes nothing returns integer
    local group g = CreateGroup()
    local integer n = 0
    local unit u
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '${trike}' then
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

// the player's frigates: shown or hidden, distance to the starport b
function PortProbeFrigate takes unit b returns string
    local group g = CreateGroup()
    local string r = ""
    local unit u
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '${all.units.rawcode.get('Frigate')}' then
            set r = r + "[hidden=" + I2S(IntegerTertiaryOp(IsUnitHidden(u), 1, 0)) + " d=" + I2S(R2I(SquareRoot((GetUnitX(u) - GetUnitX(b)) * (GetUnitX(u) - GetUnitX(b)) + (GetUnitY(u) - GetUnitY(b)) * (GetUnitY(u) - GetUnitY(b))))) + " speed=" + I2S(R2I(GetUnitDefaultMoveSpeed(u))) + "]"
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return r
endfunction

function PortProbeRun takes nothing returns nothing
    local unit b
    local integer before
    local integer k = 0
    local string s
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    set b = CreateUnit(Player(0), '${all.units.rawcode.get('ATStarport')}', EmpEntrX[EmpEntranceFor(0)] * 0.5, EmpEntrY[EmpEntranceFor(0)] * 0.5, 270.0)
    call SetPlayerTechMaxAllowed(Player(0), '${trikeOrder}', -1)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 10000)
    // a price away from 100 %, so that the difference shows
    set EmpPortPct[LoadInteger(EmpPortTab, '${trikeOrder}', 0)] = 70
    set before = PortProbeTrikes()
    // seven orders: the first frigate brings six, one waits for the next
    loop
        exitwhen k >= 7
        call IssueImmediateOrderById(b, '${trikeOrder}')
        set k = k + 1
    endloop
    call TriggerSleepAction(30.0)
    set s = "port trikes before=" + I2S(before) + " at 30 s=" + I2S(PortProbeTrikes()) + " gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " waiting=" + I2S(LoadInteger(EmpPortTab, GetHandleId(b), 1)) + " frigate " + PortProbeFrigate(b)
    call SetCameraPositionForPlayer(Player(0), GetUnitX(b), GetUnitY(b))
    call TriggerSleepAction(68.0)
    set s = s + " | at 98 s frigate " + PortProbeFrigate(b)
    call TriggerSleepAction(12.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s + " | at 110 s=" + I2S(PortProbeTrikes()) + " waiting=" + I2S(LoadInteger(EmpPortTab, GetHandleId(b), 1)) + " pct=" + I2S(EmpPortPct[LoadInteger(EmpPortTab, '${trikeOrder}', 0)]) + " cost=" + I2S(LoadInteger(EmpPortTab, '${trikeOrder}', 1)))
    call PreloadGenEnd("DuneSmoke\\\\port.pld")
    set b = null
endfunction`,
  } : {}),
  // --harv: the player's harvesters go, a refinery of his stays: one is back after HarvReplacementDelay
  ...(flag('--harv') ? {
    extraStart: 'HarvProbeRun',
    extraFunctions: `function HarvProbeCount takes nothing returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '${all.units.rawcode.get('Harvester')}' then
            set n = n + 1
            call RemoveUnit(u)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

function HarvProbeRun takes nothing returns nothing
    local integer before
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    call CreateUnit(Player(0), '${all.units.rawcode.get('ATRefinery')}', EmpEntrX[EmpEntranceFor(0)], EmpEntrY[EmpEntranceFor(0)], 270.0)
    set before = HarvProbeCount()
    call TriggerSleepAction(46.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("harvesters removed=" + I2S(before) + " after 46 s=" + I2S(HarvProbeCount()))
    call PreloadGenEnd("DuneSmoke\\\\harv.pld")
endfunction`,
  } : {}),
  // --builders: all the player's builders go; a yard of his gives them again within YARD_CHECK_PERIOD
  ...(flag('--builders') ? {
    extraStart: 'BuildersProbeRun',
    extraFunctions: `function BuildersProbeCount takes boolean remove returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and (${(['AT', 'HK', 'OR'] as const).flatMap((c) => [all.units.ids.builders[c], all.units.ids.defenceBuilders[c], all.units.ids.allyBuilders[c]]).map((id) => `GetUnitTypeId(u) == '${id}'`).join(' or ')}) then
            set n = n + 1
            if remove then
                call RemoveUnit(u)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

function BuildersProbeRun takes nothing returns nothing
    local integer first
    local integer removed
    set EmpNormalConditions = false
    call TriggerSleepAction(1.0)
    call CreateUnit(Player(0), '${all.units.rawcode.get('ATConYard')}', EmpEntrX[EmpEntranceFor(0)], EmpEntrY[EmpEntranceFor(0)], 270.0)
    call TriggerSleepAction(${BATTLE.YARD_CHECK_PERIOD * 2 + 1}.0)
    set first = BuildersProbeCount(false)
    set removed = BuildersProbeCount(true)
    call TriggerSleepAction(${BATTLE.YARD_CHECK_PERIOD * 2 + 1}.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("builders first=" + I2S(first) + " removed=" + I2S(removed) + " after=" + I2S(BuildersProbeCount(false)))
    call PreloadGenEnd("DuneSmoke\\\\builders.pld")
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

// spice ground cells within 6 tiles of the mounds seen at the start (the bloom patch, EmpMoundPatch)
function MoundProbeSpice takes real x, real y returns integer
    local integer n = 0
    local integer dx
    local integer dy
        set dy = -6
        loop
            exitwhen dy > 6
            set dx = -6
            loop
                exitwhen dx > 6
                if GetTerrainType(x + dx * 128.0, y + dy * 128.0) == '${TERRAIN.ground[TEX.SPICE]}' then
                    set n = n + 1
                endif
                set dx = dx + 1
            endloop
            set dy = dy + 1
        endloop
    return n
endfunction

function MoundProbeRun takes nothing returns nothing
    local string a
    local group g = CreateGroup()
    local unit u
    local real array mx
    local real array my
    local integer mn = 0
    local integer i
    local integer before = 0
    local integer after = 0
    set EmpNormalConditions = false
    call TriggerSleepAction(5.0)
    call GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_PASSIVE), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '${all.units.ids.spiceMound}' then
            set mx[mn] = GetUnitX(u)
            set my[mn] = GetUnitY(u)
            set before = before + MoundProbeSpice(mx[mn], my[mn])
            set mn = mn + 1
        endif
    endloop
    call DestroyGroup(g)
    set a = MoundProbeCount() + " spice cells=" + I2S(before)
    call TriggerSleepAction(65.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(a)
    set i = 0
    loop
        exitwhen i >= mn
        set after = after + MoundProbeSpice(mx[i], my[i])
        set i = i + 1
    endloop
    call Preload(MoundProbeCount() + " spice cells=" + I2S(after))
    call PreloadGenEnd("DuneSmoke\\\\mounds.pld")
endfunction`,
  } : {}),
});
const out = path.join(BUILD_DIR, 'test', `Territory${n}${args.map((s) => `-${s.replace(/^--/, '')}`).join('')}.w3x`);
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('territory probe ->', out);
