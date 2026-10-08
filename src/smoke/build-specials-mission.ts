// Special abilities in a real mission map (runtime src/jass/mission/specials.j): Deviator, Contaminator,
// Leech, Engineer, Saboteur and crushing, each on enemy units placed for the test.
// Usage: node src/smoke/build-specials-mission.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\SpMission.w3x -Seconds 60

import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '../emperor/build-mission.ts';
import { readMeta } from '../emperor/mapxbf.ts';
import { ensureMap } from '../emperor/preview-map.ts';
import { buildMission } from '../emperor/mission.ts';
import { specialAbilities } from '../emperor/specials.ts';
import { str, real } from '../wc3/jass.ts';
import { BUILD_DIR } from '../config/paths.ts';
import { TICKS_PER_SECOND } from '../config/scale.ts';
import { UI_EVENTS } from '../config/runtime.ts';

const all = loadAll();
const id = (name: string): string => `'${all.units.rawcode.get(name)}'`;
const sp = specialAbilities(all.rules);
const crusher = sp.crushers.find((n) => all.units.rawcode.has(n) && n.startsWith('AT')) ?? sp.crushers[0] as string;
const crushable = sp.crushable.find((n) => all.units.rawcode.has(n) && n.startsWith('HK')) ?? sp.crushable[0] as string;
const deviate = sp.deviateTicks / TICKS_PER_SECOND;
const fn = `function SpmLog takes string s returns nothing
    local integer i = 0
    set EmpAiLogLine[EmpAiLogCount] = s + " [sp ticks " + I2S(EmpSpTicks) + ", game s " + I2S(EmpTick / 25) + "]"
    set EmpAiLogCount = EmpAiLogCount + 1
    call PreloadGenClear()
    call PreloadGenStart()
    loop
        exitwhen i >= EmpAiLogCount
        call Preload(EmpAiLogLine[i])
        set i = i + 1
    endloop
    call PreloadGenEnd(${str('DuneSmoke\\spmission.pld')})
endfunction

function SpmOwner takes unit u returns string
    if GetUnitTypeId(u) == 0 then
        return "removed"
    elseif not EmpAlive(u) then
        return "dead"
    endif
    return "p" + I2S(GetPlayerId(GetOwningPlayer(u)))
endfunction

// only the test's units: every unit of the other sides goes (their bases shot the first probe's
// engineer and saboteur)
function SpmClear takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    call GroupEnumUnitsInRect(g, bj_mapInitialPlayableArea, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetOwningPlayer(u) != Player(0) and GetOwningPlayer(u) != Player(PLAYER_NEUTRAL_PASSIVE) then
            call RemoveUnit(u)
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

// the scan of EmpSpTick, counted: units in the playable area, repairers, crushers
function SpmScan takes string label returns nothing
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    local integer r = 0
    local integer c = 0
    local integer p0 = 0
    call GroupEnumUnitsInRect(g, bj_mapInitialPlayableArea, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set n = n + 1
        if GetOwningPlayer(u) == Player(0) then
            set p0 = p0 + 1
        endif
        if LoadInteger(EmpSpTab, GetUnitTypeId(u), 0) == 6 then
            set r = r + 1
        endif
        if LoadBoolean(EmpSpTab, GetUnitTypeId(u), 9) then
            set c = c + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    call SpmLog(label + ": units=" + I2S(n) + " p0=" + I2S(p0) + " repairers=" + I2S(r) + " crushers=" + I2S(c) + " | EmpSpTick last scanned=" + I2S(EmpSpScanned))
endfunction

function SpMissionRun takes nothing returns nothing
    local real x = (EmpMapMinX + EmpMapMaxX) / 2.0
    local real y = (EmpMapMinY + EmpMapMaxY) / 2.0 - 2500.0
    local unit a
    local unit t
    local real hp
    local integer k
    local string said
    call TriggerSleepAction(6.0)
    // no win when the other sides are gone: the victory screen paused the game at 28 s
    set EmpNormalConditions = false
    call SpmClear()
    call SpmLog("sp ticks in=" + I2S(EmpSpTicks) + " out=" + I2S(EmpSpTicksDone))
    // Deviator: the tank fights for player 0, then goes back (the deviator leaves after its hit, or it
    // would take the tank again)
    set a = CreateUnit(Player(0), ${id('ORDeviator')}, x, y, 0.0)
    set t = CreateUnit(Player(1), ${id('ATMinotaurus')}, x + 500.0, y, 180.0)
    call IssueTargetOrder(a, "attack", t)
    call TriggerSleepAction(4.0)
    call SpmLog("deviator: tank owner=" + SpmOwner(t))
    call RemoveUnit(a)
    call TriggerSleepAction(${real(deviate)})
    call SpmLog("deviator after duration: tank owner=" + SpmOwner(t))
    call RemoveUnit(t)
    // Contaminator: the infantryman dies, a contaminator of player 0 comes out
    set y = y + 700.0
    set a = CreateUnit(Player(0), ${id('TLContaminator')}, x, y, 0.0)
    set t = CreateUnit(Player(1), ${id('ATInfantry')}, x + 120.0, y, 180.0)
    call IssueTargetOrder(a, "attack", t)
    call TriggerSleepAction(4.0)
    call SpmLog("contaminator: target=" + SpmOwner(t) + " contaminators of p0 near=" + I2S(EmpCount(0, ${id('TLContaminator')})))
    // Leech: the tank loses health while the leech holds on
    set y = y + 700.0
    set a = CreateUnit(Player(0), ${id('TLLeech')}, x, y, 0.0)
    set t = CreateUnit(Player(1), ${id('ATMinotaurus')}, x + 400.0, y, 180.0)
    call PauseUnit(t, true)
    call IssueTargetOrder(a, "attack", t)
    call TriggerSleepAction(6.0)
    call IssueImmediateOrder(a, "stop")
    call RemoveUnit(a)
    set hp = GetWidgetLife(t)
    call TriggerSleepAction(3.0)
    call SpmLog("leech: tank health " + I2S(R2I(hp)) + " -> " + I2S(R2I(GetWidgetLife(t))) + " (leech removed, still drained)")
    call RemoveUnit(t)
    // Engineer: takes the barracks over
    set y = y + 900.0
    set t = CreateUnit(Player(1), ${id('ATBarracks')}, x + 600.0, y, 270.0)
    set a = CreateUnit(Player(0), ${id('HKEngineer')}, x, y, 0.0)
    call IssuePointOrder(a, "move", GetUnitX(t), GetUnitY(t))
    call TriggerSleepAction(2.0)
    call SpmLog("engineer after 2 s: at " + I2S(R2I(GetUnitX(a) - x)) + "," + I2S(R2I(GetUnitY(a) - y)) + " order=" + I2S(GetUnitCurrentOrder(a)) + " barracks at " + I2S(R2I(GetUnitX(t) - x)) + "," + I2S(R2I(GetUnitY(t) - y)) + " paused=" + I2S(IntegerTertiaryOp(IsUnitPaused(a), 1, 0)) + " speed=" + R2S(GetUnitMoveSpeed(a)))
    call TriggerSleepAction(6.0)
    call SpmLog("engineer: barracks owner=" + SpmOwner(t) + " engineer=" + SpmOwner(a) + " kind=" + I2S(LoadInteger(EmpSpTab, GetUnitTypeId(a), 0)) + " engineerable=" + I2S(IntegerTertiaryOp(LoadBoolean(EmpSpTab, GetUnitTypeId(t), 8), 1, 0)) + " centre distance=" + I2S(R2I(SquareRoot((GetUnitX(a) - GetUnitX(t)) * (GetUnitX(a) - GetUnitX(t)) + (GetUnitY(a) - GetUnitY(t)) * (GetUnitY(a) - GetUnitY(t))))) + " in range 48=" + I2S(IntegerTertiaryOp(IsUnitInRange(a, t, 48.0), 1, 0)) + " 160=" + I2S(IntegerTertiaryOp(IsUnitInRange(a, t, 160.0), 1, 0)))
    call EmpSpTick()
    call SpmLog("engineer after a direct EmpSpTick: barracks owner=" + SpmOwner(t) + " engineer=" + SpmOwner(a))
    // Saboteur: blows the windtrap up
    set y = y + 900.0
    set t = CreateUnit(Player(1), ${id('ATSmWindtrap')}, x + 600.0, y, 270.0)
    set a = CreateUnit(Player(0), ${id('ORSaboteur')}, x, y, 0.0)
    call IssuePointOrder(a, "move", GetUnitX(t), GetUnitY(t))
    call TriggerSleepAction(8.0)
    call SpmLog("saboteur: windtrap=" + SpmOwner(t) + " saboteur=" + SpmOwner(a))
    // Crushing: ${crusher} drives over ${crushable}
    set y = y + 900.0
    set t = CreateUnit(Player(1), ${id(crushable)}, x + 300.0, y, 180.0)
    call PauseUnit(t, true)
    set a = CreateUnit(Player(0), ${id(crusher)}, x, y, 0.0)
    call IssuePointOrder(a, "move", x + 700.0, y)
    set hp = 100000.0
    set k = 0
    loop
        exitwhen k >= 60
        call TriggerSleepAction(0.1)
        set hp = RMinBJ(hp, SquareRoot((GetUnitX(a) - GetUnitX(t)) * (GetUnitX(a) - GetUnitX(t)) + (GetUnitY(a) - GetUnitY(t)) * (GetUnitY(a) - GetUnitY(t))))
        set k = k + 1
    endloop
    call SpmLog("crush: infantry=" + SpmOwner(t) + " closest centre distance=" + I2S(R2I(hp)) + " crusher listed=" + I2S(IntegerTertiaryOp(IsUnitInGroup(a, EmpSpCrushers), 1, 0)))
    // Repair vehicle: a damaged tank of its side within range regains health
    set y = y + 900.0
    set t = CreateUnit(Player(0), ${id('ATMinotaurus')}, x + 300.0, y, 180.0)
    call SetWidgetLife(t, GetUnitState(t, UNIT_STATE_MAX_LIFE) * 0.5)
    set hp = GetWidgetLife(t)
    set a = CreateUnit(Player(0), ${id('ATRepairUnit')}, x, y, 0.0)
    call TriggerSleepAction(4.0)
    call SpmScan("scan with the repairer")
    call SpmLog("repair: tank health " + I2S(R2I(hp)) + " -> " + I2S(R2I(GetWidgetLife(t))) + " repairer kind=" + I2S(LoadInteger(EmpSpTab, GetUnitTypeId(a), 0)) + " heal/s=" + R2S(LoadReal(EmpSpTab, GetUnitTypeId(a), 1)) + " range=" + R2S(LoadReal(EmpSpTab, GetUnitTypeId(a), 2)))
    call EmpSpRepair(a, 100.0, 1000.0)
    call SpmLog("repair after a direct EmpSpRepair(100): " + I2S(R2I(GetWidgetLife(t))))
    call SpmLog("sp ticks in=" + I2S(EmpSpTicks) + " out=" + I2S(EmpSpTicksDone))
    // in-game announcements made during the probe (helpers.j EmpUiSay: EmpUiNext set when spoken)
    set said = "announced:"
${UI_EVENTS.map(([n], i) => `    if EmpUiNext[${i + 1}] > 0 then\n        set said = said + " ${n}"\n    endif`).join('\n')}
    call SpmLog(said)
    call SpmLog("done")
    set a = null
    set t = null
endfunction`;
const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
const m = buildMission({
  scripts: [], meta, ...all, name: 'Special abilities', playerHouse: 'Harkonnen', kind: 'attack', territoryBattle: true, hubMap: 'HK_Hub.w3x',
  debugName: 'SpMission', extraFunctions: fn, extraStart: 'SpMissionRun',
});
const out = path.join(BUILD_DIR, 'test', 'SpMission.w3x');
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('special abilities probe ->', out, crusher, crushable);
