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
import { ART_ABILITY, TERRAIN, UNIT_FIELD } from '../config/wc3.ts';
import { TEX } from '../config/terrain.ts';
import { EFFECT_MAX_RADIUS } from '../config/models.ts';
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
// --vetrange: the trike's own attack range (WC3 units)
const trikeRange = Number(all.units.objects.find((o) => o.id === trike)?.mods.filter((m) => m.field === UNIT_FIELD.range).at(-1)?.value);
// --fxgrid: the played effects with their kind (0 death, 1 muzzle, 2 hit), once each
const fxShown = [...new Map([...all.units.effects.values()].flatMap((fx) => fx.map((m, k) => [m, k] as const)).filter(([m, k]) => m && (!flag('--fxhits') || k === 2))).entries()];
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
  // --vetrange: veterancy ExtraRange (ATTrike level 3: +50 %): a plain trike and one raised to level 3
  // the scripts' way (SetVeterancy) attack paused targets 1.25 x the base range away; the veteran
  // should fire from where it stands, as the same unit counted as a trike, its stats put back
  ...(flag('--vetrange') ? {
    extraStart: 'VetRangeRun',
    extraFunctions: `function VetRangeRow takes integer row, boolean vet returns unit
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0))) + row * 400.0
    local unit s = CreateUnit(Player(0), '${trike}', x, y, 0.0)
    local unit t = CreateUnit(Player(1), '${trike}', x + ${trikeRange * 1.25}, y, 180.0)
    call PauseUnit(t, true)
    call SetUnitInvulnerable(t, false)
    if vet then
        set EmpVetArgUnit = s
        set EmpVetArgLevel = 3
        call EmpVetSetFromArgs()
    endif
    // the probe's own data under the shooter's handle, past the veterancy children
    call SaveUnitHandle(EmpVetUnit, GetHandleId(s), 100, t)
    call SaveReal(EmpVetUnit, GetHandleId(s), 101, x)
    call SaveReal(EmpVetUnit, GetHandleId(s), 102, GetWidgetLife(t))
    set t = null
    return s
endfunction

function VetRangeLog takes unit s, integer row returns string
    return "row " + I2S(row) + " handle " + I2S(GetHandleId(s)) + " wc3 type " + I2S(GetUnitTypeId(s)) + " emp type " + I2S(EmpType(s)) + " level " + I2S(LoadInteger(EmpVetUnit, GetHandleId(s), 1)) + " damage " + I2S(BlzGetUnitBaseDamage(s, 0)) + " speed " + R2S(GetUnitMoveSpeed(s)) + " max " + I2S(BlzGetUnitMaxHP(s)) + " moved " + R2S(RAbsBJ(GetUnitX(s) - LoadReal(EmpVetUnit, GetHandleId(s), 101))) + " target lost " + R2S(LoadReal(EmpVetUnit, GetHandleId(s), 102) - GetWidgetLife(LoadUnitHandle(EmpVetUnit, GetHandleId(s), 100)))
endfunction

function VetRangeRun takes nothing returns nothing
    local unit a
    local unit b
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set a = VetRangeRow(0, false)
    set b = VetRangeRow(1, true)
    call TriggerSleepAction(1.0)
    call IssueTargetOrder(a, "attack", LoadUnitHandle(EmpVetUnit, GetHandleId(a), 100))
    call IssueTargetOrder(b, "attack", LoadUnitHandle(EmpVetUnit, GetHandleId(b), 100))
    call TriggerSleepAction(6.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("trike range ${trikeRange} target at ${trikeRange * 1.25} trike type ${trike}")
    call Preload(VetRangeLog(a, 0))
    call Preload(VetRangeLog(b, 1))
    call Preload("trikes of player 0 counted " + I2S(EmpCount('${trike}', 0)))
    call PreloadGenEnd("DuneSmoke\\\\vetrange.pld")
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
    set s = "port trikes before=" + I2S(before) + " at 30 s=" + I2S(PortProbeTrikes()) + " gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " waiting=" + I2S(LoadInteger(EmpPortTab, GetHandleId(LoadTimerHandle(EmpPortTab, GetHandleId(b), 2)), 6)) + " frigate " + PortProbeFrigate(b)
    call SetCameraPositionForPlayer(Player(0), GetUnitX(b), GetUnitY(b))
    call TriggerSleepAction(68.0)
    set s = s + " | at 98 s frigate " + PortProbeFrigate(b)
    call TriggerSleepAction(12.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s + " | at 110 s=" + I2S(PortProbeTrikes()) + " waiting=" + I2S(LoadInteger(EmpPortTab, GetHandleId(LoadTimerHandle(EmpPortTab, GetHandleId(b), 2)), 6)) + " pct=" + I2S(EmpPortPct[LoadInteger(EmpPortTab, '${trikeOrder}', 0)]) + " cost=" + I2S(LoadInteger(EmpPortTab, '${trikeOrder}', 1)))
    call PreloadGenEnd("DuneSmoke\\\\port.pld")
    set b = null
endfunction`,
  } : {}),
  // --portstock: the stock (Game.exe rule, mission starport.j EmpPortStockTick): a starport stands, the
  // trike stock is set to 2, four trike orders: two go on the way, two are refused; the frigate lands
  // them, the cart is empty again and the stock is still 2 (then grows every 40 s)
  ...(flag('--portstock') ? {
    extraStart: 'PortStockRun',
    extraFunctions: `function PortStockLine takes string at returns string
    local integer k = LoadInteger(EmpPortTab, '${trikeOrder}', 0)
    return at + ": stock=" + I2S(EmpPortStock[k]) + " cart=" + I2S(EmpPortCart[k]) + " all=" + I2S(EmpPortCartAll[0]) + " left=" + R2S(EmpPortStockLeft[0]) + " gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD))
endfunction

function PortStockRun takes nothing returns nothing
    local unit b
    local integer k = 0
    local string s
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    set s = PortStockLine("no starport")
    set b = CreateUnit(Player(0), '${all.units.rawcode.get('ATStarport')}', EmpEntrX[EmpEntranceFor(0)] * 0.5, EmpEntrY[EmpEntranceFor(0)] * 0.5, 270.0)
    call SetPlayerTechMaxAllowed(Player(0), '${trikeOrder}', -1)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 10000)
    call TriggerSleepAction(2.5)
    set s = s + " | " + PortStockLine("2.5 s")
    set EmpPortStock[LoadInteger(EmpPortTab, '${trikeOrder}', 0)] = 2
    loop
        exitwhen k >= 4
        call IssueImmediateOrderById(b, '${trikeOrder}')
        set k = k + 1
    endloop
    call TriggerSleepAction(15.0)
    set s = s + " | " + PortStockLine("orders +15 s")
    call TriggerSleepAction(100.0)
    set s = s + " | " + PortStockLine("landed +115 s")
    call TriggerSleepAction(42.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s + " | " + PortStockLine("+157 s"))
    call PreloadGenEnd("DuneSmoke\\\\portstock.pld")
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
  // --portqueue: two trike orders queued at 70 % and 130 %: final gold 9400 = TRAIN_START fires when
  // training begins (each order keeps its price), 9310 = at queueing (the second price overwrote the first)
  ...(flag('--portqueue') ? {
    extraStart: 'PortQueueRun',
    extraFunctions: `function PortQueueRun takes nothing returns nothing
    local unit b
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    set b = CreateUnit(Player(0), '${all.units.rawcode.get('ATStarport')}', EmpEntrX[EmpEntranceFor(0)] * 0.5, EmpEntrY[EmpEntranceFor(0)] * 0.5, 270.0)
    call SetPlayerTechMaxAllowed(Player(0), '${trikeOrder}', -1)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 10000)
    set EmpPortPct[LoadInteger(EmpPortTab, '${trikeOrder}', 0)] = 70
    call IssueImmediateOrderById(b, '${trikeOrder}')
    set EmpPortPct[LoadInteger(EmpPortTab, '${trikeOrder}', 0)] = 130
    call IssueImmediateOrderById(b, '${trikeOrder}')
    call TriggerSleepAction(6.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("portqueue gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " waiting=" + I2S(LoadInteger(EmpPortTab, GetHandleId(LoadTimerHandle(EmpPortTab, GetHandleId(b), 2)), 6)))
    call PreloadGenEnd("DuneSmoke\\\\portqueue.pld")
    set b = null
endfunction`,
  } : {}),
  // --fx: effects of Emperor (mission effects.j): trikes blow up one by one, a tank fires at infantry
  ...(flag('--fx') ? {
    extraStart: 'FxProbeRun',
    extraFunctions: `function FxProbeRun takes nothing returns nothing
    local real x
    local real y
    local integer k = 0
    local unit a
    local unit array t
    set EmpNormalConditions = false
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set x = EmpEntrX[EmpEntranceFor(0)] * 0.5
    set y = EmpEntrY[EmpEntranceFor(0)] * 0.5
    call SetCameraPositionForPlayer(Player(0), x, y)
    loop
        exitwhen k >= 3
        set t[k] = CreateUnit(Player(1), '${trike}', x - 300.0 + k * 300.0, y + 150.0, 270.0)
        call PauseUnit(t[k], true)
        set k = k + 1
    endloop
    set a = CreateUnit(Player(0), '${all.units.rawcode.get('ATMongoose') ?? trike}', x, y - 350.0, 90.0)
    call IssueTargetOrder(a, "attack", t[1])
    // two trikes of each side fire at each other (muzzle flashes)
    call CreateUnit(Player(0), '${trike}', x - 150.0, y - 250.0, 90.0)
    call CreateUnit(Player(0), '${trike}', x + 150.0, y - 250.0, 90.0)
    call CreateUnit(Player(1), '${trike}', x - 150.0, y + 350.0, 270.0)
    call CreateUnit(Player(1), '${trike}', x + 150.0, y + 350.0, 270.0)
    call TriggerSleepAction(6.0)
    set k = 0
    loop
        exitwhen k >= 3
        call KillUnit(t[k])
        call TriggerSleepAction(1.5)
        set k = k + 1
    endloop
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("fx trike death=" + LoadStr(EmpFxTab, '${trike}', 0) + " muzzle=" + LoadStr(EmpFxTab, '${trike}', 1))
    call PreloadGenEnd("DuneSmoke\\\\fx.pld")
    set a = null
endfunction`,
  } : {}),
  // --fxgrid: every played effect in turn at the centre of the screen, its name shown, every 2.5 s
  ...(flag('--fxgrid') ? {
    extraStart: 'FxGridRun',
    extraFunctions: `function FxGridTick takes nothing returns nothing
    local real x = EmpEntrX[EmpEntranceFor(0)] * 0.5
    local real y = EmpEntrY[EmpEntranceFor(0)] * 0.5
    local effect FxGridE
    local integer k = ModuloInteger(R2I(EmpTick / 62.5), ${fxShown.length})
${fxShown.map(([model, kind], i) => `    if k == ${i} then
        set FxGridE = AddSpecialEffect(${JSON.stringify(model).replace(/\\\\/g, '\\\\')}, x, y)
        call BlzSetSpecialEffectScale(FxGridE, ${Math.min(1, (EFFECT_MAX_RADIUS[kind] as number) / Math.max(1, all.units.effectRadius.get(model) ?? 1)).toFixed(4)})
        call DestroyEffect(FxGridE)
        call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 2.0, ${JSON.stringify(model.replace(/^.*\\\\/, ''))})
    endif`).join('\n')}
endfunction

function FxGridRun takes nothing returns nothing
    set EmpNormalConditions = false
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    call SetCameraPositionForPlayer(Player(0), EmpEntrX[EmpEntranceFor(0)] * 0.5, EmpEntrY[EmpEntranceFor(0)] * 0.5)
    call TimerStart(CreateTimer(), 2.5, true, function FxGridTick)
endfunction`,
  } : {}),
  // --behave: SideAIBehaviour* on side 1 while the AI runs it (forces.j EmpAiBehave): the values before,
  // after Aggressive twice (compounding), after Normal (no change); the side keeps its AI mode (8)
  ...(flag('--behave') ? {
    extraStart: 'BehaveProbeRun',
    extraFunctions: `function BehaveProbeLine takes string at returns string
    return at + ": on=" + I2S(IntegerTertiaryOp(EmpAiOn, 1, 0)) + " mode=" + I2S(EmpAIMode[1]) + " max1=" + I2S(EmpAiTMax[1]) + " max8=" + I2S(EmpAiTMax[8]) + " gap1=" + I2S(EmpAiTGapTicks[1]) + " gapS=" + R2S(EmpAiTGap[1]) + " first1=" + I2S(EmpAiTFirst[1]) + " min1=" + I2S(EmpAiTMinDef[1]) + " maxdef1=" + I2S(EmpAiTMaxDef[1]) + " def%=" + I2S(EmpAiDefPct) + " wander=" + I2S(EmpAiWander) + " walls=" + I2S(IntegerTertiaryOp(EmpAiBuildsDef, 1, 0)) + " scouts=" + I2S(EmpAiScoutTeams) + " wave left=" + R2S(TimerGetRemaining(EmpAiWaveTimer)) + " build period=" + R2S(TimerGetTimeout(EmpAiBuildTimer))
endfunction

function BehaveProbeRun takes nothing returns nothing
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    // one Preload line per stage: a line holds some 250 characters
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(BehaveProbeLine("start"))
    // the campaign enemy's start tuning (forces.j EmpAiCampaignTune): phase, tech level, skill
    call Preload("start skill=" + I2S(EmpAiSkill) + " base=" + I2S(EmpAiSkillBase) + " phase=" + I2S(EmpPhase) + " tech=" + I2S(EmpTechLevel))
    call EF_SideAIBehaviourAggressive(1)
    call Preload(BehaveProbeLine("aggressive"))
    call Preload("aggressive skill=" + I2S(EmpAiSkill))
    call EF_SideAIBehaviourAggressive(1)
    call Preload(BehaveProbeLine("aggressive x2"))
    call EF_SideAIBehaviourNormal(1)
    call Preload(BehaveProbeLine("normal"))
    call EF_SideAIBehaviourDefensive(1)
    call TriggerSleepAction(1.0)
    call Preload(BehaveProbeLine("defensive"))
    call PreloadGenEnd("DuneSmoke\\\\behave.pld")
endfunction`,
  } : {}),
  // --maintain: the base builder goes to maintenance at once (NumBuildings 1, MaintenanceDelay 3 s); the
  // AI report (CustomMapData\\DuneTest\\Territory9_AI.pld) shows its turns
  ...(flag('--maintain') ? {
    extraStart: 'MaintainProbeRun',
    extraFunctions: `function MaintainProbeRun takes nothing returns nothing
    local integer l = 1
    set EmpNormalConditions = false
    loop
        exitwhen l > ${BATTLE.AI_TECH_LEVELS}
        set EmpAiTBuildings[l] = 1
        set EmpAiTMaintDelay[l] = 3.0
        set l = l + 1
    endloop
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, 20000)
endfunction`,
  } : {}),
  // --losing: the AI's losing test (ai.j EmpAiLosingCase / Check): side 1 loses its refineries and
  // credits, the clock passes 15000 ticks; the case, then retreat (units leave) or last gasp (attack)
  ...(flag('--losing') ? {
    extraStart: 'LosingProbeRun',
    extraFunctions: `function LosingProbeKill takes nothing returns boolean
    local unit u = GetFilterUnit()
    if EmpAlive(u) and LoadBoolean(EmpAiTab, EmpType(u), 3) then
        call KillUnit(u)
    endif
    set u = null
    return false
endfunction

function LosingProbeRun takes nothing returns nothing
    local string s
    local group g = CreateGroup()
    set EmpNormalConditions = false
    call TriggerSleepAction(4.0)
    set s = "before: case=" + I2S(EmpAiLosingCase()) + " gold=" + I2S(EmpEnemyGold())
    call GroupEnumUnitsOfPlayer(g, Player(1), Filter(function LosingProbeKill))
    call DestroyGroup(g)
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, 0)
    call TriggerSleepAction(1.0)
    set s = s + " | no refinery, no credits: case=" + I2S(EmpAiLosingCase())
    set EmpTick = ${BATTLE.AI_LOSING.fromTicks}
    call EmpAiLosingCheck()
    set s = s + " | lost=" + I2S(IntegerTertiaryOp(EmpAiLost, 1, 0)) + " gone=" + I2S(IntegerTertiaryOp(EmpAiGone, 1, 0)) + " mode=" + I2S(EmpAIMode[1]) + " defPct=" + I2S(EmpAiDefPct)
    call TriggerSleepAction(1.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s)
    call PreloadGenEnd("DuneSmoke\\\\losing.pld")
    set g = null
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
