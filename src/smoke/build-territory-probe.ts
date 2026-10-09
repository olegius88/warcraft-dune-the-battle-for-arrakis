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
import { CACHE_CATEGORY } from '../config/campaign.ts';
import { ART_ABILITY, TERRAIN, UNIT_FIELD } from '../config/wc3.ts';
import { TEX } from '../config/terrain.ts';
import { EFFECT_MAX_RADIUS } from '../config/models.ts';
import * as BATTLE from '../config/battle.ts';
import { RANGE_PER_TILE } from '../config/scale.ts';

// node src/smoke/build-territory-probe.ts <territory> [script ...]: the scripts (phase 1, 2, ...) too
// flags as build-campaign.ts sets them: --briefing (of the first script), --no-icons, --autowin
const n = Number(process.argv[2] ?? 7);
const args = process.argv.slice(3);
const names = args.filter((a) => !a.startsWith('--'));
const flag = (f: string): boolean => args.includes(f);
const all = loadAll({ models: flag('--models') });
const trike = all.units.rawcode.get('ATTrike') as string;
const trikeOrder = [...all.units.portOrders].find(([, real]) => real === trike)?.[0] as string;
// --vetrange: the trike's own attack range (WC3 units)
const trikeRange = Number(all.units.objects.find((o) => o.id === trike)?.mods.filter((m) => m.field === UNIT_FIELD.range).at(-1)?.value);
// --deploy: the Kindjal, its deployed copy and the toggle
const kindjal = all.units.rawcode.get('ATKindjal') as string;
const kindjalDeploy = all.units.deploy.find((d) => d.type === kindjal);
const kindjalDeployed = kindjalDeploy?.deployed ?? '';
const kindjalToggle = kindjalDeploy?.deploy ?? '';
// --knife: the ADV Sardaukar and an Atreides infantryman
const advSard = all.units.rawcode.get('IMADVSardaukar') as string;
const atInf = all.units.rawcode.get('ATInfantry') as string;
const atApc = all.units.rawcode.get('ATAPC') as string;
const harvesterId = all.units.rawcode.get('Harvester') as string;
const carryallId = all.units.rawcode.get('Carryall') as string;
const atRefinery = all.units.rawcode.get('ATRefinery') as string;
const atHelipad = all.units.rawcode.get('ATHelipad') as string;
const atOrni = all.units.rawcode.get('ATOrni') as string;
const hkYard = all.units.rawcode.get('HKConYard') as string;
const dustScout = all.units.rawcode.get('ORDustScout') as string;
const orAdp = all.units.rawcode.get('ORADP') as string;
const niab = all.units.rawcode.get('GUNIABTank') as string;
const projector = all.units.rawcode.get('IXProjector') as string;
const atAdv = all.units.rawcode.get('ATADVCarryall') as string;
// --scripts: an army of the AI's house (Harkonnen here) of the kinds the scripts' teams name
const scriptArmy = ([['HKBuzzsaw', 6], ['HKAssault', 6], ['HKInfantry', 6], ['HKTrooper', 4], ['HKFlame', 3], ['HKMissile', 2]] as const).map(([n, k]) => [all.units.rawcode.get(n) ?? '', k] as const).filter(([id]) => id);
const advFremen = all.units.rawcode.get('FRADVFremen') as string;
const wormRider = all.units.rawcode.get('WormRider') as string;
const wormButton = all.units.wormCallers[0]?.button ?? '';
const sandTile = TERRAIN.ground[TEX.SAND];
const dustTile = TERRAIN.ground[TEX.DUST];
const [hkDev, ixInf, orEits, orSab, atScout] = ['HKDevastator', 'IXInfiltrator', 'OREITS', 'ORSaboteur', 'ATScout'].map((n) => all.units.rawcode.get(n) as string);
// --mcvai: a factory of each house
const factoryOf = { AT: all.units.rawcode.get('ATFactory') as string, HK: all.units.rawcode.get('HKFactory') as string, OR: all.units.rawcode.get('ORFactory') as string };
// --fxgrid: the played effects with their kind (0 death, 1 muzzle, 2 hit), once each
const fxShown = [...new Map([...all.units.effects.values()].flatMap((fx) => fx.map((m, k) => [m, k] as const)).filter(([m, k]) => m && (!flag('--fxhits') || k === 2))).entries()];
const meta = readMeta(path.join(ensureMap(territoryMapPrefix(n))[0] as string, 'test.xbf'));
const scripts = names.map((s, i) => ({ tok: fs.readFileSync(path.join(RAW_DIR, `${s}.tok`)), phase: i + 1, name: s }));
const m = buildMission({
  scripts, meta, ...all, name: `Territory ${n}`, playerHouse: 'Atreides', kind: flag('--defend') ? 'defend' : 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x', debugName: `Territory${n}`,
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
  // --deploy: a Kindjal raised to level 1 (ExtraDamage 50 %) deploys by its button, then attacks
  // a paused target 10 tiles away (beyond its pistol's 5, within Kindjal_B's 12), is told to move,
  // and undeploys: the type, damage, speed and the target's loss after each step
  ...(flag('--deploy') ? {
    extraStart: 'DeployProbeRun',
    extraFunctions: `function DeployProbeB takes boolean b returns string
    if b then
        return "yes"
    endif
    return "no"
endfunction

function DeployProbeLog takes string at, unit s, unit t returns string
    return at + " wc3 type " + I2S(GetUnitTypeId(s)) + " emp type " + I2S(EmpType(s)) + " deployed " + DeployProbeB(EmpDeployed(s)) + " damage " + I2S(BlzGetUnitBaseDamage(s, 0)) + " range " + R2S(BlzGetUnitWeaponRealField(s, UNIT_WEAPON_RF_ATTACK_RANGE, 0)) + " speed " + R2S(GetUnitMoveSpeed(s)) + " x " + R2S(GetUnitX(s)) + " target life " + R2S(GetWidgetLife(t)) + " cast seen " + DeployProbeB(HaveSavedInteger(EmpVetUnit, GetHandleId(s), 15)) + " order " + OrderId2String(GetUnitCurrentOrder(s))
endfunction

function DeployProbeRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit s
    local unit t
    local boolean ok
    local string array l
    local integer n = 0
    local integer i = 0
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set s = CreateUnit(Player(0), '${kindjal}', x, y, 0.0)
    set t = CreateUnit(Player(1), '${kindjal}', x + ${10 * RANGE_PER_TILE}, y, 180.0)
    call PauseUnit(t, true)
    set EmpVetArgUnit = s
    set EmpVetArgLevel = 1
    call EmpVetSetFromArgs()
    set l[n] = "kindjal ${kindjal} deployed ${kindjalDeployed} toggle ${kindjalToggle}"
    set n = n + 1
    set l[n] = DeployProbeLog("start", s, t)
    set n = n + 1
    call IssueImmediateOrder(s, "holdposition")
    set ok = IssueImmediateOrder(s, "channel")
    set l[n] = "deploy button cast " + DeployProbeB(ok)
    set n = n + 1
    call TriggerSleepAction(0.5)
    set l[n] = DeployProbeLog("0.5 s", s, t)
    set n = n + 1
    call IssueTargetOrder(s, "attack", t)
    call TriggerSleepAction(6.0)
    set l[n] = DeployProbeLog("attacked 6 s", s, t)
    set n = n + 1
    call IssuePointOrder(s, "move", x, y + 800.0)
    call TriggerSleepAction(3.0)
    set l[n] = DeployProbeLog("move 3 s", s, t)
    set n = n + 1
    set ok = IssueImmediateOrder(s, "channel")
    set l[n] = "undeploy button cast " + DeployProbeB(ok)
    set n = n + 1
    call TriggerSleepAction(1.0)
    set l[n] = DeployProbeLog("undeployed 1 s", s, t)
    set n = n + 1
    call IssuePointOrder(s, "move", x, y + 800.0)
    call TriggerSleepAction(3.0)
    set l[n] = DeployProbeLog("move 3 s", s, t)
    set n = n + 1
    call EmpDeploySet(s, true)
    call TriggerSleepAction(1.0)
    set l[n] = DeployProbeLog("deployed again by script 1 s", s, t)
    set n = n + 1
    call EmpDeploySet(s, false)
    call TriggerSleepAction(1.0)
    set l[n] = DeployProbeLog("undeployed again 1 s", s, t)
    set n = n + 1
    call PreloadGenClear()
    call PreloadGenStart()
    loop
        exitwhen i >= n
        call Preload(l[i])
        set i = i + 1
    endloop
    call PreloadGenEnd("DuneSmoke\\\\deploy.pld")
endfunction`,
  } : {}),
  // --mcvai: the AI loses its construction yard; with a factory and credits its builder turn orders an
  // emergency MCV, which deploys where a yard fits
  ...(flag('--mcvai') ? {
    extraStart: 'McvAiRun',
    extraFunctions: `function McvAiLine takes string at returns string
    return at + " yards " + I2S(EmpCount(1, EmpAiYardType[EmpEnemyHouse])) + " mcvs " + I2S(EmpCount(1, EmpAiMcv)) + " yard alive " + I2S(IntegerTertiaryOp(EmpAiYardAlive(), 1, 0)) + " gold " + I2S(EmpEnemyGold())
endfunction

function McvAiRun takes nothing returns nothing
    local integer k = EmpBaseOfSide(1)
    local string s1
    local string s2
    local string s3
    local string s4
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(3.0)
    call CreateUnit(Player(1), '${factoryOf.AT}', EmpBaseX[k] + 1200.0, EmpBaseY[k] - 600.0, 270.0)
    call CreateUnit(Player(1), '${factoryOf.HK}', EmpBaseX[k] + 1200.0, EmpBaseY[k] + 600.0, 270.0)
    call CreateUnit(Player(1), '${factoryOf.OR}', EmpBaseX[k] - 1200.0, EmpBaseY[k] + 600.0, 270.0)
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, 6000)
    call KillUnit(EmpAiYard)
    call TriggerSleepAction(1.0)
    set s1 = McvAiLine("yard killed")
    call EmpEnemyBuildTurn()
    set s2 = McvAiLine("builder turn")
    call TriggerSleepAction(6.0)
    set s3 = McvAiLine("6 s")
    call TriggerSleepAction(10.0)
    set s4 = McvAiLine("16 s")
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call Preload(s4)
    call PreloadGenEnd("DuneSmoke\\\\mcvai.pld")
endfunction`,
  } : {}),
  // --basesave: the AI's base as the winner's (EmpBaseSave(false)), its buildings removed, then given
  // back to the AI as the next defender (EmpBaseRestore(1)): kept types, counts and the yard
  ...(flag('--basesave') ? {
    extraStart: 'BaseSaveRun',
    extraFunctions: `function BaseSaveRun takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local string s1
    local string s2
    local string s3
    local boolean yard
    call TriggerSleepAction(40.0)
    set EmpInCampaign = true
    set s1 = "before: ai buildings " + I2S(EmpCount(1, 2))
    call EmpBaseSave(false)
    set s2 = "saved " + I2S(GetStoredInteger(EmpCache, ${JSON.stringify(CACHE_CATEGORY)}, EmpBaseKey(EmpEnemyHouse, "n", 0)))
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if IsUnitType(u, UNIT_TYPE_STRUCTURE) then
            call RemoveUnit(u)
        endif
    endloop
    call DestroyGroup(g)
    set yard = EmpBaseRestore(1)
    set s3 = "restored: ai buildings " + I2S(EmpCount(1, 2)) + " yard " + I2S(IntegerTertiaryOp(yard, 1, 0)) + " yards " + I2S(EmpCount(1, EmpAiYardType[EmpEnemyHouse]))
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call PreloadGenEnd("DuneSmoke\\\\basesave.pld")
endfunction`,
  } : {}),
  // --explore: after the start the player's explored tiles are saved, the whole map masked black, and
  // the saved tiles given back: how many sample points are masked at each step
  ...(flag('--explore') ? {
    extraStart: 'ExploreRun',
    extraFunctions: `function ExploreMasked takes nothing returns integer
    local integer n = 0
    local real x = EmpMapMinX + 64.0
    local real y
    loop
        exitwhen x > EmpMapMaxX
        set y = EmpMapMinY + 64.0
        loop
            exitwhen y > EmpMapMaxY
            if IsMaskedToPlayer(x, y, Player(0)) then
                set n = n + 1
            endif
            set y = y + 512.0
        endloop
        set x = x + 512.0
    endloop
    return n
endfunction

function ExploreRun takes nothing returns nothing
    local integer i
    local string s1
    local string s2
    local string s3
    call TriggerSleepAction(10.0)
    set EmpInCampaign = true
    set s1 = "explored by now: masked samples " + I2S(ExploreMasked())
    call EmpExploreSave()
    set s2 = "saved rows " + I2S(GetStoredInteger(EmpCache, ${JSON.stringify(CACHE_CATEGORY)}, EmpExploreKey(-1, 0))) + ", now every tile marked explored"
    set EmpExploreRow = 0
    loop
        exitwhen EmpExploreRow >= EmpExploreRows()
        set i = 0
        loop
            exitwhen i * 30 >= EmpExploreCols()
            call StoreInteger(EmpCache, ${JSON.stringify(CACHE_CATEGORY)}, EmpExploreKey(EmpExploreRow, i), 1073741823)
            set i = i + 1
        endloop
        set EmpExploreRow = EmpExploreRow + 1
    endloop
    call EmpExploreRestore()
    call TriggerSleepAction(1.0)
    set s3 = "restored: masked samples " + I2S(ExploreMasked())
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call PreloadGenEnd("DuneSmoke\\\\explore.pld")
endfunction`,
  } : {}),
  // --apc: an ATAPC told to load six infantrymen and a trike: five ride, the sixth and the trike stay;
  // the APC killed: its passengers die
  ...(flag('--apc') ? {
    extraStart: 'ApcRun',
    extraFunctions: `function ApcRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit a
    local unit array p
    local integer i = 0
    local integer inside = 0
    local integer alive = 0
    local string s1
    local string s2
    call TriggerSleepAction(2.0)
    set a = CreateUnit(Player(0), '${atApc}', x, y, 0.0)
    loop
        exitwhen i >= 6
        set p[i] = CreateUnit(Player(0), '${atInf}', x + 300.0, y + i * 60.0, 0.0)
        set i = i + 1
    endloop
    set p[6] = CreateUnit(Player(0), '${trike}', x - 300.0, y, 0.0)
    set i = 0
    loop
        exitwhen i > 6
        call IssueTargetOrder(a, "load", p[i])
        call TriggerSleepAction(2.5)
        set i = i + 1
    endloop
    set i = 0
    loop
        exitwhen i > 6
        if IsUnitInTransport(p[i], a) then
            set inside = inside + 1
        endif
        set i = i + 1
    endloop
    set s1 = "inside " + I2S(inside) + " trike inside " + I2S(IntegerTertiaryOp(IsUnitInTransport(p[6], a), 1, 0)) + " sixth inside " + I2S(IntegerTertiaryOp(IsUnitInTransport(p[5], a), 1, 0))
    call KillUnit(a)
    call TriggerSleepAction(2.0)
    set i = 0
    loop
        exitwhen i > 5
        if EmpAlive(p[i]) then
            set alive = alive + 1
        endif
        set i = i + 1
    endloop
    set s2 = "after the APC died, infantry alive " + I2S(alive)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call PreloadGenEnd("DuneSmoke\\\\apc.pld")
endfunction`,
  } : {}),
  // --carryall: a player harvester sent to a spice field far off, a carryall by it: carried there
  ...(flag('--carryall') ? {
    extraStart: 'CarryRun',
    extraFunctions: `function CarryLine takes string at, unit h, unit c returns string
    local unit m = EmpNearestMine(GetUnitX(h), GetUnitY(h))
    return at + " field at " + R2S(SquareRoot((GetUnitX(m) - GetUnitX(h)) * (GetUnitX(m) - GetUnitX(h)) + (GetUnitY(m) - GetUnitY(h)) * (GetUnitY(m) - GetUnitY(h)))) + " hidden " + I2S(IntegerTertiaryOp(IsUnitHidden(h), 1, 0)) + " carryall state " + I2S(LoadInteger(EmpCarryTab, GetHandleId(c), 1)) + " harvester order " + OrderId2String(GetUnitCurrentOrder(h)) + " carryall at " + R2S(SquareRoot((GetUnitX(c) - GetUnitX(h)) * (GetUnitX(c) - GetUnitX(h)) + (GetUnitY(c) - GetUnitY(h)) * (GetUnitY(c) - GetUnitY(h)))) + " order " + OrderId2String(GetUnitCurrentOrder(c)) + " speed " + R2S(GetUnitMoveSpeed(c)) + " in range " + I2S(IntegerTertiaryOp(IsUnitInRange(c, h, 160.0), 1, 0)) + " c " + R2S(GetUnitX(c)) + "," + R2S(GetUnitY(c)) + " h " + R2S(GetUnitX(h)) + "," + R2S(GetUnitY(h)) + " busy " + I2S(IntegerTertiaryOp(IsUnitInGroup(c, EmpCarryBusy), 1, 0)) + " owner " + I2S(GetPlayerId(GetOwningPlayer(c)))
endfunction

function CarryRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit h
    local unit c
    local string array l
    local integer i = 0
    local group g = CreateGroup()
    local unit u
    local unit m
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    // only this probe's harvester: the start one goes
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpType(u) == '${harvesterId}' then
            call RemoveUnit(u)
        endif
    endloop
    call DestroyGroup(g)
    call CreateUnit(Player(0), '${atRefinery}', x - 600.0, y + 600.0, 270.0)
    set m = EmpNearestMine(x + 9000.0, y + 9000.0)
    set h = CreateUnit(Player(0), '${harvesterId}', x, y, 0.0)
    call IssueTargetOrder(h, "harvest", m)
    set c = CreateUnit(Player(0), '${carryallId}', x + 400.0, y, 0.0)
        loop
        exitwhen i >= 60
        call TriggerSleepAction(1.0)
        set h = LoadUnitHandle(EmpCarryTab, GetHandleId(c), 0)
        if h != null then
            set l[i] = I2S(i) + "s st " + I2S(LoadInteger(EmpCarryTab, GetHandleId(c), 1)) + " c-h " + I2S(R2I(SquareRoot((GetUnitX(c) - GetUnitX(h)) * (GetUnitX(c) - GetUnitX(h)) + (GetUnitY(c) - GetUnitY(h)) * (GetUnitY(c) - GetUnitY(h))))) + " hid " + I2S(IntegerTertiaryOp(IsUnitHidden(h), 1, 0)) + " field " + I2S(R2I(SquareRoot((GetUnitX(m) - GetUnitX(h)) * (GetUnitX(m) - GetUnitX(h)) + (GetUnitY(m) - GetUnitY(h)) * (GetUnitY(m) - GetUnitY(h))))) + " gold " + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " ho " + OrderId2String(GetUnitCurrentOrder(h)) + " |"
        else
            set l[i] = I2S(i) + "s free"
        endif
        set i = i + 1
    endloop
    call PreloadGenClear()
    call PreloadGenStart()
    set i = 0
    loop
        exitwhen i >= 60
        call Preload(l[i])
        set i = i + 3
    endloop
    call PreloadGenEnd("DuneSmoke\\\\carryall.pld")
endfunction`,
  } : {}),
  // --harvorders: the orders the engine gives a harvester through a harvest cycle (a refinery by a field)
  ...(flag('--harvorders') ? {
    extraStart: 'HarvOrdersRun',
    extraFunctions: `function HarvOrdersLog takes nothing returns nothing
    local integer n = LoadInteger(EmpVetUnit, -77, 1000)
    if GetTriggerUnit() == LoadUnitHandle(EmpVetUnit, -77, 999) and n < 40 then
        call SaveStr(EmpVetUnit, -77, n, I2S(EmpTick) + " " + OrderId2String(GetIssuedOrderId()) + " gold " + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)))
        call SaveInteger(EmpVetUnit, -77, 1000, n + 1)
    endif
endfunction

function HarvOrdersRun takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local unit m
    local integer i = 0
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_ISSUED_ORDER, null)
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER, null)
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER, null)
    call TriggerAddAction(tr, function HarvOrdersLog)
    call TriggerSleepAction(1.0)
    set m = EmpNearestMine(0.0, 0.0)
    call CreateUnit(Player(0), '${atRefinery}', GetUnitX(m) + 900.0, GetUnitY(m), 270.0)
    call SaveUnitHandle(EmpVetUnit, -77, 999, CreateUnit(Player(0), '${harvesterId}', GetUnitX(m) + 600.0, GetUnitY(m) - 300.0, 0.0))
    call IssueTargetOrder(LoadUnitHandle(EmpVetUnit, -77, 999), "harvest", m)
    call TriggerSleepAction(70.0)
    call PreloadGenClear()
    call PreloadGenStart()
    loop
        exitwhen i >= LoadInteger(EmpVetUnit, -77, 1000)
        call Preload(LoadStr(EmpVetUnit, -77, i))
        set i = i + 1
    endloop
    call PreloadGenEnd("DuneSmoke\\\\harvorders.pld")
endfunction`,
  } : {}),
  // --orni: an ATOrni attacks a sturdy target with a helipad of its owner nearby: 10 shots, then to
  // the pad, a round every RearmRate there
  ...(flag('--orni') ? {
    extraStart: 'OrniRun',
    extraFunctions: `function OrniRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit o
    local unit t
    local unit p
    local string array l
    local integer i = 0
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    set p = CreateUnit(Player(0), '${atHelipad}', x - 700.0, y, 270.0)
    set o = CreateUnit(Player(0), '${atOrni}', x, y, 0.0)
    set t = CreateUnit(Player(1), '${hkYard}', x + 900.0, y, 180.0)
    call PauseUnit(t, true)
    call IssuePointOrder(o, "move", x + 300.0, y - 800.0)
    call TriggerSleepAction(3.0)
    set l[23] = "plain move: moved " + R2S(SquareRoot((GetUnitX(o) - x) * (GetUnitX(o) - x) + (GetUnitY(o) - y) * (GetUnitY(o) - y))) + " speed " + R2S(GetUnitMoveSpeed(o)) + " fly height " + R2S(GetUnitFlyHeight(o)) + " paused " + I2S(IntegerTertiaryOp(IsUnitPaused(o), 1, 0))
    call IssueTargetOrder(o, "attack", t)
    loop
        exitwhen i >= 23
        call TriggerSleepAction(2.5)
        set l[i] = I2S(i * 5 / 2) + "s rounds " + I2S(EmpOrniRounds(o)) + " state " + I2S(LoadInteger(EmpOrniTab, GetHandleId(o), 4)) + " to pad " + I2S(R2I(SquareRoot((GetUnitX(o) - GetUnitX(p)) * (GetUnitX(o) - GetUnitX(p)) + (GetUnitY(o) - GetUnitY(p)) * (GetUnitY(o) - GetUnitY(p))))) + " order " + OrderId2String(GetUnitCurrentOrder(o))
        set i = i + 1
    endloop
    call PreloadGenClear()
    call PreloadGenStart()
    set i = 0
    loop
        exitwhen i >= 24
        call Preload(l[i])
        set i = i + 1
    endloop
    call PreloadGenEnd("DuneSmoke\\\\orni.pld")
endfunction`,
  } : {}),
  // --boom: a Devastator, an Infiltrator (an enemy scout hidden by it) and an EITS blow up by their
  // button, each by a paused enemy trike
  ...(flag('--boom') ? {
    extraStart: 'BoomRun',
    extraFunctions: `function BoomOne takes integer t, real x, real y returns string
    local unit u = CreateUnit(Player(0), t, x, y, 0.0)
    local unit v = CreateUnit(Player(1), '${trike}', x + 200.0, y, 0.0)
    local unit s = CreateUnit(Player(1), '${atScout}', x + 600.0, y, 0.0)
    local real life = GetWidgetLife(v)
    local boolean cast
    local string r
    call PauseUnit(v, true)
    call UnitAddAbility(s, 'Apiv')
    call TriggerSleepAction(0.5)
    set cast = IssueImmediateOrder(u, "channel")
    call TriggerSleepAction(1.5)
    set r = GetObjectName(t) + ": cast " + I2S(IntegerTertiaryOp(cast, 1, 0)) + " alive " + I2S(IntegerTertiaryOp(EmpAlive(u), 1, 0)) + " trike lost " + R2S(life - GetWidgetLife(v)) + " scout invisible " + I2S(GetUnitAbilityLevel(s, 'Apiv')) + " revealed for " + I2S(LoadInteger(EmpVetUnit, GetHandleId(s), 18) - EmpTick) + " saboteurs " + I2S(EmpCount(0, '${orSab}'))
    set u = null
    set v = null
    set s = null
    return r
endfunction

// an ORADP of the player with an enemy ornithopter 8 tiles off: its rockets, then it is gone
function BoomMine takes real x, real y returns string
    local unit m = CreateUnit(Player(0), '${orAdp}', x, y, 0.0)
    local unit o = CreateUnit(Player(1), '${atOrni}', x + 1000.0, y, 180.0)
    local real life = GetWidgetLife(o)
    call PauseUnit(o, true)
    call TriggerSleepAction(1.0)
    return "ORADP alive " + I2S(IntegerTertiaryOp(EmpAlive(m), 1, 0)) + " orni lost " + R2S(life - GetWidgetLife(o))
endfunction

// an Infiltrator sent (right click) at a paused enemy trike 12 tiles off: it walks up and goes off
// within its bomb's BlastRadius plus the trike's Size (Game.exe 0x565cc0)
function BoomSent takes real x, real y returns string
    local unit u = CreateUnit(Player(0), '${ixInf}', x, y, 0.0)
    local unit v = CreateUnit(Player(1), '${trike}', x + 1536.0, y, 0.0)
    local real life = GetWidgetLife(v)
    local real gap = 0.0
    local integer n = 0
    call PauseUnit(v, true)
    call TriggerSleepAction(0.5)
    call IssueTargetOrder(u, "smart", v)
    loop
        exitwhen not EmpAlive(u) or n >= 60
        set gap = SquareRoot((GetUnitX(v) - GetUnitX(u)) * (GetUnitX(v) - GetUnitX(u)) + (GetUnitY(v) - GetUnitY(u)) * (GetUnitY(v) - GetUnitY(u)))
        call TriggerSleepAction(0.25)
        set n = n + 1
    endloop
    call TriggerSleepAction(0.5)
    return "sent Infiltrator alive " + I2S(IntegerTertiaryOp(EmpAlive(u), 1, 0)) + " gap at blast " + R2S(gap) + " trike lost " + R2S(life - GetWidgetLife(v))
endfunction

// a worm rider of the player between an enemy rider and an enemy trike: it shoots the trike only
// (Game.exe 0x5728d0; worms and riders are WC3 "ancient", a rider targets "nonancient")
function BoomRider takes real x, real y returns string
    local unit r = CreateUnit(Player(0), '${wormRider}', x, y, 0.0)
    local unit e = CreateUnit(Player(1), '${wormRider}', x + 300.0, y, 180.0)
    local unit v = CreateUnit(Player(1), '${trike}', x - 300.0, y, 0.0)
    local real le = GetWidgetLife(e)
    local real lv = GetWidgetLife(v)
    call PauseUnit(e, true)
    call PauseUnit(v, true)
    call TriggerSleepAction(5.0)
    return "rider ancient " + I2S(IntegerTertiaryOp(IsUnitType(r, UNIT_TYPE_ANCIENT), 1, 0)) + " enemy rider lost " + R2S(le - GetWidgetLife(e)) + " trike lost " + R2S(lv - GetWidgetLife(v))
endfunction

function BoomRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local string s1
    local string s2
    local string s3
    local string s4
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    set s1 = BoomOne('${hkDev}', x, y)
    set s2 = BoomOne('${ixInf}', x, y + 1500.0)
    set s3 = BoomOne('${orEits}', x, y - 1500.0) + " | " + BoomMine(x - 2500.0, y)
    // the player slots the scripts register events for (orni.j: every one, the neutrals included?)
    set s4 = BoomSent(x - 2500.0, y + 2500.0) + " | slots " + I2S(bj_MAX_PLAYER_SLOTS) + " neutral passive " + I2S(PLAYER_NEUTRAL_PASSIVE) + " aggressive " + I2S(PLAYER_NEUTRAL_AGGRESSIVE)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call Preload(s4)
    call Preload(BoomRider(x + 2500.0, y + 2500.0))
    call PreloadGenEnd("DuneSmoke\\\\boom.pld")
endfunction`,
  } : {}),
  // --burrow: a dust scout on the dust ground burrows; an enemy trike in GuardTileRange brings it up
  ...(flag('--burrow') ? {
    extraStart: 'BurrowRun',
    extraFunctions: `function BurrowLine takes string at, unit u returns string
    return at + " burrowed " + I2S(IntegerTertiaryOp(LoadBoolean(EmpBurrowTab, GetHandleId(u), 1), 1, 0)) + " invisible " + I2S(GetUnitAbilityLevel(u, 'Apiv')) + " order " + OrderId2String(GetUnitCurrentOrder(u))
endfunction

function BurrowRun takes nothing returns nothing
    local real x = EmpMapMinX + 256.0
    local real y
    local boolean found = false
    local unit u
    local unit t
    local string s1 = "no dust ground"
    local string s2 = ""
    local string s3 = ""
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    loop
        exitwhen x > EmpMapMaxX or found
        set y = EmpMapMinY + 256.0
        loop
            exitwhen y > EmpMapMaxY or found
            if GetTerrainType(x, y) == '${dustTile}' and GetTerrainType(x + 128.0, y) == '${dustTile}' then
                set found = true
            else
                set y = y + 256.0
            endif
        endloop
        if not found then
            set x = x + 256.0
        endif
    endloop
    if found then
        set u = CreateUnit(Player(0), '${dustScout}', x, y, 0.0)
        call TriggerSleepAction(1.5)
        set s1 = BurrowLine("idle on dust", u)
        set t = CreateUnit(Player(1), '${trike}', x + 1000.0, y, 0.0)
        call PauseUnit(t, true)
        call TriggerSleepAction(1.0)
        set s2 = BurrowLine("enemy at 8 tiles", u) + " trike life " + R2S(GetWidgetLife(t))
        call RemoveUnit(t)
        call TriggerSleepAction(4.0)
        set s3 = BurrowLine("enemy gone, idle again", u)
    endif
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call PreloadGenEnd("DuneSmoke\\\\burrow.pld")
endfunction`,
  } : {}),
  // --worm: an ADV Fremen on sand calls a worm (the wait cut to 10 ticks), rides it (the ride cut to
  // 50 ticks), and is an ADV Fremen again
  ...(flag('--worm') ? {
    extraStart: 'WormRun',
    extraFunctions: `function WormRun takes nothing returns nothing
    local real x = EmpMapMinX + 256.0
    local real y
    local boolean found = false
    local unit u
    local boolean cast
    local string s1 = "no sand"
    local string s2 = ""
    local string s3 = ""
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    loop
        exitwhen x > EmpMapMaxX or found
        set y = EmpMapMinY + 256.0
        loop
            exitwhen y > EmpMapMaxY or found
            if GetTerrainType(x, y) == '${sandTile}' and GetTerrainType(x + 256.0, y) == '${sandTile}' and GetTerrainType(x, y + 256.0) == '${sandTile}' then
                set found = true
            else
                set y = y + 256.0
            endif
        endloop
        if not found then
            set x = x + 256.0
        endif
    endloop
    if found then
        set u = CreateUnit(Player(0), '${advFremen}', x, y, 0.0)
        call SetUnitLifePercentBJ(u, 50.0)
        call TriggerSleepAction(0.5)
        set cast = IssueImmediateOrder(u, "channel")
        call TriggerSleepAction(1.5)
        set s1 = "cast " + I2S(IntegerTertiaryOp(cast, 1, 0)) + " waiting " + I2S(LoadInteger(EmpRideTab, GetHandleId(u), 4)) + " caller " + I2S(IntegerTertiaryOp(LoadBoolean(EmpRideTab, EmpType(u), 1), 1, 0)) + " button " + I2S(LoadInteger(EmpRideTab, '${wormButton}', 3)) + " ability " + I2S(GetUnitAbilityLevel(u, '${wormButton}')) + " sand " + I2S(IntegerTertiaryOp(GetTerrainType(GetUnitX(u), GetUnitY(u)) == '${sandTile}', 1, 0)) + " in group " + I2S(IntegerTertiaryOp(IsUnitInGroup(u, EmpRideAll), 1, 0)) + " order " + OrderId2String(GetUnitCurrentOrder(u))
        call SaveInteger(EmpRideTab, GetHandleId(u), 4, 10)
        call TriggerSleepAction(2.0)
        set s2 = "riders " + I2S(EmpCount(0, '${wormRider}')) + " fremen " + I2S(EmpCount(0, '${advFremen}'))
        call GroupEnumUnitsOfPlayer(EmpTmpGroup, Player(0), null)
        loop
            set u = FirstOfGroup(EmpTmpGroup)
            exitwhen u == null
            call GroupRemoveUnit(EmpTmpGroup, u)
            if EmpType(u) == '${wormRider}' then
                set s2 = s2 + " rider life % " + R2S(GetUnitLifePercent(u)) + " order " + OrderId2String(GetUnitCurrentOrder(u))
                call SaveInteger(EmpRideTab, GetHandleId(u), 5, 30)
            endif
        endloop
        call TriggerSleepAction(3.0)
        set s3 = "after the ride: riders " + I2S(EmpCount(0, '${wormRider}')) + " fremen " + I2S(EmpCount(0, '${advFremen}'))
    endif
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call PreloadGenEnd("DuneSmoke\\\\worm.pld")
endfunction`,
  } : {}),
  // --proj: a projector deploys, projects an enemy trike (a replica for the player), the replica is
  // shot at and vanishes; another one vanishes with its projector (the report is written at each step)
  ...(flag('--proj') ? {
    extraStart: 'ProjRun',
    extraFunctions: `function ProjCountEnum takes nothing returns nothing
    if EmpAlive(GetEnumUnit()) then
        call SaveInteger(EmpProjTab, -1, 0, LoadInteger(EmpProjTab, -1, 0) + 1)
    endif
endfunction

function ProjCount takes nothing returns integer
    call SaveInteger(EmpProjTab, -1, 0, 0)
    call ForGroup(EmpProjAll, function ProjCountEnum)
    return LoadInteger(EmpProjTab, -1, 0)
endfunction

function ProjSave takes string a, string b, string c returns nothing
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(a)
    call Preload(b)
    call Preload(c)
    call PreloadGenEnd("DuneSmoke\\\\proj.pld")
endfunction

function ProjRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit p
    local unit t
    local unit r
    local boolean cast
    local string s1 = "start"
    local string s2 = ""
    local string s3 = ""
    local integer i
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    set p = CreateUnit(Player(0), '${projector}', x, y, 0.0)
    set t = CreateUnit(Player(1), '${trike}', x + 900.0, y, 180.0)
    call PauseUnit(t, true)
    call ProjSave("created", "", "")
    call TriggerSleepAction(0.5)
    call EmpDeploySet(p, true)
    call TriggerSleepAction(1.5)
    set cast = IssueTargetOrder(p, "absorb", t)
    // projected for ReplicaProjectionTime (20 ticks, 0.8 s) from the spell effect, then a normal unit
    call TriggerSleepAction(0.6)
    set r = FirstOfGroup(EmpProjAll)
    set s1 = " phase at 0.6 s " + I2S(LoadInteger(EmpProjTab, GetHandleId(r), 4))
    call TriggerSleepAction(0.9)
    set s1 = "deployed " + I2S(IntegerTertiaryOp(EmpDeployed(p), 1, 0)) + " cast " + I2S(IntegerTertiaryOp(cast, 1, 0)) + " replicas " + I2S(ProjCount()) + s1 + " at 1.5 s " + I2S(LoadInteger(EmpProjTab, GetHandleId(r), 4)) + " order " + OrderId2String(GetUnitCurrentOrder(r))
    call ProjSave(s1, "", "")
    set r = FirstOfGroup(EmpProjAll)
    if r != null then
        call UnitDamageTarget(t, r, 10.0, true, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
    endif
    set i = EmpTick
    call TriggerSleepAction(0.1)
    set s2 = I2S(EmpTick - i) + " ticks after a hit: phase " + I2S(LoadInteger(EmpProjTab, GetHandleId(r), 4)) + " replicas " + I2S(ProjCount())
    call TriggerSleepAction(0.4)
    set s2 = s2 + "; 0.5 s: replicas " + I2S(ProjCount())
    call ProjSave(s1, s2, "")
    set cast = IssueTargetOrder(p, "absorb", t)
    call TriggerSleepAction(1.5)
    call KillUnit(p)
    call TriggerSleepAction(1.0)
    set s3 = "second one " + I2S(IntegerTertiaryOp(cast, 1, 0)) + ", projector killed: replicas " + I2S(ProjCount())
    call ProjSave(s1, s2, s3)
endfunction`,
  } : {}),
  // --scripts: the AI gets an army by its base and the player's base is known; the script picker runs
  // every 5 s from 3 s on (FirstAttackDelay off); the AI log tells which scripts start and their steps
  ...(flag('--scripts') ? {
    extraStart: 'ScriptsRun',
    extraFunctions: `function ScriptsArmy takes integer t, integer n returns nothing
    local integer b = EmpBaseOfSide(1)
    local integer i = 0
    loop
        exitwhen i >= n
        call CreateUnit(Player(1), t, EmpBaseX[b] + GetRandomReal(-600.0, 600.0), EmpBaseY[b] + GetRandomReal(-600.0, 600.0), 0.0)
        set i = i + 1
    endloop
endfunction

function ScriptsRun takes nothing returns nothing
    local integer i = 0
    call TriggerSleepAction(2.0)
${scriptArmy.map(([id, n]) => `    call ScriptsArmy('${id}', ${n})`).join('\n')}
    set EmpAiKnown = true
    set EmpAiKnownX = EmpBaseX[EmpBaseOfSide(0)]
    set EmpAiKnownY = EmpBaseY[EmpBaseOfSide(0)]
    loop
        exitwhen i >= 6
        set EmpAiTFirst[i + 1] = 0
        set EmpAiTFirst[i + 3] = 0
        set i = i + 1
    endloop
    set i = 0
    loop
        exitwhen i >= 12
        call TriggerSleepAction(5.0)
        call EmpScrPick()
        set i = i + 1
    endloop
endfunction`,
  } : {}),
  // --reserves: two reserve stacks arrive by the player's start: their units and veterancy levels
  ...(flag('--reserves') ? {
    extraStart: 'ReservesRun',
    extraFunctions: `function ReservesRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local integer before
    local group g = CreateGroup()
    local unit u
    local integer lv2 = 0
    call TriggerSleepAction(1.0)
    set before = EmpCount(0, 1)
    set EmpReserveStacks = 2
    call EmpReserveArrive(x, y)
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if LoadInteger(EmpVetUnit, GetHandleId(u), 1) == 2 then
            set lv2 = lv2 + 1
        endif
    endloop
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("units before " + I2S(before) + " after " + I2S(EmpCount(0, 1)) + " at veterancy 2: " + I2S(lv2))
    call PreloadGenEnd("DuneSmoke\\\\reserves.pld")
endfunction`,
  } : {}),
  // --advcarry: an ADV carryall picks its own trike up and sets it down 1500 off, picks an enemy trike
  // up (after the delay) and is shot down: the trike goes with it
  ...(flag('--advcarry') ? {
    extraStart: 'AdvRun',
    extraFunctions: `function AdvRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit c
    local unit a
    local unit e
    local boolean ok
    local string s1
    local string s2
    local string s3
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    set c = CreateUnit(Player(0), '${atAdv}', x, y, 0.0)
    set a = CreateUnit(Player(0), '${trike}', x + 500.0, y, 0.0)
    set e = CreateUnit(Player(1), '${trike}', x + 500.0, y + 800.0, 0.0)
    call PauseUnit(e, true)
    call TriggerSleepAction(0.5)
    set ok = IssueTargetOrder(c, "channel", a)
    call TriggerSleepAction(3.0)
    set s1 = "own pick " + I2S(IntegerTertiaryOp(ok, 1, 0)) + " hidden " + I2S(IntegerTertiaryOp(IsUnitHidden(a), 1, 0))
    set ok = IssuePointOrder(c, "acidbomb", x, y - 1500.0)
    call TriggerSleepAction(6.0)
    set s2 = "drop " + I2S(IntegerTertiaryOp(ok, 1, 0)) + " shown " + I2S(IntegerTertiaryOp(not IsUnitHidden(a), 1, 0)) + " moved " + R2S(y - GetUnitY(a))
    set ok = IssueTargetOrder(c, "channel", e)
    call TriggerSleepAction(10.0)
    set s3 = "enemy pick " + I2S(IntegerTertiaryOp(ok, 1, 0)) + " hidden " + I2S(IntegerTertiaryOp(IsUnitHidden(e), 1, 0)) + " state " + I2S(LoadInteger(EmpCarryTab, GetHandleId(c), 34)) + " cargo " + I2S(IntegerTertiaryOp(LoadUnitHandle(EmpCarryTab, GetHandleId(c), 33) == e, 1, 0)) + " to it " + R2S(SquareRoot((GetUnitX(c) - GetUnitX(e)) * (GetUnitX(c) - GetUnitX(e)) + (GetUnitY(c) - GetUnitY(e)) * (GetUnitY(c) - GetUnitY(e)))) + " order " + OrderId2String(GetUnitCurrentOrder(c))
    call KillUnit(c)
    call TriggerSleepAction(0.5)
    set s3 = s3 + ", carryall shot down: enemy trike alive " + I2S(IntegerTertiaryOp(EmpAlive(e), 1, 0))
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call PreloadGenEnd("DuneSmoke\\\\advcarry.pld")
endfunction`,
  } : {}),
  // --tele: a NIAB tank teleports 3000 units off (explored: the fog is off), sleeps, acts again
  ...(flag('--tele') ? {
    extraStart: 'TeleRun',
    extraFunctions: `function TeleRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit u
    local boolean cast
    local string s1
    local string s2
    local string s3
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(1.0)
    set u = CreateUnit(Player(0), '${niab}', x, y, 0.0)
    call TriggerSleepAction(0.5)
    set cast = IssuePointOrder(u, "channel", x, y + 3000.0)
    call TriggerSleepAction(1.0)
    set s1 = "cast " + I2S(IntegerTertiaryOp(cast, 1, 0)) + " moved " + R2S(GetUnitY(u) - y) + " paused " + I2S(IntegerTertiaryOp(IsUnitPaused(u), 1, 0))
    call TriggerSleepAction(1.5)
    set s2 = "2.5 s: moved " + R2S(GetUnitY(u) - y)
    call TriggerSleepAction(4.0)
    call IssuePointOrder(u, "move", x + 600.0, y + 3000.0)
    call TriggerSleepAction(1.5)
    set s3 = "6.5 s: ordered to move, x moved " + R2S(GetUnitX(u) - x)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload(s3)
    call PreloadGenEnd("DuneSmoke\\\\tele.pld")
endfunction`,
  } : {}),
  // --knife: an ADV Sardaukar with enemy infantry 8 tiles off (the gun), then 3 tiles off (the knife,
  // it walks up and stabs), then none (the gun again)
  ...(flag('--knife') ? {
    extraStart: 'KnifeRun',
    extraFunctions: `function KnifeLine takes string at, unit s, unit t returns string
    return at + " type " + I2S(GetUnitTypeId(s)) + " knife " + I2S(IntegerTertiaryOp(EmpDeployed(s), 1, 0)) + " emp " + I2S(EmpType(s)) + " x " + R2S(GetUnitX(s)) + " target life " + R2S(GetWidgetLife(t))
endfunction

function KnifeRun takes nothing returns nothing
    local real x = GetStartLocationX(GetPlayerStartLocation(Player(0)))
    local real y = GetStartLocationY(GetPlayerStartLocation(Player(0)))
    local unit s
    local unit t
    local string array l
    local integer i = 0
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set s = CreateUnit(Player(0), '${advSard}', x, y, 0.0)
    set t = CreateUnit(Player(1), '${atInf}', x + ${8 * RANGE_PER_TILE}, y, 180.0)
    call PauseUnit(t, true)
    call IssueImmediateOrder(s, "holdposition")
    call TriggerSleepAction(1.5)
    set l[0] = KnifeLine("infantry at 8", s, t)
    call SetUnitPosition(t, x + ${3 * RANGE_PER_TILE}, y)
    call TriggerSleepAction(1.0)
    set l[1] = KnifeLine("infantry at 3", s, t)
    call IssueTargetOrder(s, "attack", t)
    call TriggerSleepAction(5.0)
    set l[2] = KnifeLine("attacked 5 s", s, t)
    call RemoveUnit(t)
    call TriggerSleepAction(1.0)
    set l[3] = KnifeLine("no infantry", s, s)
    call PreloadGenClear()
    call PreloadGenStart()
    loop
        exitwhen i > 3
        call Preload(l[i])
        set i = i + 1
    endloop
    call PreloadGenEnd("DuneSmoke\\\\knife.pld")
endfunction`,
  } : {}),
  // --deployai: two Kindjals of the AI by its base: one with a paused player trike 10 tiles off (in
  // the deployed range: deploys at once), one alone (deploys after standing still 160 ticks)
  ...(flag('--deployai') ? {
    extraStart: 'DeployAiRun',
    extraFunctions: `function DeployAiLine takes string at, unit a, unit b returns string
    return at + " near: type " + I2S(GetUnitTypeId(a)) + " deployed " + I2S(IntegerTertiaryOp(EmpDeployed(a), 1, 0)) + " | alone: type " + I2S(GetUnitTypeId(b)) + " deployed " + I2S(IntegerTertiaryOp(EmpDeployed(b), 1, 0)) + " order " + OrderId2String(GetUnitCurrentOrder(b))
endfunction

function DeployAiRun takes nothing returns nothing
    local integer k = EmpBaseOfSide(1)
    local real x = EmpBaseX[k]
    local real y = EmpBaseY[k]
    local unit a
    local unit b
    local unit t
    local string s1
    local string s2
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set a = CreateUnit(Player(1), '${kindjal}', x + 1500.0, y, 0.0)
    set t = CreateUnit(Player(0), '${trike}', x + 1500.0 + ${10 * RANGE_PER_TILE}, y, 180.0)
    call PauseUnit(t, true)
    set b = CreateUnit(Player(1), '${kindjal}', x - 1500.0, y, 0.0)
    call TriggerSleepAction(4.0)
    set s1 = DeployAiLine("4 s", a, b)
    call TriggerSleepAction(10.0)
    set s2 = DeployAiLine("14 s", a, b)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s1)
    call Preload(s2)
    call Preload("trike life " + R2S(GetWidgetLife(t)))
    call PreloadGenEnd("DuneSmoke\\\\deployai.pld")
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
  // --critical: the builder's critical barracks (ai.j EmpAiCriticalBarracks): skill 99, strength 2,
  // side 1's barracks destroyed after its [StartScript] built them; the AI report logs the direct call
  // ("critical: more barracks required", the type). The builder itself rebuilds the template barracks
  // first (forces.j EmpEnemyBuildTurn), so in a turn the critical need shows only past the template.
  ...(flag('--critical') ? {
    extraStart: 'CriticalProbeRun',
    extraFunctions: `function CriticalProbeKill takes nothing returns boolean
    local integer t = EmpType(GetFilterUnit())
    if EmpAlive(GetFilterUnit()) and (${['AT', 'HK', 'OR'].map((h) => `t == '${all.units.rawcode.get(`${h}Barracks`)}'`).join(' or ')}) then
        call KillUnit(GetFilterUnit())
    endif
    return false
endfunction

function CriticalProbeRun takes nothing returns nothing
    local group g = CreateGroup()
    set EmpNormalConditions = false
    call TriggerSleepAction(2.0)
    set EmpAiSkill = 99
    set EmpAiStrength = 2
    call GroupEnumUnitsOfPlayer(g, Player(1), Condition(function CriticalProbeKill))
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, 20000)
    // the [StartScript] builds barracks (step 4): destroyed again once it is past them
    loop
        exitwhen EmpTick > 4900
        call TriggerSleepAction(1.0)
    endloop
    call GroupEnumUnitsOfPlayer(g, Player(1), Condition(function CriticalProbeKill))
    call EmpAiLog("probe: barracks destroyed")
    call TriggerSleepAction(2.0)
    call EmpAiLog("probe: critical -> " + I2S(EmpAiCriticalBarracks()) + " skill " + I2S(EmpAiSkill) + " strength " + I2S(EmpAiStrength) + " house " + I2S(EmpEnemyHouse))
    call DestroyGroup(g)
    set g = null
endfunction`,
  } : {}),
  // --plan: the defence plan (battle ai-map.j): tech 5, DEFENSIVE (walls past 2..3 minutes), strong,
  // credits, 24 infantry of side 1, maintenance at once; no fog, the camera on the enemy base. The AI
  // report logs the clusters, the roads, the plan's points and turrets and the walls started.
  ...(flag('--plan') ? {
    extraStart: 'PlanProbeRun',
    extraFunctions: `function PlanProbeRun takes nothing returns nothing
    local integer l = 1
    local integer i = 0
    set EmpNormalConditions = false
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set EmpTechLevel = 5
    set EmpAiBuildsDef = true
    set EmpAiPersonality = 2
    set EmpAiStrength = 2
    set EmpAiSkill = 9
    loop
        exitwhen l > ${BATTLE.AI_TECH_LEVELS}
        set EmpAiTBuildings[l] = 1
        set EmpAiTMaintDelay[l] = 3.0
        set l = l + 1
    endloop
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, 40000)
    loop
        exitwhen i >= 24
        call CreateUnit(Player(1), '${all.units.rawcode.get('HKLightInf')}', EmpBaseX[EmpBaseOfSide(1)] + GetRandomReal(-300.0, 300.0), EmpBaseY[EmpBaseOfSide(1)] - 900.0, 270.0)
        set i = i + 1
    endloop
    call SetCameraPositionForPlayer(Player(0), EmpBaseX[EmpBaseOfSide(1)], EmpBaseY[EmpBaseOfSide(1)])
    call EmpAiLog("probe: clusters " + I2S(EmpAiClN) + " builds defences " + I2S(EF_B2I(EmpAiBuildsDef)))
    loop
        exitwhen EmpTick > 8500
        call TriggerSleepAction(2.0)
    endloop
    set i = 0
    loop
        exitwhen i >= EmpAiClN
        call EmpAiLog("probe: cluster " + I2S(i) + " box " + I2S(EmpAiClX0[i]) + "," + I2S(EmpAiClY0[i]) + " .. " + I2S(EmpAiClX1[i]) + "," + I2S(EmpAiClY1[i]) + " plan " + I2S(LoadInteger(EmpAiMapTab, -1 - i, 0)))
        set i = i + 1
    endloop
    set i = EmpAiClN - 1
    call SetCameraFieldForPlayer(Player(0), CAMERA_FIELD_TARGET_DISTANCE, 3000.0, 0.0)
    call SetCameraPositionForPlayer(Player(0), EmpAiTileWX((EmpAiClX0[i] + EmpAiClX1[i]) / 2), EmpAiTileWY((EmpAiClY0[i] + EmpAiClY1[i]) / 2))
endfunction`,
  } : {}),
  // --pads: refinery pads (battle pads.j): an Atreides refinery of the player trains three pad orders
  // (the third finds no slot: its credits come back); the AI orders one (ai.j EmpAiPadOrder). The AI
  // report logs the pads, hit points, harvesters and credits.
  ...(flag('--pads') ? {
    extraStart: 'PadsProbeRun',
    extraFunctions: `function PadsProbeHarv takes player p returns integer
    local group g = CreateGroup()
    local unit u
    local integer n = 0
    call GroupEnumUnitsOfPlayer(g, p, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and EmpType(u) == '${all.units.rawcode.get('Harvester')}' then
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return n
endfunction

function PadsProbeRun takes nothing returns nothing
    local unit r
    local integer o = '${all.units.padOrders.find((p) => p.dock === 'ATRefineryDock')?.id ?? '0000'}'
    set EmpNormalConditions = false
    call TriggerSleepAction(2.0)
    set EmpTechLevel = 3
    call SetPlayerTechMaxAllowed(Player(0), o, -1)
    call SetPlayerTechMaxAllowed(Player(1), EmpAiPadType[EmpEnemyHouse], -1)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 10000)
    call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, 10000)
    set r = CreateUnit(Player(0), '${all.units.rawcode.get('ATRefinery')}', EmpBaseX[0] + 600.0, EmpBaseY[0] + 600.0, 270.0)
    call TriggerSleepAction(1.0)
    call EmpAiLog("probe: player refinery hp " + I2S(BlzGetUnitMaxHP(r)) + " harvesters " + I2S(PadsProbeHarv(Player(0))) + " gold " + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)))
    call IssueImmediateOrderById(r, o)
    call IssueImmediateOrderById(r, o)
    call IssueImmediateOrderById(r, o)
    call EmpAiLog("probe: AI refineries " + I2S(EmpAiCount(-2)) + " pad order -> " + I2S(EmpAiPadOrder()) + " player gold after 3 orders " + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)))
    // the third order ends past 3 x its time: its credits come back then
    call TriggerSleepAction(${3 * (all.units.padOrders.find((p) => p.dock === 'ATRefineryDock')?.seconds ?? 29) - 4})
    call EmpAiLog("probe: before the third, gold " + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " pads " + I2S(EmpPadCountOf(r)))
    call TriggerSleepAction(8.0)
    call EmpAiLog("probe: after the third, gold " + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " pads " + I2S(EmpPadCountOf(r)))
    call EmpAiLog("probe: player pads " + I2S(EmpPadCountOf(r)) + " hp " + I2S(BlzGetUnitMaxHP(r)) + " harvesters " + I2S(PadsProbeHarv(Player(0))) + " gold " + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)))
    call EmpAiLog("probe: AI refineries and pads " + I2S(EmpAiCount(-2)) + " pads " + I2S(EmpPadCount(Player(1))))
    set r = null
endfunction`,
  } : {}),
  // --tactics: the tactics' starts (ai.j EmpAiTactics): DEFENSIVE, tech 5, skill 9, strength 2, 12 units
  // of side 1, a crate by its base (no crate run in the campaign); the AI report logs the scouts and the
  // yard guard
  ...(flag('--tactics') ? {
    extraStart: 'TacticsProbeRun',
    extraFunctions: `function TacticsProbeRun takes nothing returns nothing
    local integer i = 0
    local integer b = EmpBaseOfSide(1)
    set EmpNormalConditions = false
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(2.0)
    set EmpTechLevel = 5
    set EmpAiPersonality = 2
    set EmpAiStrength = 2
    set EmpAiSkill = 9
    loop
        exitwhen i >= 12
        call CreateUnit(Player(1), '${all.units.rawcode.get('HKLightInf')}', EmpBaseX[b] + GetRandomReal(-300.0, 300.0), EmpBaseY[b] - 700.0, 270.0)
        set i = i + 1
    endloop
    call EmpAddCrate(EmpBaseX[b] + 900.0, EmpBaseY[b] - 900.0, 0, 500)
    call EmpAiLog("probe: tactics set, crates " + I2S(EmpCrateCount))
endfunction`,
  } : {}),
  // --base: the defending AI's minimal base (ai.j EmpAiMinimalBase): no fog, the camera on its yard after
  // 5 s, the AI report lists its buildings
  ...(flag('--base') ? {
    extraStart: 'BaseProbeRun',
    extraFunctions: `function BaseProbeRun takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    call FogEnable(false)
    call FogMaskEnable(false)
    call TriggerSleepAction(5.0)
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if IsUnitType(u, UNIT_TYPE_STRUCTURE) then
            call EmpAiLog("probe: building " + GetUnitName(u) + " at tile " + I2S(EmpAiTileX(GetUnitX(u))) + "," + I2S(EmpAiTileY(GetUnitY(u))))
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    call SetCameraFieldForPlayer(Player(0), CAMERA_FIELD_TARGET_DISTANCE, 2600.0, 0.0)
    call SetCameraPositionForPlayer(Player(0), GetUnitX(EmpAiYard), GetUnitY(EmpAiYard))
endfunction`,
  } : {}),
  // --sites: the building sites (ai-map.j): tiles round the first cluster where side 1's refinery fits
  // with and without the road link of an exit, and EmpAiPlace's answer
  ...(flag('--sites') ? {
    extraStart: 'SitesProbeRun',
    extraFunctions: `function SitesProbeTile takes nothing returns nothing
    if EmpAiSiteFits(EmpAiEvT, EmpAiEvX, EmpAiEvY) then
        set EmpAiEvN = EmpAiEvN + 1
    endif
endfunction

// a thread per tile (the op limit)
function SitesProbeCount takes integer t returns integer
    local integer x = EmpAiClX0[0] - 12
    local integer y
    set EmpAiEvT = t
    set EmpAiEvN = 0
    loop
        exitwhen x > EmpAiClX1[0] + 12
        set y = EmpAiClY0[0] - 12
        loop
            exitwhen y > EmpAiClY1[0] + 12
            set EmpAiEvX = x
            set EmpAiEvY = y
            call ExecuteFunc("SitesProbeTile")
            set y = y + 1
        endloop
        set x = x + 1
    endloop
    return EmpAiEvN
endfunction

function SitesProbeRun takes nothing returns nothing
    local integer t = EmpAiRefinery[EmpEnemyHouse]
    local integer withRoad
    local integer without
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    set withRoad = SitesProbeCount(t)
    call SaveBoolean(EmpAiTab, t, 2, false)
    set without = SitesProbeCount(t)
    call SaveBoolean(EmpAiTab, t, 2, true)
    call EmpAiLog("probe: clusters " + I2S(EmpAiClN) + " box " + I2S(EmpAiClX0[0]) + "," + I2S(EmpAiClY0[0]) + " .. " + I2S(EmpAiClX1[0]) + "," + I2S(EmpAiClY1[0]) + " refinery fits " + I2S(withRoad) + " / without the road " + I2S(without))
    call EmpAiLog("probe: place -> " + I2S(EF_B2I(EmpAiPlace(t))) + " at " + I2S(EmpAiSiteX) + "," + I2S(EmpAiSiteY))
endfunction`,
  } : {}),
  // --critneeds: the builder's critical needs (ai.j EmpAiCritical): skill 99, strength 2; the AI report
  // logs EmpAiCritical() past 1 minute (refineries: want 3 > the template's), with the windtraps gone
  // (power) and with 3 ornithopters of the enemy house and its helipads gone (helipads)
  ...(flag('--critneeds') ? {
    extraStart: 'CritNeedsRun',
    extraFunctions: `function CritNeedsKill takes nothing returns boolean
    local integer t = EmpType(GetFilterUnit())
    if EmpAlive(GetFilterUnit()) and (t == EmpAiPower[EmpEnemyHouse] or t == EmpAiHelipad[EmpEnemyHouse]) then
        call KillUnit(GetFilterUnit())
    endif
    return false
endfunction

function CritNeedsName takes integer t returns string
    if t <= 0 then
        return I2S(t)
    endif
    return GetObjectName(t)
endfunction

function CritNeedsRun takes nothing returns nothing
    local group g = CreateGroup()
    local integer i = 0
    set EmpNormalConditions = false
    call TriggerSleepAction(2.0)
    set EmpAiSkill = 99
    set EmpAiStrength = 2
    loop
        exitwhen EmpTick > 1600
        call TriggerSleepAction(1.0)
    endloop
    call EmpAiLog("probe: refineries " + I2S(EmpAiCount(-2)) + " power " + I2S(EmpPowerSum[1]) + " -> " + CritNeedsName(EmpAiCritical()))
    // enough refineries for the time, so the later needs show
    loop
        exitwhen EmpAiCount(-2) >= 3
        call CreateUnit(Player(1), EmpAiRefinery[EmpEnemyHouse], EmpBaseX[EmpBaseOfSide(1)] + 1200.0 + 600.0 * EmpAiCount(-2), EmpBaseY[EmpBaseOfSide(1)], 270.0)
    endloop
    call TriggerSleepAction(2.0)
    call EmpAiLog("probe: refineries " + I2S(EmpAiCount(-2)) + " power " + I2S(EmpPowerSum[1]) + " -> " + CritNeedsName(EmpAiCritical()))
    call GroupEnumUnitsOfPlayer(g, Player(1), Condition(function CritNeedsKill))
    call TriggerSleepAction(2.0)
    call EmpAiLog("probe: windtraps gone, power " + I2S(EmpPowerSum[1]) + " -> " + CritNeedsName(EmpAiCritical()))
    loop
        exitwhen i >= 3
        call CreateUnit(Player(1), '${all.units.rawcode.get('HKGunship')}', EmpBaseX[EmpBaseOfSide(1)], EmpBaseY[EmpBaseOfSide(1)], 0.0)
        set i = i + 1
    endloop
    call EmpAiLog("probe: 3 gunships, helipad " + CritNeedsName(EmpAiHelipad[EmpEnemyHouse]) + " -> " + CritNeedsName(EmpAiCritical()))
    call DestroyGroup(g)
    set g = null
endfunction`,
  } : {}),
  // --special: the special units (forces.j EmpAiSpecialTurn): tech 8, skill 99, credits, 16 units of
  // side 1; past 4500 ticks the AI report logs "special unit <name>" (Rules.txt AiSpecial types)
  ...(flag('--special') ? {
    defaultTech: 8,
    extraStart: 'SpecialProbeRun',
    extraFunctions: `function SpecialProbeRun takes nothing returns nothing
    local integer i = 0
    set EmpNormalConditions = false
    call TriggerSleepAction(2.0)
    set EmpAiSkill = 99
    loop
        exitwhen i >= 16
        call CreateUnit(Player(1), '${all.units.rawcode.get('HKLightInf')}', EmpBaseX[EmpBaseOfSide(1)], EmpBaseY[EmpBaseOfSide(1)], 0.0)
        set i = i + 1
    endloop
    loop
        call SetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD, 30000)
        call TriggerSleepAction(5.0)
    endloop
endfunction`,
  } : {}),
  // --reserve: the reserve teams (ai.j EmpAiResTeam): 8 home units of side 1, a unit of the player at
  // the base as a threat, killed after 15 s; the AI report logs the points and where the teams stand
  ...(flag('--reserve') ? {
    extraStart: 'ReserveProbeRun',
    extraFunctions: `function ReserveProbeLog takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer b = EmpBaseOfSide(1)
    local integer t
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set t = LoadInteger(EmpWaveTab, GetHandleId(u), ${BATTLE.AI_TAB_RESERVE_TEAM})
        if t > 0 and EmpAlive(u) then
            call EmpAiLog("probe: team " + I2S(t) + " at " + I2S(R2I(GetUnitX(u))) + "," + I2S(R2I(GetUnitY(u))) + " point " + I2S(R2I(EmpAiDefX[b * 3 + t])) + "," + I2S(R2I(EmpAiDefY[b * 3 + t])))
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function ReserveProbeRun takes nothing returns nothing
    local integer i = 0
    local integer b
    local unit a
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    set b = EmpBaseOfSide(1)
    call EmpAiLog("probe: base " + I2S(R2I(EmpBaseX[b])) + "," + I2S(R2I(EmpBaseY[b])) + " points " + I2S(R2I(EmpAiDefX[b * 3])) + "," + I2S(R2I(EmpAiDefY[b * 3])) + " " + I2S(R2I(EmpAiDefX[b * 3 + 1])) + "," + I2S(R2I(EmpAiDefY[b * 3 + 1])) + " " + I2S(R2I(EmpAiDefX[b * 3 + 2])) + "," + I2S(R2I(EmpAiDefY[b * 3 + 2])))
    loop
        exitwhen i >= 8
        call CreateUnit(Player(1), '${all.units.rawcode.get('HKLightInf')}', EmpBaseX[b] + 200.0, EmpBaseY[b], 0.0)
        set i = i + 1
    endloop
    call TriggerSleepAction(5.0)
    set a = CreateUnit(Player(0), '${all.units.rawcode.get('ATTrike')}', EmpBaseX[b] + 500.0, EmpBaseY[b], 0.0)
    call UnitShareVision(a, Player(1), true)
    call SetUnitInvulnerable(a, true)
    call TriggerSleepAction(15.0)
    call EmpAiLog("probe: trike alive " + I2S(IntegerTertiaryOp(EmpAlive(a), 1, 0)) + " visible " + I2S(IntegerTertiaryOp(IsUnitVisible(a, Player(1)), 1, 0)) + " fights " + I2S(EmpAiResFight[1]))
    call SetUnitInvulnerable(a, false)
    call KillUnit(a)
    call TriggerSleepAction(25.0)
    call EmpAiLog("probe: fights " + I2S(EmpAiResFight[1]) + " " + I2S(EmpAiResFight[2]) + " " + I2S(EmpAiResFight[3]))
    call ReserveProbeLog()
endfunction`,
  } : {}),
  // --harvflee: the harvester flight (ai.j EmpAiHarvTick): skill 99, tech 8; a unit of the player hits
  // side 1's harvester; the AI report logs "harvester under attack" and where it went
  ...(flag('--harvflee') ? {
    extraStart: 'HarvFleeProbeRun',
    extraFunctions: `function HarvFleeProbeRun takes nothing returns nothing
    local group g = CreateGroup()
    local unit h = null
    local unit u
    local unit a
    set EmpNormalConditions = false
    call TriggerSleepAction(3.0)
    set EmpAiSkill = 99
    set EmpTechLevel = 8
    loop
        exitwhen h != null or EmpTick > 3000
        call GroupEnumUnitsOfPlayer(g, Player(1), null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if EmpType(u) == '${all.units.rawcode.get('Harvester')}' and EmpAlive(u) then
                set h = u
            endif
        endloop
        call TriggerSleepAction(1.0)
    endloop
    call DestroyGroup(g)
    set g = null
    if h == null then
        call EmpAiLog("probe: no harvester")
        return
    endif
    call EmpAiLog("probe: harvester at " + I2S(R2I(GetUnitX(h))) + "," + I2S(R2I(GetUnitY(h))))
    set a = CreateUnit(Player(0), '${all.units.rawcode.get('ATTrike')}', GetUnitX(h) + 200.0, GetUnitY(h), 0.0)
    call UnitDamageTarget(a, h, 1.0, true, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
    call TriggerSleepAction(1.0)
    call EmpAiLog("probe: harvester order " + OrderId2String(GetUnitCurrentOrder(h)) + " at " + I2S(R2I(GetUnitX(h))) + "," + I2S(R2I(GetUnitY(h))))
    call TriggerSleepAction(8.0)
    call EmpAiLog("probe: harvester now at " + I2S(R2I(GetUnitX(h))) + "," + I2S(R2I(GetUnitY(h))))
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
