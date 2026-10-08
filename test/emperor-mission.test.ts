// Mission maps built from the user's installed Emperor data.
// Skipped when the game or the extracted data (node src/emperor/extract.ts) is absent.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '../src/emperor/build-mission.ts';
import { readMeta } from '../src/emperor/mapxbf.ts';
import { ensureMap } from '../src/emperor/preview-map.ts';
import { buildMission } from '../src/emperor/mission.ts';
import { loadCampaign, defendVariant } from '../src/emperor/campaign-data.ts';
import { superweapons } from '../src/emperor/superweapons.ts';
import { specialAbilities } from '../src/emperor/specials.ts';
import { UI_EVENTS } from '../src/config/runtime.ts';
import modelModule from 'mdx-m3-viewer/dist/cjs/parsers/mdlx/model.js';

const MdlxModel = modelModule.default;

import { RAW_DIR, GAME_EXE } from '../src/config/paths.ts';
const RAW = RAW_DIR;
const have = fs.existsSync(GAME_EXE) && fs.existsSync(path.join(RAW, 'Rules.txt'));
const opts = { skip: have ? false : 'Emperor game/data not available' };

// Regression: HK_S_Heighliner showed "Победа!" right after the start. The script's win check is
// SideObjectCount(GetEnemySide(), ATFactoryFrigate) == 0 && ... ORFactoryFrigate == 0, and the
// enemy frigates are objects placed in map #H3 with owner 1. EmpPlaced skipped every
// *FactoryFrigate as scenery, so the counts were 0 from the first tick. It did not surface in
// pjass or in territory battles: only the heighliner story maps place frigates.
// Guaranteed now: placed frigates of owner 1 are created for Player(1) (= GetEnemySide()).
test('heighliner story map places the enemy factory frigates for the enemy side', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#H3 ')[0], 'test.xbf'));
  const m = buildMission({
    scripts: [{ tok: fs.readFileSync(path.join(RAW, 'HHK Heighliner Mission.tok')), phase: 1, name: 'HHK Heighliner Mission' }],
    meta, ...all, name: 'HK_S_Heighliner', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x',
  });
  const placedBody = m.script.split('function EmpPlaced takes nothing returns nothing')[1].split('endfunction')[0];
  for (const n of ['ATFactoryFrigate', 'ORFactoryFrigate']) {
    const id = all.units.rawcode.get(n);
    assert.ok(id, `${n} has a rawcode`);
    assert.ok(placedBody.includes(`CreateUnit(Player(1), '${id}'`), `${n} (${id}) is placed for Player(1)`);
  }
  // owner 0 = the player's side (H2/H3 own frigate, the whole HK base of #V1 Homeworld Defence)
  assert.ok(placedBody.includes(`CreateUnit(Player(0), '${all.units.rawcode.get('HKFactoryFrigate')}'`), 'own frigate is placed for Player(0)');
});

// Regression: in HK_S_Heighliner the camera started on the WC3 start location (an empty corner of
// #H3). Emperor story scripts never move the main camera at the start (they only pan the PIP
// window), the game starts it on the player's forces. Territory battles set it themselves, so
// only story maps showed it. Guaranteed now: unless a script or the battle setup set the camera,
// it is centred on the player's units shortly after the start.
test('story map centres the camera on the player forces when nothing else does', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#H3 ')[0], 'test.xbf'));
  const m = buildMission({
    scripts: [{ tok: fs.readFileSync(path.join(RAW, 'HHK Heighliner Mission.tok')), phase: 1, name: 'HHK Heighliner Mission' }],
    meta, ...all, name: 'HK_S_Heighliner', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x',
  });
  assert.match(m.script, /function EmpInitialCamera takes nothing returns nothing/);
  assert.match(m.script, /TimerStart\(CreateTimer\(\), 0\.5, false, function EmpInitialCamera\)/);
  const look = m.script.split('function EF_CameraLookAtPoint')[1].split('endfunction')[0];
  assert.match(look, /set EmpCamSet = true/);
});

// Regression: crates were WC3 'gold' items. Emperor units have no inventory in WC3, so nothing could
// pick them up, and every crate gave the same thing. Emperor crates give CrateGiftObject from
// Rules.txt when a unit drives over them. Guaranteed now: each placed crate is registered with
// its gift (unit rawcode, or cash for CASH<n>) and a periodic proximity check hands it out.
test('crates give their Rules.txt gift to the unit that reaches them', opts, () => {
  const all = loadAll();
  assert.strictEqual(all.rules.crates.get('SardaukarCrate'), 'IMSardaukar');
  assert.strictEqual(all.rules.crates.get('MoneyCrate'), 'CASH2000');
  const meta = readMeta(path.join(ensureMap('#H1 ')[0], 'test.xbf'));
  assert.ok(meta.buildings?.some((b) => b.name === 'SardaukarCrate'), '#H1 has a Sardaukar crate');
  const m = buildMission({
    scripts: [{ tok: fs.readFileSync(path.join(RAW, 'Atreides Heighliner Mission.tok')), phase: 1, name: 'Atreides Heighliner Mission' }],
    meta, ...all, name: 'AT_S_Heighliner', playerHouse: 'Atreides', kind: 'story', hubMap: 'AT_Hub.w3x',
  });
  const placedBody = m.script.split('function EmpPlaced takes nothing returns nothing')[1].split('endfunction')[0];
  assert.ok(placedBody.includes(`, '${all.units.rawcode.get('IMSardaukar')}', 0)`), 'Sardaukar crate registered with IMSardaukar');
  assert.ok(!placedBody.includes("CreateItem('gold'"), 'no bare gold items');
  assert.match(m.script, /function EmpCrateTick takes nothing returns nothing/);
  assert.match(m.script, /TimerStart\(CreateTimer\(\), 0\.5, true, function EmpCrateTick\)/);
});

// Veterancy (Rules.txt): a killer gets the victim's Score; VeterancyLevel = N blocks give absolute
// Health, ExtraDamage %, ExtraArmour %, CanSelfRepair, Elite. Previously ignored (TODO(veterancy)).
test('veterancy levels are parsed from Rules.txt and wired into missions', opts, () => {
  const all = loadAll();
  const k = all.rules.objects.get('ATKindjal');
  assert.ok(k, 'ATKindjal in Rules.txt');
  assert.strictEqual(k.score, 2);
  assert.strictEqual(k.health, 600, 'base health is not overwritten by veterancy blocks');
  assert.deepStrictEqual(k.veterancy.map((l) => l.score), [2, 10, 20]);
  assert.strictEqual(k.veterancy[0].health, 800);
  assert.strictEqual(k.veterancy[0].extraDamage, 50);
  assert.strictEqual(k.veterancy[1].selfRepair, 1, 'CanSelfRepair = 1 is an amount per repair period');
  assert.strictEqual(k.veterancy[2].elite, true);
  assert.strictEqual(k.veterancy[2].extraDamage, 100);
  const meta = readMeta(path.join(ensureMap('#H3 ')[0], 'test.xbf'));
  const m = buildMission({
    scripts: [{ tok: fs.readFileSync(path.join(RAW, 'HHK Heighliner Mission.tok')), phase: 1, name: 'HHK Heighliner Mission' }],
    meta, ...all, name: 'HK_S_Heighliner', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x',
  });
  const id = all.units.rawcode.get('ATKindjal');
  // level 1 of ATKindjal: threshold 2, health 800 -> WC3 400
  assert.ok(m.script.includes(`call EmpVetLevel('${id}', 1, 2, 400, 50, 0, 0, 0, 0.0, false, false)`), 'ATKindjal level 1 registered');
  assert.match(m.script, /EVENT_PLAYER_UNIT_DEATH/);
  assert.match(m.script, /function EmpOnKill takes nothing returns nothing/);
  // level 2 of ATKindjal: CanSelfRepair = 1 per 10 ticks (Rules.txt RepairRate period) = 2.5
  // Emperor health per second = 1.25 WC3 health per second; it was 1 % of max health (a guess)
  assert.ok(m.script.includes(`call EmpVetLevel('${id}', 2, 10, 0, 0, 0, 0, 0, 1.25, false, false)`), 'ATKindjal level 2 self-repair rate');
});

// Veterancy ExtraRange was not applied (TODO(veterancy)): in 1.31.1 the weapon range setter changes
// nothing (src/smoke/build-range-probe.ts), and a new unit would break the scripts' references to it.
// A Chaos-based ability turns a unit into another type while it stays the same unit: handle,
// variables, hashtable data, groups, selection, life, max life and armour kept; base damage, speed,
// regeneration and added abilities reset to the new type's (src/smoke/build-morph-probe.ts,
// 2026-10-08, 1.31.1). Guaranteed now: every (type, ExtraRange %) has a veteran copy of the type with
// the longer range and a morph ability into it; a level with ExtraRange morphs the unit, the
// veterancy stats are put back after it, and the runtime looks every type up through EmpType (the
// veteran type counts as its Emperor type for scripts, AI, effects and tables).
test('veterancy ExtraRange turns the unit into a longer-range copy of its type', opts, () => {
  const all = loadAll();
  assert.strictEqual(all.rules.objects.get('ATTrike')?.veterancy[2]?.extraRange, 50);
  const trike = all.units.rawcode.get('ATTrike') as string;
  const vet = all.units.vetRange.find((v) => v.type === trike && v.percent === 50);
  assert.ok(vet, 'ATTrike has a +50 % range veteran type');
  const range = (id: string): number => Number(all.units.objects.find((o) => o.id === id)?.mods.filter((m) => m.field === 'ua1r').at(-1)?.value);
  const acquire = (id: string): number => Number(all.units.objects.find((o) => o.id === id)?.mods.filter((m) => m.field === 'uacq').at(-1)?.value);
  assert.strictEqual(range(vet.veteran), Math.round(range(trike) * 1.5));
  assert.ok(acquire(vet.veteran) >= range(vet.veteran), 'the veteran acquires targets at its range');
  assert.strictEqual(all.units.objects.find((o) => o.id === vet.veteran)?.base, all.units.objects.find((o) => o.id === trike)?.base);
  // the morph ability: Chaos without its research requirement, UnitID1 = the veteran type
  const w3a = all.units.w3a.toString('latin1');
  assert.ok(w3a.includes(`Sca1${vet.morph}`), 'morph ability made from Chaos');
  assert.ok(w3a.includes(`Cha1\u0003\0\0\0\u0001\0\0\0\0\0\0\0${vet.veteran}\0`), 'Cha1 level 1 = veteran type');
  assert.ok(w3a.includes('areq\u0003\0\0\0\0\0\0\0\0\0\0\0\0'), 'no Chaos research needed');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'vet range', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes(`call EmpVetRangeType('${trike}', 50, '${vet.veteran}', '${vet.morph}')`), 'veteran type registered');
  const body = (name: string): string => m.script.split(`function ${name} takes`)[1]?.split('endfunction')[0] ?? '';
  assert.match(body('EmpVetApply'), /UnitAddAbility\(u, LoadInteger\(EmpVet, t, /, 'a level with ExtraRange morphs the unit');
  assert.match(body('EmpVetRestore'), /BlzSetUnitBaseDamage/, 'damage put back after the morph');
  assert.match(body('EmpVetRestore'), /SetUnitMoveSpeed/, 'speed put back after the morph');
  // every other type lookup goes through EmpType (a comparison with 0 asks whether the unit still
  // exists: the WC3 type itself)
  const raw = m.script.split(/\nfunction /).filter((f) => f.replace(/GetUnitTypeId\([^()]*(\([^()]*\))?\) [!=]= 0/g, '').includes('GetUnitTypeId(')).map((f) => f.split(' ')[0]);
  assert.deepStrictEqual(raw.filter((f) => !['EmpType', 'EmpAlive', 'EmpVetApply', 'EmpVetMorphed'].includes(f as string)), [], 'raw GetUnitTypeId only where the WC3 type itself is meant');
});

// StealthedWhenStill (scouts by type, ATSniper at veterancy level 3) and AIThreat were not modelled.
test('stealthed-when-still units and the AIThreat target priority come from Rules.txt', opts, () => {
  const all = loadAll();
  assert.deepStrictEqual(all.rules.stealth, { delay: 30, afterFiring: 10 });
  assert.strictEqual(all.rules.objects.get('ATScout')?.stealthedWhenStill, true);
  assert.strictEqual(all.rules.objects.get('ATSniper')?.veterancy[2]?.stealthedWhenStill, true);
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'stealth', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes(`call SaveBoolean(EmpVet, '${all.units.rawcode.get('ATScout')}', 2, true)`), 'scout type stealthed when still');
  assert.match(m.script, new RegExp(`call EmpVetLevel\\('${all.units.rawcode.get('ATSniper')}', 3, [^)]*, true\\)`), 'sniper level 3 stealth');
  assert.match(m.script, /TimerStart\(CreateTimer\(\), 0\.2, true, function EmpStillTick\)/);
  assert.ok(m.script.includes('EmpTick - LoadInteger(EmpVetUnit, h, 10) >= 30'), 'StealthDelay');
  // UnstealthRange is a detection radius of turrets and scouts (HKGunTurret 6 tiles = 768)
  assert.strictEqual(all.rules.objects.get('HKGunTurret')?.unstealthRange, 6);
  assert.ok(m.script.includes(`call SaveReal(EmpVet, '${all.units.rawcode.get('HKGunTurret')}', 3, 768.0)`), 'detector range');
  assert.ok(m.script.includes('call GroupEnumUnitsInRange(g, GetUnitX(u), GetUnitY(u), 768.0, null)'), 'detectors searched within the largest range');
  const kindjal = all.rules.objects.get('ATKindjal');
  assert.strictEqual(kindjal?.aiThreat, 50);
  assert.ok(m.script.includes(`call SaveInteger(EmpThreat, '${all.units.rawcode.get('ATKindjal')}', 0, 50)`), 'AIThreat default');
  assert.ok(m.script.includes('set EmpThreatAny = true'));
});

// Regression: the normal win/lose rule counted every object, so a side that had only walls or
// small windtraps left (Rules.txt ExcludeFromCampaignLose = TRUE: *Wall, *SmWindtrap, IXWindtrap,
// INTLWindtrap) was not beaten. Found by an independent audit 2026-10-08 (the flag was never read).
test('objects with ExcludeFromCampaignLose do not keep a side alive in the normal win/lose rule', opts, () => {
  const all = loadAll();
  assert.strictEqual(all.rules.objects.get('HKWall')?.excludeFromLose, true);
  assert.strictEqual(all.rules.objects.get('ATSmWindtrap')?.excludeFromLose, true);
  assert.strictEqual(all.rules.objects.get('ATBarracks')?.excludeFromLose, false);
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'lose', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes(`call SaveBoolean(EmpVet, '${all.units.rawcode.get('HKWall')}', 4, true)`), 'wall excluded');
  assert.ok(!m.script.includes(`call SaveBoolean(EmpVet, '${all.units.rawcode.get('ATBarracks')}', 4, true)`), 'barracks counted');
  const check = m.script.slice(m.script.indexOf('function EmpNormalCheck'), m.script.indexOf('endfunction', m.script.indexOf('function EmpNormalCheck')));
  assert.ok(check.length > 0 && !/EmpCount\(/.test(check) && /EmpLoseCount\(/.test(check), 'normal rule counts through EmpLoseCount');
});

// The enemy's pace was invented (ENEMY_PRODUCE_PERIOD 20 s, ENEMY_WAVE_PERIOD 150 s) although
// ai_difficulty.ini gives it per tech level. Found by an independent audit 2026-10-08.
test('enemy AI pace from ai_difficulty.ini by tech level', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'pace', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('set EmpAiTUnitDelay[1] = 35.0') && m.script.includes('set EmpAiTBuildDelay[4] = 19.2'), 'delays in seconds (875 / 480 ticks)');
  assert.ok(m.script.includes('set EmpAiTMax[1] = 22') && m.script.includes('set EmpAiTTurrets[3] = 2') && m.script.includes('set EmpAiTFirst[1] = 5000'));
  assert.ok(m.script.includes('call TimerStart(CreateTimer(), EmpAiTUnitDelay[EmpAiT()], true, function EmpEnemyProduce)'), 'unit delay');
  assert.ok(m.script.includes('call TimerStart(CreateTimer(), EmpAiTBuildDelay[EmpAiT()], true, function EmpEnemyBuildTurn)'), 'building delay');
  assert.ok(m.script.includes('if EmpCount(1, 1) >= EmpAiTMax[EmpAiT()] then'), 'MaxAiUnits');
  assert.ok(m.script.includes('if EmpTick < EmpAiTFirst[EmpAiT()] then'), 'FirstAttackDelay');
  assert.ok(m.script.includes('EmpAiCount(-1) < EmpAiTTurrets[EmpAiT()]'), 'MaxTurretsAllowed');
  assert.ok(m.script.includes('>= EmpAiTBuildings[EmpAiT()]'), 'NumBuildings');
  assert.ok(!m.script.includes('function EmpEnemyWave'), 'no invented wave period');
});

// Building upgrades (Rules.txt UpgradeCost / UpgradeTechLevel / UpgradeBuildTime) were missing, so
// the 35 types with UpgradedPrimaryRequired (Kindjal, Kobra, the house turrets...) were buildable
// without them. Each upgradable building now researches a custom upgrade (war3map.w3q) that those
// types require; in-game probe src/smoke/build-tech-probe.ts (2026-10-08) showed ureq and
// SetPlayerTechMaxAllowed work with custom upgrades in 1.31.1. Found by an independent audit.
test('building upgrades: researched by the building, required by UpgradedPrimaryRequired types, tech-gated', opts, () => {
  const all = loadAll();
  const at = all.rules.objects.get('ATBarracks');
  assert.strictEqual(at?.upgradeCost, 800);
  assert.strictEqual(at?.upgradeTechLevel, 3);
  assert.strictEqual(all.rules.objects.get('HKRefineryDock')?.upgradeBuildTime, 720);
  assert.strictEqual(all.rules.objects.get('ATKindjal')?.upgradedPrimaryRequired, true);
  assert.strictEqual(all.rules.objects.get('ATInfantry')?.upgradedPrimaryRequired, false);
  const up = all.units.upgrades;
  assert.strictEqual(up.length, 20, 'every building with an UpgradeCost');
  const atUp = up.find((u) => u.building === 'ATBarracks');
  assert.ok(atUp && atUp.cost === 800 && atUp.techLevel === 3);
  const objOf = (name: string) => all.units.objects.find((o) => o.id === all.units.rawcode.get(name));
  const fieldOf = (name: string, field: string) => objOf(name)?.mods.filter((m) => m.field === field).map((m) => String(m.value)).at(-1) ?? '';
  assert.strictEqual(fieldOf('ATBarracks', 'ures'), atUp.id, 'the barracks researches its upgrade');
  assert.ok(fieldOf('ATKindjal', 'ureq').split(',').includes(atUp.id), 'Kindjal needs the upgraded barracks');
  assert.ok(!fieldOf('ATInfantry', 'ureq').split(',').includes(atUp.id), 'plain infantry does not');
  const yardUp = up.find((u) => u.building === 'HKConYard');
  assert.ok(yardUp && fieldOf('HKGunTurret', 'ureq').split(',').includes(yardUp.id), 'turret needs the upgraded construction yard');
  // Regression: only gnam / gtp1 were set, so hovering the button showed the stock extended tooltip
  // of the base upgrade (Iron Forged Swords). gub1 now says what the upgrade unlocks.
  const w3q = all.units.w3q.toString('latin1');
  assert.strictEqual((w3q.match(/gub1/g) ?? []).length, up.length, 'every upgrade has its extended tooltip');
  // upgrade time: UpgradeBuildTime, else the building's own BuildTime
  assert.strictEqual(up.find((u) => u.building === 'HKRefineryDock')?.seconds, 720 / 25);
  assert.strictEqual(atUp.seconds, (all.rules.objects.get('ATBarracks')?.buildTime ?? 0) / 25);
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'upgrades', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.imports['war3map.w3q'] && m.imports['war3map.w3q'].length > 100, 'mission imports the upgrade objects');
  assert.match(m.script, new RegExp(`if EmpTechLevel < 3 then[\\s\\S]*?call SetPlayerTechMaxAllowed\\(Player\\(i\\), '${atUp.id}', 0\\)`), 'tech gate');
  // the enemy AI buys the upgrades of its house and produces gated types only after them
  assert.ok(m.script.includes(`'${atUp.id}'`) && /set EmpAiUpg\[\d+\] = '/.test(m.script), 'AI upgrade table');
  assert.ok(m.script.includes(`call SaveInteger(EmpAiTab, '${all.units.rawcode.get('ATKindjal')}', 5, '${atUp.id}')`), 'Kindjal waits for the upgrade');
  assert.ok(m.script.includes('elseif EmpAiUpgrade() then'), 'builder turn tries upgrades');
});

// The 64 *Fail / *Win variants of defence scripts were parsed and never played. Inferred from their
// content (not from game code): 59 Fail variants only give the enemy cash (the help of the base
// script, e.g. ATP1D1FR "the Fremen repay their debt", did not come), so a defence plays its Fail
// variant unless the attack on the same territory in the same phase was won; a Win variant plays
// when it was won. The attack map records the win in the game cache (won<attack script>).
test('defence scripts pick their Fail / Win variant by the won attack on the same territory', opts, () => {
  const all = loadAll();
  const camp = loadCampaign(RAW, []);
  assert.deepStrictEqual(defendVariant(camp, 'AT', 1, 1), { name: 'ATP1D1FRFail', attack: 'ATP1M1FR', won: false });
  assert.deepStrictEqual(defendVariant(camp, 'AT', 1, 19), { name: 'ATP1D19GNWin', attack: 'ATP1M19GN', won: true });
  assert.deepStrictEqual(defendVariant(camp, 'AT', 1, 16), { name: 'ATP1D16GNFail', attack: 'ATP1M16AT', won: false }, 'paired by phase and territory');
  assert.strictEqual(defendVariant(camp, 'OR', 2, 8), null, 'no attack to pair with');
  // Regression (second audit): HKP1D1FRFail was paired with HKP1M1FR, an attack on the house's own
  // capital that is never played (build-campaign skips it), so HK_D01 always played the Fail variant
  assert.strictEqual(camp.jumpPoint.HK, 1);
  assert.strictEqual(defendVariant(camp, 'HK', 1, 1), null, 'an attack never played does not pick variants');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const tokOf = (n: string): Buffer => fs.readFileSync(path.join(RAW, `${n}.tok`));
  const d = buildMission({ scripts: [{ tok: tokOf('ATP1D1FR'), phase: 1, name: 'ATP1D1FR' }, { tok: tokOf('ATP1D1FRFail'), phase: 1, name: 'ATP1D1FRFail', whenWon: { attack: 'ATP1M1FR', won: false } }],
    meta, ...all, name: 'variant', playerHouse: 'Atreides', kind: 'defend', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(d.script.includes('if EmpInCampaign and EmpPhase == 1 and GetStoredInteger(EmpCache, "emp", "wonATP1M1FR") != 1 then\n        set EmpScriptIndex = 1'), 'variant picked when the attack was not won');
  const a = buildMission({ scripts: [{ tok: tokOf('ATP1M1FR'), phase: 1, name: 'ATP1M1FR' }], meta, ...all, name: 'attack', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(a.script.includes('call StoreInteger(EmpCache, "emp", "wonATP1M1FR", 1)'), 'attack win recorded');
});

// Palace super weapons (Rules.txt HKDeathHand / ATHawkWeapon / ORBeamWeapon, Cost 0) were filtered
// out, and SideNuke used invented NUKE_RADIUS / NUKE_DAMAGE. A palace now trains the charge for its
// BuildTime; the charge's attack-ground order is the strike (in-game probe
// src/smoke/build-superweapon-probe.ts, 2026-10-08). Effects from Rules.txt; what Hawk and Chaos
// Lightning do to units from cncnz.com (Atreides / Ordos structures): units flee / go berserk.
test('palace super weapons: Rules.txt strike data, trained by the palace, fired by attack-ground', opts, () => {
  const all = loadAll();
  const sw = superweapons(all.rules);
  const dh = sw.find((w) => w.kind === 'deathHand');
  assert.deepStrictEqual(dh && { name: dh.name, palace: dh.palace, chargeTicks: dh.chargeTicks, damage: dh.damage, radiusTiles: dh.radiusTiles, friendly: dh.friendly },
    { name: 'HKDeathHand', palace: 'HKPalace', chargeTicks: 5184, damage: 5000, radiusTiles: 3, friendly: true });
  // TODO(superweapon) closed by Game.exe 1.09 (splat update 0x543c00): the splat detonates its
  // Resource bullet (DeathHandSplat_B) every tick for its Lifespan; the bullet hits within its own
  // BlastRadius (320 = 10 tiles, not the splat Size 10 / 2) through its warhead. Before: once a second,
  // radius Size / 2, the same damage for every armour.
  assert.deepStrictEqual(dh?.fallout, { damage: 15, radiusTiles: 10, lifespanTicks: 1000, friendly: true, warhead: 'DeathHandSplat_W' });
  assert.strictEqual(dh?.warhead, 'Death_W');
  const hawk = sw.find((w) => w.kind === 'hawk');
  assert.deepStrictEqual(hawk && [hawk.name, hawk.palace, hawk.chargeTicks, hawk.damage, hawk.radiusTiles, hawk.friendly, hawk.effectTicks], ['ATHawkWeapon', 'ATPalace', 4536, 1000, 4, false, 500]);
  const beam = sw.find((w) => w.kind === 'beam');
  assert.deepStrictEqual(beam && [beam.name, beam.palace, beam.chargeTicks, beam.damage, beam.radiusTiles, beam.friendly, beam.effectTicks], ['ORBeamWeapon', 'ORPalace', 6220, 1000, 4, false, 300]);
  const objOf = (name: string) => all.units.objects.find((o) => o.id === all.units.rawcode.get(name));
  const fieldOf = (name: string, field: string) => objOf(name)?.mods.filter((m) => m.field === field).map((m) => String(m.value)).at(-1) ?? '';
  assert.ok(fieldOf('HKPalace', 'utra').split(',').includes(all.units.rawcode.get('HKDeathHand') as string), 'the palace trains its charge');
  assert.notStrictEqual(fieldOf('HKDeathHand', 'uaen'), '0', 'the charge keeps its attack (attack-ground)');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'sw', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  const dhId = all.units.rawcode.get('HKDeathHand');
  // damage / radius scaled like units.ts: /DAMAGE_DIVISOR, tiles * 128
  assert.ok(m.script.includes(`call EmpSwType('${dhId}', 1, 2500.0, 384.0, true, 0.0)`), 'Death Hand strike data');
  // fallout: 15 per tick = 15 * 25 / 2 per second, radius 10 tiles, 1000 ticks = 40 s
  assert.ok(m.script.includes(`call EmpSwFallout('${dhId}', 187.5, 1280.0, 40.0, true)`), 'fallout per tick, bullet radius');
  // warheads: Death_W for the strike (Building 75), DeathHandSplat_W for the fallout (Building 10)
  const building = all.rules.armourTypes.indexOf('Building') + 1;
  assert.ok(building > 0 && m.script.includes(`call SaveInteger(EmpSwTab, '${dhId}', ${30 + building}, 75)`) && m.script.includes(`call SaveInteger(EmpSwTab, '${dhId}', ${60 + building}, 10)`), 'warhead percentages per armour');
  assert.ok(m.script.includes(`call SaveInteger(EmpSwTab, '${all.units.rawcode.get('ATBarracks')}', 20, ${building})`), 'armour of a type');
  const dmg = m.script.slice(m.script.indexOf('function EmpSwDamage takes'), m.script.indexOf('endfunction', m.script.indexOf('function EmpSwDamage takes')));
  assert.ok(dmg.includes('LoadInteger(EmpSwTab, EmpType(u), 20)'), 'damage by the armour of the unit');
  assert.ok(!m.script.includes('TODO(superweapon)'), 'TODO closed');
  assert.ok(m.script.includes('EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER') && m.script.includes('OrderId("attackground")'), 'strike by attack-ground');
  assert.ok(!/NUKE_RADIUS|2000\.0\)\s*$/m.test(m.script) && m.script.includes('function EmpNukeAt'), 'SideNuke strikes with the Death Hand data');
  // Regression: berserk units belong to Neutral Hostile until they calm down, so a side whose last
  // units went berserk counted as beaten (EmpNormalCheck). Berserk units are counted per side and the
  // rule waits for them.
  const check = m.script.slice(m.script.indexOf('function EmpNormalCheck'), m.script.indexOf('endfunction', m.script.indexOf('function EmpNormalCheck')));
  assert.ok(check.includes('EmpSwBerserk[0] == 0') && check.includes('EmpSwBerserk[1] == 0'), 'win / lose wait for berserk units');
  assert.ok(m.script.includes('set EmpSwBerserk[GetPlayerId(GetOwningPlayer(u))] = EmpSwBerserk[GetPlayerId(GetOwningPlayer(u))] + 1'), 'counted when berserk');
  assert.ok(m.script.includes('set EmpSwBerserk[p - 1] = EmpSwBerserk[p - 1] - 1'), 'uncounted when calm');
  // the enemy AI charges its palace weapon and fires it at the player's base it knows (house 1 = HK)
  assert.ok(m.script.includes(`set EmpAiSw[1] = '${dhId}'`) && m.script.includes('set EmpAiSwTicks[1] = 5184'), 'AI super weapon data');
  assert.ok(m.script.includes('call EmpSwStrike(t, Player(1), EmpAiKnownX, EmpAiKnownY)'), 'AI fires at the known base');
});

// The starports sold nothing: no unit names a starport as PrimaryBuilding, the 33 Starportable types
// are ordered there in Emperor. A house starport now trains the Starportable types of its house and
// the houseless ones (Harvester, MCV, Carryall). Found by an independent audit 2026-10-08.
test('starports train the Starportable units of their house', opts, () => {
  const all = loadAll();
  const trains = (b: string): string[] => all.units.objects.find((o) => o.id === all.units.rawcode.get(b))?.mods.filter((m) => m.field === 'utra').map((m) => String(m.value)).at(-1)?.split(',') ?? [];
  // a starport sells orders of the units (the frigate delivers them; mission starport.j)
  const id = (n: string): string => [...all.units.portOrders].find(([, real]) => real === all.units.rawcode.get(n))?.[0] ?? `none:${n}`;
  const at = trains('ATStarport');
  for (const n of ['ATTrike', 'ATMinotaurus', 'ATOrni', 'Harvester', 'MCV', 'Carryall']) assert.ok(at.includes(id(n)), `ATStarport sells ${n}`);
  for (const n of ['HKDevastator', 'ORLaserTank', 'SMQuad', 'GUMaker']) assert.ok(!at.includes(id(n)), `ATStarport does not sell ${n}`);
  assert.ok(trains('HKStarport').includes(id('HKDevastator')));
});

// Train / research buttons took their cell from the stock base unit, so types made from the same base
// shared a cell and hid each other on the command card (starports sell 11 types). Every building's
// buttons now have their own cells, never the rally point's (3,1) (in-game probe
// src/smoke/build-button-probe.ts: BlzGetAbilityPosX/Y('ARal') = 3,1).
test('command card: the train and research buttons of a building never share a cell', opts, () => {
  const all = loadAll();
  const byId = new Map(all.units.objects.map((o) => [o.id, o]));
  const last = (mods: { field: string; value: number | string }[], f: string): string => mods.filter((m) => m.field === f).map((m) => String(m.value)).at(-1) ?? '';
  const upgradeMods = new Map(all.units.upgradeButtons);
  for (const o of all.units.objects) {
    if (o.emperor?.category !== 'Building') continue;
    const cells: string[] = [];
    for (const t of last(o.mods, 'utra').split(',').filter(Boolean)) {
      const u = byId.get(t);
      assert.ok(u, `${o.emperor.name} trains a known type`);
      cells.push(`${last(u.mods, 'ubpx')},${last(u.mods, 'ubpy')}`);
    }
    const r = last(o.mods, 'ures');
    if (r) cells.push(upgradeMods.get(r)?.join(',') ?? 'none');
    assert.strictEqual(new Set(cells).size, cells.length, `${o.emperor.name}: ${cells.join(' ')}`);
    assert.ok(!cells.includes('3,1'), `${o.emperor.name}: rally point cell taken`);
    assert.ok(!cells.some((c) => c.includes('none') || c === ','), `${o.emperor.name}: every button has a cell`);
  }
  // build menus (12 cells, Cancel at 3,2): 12 buildings did not fit one builder, so walls and turrets
  // have their own builder; every house building is in one of them, each with its own cell
  const houseBuildings = (h: string) => [...all.rules.objects.values()].filter((b) => b.category === 'Building' && b.cost > 0 && b.name.startsWith(h) && /ConYard/.test(b.primaryBuilding.join(','))).map((b) => all.units.rawcode.get(b.name));
  for (const h of ['AT', 'HK', 'OR'] as const) {
    const menus = [all.units.ids.builders[h], all.units.ids.defenceBuilders[h]].map((id) => last(byId.get(id as string)?.mods ?? [], 'ubui').split(',').filter(Boolean));
    assert.deepStrictEqual(menus.flat().sort(), houseBuildings(h).sort(), `${h}: every building in a build menu`);
    for (const menu of menus) {
      const cells = menu.map((t) => { const b = byId.get(t); return b ? `${last(b.mods, 'ubpx')},${last(b.mods, 'ubpy')}` : 'none'; });
      assert.ok(menu.length <= 11 && new Set(cells).size === cells.length && !cells.includes('3,2'), `${h} build menu: ${cells.join(' ')}`);
    }
  }
});

// Sub-house buildings (FRCamp, IMBarracks, IXResCentre, TLFleshVat) were never buildable. Inferred
// from the scripts (not from game code): an attack tagged with a sub-house (ATP1M1FR: protect the
// Fremen camp) earns that sub-house's alliance when won; Ix and Tleilaxu exclude each other
// (Wikipedia). An allied sub-house's building is in the third builder's menu; the others stay locked.
// Corrected after a second audit: the tag of the script name is not the alliance (ATP3M5TL is fought
// *against* the Tleilaxu); 38 scripts play "<H>allygain<n>" once their goal is met (ATallygain1 "the
// Fremen want to discuss an alliance with us": 1 Fremen, 2 Sardaukar, 3 Ix, 4 Tleilaxu). That
// message marks the alliance; a won mission stores it.
test('sub-house alliances: the allygain message of a won mission allies the sub-house and unlocks its building', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const tokOf = (n: string): Buffer => fs.readFileSync(path.join(RAW, `${n}.tok`));
  const attack = (s: string) => buildMission({ scripts: [{ tok: tokOf(s), phase: 1, name: s }], meta, ...all, name: s, playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  const fr = attack('ATP1M4FR').script;
  assert.match(fr, /set EmpMsgAlly\[\d+\] = 1\n/, 'ATallygain1 marks the Fremen');
  assert.ok(fr.includes('if EmpAllyGain[1] then') && fr.includes('call StoreInteger(EmpCache, "emp", "allyFR", 1)'), 'stored when won');
  assert.ok(!attack('ATP3M5TL').script.includes('set EmpMsgAlly['), 'a mission against the Tleilaxu allies nobody');
  const ix = attack('ATP2M13IX').script;
  assert.ok(ix.includes('call StoreInteger(EmpCache, "emp", "allyIX", 1)') && ix.includes('call StoreInteger(EmpCache, "emp", "allyTL", 0)'), 'Ix ally ends the Tleilaxu one');
  const camp = all.units.rawcode.get('FRCamp');
  assert.ok(ix.includes(`call SetPlayerTechMaxAllowed(Player(i), '${camp}', 0)`), 'sub-house building locked unless allied');
  assert.match(ix, /GetStoredInteger\(EmpCache, "emp", "allyFR"\) == 1/);
  const menu = all.units.objects.find((o) => o.id === all.units.ids.allyBuilders.AT)?.mods.filter((m) => m.field === 'ubui').map((m) => String(m.value)).at(-1)?.split(',') ?? [];
  assert.deepStrictEqual(menu.sort(), ['FRCamp', 'IMBarracks', 'IXResCentre', 'TLFleshVat', 'GUPalace'].map((n) => all.units.rawcode.get(n)).sort(), 'third builder');
  // the scripts also play "<H>allybreak<n>" when the sub-house's condition fails (ATP1M4FR, Fremen
  // dead: "the Fremen will be outraged... the alliance is doomed"); it was not read, so a lost
  // alliance stayed. It ends the alliance whatever the result; of gain and break the later one counts.
  assert.match(fr, /set EmpMsgAlly\[\d+\] = -1\n/, 'ATallybreak1 marks the Fremen');
  const end = fr.slice(fr.indexOf('call StoreInteger(EmpCache, "emp", "resultkind"'));
  assert.ok(end.indexOf('if EmpAllyBreak[1] then') >= 0 && end.indexOf('if EmpAllyBreak[1] then') < end.indexOf('    if win then'), 'stored whatever the result');
  assert.ok(end.includes('call StoreInteger(EmpCache, "emp", "allyFR", 0)'), 'the Fremen alliance ends');
});

// Special abilities were missing (independent audit 2026-10-08): Deviator (Deviate_B, DeviateDuration,
// CanBeDeviated), Leech / Contaminator (Leech_B / Contaminator_B: Infantry, ShieldHealth per tick),
// Engineer (CanBeEngineered), Saboteur (SaboteurBomb), crushing (Crushes / Crushable).
test('special abilities: data from Rules.txt and their runtime', opts, () => {
  const all = loadAll();
  const sp = specialAbilities(all.rules);
  assert.strictEqual(sp.deviateTicks, 400, 'first DeviateDuration of [General] wins');
  assert.ok(sp.deviators.includes('ORDeviator'));
  assert.deepStrictEqual(sp.leeches.find((l) => l.name === 'TLLeech'), { name: 'TLLeech', infantry: false, damagePerTick: 2, damage: 100 });
  assert.deepStrictEqual(sp.leeches.find((l) => l.name === 'TLContaminator'), { name: 'TLContaminator', infantry: true, damagePerTick: 10000, damage: 10 });
  assert.deepStrictEqual([...sp.engineers].sort(), ['ATEngineer', 'HKEngineer', 'OREngineer']);
  assert.deepStrictEqual(sp.saboteurs, [{ name: 'ORSaboteur', damage: 3000, radiusTiles: 3 }]);
  assert.ok(sp.notDeviatable.length === 43 && sp.engineerable.length >= 39 && sp.crushers.length === 17 && sp.crushable.length === 36);
  // repair vehicle (Repair = true): [General] RepairTileRange, RepairRate per 10 ticks
  assert.deepStrictEqual(sp.repair, { units: ['ATRepairUnit'], rangeTiles: 10, perTenTicks: 12 });
  // third audit: story characters (TastyToWorms = FALSE) are neither leeched nor contaminated; the repair
  // vehicle mends only what CanBeRepaired allows; saboteurs do not blow up on walls
  assert.ok(sp.notRepairable.includes('ATInfantry') && sp.story.length > 0 && sp.walls.includes('HKWall'));
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'specials', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  const id = (n: string) => all.units.rawcode.get(n);
  assert.ok(m.script.includes(`call SaveInteger(EmpSpTab, '${id('ORDeviator')}', 0, 1)`), 'deviator kind');
  assert.ok(m.script.includes(`call SaveInteger(EmpSpTab, '${id('TLContaminator')}', 0, 3)`), 'contaminator kind');
  const immune = sp.notDeviatable.find((n) => id(n)) as string;
  assert.ok(m.script.includes(`call SaveBoolean(EmpSpTab, '${id(immune)}', 7, true)`), `${immune} cannot be deviated`);
  assert.ok(m.script.includes(`call SaveBoolean(EmpSpTab, '${id('ATBarracks')}', 8, true)`), 'barracks can be engineered');
  assert.ok(m.script.includes('EVENT_PLAYER_UNIT_DAMAGED') && m.script.includes('function EmpSpDamaged'), 'damage hook');
  assert.ok(m.script.includes('function EmpSpTick'), 'engineer / saboteur / crush scan');
  assert.ok(m.script.includes(`call SaveInteger(EmpSpTab, '${id('ATRepairUnit')}', 0, 6)`), 'repair vehicle');
  // third audit: a crusher with an order but standing (attacking from its place) ran infantry over;
  // now only one that moved since the last check. A host removed from the game (not killed) let out a
  // new leech at the map's corner.
  assert.ok(m.script.includes('call SaveReal(EmpSpTab, GetHandleId(u), 33, GetUnitX(u))'), 'crusher position kept');
  assert.ok(!m.script.includes('elseif GetUnitCurrentOrder(u) != 0 then'), 'an order alone is not moving');
  // the position goes with the crusher: WC3 reuses handle ids, a new unit must not compare with it
  assert.ok(m.script.includes('call RemoveSavedReal(EmpSpTab, GetHandleId(u), 33)'), 'stale crusher position cleared');
  assert.ok(m.script.includes('if GetUnitTypeId(u) != 0 then'), 'no leech out of a removed host');
});

// Regression (second audit): builders came only with a construction yard the player built
// (CONSTRUCT_FINISH); the bases of defence battles (EmpDefendStart), placed story bases and yards made
// by scripts (BuildObject) are made with CreateUnit, so there the player could build nothing.
// Every yard of the player now gets its builders once, whenever it appears.
test('every construction yard of the player gets its builders, also those made with CreateUnit', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'yards', playerHouse: 'Atreides', kind: 'defend', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('function EmpGiveBuilders takes unit b returns nothing'));
  assert.ok(m.script.includes('function EmpYardTick') && /TimerStart\(CreateTimer\(\), [\d.]+, true, function EmpYardTick\)/.test(m.script), 'periodic yard check');
  const done = m.script.slice(m.script.indexOf('function EmpOnBuildingDone'), m.script.indexOf('endfunction', m.script.indexOf('function EmpOnBuildingDone')));
  assert.ok(done.includes('call EmpGiveBuilders(b)'), 'built yards too, once');
  // Regression (third audit): builders came once per yard; when they died (storm, worm) the player could
  // not build again. A yard gives them again while the player has none.
  assert.ok(m.script.includes('call GroupClear(EmpYardsServed)'), 'builders again when all are gone');
  // fourth audit: a surviving sub-house builder counted as a builder, so the yard gave no others
  const tick = m.script.slice(m.script.indexOf('function EmpYardTick'), m.script.indexOf('endfunction', m.script.indexOf('function EmpYardTick')));
  assert.ok(!tick.includes(`'${all.units.ids.allyBuilders.AT}'`) && tick.includes(`'${all.units.ids.builders.AT}'`), 'only the yard\'s own builders count');
});

// In-game announcements were missing or invented ("Ментат: Недостаточно энергии! Турели отключены…"):
// Uispoken.txt / sounds.txt IngameMessages hold them, many per house (ATLowPower, HKLowPower...).
// Found by an independent audit 2026-10-08.
test('in-game announcements: the original lines of the player\'s house, with their speech', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'ui', playerHouse: 'Harkonnen', kind: 'attack', territoryBattle: true, hubMap: 'HK_Hub.w3x' });
  const lowPower = UI_EVENTS.findIndex(([n]) => n === 'lowPower') + 1;
  const base = UI_EVENTS.findIndex(([n]) => n === 'baseAttack') + 1;
  assert.ok(m.script.includes(`set EmpUiText[${lowPower}] = "Вам нужно больше энергии.  Стройте больше ветроловушек."`), 'HKLowPower text');
  // the installed DIALOG.BAG holds only some of the UI lines (UI-G004..G018, not HKLowPower UI-G014): the
  // others are shown without speech
  assert.ok(m.script.includes(`set EmpUiSound[${base}] = "war3mapImported\\\\speech\\\\UI-G006.wav"`), 'BaseAttack speech');
  assert.ok(m.script.includes(`set EmpUiText[${base}] = "База атакована."`), 'generic BaseAttack');
  assert.ok(m.imports && Object.keys(m.imports).some((k) => /speech/i.test(k)), 'speech imported');
  assert.ok(!m.script.includes('Турели отключены'), 'no invented low-power text');
  assert.ok(m.script.includes(`call EmpUiSay(${lowPower})`), 'low power announced');
  assert.ok(m.script.includes('function EmpUiDeath') && m.script.includes('function EmpUiAttacked'), 'event hooks');
});

// Spice mounds of the maps (test.xbf SpiceMound tag, 73 on the territory maps) were read and dropped.
// Rules.txt [SpiceMound]: a mound bursts after Size + up to Cost ticks into a spice bloom of
// SpiceCapacity, BlastRadius tiles, and grows again after MinRange..MaxRange ticks.
test('spice mounds burst into spice blooms and grow again', opts, () => {
  const all = loadAll();
  assert.deepStrictEqual(all.rules.spiceMound, { health: 100, minTicks: 1000, randomTicks: 500, radiusTiles: 6, capacity: 50000, delayTicks: 6, regrowMin: 200, regrowMax: 2000 });
  const mound = all.units.objects.find((o) => o.id === all.units.ids.spiceMound);
  assert.ok(mound, 'mound unit');
  const meta = readMeta(path.join(ensureMap('#T5 ')[0] as string, 'test.xbf'));
  assert.strictEqual(meta.spiceMounds?.length, 4);
  const m = buildMission({ scripts: [], meta, ...all, name: 'mounds', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.strictEqual((m.script.match(/call EmpMoundAdd\(/g) ?? []).length, 4, 'one per mound of the map');
  // the bloom held SpiceCapacity = 50000 credits. Game.exe 1.09 (mound 0x542717..0x542acc) puts spice
  // on the sand cells within BlastRadius, and a harvested cell gives SpiceValue whatever its amount
  // (0x56c2c4): the bloom holds SpiceValue per cell it turned to spice
  assert.ok(m.script.includes('function EmpMoundTimer') && m.script.includes('set n = EmpMoundPatch(x, y)') && m.script.includes('call SetResourceAmount(f, n * 200)'), 'bloom of SpiceValue per new spice cell');
  assert.ok(!m.script.includes('call SetResourceAmount(f, 50000)'), 'not SpiceCapacity');
  // the bloom was only a mine: the BlastRadius patch ('Radius of spice bloom patch (in tiles)') is
  // now painted with the spice ground on the sand cells within 6 tiles (no spice on rock)
  assert.ok(m.script.includes('function EmpMoundPatch') && m.script.includes("call SetTerrainType(cx, cy, 'Bdrt', -1, 1, 0)"), 'spice patch');
  assert.ok(m.script.includes("GetTerrainType(cx, cy) == 'Bdsr'"), 'only on sand');
  assert.ok(m.script.includes('exitwhen dy > 6'), 'BlastRadius');
});

// A spice field held 1500 credits per spice cell, a guess (TODO(economy)), at least 2000. Game.exe 1.09
// (harvester 0x56c2c4..0x56c329): harvesting a cell sets its spice byte to 0 (0x4e63e0) and adds
// [General] SpiceValue to the load; unloading adds the load to the side's credits 1:1 (0x53ebc0).
// Guaranteed now: a field holds SpiceValue per spice cell of the map, no made-up minimum.
test('a spice field holds SpiceValue credits per spice cell (Game.exe harvesting)', opts, () => {
  const all = loadAll();
  assert.strictEqual(all.rules.general.SpiceValue, '200');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'spice', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  const amounts = [...m.script.matchAll(/call SetResourceAmount\(m, (\d+)\)/g)].map((x) => Number(x[1]));
  assert.ok(amounts.length > 0, 'fields placed');
  const cells = (meta.spice ?? []).filter(Boolean).length;
  assert.strictEqual(amounts.reduce((a, b) => a + b, 0), cells * 200, 'SpiceValue per cell, all cells counted once');
});

// Sandstorms ([General] Storm*, [StormUnit], StormDamage of 174 objects) were missing.
test('sandstorms come and go on the sand by Rules.txt', opts, () => {
  const all = loadAll();
  assert.deepStrictEqual(all.rules.storm, { killChance: 127, minWait: 7500, maxWait: 1500, minLife: 2000, maxLife: 2500, sizeTiles: 3, speed: 3 });
  assert.strictEqual(all.rules.objects.get('HKWall')?.stormDamage, 5);
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'storm', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('function EmpStormTick'), 'storm runtime');
  assert.match(m.script, /TimerStart\(CreateTimer\(\), [\d.]+, true, function EmpStormTick\)/);
  assert.ok(m.script.includes(`call SaveInteger(EmpStormTab, '${all.units.rawcode.get('HKWall')}', 0, 5)`), 'StormDamage per type');
  // StormDamage packs (class * 64) + damage (Rules.txt '74 // (1*64)+10'); below 64 'only damages, is
  // never picked up' (third audit: vehicles were picked up). Damage = value mod 64, class = value / 64.
  const inf = all.units.rawcode.get('ATInfantry');
  assert.ok(m.script.includes(`call SaveInteger(EmpStormTab, '${inf}', 0, 10)`) && m.script.includes(`call SaveInteger(EmpStormTab, '${inf}', 1, 2)`), 'ATInfantry 138 = class 2, damage 10');
  assert.ok(m.script.includes('LoadInteger(EmpStormTab, EmpType(u), 1) > 0'), 'only a class above 0 is picked up');
  // TODO(storm) closed by Game.exe 1.09 (storm update 0x52ba18..0x52bc87, per game tick): ground objects
  // in the 11 x 11 cells around the storm are picked up with chance class / (StormKillChance + 1)
  // ((rand & 127) < class) every tick, else take damage (value mod 64) every tick; flying units within
  // 160 / 32 = 5 cells (distance^2 < 25600) take the whole value every tick. It was once per unit and
  // storm with chance 127 / 256 and the damage per second.
  const body = (f: string): string => m.script.slice(m.script.indexOf(`function ${f} takes`), m.script.indexOf('endfunction', m.script.indexOf(`function ${f} takes`)));
  const hit = body('EmpStormHit');
  assert.ok(!hit.includes('EmpStormSeen'), 'no longer once per storm');
  // 0.25 s = 6.25 ticks: class 2 -> 1 - (1 - 2/128)^6.25
  assert.ok(m.script.includes(`set EmpStormPick[2] = ${(1 - (1 - 2 / 128) ** 6.25).toFixed(4)}`), 'pick-up chance per check from the per-tick chance');
  assert.ok(hit.includes('* 6.25'), 'damage per tick, 6.25 ticks per check');
  assert.ok(hit.includes('UNIT_TYPE_FLYING') && hit.includes('LoadInteger(EmpStormTab, EmpType(u), 2)'), 'flying units take the whole value');
  assert.ok(!m.script.includes('TODO(storm)'), 'TODO closed');
});

// [General] HarvReplacementDelay ("ticks before harvester gets replaced") and CashDeliveryWhenNoSpice*
// were not read.
test('a refinery without harvesters gets one after HarvReplacementDelay; cash comes when the spice is gone', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'harv', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('function EmpHarvReplaceTick'), 'replacement check');
  // TODO(economy) closed by Game.exe 1.09: the side update (0x53bb30..0x53bb6f) counts refineries and
  // harvesters (+0x58ac / +0x58b0, 0x53fa30..0x53fa63); while there are fewer harvesters, a timer
  // starting at HarvReplacementDelay goes down by the shortfall every tick, and at its end one
  // harvester comes at the refinery with the fewest (0x53f490), the timer starting again. Every missing
  // harvester is replaced, not only the last one. Cash (0x53ec20) goes to every side once the map has
  // no spice, refinery or not: AmountMin + rand % (Max - Min) every FrequencyMin + rand % (Max - Min)
  // ticks, with the GenResources line.
  const body = (f: string): string => m.script.slice(m.script.indexOf(`function ${f} takes`), m.script.indexOf('endfunction', m.script.indexOf(`function ${f} takes`)));
  const tick = body('EmpHarvReplaceTick');
  assert.ok(tick.includes('set EmpHarvLeft[i] = EmpHarvLeft[i] - (refineries - harvesters) * '), 'the timer goes down by the shortfall');
  assert.ok(m.script.includes('set EmpHarvLeft[i] = 1000'), 'starting at HarvReplacementDelay');
  assert.ok(tick.includes('GetRandomInt(10000, 19999)') && tick.includes('GetRandomInt(4000, 7999)'), 'cash delivery amounts and ticks');
  assert.ok(!/refinery != null and spice == 0/.test(tick), 'cash without a refinery too');
  assert.ok(tick.includes('EmpUiSay(') && m.script.includes('Оплата была получена'), 'GenResources announced');
  assert.ok(!m.script.includes('TODO(economy)'), 'TODO closed');
});

// Starport prices did not change ([General] StarportCostUpdateDelay, StarportCostVariationPercent).
test('starport prices change every StarportCostUpdateDelay ticks within StarportCostVariationPercent', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'port', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('GetRandomInt(60, 140)'), '±40 %');
  assert.match(m.script, /TimerStart\(CreateTimer\(\), 60\.0, true, function EmpPortPrices\)/, '1500 ticks = 60 s');
  const trikeOrder = [...all.units.portOrders].find(([, real]) => real === all.units.rawcode.get('ATTrike'))?.[0];
  assert.ok(m.script.includes(`call SaveInteger(EmpPortTab, '${trikeOrder}', 1, `), 'base cost of a starport type (its order)');
  assert.ok(m.script.includes('EVENT_PLAYER_UNIT_TRAIN_START') && m.script.includes('function EmpPortTrain'), 'charged at purchase');
  // Regression (third audit): a cancelled purchase got the full stock price back from WC3 and kept
  // the starport's difference: below 100 % every buy-and-cancel made money. The difference goes back too.
  assert.ok(m.script.includes('EVENT_PLAYER_UNIT_TRAIN_FINISH') && m.script.includes('function EmpPortFinish'), 'difference settled when the unit is out, so a cancel needs nothing');
  // fourth audit: the record of a destroyed starport stayed on its handle id; a factory reusing it
  // settled a starport price for its own trike. Only starports settle, and the record goes with it.
  const fin = m.script.slice(m.script.indexOf('function EmpPortFinish'), m.script.indexOf('endfunction', m.script.indexOf('function EmpPortFinish')));
  assert.ok(fin.includes('LoadBoolean(EmpPortTab, EmpType(b), 2)') && fin.includes('call RemoveSavedInteger(EmpPortTab, GetHandleId(b), t)'), 'starport only, record removed');
});

// Emperor's effects were missing (TODO(models)): Rules.txt names an explosion for every object that
// dies (ExplosionType) and a muzzle flash for every turret (TurretMuzzleFlash); ArtIni.txt gives their
// XBF (Explosion/*.xbf), converted like the unit models (src/emperor/effects.ts). The runtime plays
// them where a unit dies and where it fires.
// The textures a node shows over time come from the FXData MASTER events (the explosion fades by
// them); effects are shown at most EFFECT_MAX_RADIUS; hits are FXData particles (PRE2 emitters).
test('effects: an explosion where an object dies, a muzzle flash where it fires (Rules.txt, ArtIni.txt, FXData)', opts, async () => {
  const { effectUse, buildEffects } = await import('../src/emperor/effects.ts');
  const { loadArtIni } = await import('../src/emperor/artini.ts');
  const { EFFECT_PLAYED } = await import('../src/config/models.ts');
  const all = loadAll();
  const use = effectUse(all.rules);
  assert.strictEqual(use.death.get('ATTrike'), 'SmExplosion');
  assert.strictEqual(use.muzzle.get('ATTrike'), 'Muzzle1');
  const set = buildEffects(['Explosion', 'Muzzle1', 'MissileHit', 'DeviateHit'], loadArtIni(path.join(RAW, 'ArtIni.txt')));
  const parse = (name: string) => { const m = new MdlxModel(); m.load(new Uint8Array(set.files[(set.model.get(name) as string).replace(/\.mdl$/, '.mdx')] as Buffer)); return m; };
  const boom = parse('explosion');
  assert.ok(boom.sequences.some((s: { name: string }) => s.name === 'Death'), 'the animation plays as Death');
  // Bug (probe 2026-10-08): the bind-pose Stand was put first in the list but after Death in time;
  // the game then played no animation at all (the explosion stood still at full size). Sequences go
  // in time order.
  const starts = boom.sequences.map((s: { interval: ArrayLike<number> }) => s.interval[0] as number);
  assert.deepStrictEqual(starts, [...starts].sort((a, b) => a - b), 'sequences in time order');
  assert.ok(boom.materials.some((x: { layers: Array<{ animations: Array<{ name: string }> }> }) => x.layers[0]?.animations.some((a) => a.name === 'KMTF')), '!%boom0..10 flipped');
  assert.ok(parse('muzzle1').geosets.length > 0, 'the flash mesh (? nodes) is drawn');
  // a hit made of FXData particles only: particle emitters 2 (4 records, at the ?#bing nodes MASTER
  // names), textures as atlases of their frames (!cexp0..15)
  const hit = parse('missilehit');
  assert.ok(hit.particleEmitters2.length >= 4, `emitters ${hit.particleEmitters2.length}`);
  assert.ok(hit.textures.some((t: { path: string }) => /_cexp_atlas\.blp$/i.test(t.path)) && set.files['Emperor\\Textures\\_cexp_atlas.blp'], 'atlas');
  const e = hit.particleEmitters2.find((x: { name: string }) => /#49/.test(x.name));
  assert.ok(e && e.columns * e.rows >= 16 && e.animations.some((a: { name: string }) => a.name === 'KP2E'), 'burst of the cexp emitter');
  // sixth audit: DeviateHit grows x2 a frame: its sprites reached 5120 units (scale is not applied to
  // particles-only effects); a sprite is at most FX_PARTICLE.maxSize
  const dev = parse('deviatehit');
  assert.ok(dev.particleEmitters2.every((x: { segmentScaling: ArrayLike<number> }) => Math.max(...Array.from(x.segmentScaling)) <= 256), 'particle size capped');
  // ?innerfire's MASTER list ends with !%boom0 again: the bright first frame flashed before the end
  const fire = boom.materials.find((x: { layers: Array<{ animations: Array<{ name: string; values: ArrayLike<number>[] }> }> }) => x.layers[0]?.animations.some((a) => a.name === 'KMTF' && a.values.length === 12 * 2));
  assert.ok(!fire, 'the wrap-around frame is dropped');
  // the shockwave's textures from FXData MASTER (choc0 .. choc7): one flipping layer
  assert.ok(boom.textures.some((t: { path: string }) => /_choc7\.blp$/i.test(t.path)), 'MASTER texture list');
  // explosions, muzzle flashes and hits played; the trike's are in the runtime table, shrunk
  assert.deepStrictEqual(EFFECT_PLAYED, [true, true, true]);
  const trike = all.units.rawcode.get('ATTrike') as string;
  const fx = all.units.effects.get(trike) as [string, string, string];
  assert.ok(fx[0].endsWith('FX_SmallExplosion.mdl') && fx[1].endsWith('FX_Muzzle1.mdl'), fx.join(' | '));
  assert.ok(all.units.models[fx[0].replace(/\.mdl$/, '.mdx')], 'imported');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'fx', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes(`call SaveStr(EmpFxTab, '${trike}', 1, ${JSON.stringify(fx[1])})`), 'muzzle of the trike');
  assert.match(m.script, new RegExp(`call SaveReal\\(EmpFxTab, '${trike}', 11, 0\\.\\d+\\)`), 'the flash shrunk to EFFECT_MAX_RADIUS');
  assert.ok(m.script.includes('function EmpFxDeath') && m.script.includes('call EmpFxInit()'), 'runtime');
  assert.ok(m.script.includes('local string at = "weapon"') && m.script.includes('call EmpFxPlay(AddSpecialEffectTarget(LoadStr(EmpFxTab, t, 1), u, at), t, 1)'), 'muzzle at the weapon');
});

// Sixth audit: 17 converted models have no "Weapon Ref" (no #fire node: HKBuzzsaw, ATMongoose...); the
// muzzle flash asked for "weapon" on them. Those flash at "chest".
test('a muzzle flash goes to the chest of a converted model without a weapon attachment', opts, async () => {
  const { buildModels } = await import('../src/emperor/models.ts');
  const { buildUnitData } = await import('../src/emperor/units.ts');
  const { effectUse, buildEffects } = await import('../src/emperor/effects.ts');
  const { loadArtIni } = await import('../src/emperor/artini.ts');
  const all = loadAll();
  const art = loadArtIni(path.join(RAW, 'ArtIni.txt'));
  const models = buildModels(['HKBuzzsaw', 'ATTrike'], art);
  assert.ok(models.weapon.has('ATTrike') && !models.weapon.has('HKBuzzsaw'), 'weapon attachments');
  const use = effectUse(all.rules);
  const units = buildUnitData(all.rules, (n) => n, undefined, models, { use, set: buildEffects([...use.muzzle.values()], art) });
  assert.strictEqual(units.muzzleAt.get(units.rawcode.get('HKBuzzsaw') as string), 'chest');
  assert.ok(!units.muzzleAt.has(units.rawcode.get('ATTrike') as string), 'the trike fires from its weapon');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, units, name: 'fx', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes(`call SaveStr(EmpFxTab, '${units.rawcode.get('HKBuzzsaw')}', 21, "chest")`), 'attach point in the table');
  assert.ok(m.script.includes('function EmpFxFire') && m.script.includes('LoadStr(EmpFxTab, t, 21)'), 'runtime reads it');
  // sixth audit: damage and attacks of neutral hostile (the worm) were not registered, deaths were
  assert.match(m.script, /TriggerRegisterPlayerUnitEvent\(hit, Player\(PLAYER_NEUTRAL_AGGRESSIVE\), EVENT_PLAYER_UNIT_DAMAGED, null\)/);
});

// The hub said nothing when an alliance was made or lost; E_Output_Pickup holds the house's debrief
// lines for it ("<H>allydebriefgain<n>" / "allydebriefbreak<n>": ATallydebriefgain1 "the Fremen are
// honoured to join us"). Back from a mission the hub compares each alliance with the one it saw.
test('the hub announces a sub-house alliance made or lost with the original debrief line', opts, async () => {
  const { buildHub } = await import('../src/emperor/hub.ts');
  const all = loadAll();
  const text = (k: string): string => all.ctx.textByKey(k) as string;
  const hub = buildHub({
    house: 'AT', autoTest: false, campaign: loadCampaign(RAW, []), battleMap: () => null, storyMap: { heighliner: 'H.w3x', homeDefence: 'D.w3x', civilWar: 'C.w3x', homeAttack: { HK: 'A.w3x', OR: 'O.w3x' }, end: 'E.w3x' },
    units: { w3u: Buffer.alloc(0), w3a: Buffer.alloc(0), w3q: Buffer.alloc(0) } as never,
    allyDebrief: (k) => all.ctx.textByKey(k),
  });
  assert.ok(hub.script.includes('function EmpAllyDebrief'), 'debrief');
  assert.ok(hub.script.includes(`call EmpSay(${JSON.stringify(text('ATallydebriefgain1'))})`) && hub.script.includes(`call EmpSay(${JSON.stringify(text('ATallydebriefbreak1'))})`), 'Fremen lines');
  const apply = hub.script.slice(hub.script.indexOf('function EmpApplyResult'));
  assert.ok(apply.slice(0, apply.indexOf('endfunction')).includes('call EmpAllyDebrief()'), 'after every mission');
  assert.ok(hub.script.includes('call StoreInteger(EmpCache, "emp", "allyseenFR", 0)'), 'a new campaign forgets what it saw');
});

// The starport delivered after the unit's BuildTime; in Emperor a CHOAM frigate brings the order:
// [General] FrigateCountdown = 2500 ('time for frigate to arrive'), StarportMaxDeliverySingle = 6. A
// starport now sells orders (one per Starportable type, ready in a second); a finished order goes to
// the starport's frigate, which lands after FrigateCountdown with up to 6 units. Found 2026-10-08.
test('a starport sells orders that a frigate delivers after FrigateCountdown, up to 6 at a time', opts, () => {
  const all = loadAll();
  const trike = all.units.rawcode.get('ATTrike') as string;
  const order = [...all.units.portOrders].find(([, real]) => real === trike)?.[0] as string;
  assert.ok(order && order !== trike, 'an order type for the trike');
  const trainsOf = (name: string): string[] => all.units.objects.find((o) => o.emperor?.name === name)?.mods.filter((x) => x.field === 'utra').map((x) => String(x.value)).at(-1)?.split(',') ?? [];
  assert.ok(trainsOf('ATStarport').includes(order) && !trainsOf('ATStarport').includes(trike), 'the starport trains the order, not the unit');
  assert.ok(trainsOf('ATFactory').includes(trike), 'the factory still builds trikes');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'frigate', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes(`call SaveInteger(EmpPortTab, '${order}', 3, '${trike}')`), 'order -> unit');
  assert.ok(m.script.includes('function EmpPortFrigate'), 'frigate');
  assert.match(m.script, /TimerStart\(tm, 100\.0, false, function EmpPortFrigate\)/, '2500 ticks = 100 s');
  assert.ok(m.script.includes('exitwhen k >= 6'), 'StarportMaxDeliverySingle');
  // the frigate itself ([Frigate]: flies, CanDie = FALSE) comes in from the nearest map edge to land at
  // FrigateCountdown and flies off; Locust keeps it out of selection
  assert.ok(m.script.includes(`'${all.units.rawcode.get('Frigate')}'`) && m.script.includes('function EmpPortFrigateFly'), 'frigate shown');
  assert.ok(m.script.includes("call UnitAddAbility(f, 'Aloc')"), 'not selectable');
  // the frigate (hidden for up to FrigateCountdown, owned by the buyer) counted as a unit of his: a
  // player with nothing left but a delivery on its way did not lose (EmpNormalCheck). Locust units
  // are not counted.
  const count = m.script.slice(m.script.indexOf('function EmpCountEnum'), m.script.indexOf('endfunction', m.script.indexOf('function EmpCountEnum')));
  assert.ok(count.includes("GetUnitAbilityLevel(u, 'Aloc') == 0"), 'frigates do not count');
  // fifth audit: the queue lived under the starport's handle id: after it fell, a new starport with
  // that id joined the old queue; owner and place were those of the first order, also after an
  // engineer took the starport. The queue goes with the delivery timer, a fallen starport lets go of
  // it, and each landing takes the starport's owner and place while it stands.
  const body = (f: string): string => m.script.slice(m.script.indexOf(`function ${f} takes`), m.script.indexOf('endfunction', m.script.indexOf(`function ${f} takes`)));
  assert.ok(body('EmpPortDeath').includes('call RemoveSavedHandle(EmpPortTab, h, 2)'), 'a fallen starport lets go of its frigate');
  assert.ok(body('EmpPortQueue').includes('call SaveInteger(EmpPortTab, th, 10 + n, t)'), 'the queue on the timer');
  assert.ok(body('EmpPortFrigate').includes('set p = GetOwningPlayer(b)'), 'the owner at landing');
  // the hidden frigate was a threat the AI's home units were sent at (they cannot attack it)
  assert.ok(body('EmpAiTactics').includes("GetUnitAbilityLevel(u, 'Aloc') == 0"), 'no frigate threat');
  // "unit ready" for an order removed by EmpPortFinish first (trigger order not guaranteed)
  assert.ok(body('EmpUiTrained').includes('GetUnitTypeId(GetTrainedUnit()) == 0'), 'removed order is no unit');
});

// The starport stock was not modelled (TODO(starport)): every type was always available. Rules.txt
// only names StarportStockIncreaseProb / Delay; the rest is Game.exe 1.09 (disassembly 2026-10-08,
// side update 0x53bb10 -> starport tick 0x53eda0, order 0x53cd00, side init 0x53b9f8 / 0x53c6d0):
// - every Starportable type starts at stock 0 (0x53c77d), the stock timer at 0 (0x53b9fe);
// - while the side has a starport, nothing in its cart and no frigate on the way, the timer counts
//   down; at 0 each type below StarportMaxDeliverySingle gets +1 if rand % 100 <= Prob, and the
//   timer restarts at StarportStockIncreaseDelay (0x53eeb2..0x53ef1e);
// - a type goes into the cart only while fewer of it are in the cart than the stock and the cart
//   holds fewer than StarportMaxDeliverySingle (0x53cd35..0x53cd60); a delivery empties the cart and
//   leaves the stock as it is (0x53f1bb..0x53f203 only lowers the cart).
// Guaranteed now: the runtime keeps that stock per side and type and refuses an order beyond it.
test('starport stock grows by Game.exe rules and limits what can be ordered', opts, () => {
  const all = loadAll();
  assert.strictEqual(all.rules.general.StarportStockIncreaseProb, '90');
  assert.strictEqual(all.rules.general.StarportStockIncreaseDelay, '1000');
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'stock', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  const body = (f: string): string => m.script.slice(m.script.indexOf(`function ${f} takes`), m.script.indexOf('endfunction', m.script.indexOf(`function ${f} takes`)));
  const tick = body('EmpPortStockTick');
  assert.ok(tick.includes('GetRandomInt(0, 99) <= 90'), 'rand % 100 <= StarportStockIncreaseProb');
  assert.ok(tick.includes('< 6'), 'up to StarportMaxDeliverySingle');
  assert.ok(tick.includes('40.0'), '1000 ticks = 40 s');
  assert.ok(tick.includes('EmpPortCartAll['), 'frozen while the cart is not empty');
  assert.match(m.script, /TimerStart\(CreateTimer\(\), [0-9.]+, true, function EmpPortStockTick\)/);
  const refusal = body('EmpPortRefusal');
  assert.ok(refusal.includes('EmpPortCart[k] >= EmpPortStock[k]'), 'an order needs stock beyond what is on the way');
  assert.ok(refusal.includes('>= 6'), 'the cart holds at most StarportMaxDeliverySingle');
  assert.ok(body('EmpPortTrain').includes('EmpPortRefusal(') && body('EmpPortFinish').includes('EmpPortRefusal('), 'checked at the start and when ready');
  assert.ok(body('EmpPortFinish').includes('set EmpPortCart[k] = EmpPortCart[k] + 1'), 'a ready order is on the way');
  assert.ok(body('EmpPortFrigate').includes('EmpPortCart[c] - 1'), 'a landing empties the cart, the stock stays');
  assert.ok(!m.script.includes('TODO(starport): the stock'), 'TODO closed');
});

// A starport order kept its unit's requirements: the factory upgrade of UpgradedPrimaryRequired types
// (Minotaurus...) and the SecondaryBuilding (TODO(starport)). Game.exe 1.09 offers a starport type to
// a side by its house (-1 any) and DisableIfNoSpiceOnMap only (tab check 0x53e4f0; keys -> fields
// from the parser switch 0x526720: House +0x80, DisableIfNoSpiceOnMap +0x3d4, Upgraded*Required
// +0x3c1/+0x3c2, which the check never reads). Guaranteed now: orders have no requirements.
test('starport orders need no building or upgrade (Game.exe tab check)', opts, () => {
  const all = loadAll();
  const mino = all.rules.objects.get('ATMinotaurus');
  assert.ok(mino?.upgradedPrimaryRequired, 'Minotaurus needs the factory upgrade at the factory');
  const real = all.units.rawcode.get('ATMinotaurus') as string;
  const order = [...all.units.portOrders].find(([, r]) => r === real)?.[0] as string;
  const req = (id: string): string => all.units.objects.find((o) => o.id === id)?.mods.filter((m) => m.field === 'ureq').map((m) => String(m.value)).at(-1) ?? '';
  assert.notStrictEqual(req(real), '', 'the factory unit keeps its requirements');
  assert.strictEqual(req(order), '', 'the starport order has none');
});

// A wall lost was announced as a building lost (TODO(ui)). Game.exe 1.09 (0x4f9c45..0x4f9cb4)
// announces BldgLost for the local player's buildings except those whose name after the house prefix
// is "Wall" or "FactoryFrigate" (strings 0x60f93c / 0x60f944); a unit is UnitLost.
test('a lost wall or factory frigate is not announced (Game.exe)', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'ui', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  for (const n of ['ATWall', 'HKWall', 'ORWall', 'ATFactoryFrigate']) assert.ok(m.script.includes(`call SaveBoolean(EmpUiTab, '${all.units.rawcode.get(n)}', 1, true)`), `${n} not announced`);
  assert.ok(!m.script.includes(`call SaveBoolean(EmpUiTab, '${all.units.rawcode.get('ATBarracks')}', 1, true)`), 'barracks announced');
  const body = m.script.slice(m.script.indexOf('function EmpUiDeath takes'), m.script.indexOf('endfunction', m.script.indexOf('function EmpUiDeath takes')));
  assert.ok(body.includes('LoadBoolean(EmpUiTab, EmpType(GetTriggerUnit()), 1)'), 'checked at death');
  assert.ok(!m.script.includes('TODO(ui)'), 'TODO closed');
});

// Speech: DATA\Sounds\sounds.txt maps message keys to DIALOG.BAG lines; a mission map imports the
// lines its scripts use and Message() queues them (one at a time, by known duration).
test('mission messages play the original speech', opts, () => {
  const all = loadAll();
  assert.ok(all.speech, 'speech table loaded');
  const meta = readMeta(path.join(ensureMap('#H3 ')[0], 'test.xbf'));
  const m = buildMission({
    scripts: [{ tok: fs.readFileSync(path.join(RAW, 'HHK Heighliner Mission.tok')), phase: 1, name: 'HHK Heighliner Mission' }],
    meta, ...all, name: 'HK_S_Heighliner', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x',
  });
  // the key occurs in more than one string table; take the message number the script uses
  const hit = /set EmpMsgSound\[(\d+)\] = "war3mapImported\\\\speech\\\\YK-G004\.wav"/.exec(m.script);
  assert.ok(hit, 'YK-G004 assigned to a message');
  assert.strictEqual(all.ctx.messageKey(Number(hit[1])), 'HHKKillKill');
  assert.ok(m.imports['war3mapImported\\speech\\YK-G004.wav'], 'speech file imported into the map');
  assert.match(m.script, /call EmpSpeak\(EmpMsgSound\[a1\], EmpMsgSoundLen\[a1\]\)/);
});

// Regression: money crates gave 500 credits instead of CrateGiftObject = CASH2000. The CASH<n>
// pattern had lost its backslash (written through a shell heredoc: "CASH(d+)" instead of a digit
// class), so it never matched and every money crate fell back to the 500-credit default. The crate
// test above only checked a unit crate. Guaranteed now: CASH<n> crates give n credits.
test('money crates give the credits of CrateGiftObject CASH<n>', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#D1 ')[0] as string, 'test.xbf'));
  assert.ok(meta.buildings?.some((b) => b.name === 'MoneyCrate'), '#D1 has a money crate');
  const m = buildMission({
    scripts: [], meta, ...all, name: 'money-crate', playerHouse: 'Atreides', kind: 'story', hubMap: 'AT_Hub.w3x',
  });
  const placedBody = (m.script.split('function EmpPlaced takes nothing returns nothing')[1] ?? '').split('endfunction')[0] ?? '';
  assert.ok(placedBody.includes(', 0, 2000)'), 'money crate registered with 2000 credits');
  assert.ok(!placedBody.includes(', 0, 500)'), 'no 500-credit fallback for a CASH crate');
});

// Power (Rules.txt): windtraps generate PowerGenerated, buildings use PowerUsed; turrets with
// DisableWithLowPower stop while their side uses more than it generates. Was TODO(power).
test('power: per-type balance table and low-power turret switch in mission maps', opts, () => {
  const all = loadAll();
  const trap = all.rules.objects.get('HKSmWindtrap');
  const turret = all.rules.objects.get('HKGunTurret');
  assert.ok(trap && turret);
  assert.ok(trap.power > 0, 'windtrap generates power');
  assert.strictEqual(turret.disableWithLowPower, true);
  const meta = readMeta(path.join(ensureMap('#H3 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'power', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x' });
  const trapId = all.units.rawcode.get('HKSmWindtrap');
  const turretId = all.units.rawcode.get('HKGunTurret');
  assert.ok(m.script.includes(`call EmpPowerType('${trapId}', ${trap.power}, false)`), 'windtrap in the power table');
  assert.ok(m.script.includes(`call EmpPowerType('${turretId}', ${turret.power}, true)`), 'turret in the power table, disabled on low power');
  assert.ok(m.script.includes('function EmpPowerTick takes nothing returns nothing'));
  // Regression: a building counted in the balance from the moment its construction began (a windtrap
  // gave power before it stood). The construction start marks it, the finish unmarks it, and the
  // power tick skips marked buildings.
  assert.ok(m.script.includes('call SaveBoolean(EmpPowerTab, GetHandleId(b), 2, true)'), 'construction start marks the building');
  assert.ok(m.script.includes('call RemoveSavedBoolean(EmpPowerTab, GetHandleId(b), 2)'), 'finish unmarks it');
  assert.ok(m.script.includes('if EmpAlive(u) and not LoadBoolean(EmpPowerTab, GetHandleId(u), 2) then'), 'power tick skips it');
});

// SetVeterancy(obj, level): 51 scripts promote their units at start; was a stub (TODO(runtime)).
test('SetVeterancy promotes a unit through the veterancy levels', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#H3 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW, 'HHK Heighliner Mission.tok')), phase: 1, name: 'HHK Heighliner Mission' }],
    meta, ...all, name: 'vet', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x' });
  assert.ok(!m.stubbed.includes('SetVeterancy'), 'SetVeterancy implemented');
  const ef = (m.script.split('function EF_SetVeterancy')[1] ?? '').split('endfunction')[0] ?? '';
  assert.ok(ef.includes('call ExecuteFunc("EmpVetSetFromArgs")'));
  assert.match(m.script, /function EmpVetSetFromArgs takes nothing returns nothing/);
});

// AirStrike(id, from, side, types...) / AirStrikeDone(id): 7 scripts call air support; were stubs.
test('AirStrike brings aircraft that attack the enemy base; AirStrikeDone reports the end', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW, 'ATP1M9GN.tok')), phase: 1, name: 'ATP1M9GN' }],
    meta, ...all, name: 'air', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(!m.stubbed.includes('AirStrike') && !m.stubbed.includes('AirStrikeDone'));
  const ef = (m.script.split('function EF_AirStrike takes')[1] ?? '').split('endfunction')[0] ?? '';
  assert.ok(ef.includes('call EmpStrikeAdd('), 'strike units are created');
});

// Sandworms on territory battles (Rules.txt [General] worm keys). Emperor does this in code, not
// in scripts; the territory battles had no worms.
test('territory battles have surface and vertical worms with the Rules.txt chances', opts, () => {
  const all = loadAll();
  const w = all.rules.worms;
  assert.deepStrictEqual([w.surfaceChance, w.verticalChance, w.minLife, w.maxLife, w.disappearHealth, w.minTick, w.attractionRadius], [6000, 5000, 600, 1000, 25, 1000, 32]);
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const battle = buildMission({ scripts: [], meta, ...all, name: 'worms', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.match(battle.script, /function EmpWormTick takes nothing returns nothing/);
  assert.ok(battle.script.includes('GetRandomInt(1, 6000) <= 25'), 'surface worm chance per second from ChanceOfSurfaceWorm');
  assert.ok(battle.script.includes('GetRandomInt(1, 5000) <= 25'), 'vertical worm chance per second from ChanceOfVerticalWorm');
  // per-type WormAttraction weights; TastyToWorms = False and GUMaker (-20) are never eaten
  const weight = (name: string): RegExpExecArray | null => new RegExp(`call SaveInteger\\(EmpWormTab, '${all.units.rawcode.get(name)}', 0, (-?\\d+)\\)`).exec(battle.script);
  assert.strictEqual(all.rules.objects.get('ATGeneral')?.tastyToWorms, false);
  if (all.units.rawcode.has('ATGeneral')) assert.strictEqual(weight('ATGeneral')?.[1], '0');
  assert.strictEqual(weight('GUMaker')?.[1], '-20');
  assert.ok(battle.script.includes('or not EmpOnSand(GetUnitX(EmpWorm), GetUnitY(EmpWorm)))'), 'a worm on rock goes under the sand');
  const story = buildMission({ scripts: [], meta, ...all, name: 'no-worms', playerHouse: 'Atreides', kind: 'story', hubMap: 'AT_Hub.w3x' });
  assert.ok(!story.script.includes('EmpWormTick'), 'no worms outside territory battles');
});

// Reinforcements (Rules.txt [General] UnitValue*Reinforcements, TicksBetweenReinforcements and the
// units' ReinforcementValue). SetReinforcements was a stub and territory battles had none.
test('territory battles bring reinforcement sets of the Rules.txt value; the pick table is per house', opts, () => {
  const all = loadAll();
  assert.deepStrictEqual(all.rules.reinforcements, { attacker: 20, defender: 5, reserves: 20, initial: 20, subsequent: 10, delay: 6600, variation: 600, messageBefore: 100 });
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const battle = buildMission({ scripts: [], meta, ...all, name: 'reinf', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.match(battle.script, /set EmpReinfDelay = 6600\n\s+set EmpReinfVariation = 600/);
  assert.match(battle.script, /call EmpReinfStart\(0, EmpReinfInitial, EmpReinfSubsequent\)\n\s+call EmpReinfStart\(1, EmpReinfInitial, EmpReinfSubsequent\)/);
  // every house has its own units in the table (index = house id: 0 AT, 1 HK, 2 OR), e.g. the trike
  // of the Atreides costs 5 and needs tech level 2
  const trike = all.units.rawcode.get('ATTrike');
  const m = new RegExp(`set EmpReinfType\\[(\\d+)\\] = '${trike}'`).exec(battle.script);
  assert.ok(m, 'ATTrike in the pick table');
  const k = Number(m[1]);
  assert.ok(k < 32, 'Atreides units in house slot 0');
  assert.ok(battle.script.includes(`set EmpReinfCost[${k}] = 5\n    set EmpReinfTech[${k}] = 2`));
  for (const h of [0, 1, 2]) assert.match(battle.script, new RegExp(`set EmpReinfCount\\[${h}\\] = [1-9]`));
  const story = buildMission({ scripts: [], meta, ...all, name: 'no-reinf', playerHouse: 'Atreides', kind: 'story', hubMap: 'AT_Hub.w3x' });
  assert.ok(!story.script.includes('call EmpReinfStart(0'), 'story missions get sets only through SetReinforcements');
});

// Territory battle armies and credits come from Rules.txt (UnitValueAttacker / UnitValueDefender,
// CampaignAttackMoney / CampaignDefendMoney); they were fixed unit lists and invented credits, and
// the enemy produced units for free.
test('territory battle armies, credits and paid enemy production follow Rules.txt', opts, () => {
  const all = loadAll();
  assert.deepStrictEqual(all.rules.campaignMoney, { attack: 5000, defend: 2500 });
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const attack = buildMission({ scripts: [], meta, ...all, name: 'army', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(attack.script.includes('call EmpSpawnSet(0, 20, GetLocationX(p), GetLocationY(p)'), 'attacking army worth UnitValueAttacker');
  assert.ok(attack.script.includes('call EmpSpawnSet(1, 5, EmpBaseX[b], EmpBaseY[b]'), 'defending army worth UnitValueDefender');
  assert.ok(attack.script.includes('call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, 5000)'));
  assert.ok(attack.script.includes('call SetPlayerStateBJ(Player(1), PLAYER_STATE_RESOURCE_GOLD, 2500)'));
  const trooper = all.units.rawcode.get('HKTrooper');
  const cost = all.rules.objects.get('HKTrooper')?.cost;
  assert.ok(cost && cost > 0);
  assert.ok(attack.script.includes(`call SaveInteger(EmpCostTab, '${trooper}', 0, ${cost})`), 'enemy pays Rules.txt Cost');
  const defend = buildMission({ scripts: [], meta, ...all, name: 'hold', playerHouse: 'Atreides', kind: 'defend', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(defend.script.includes('call EmpSpawnSet(1, 20, EmpEntrX[e], EmpEntrY[e]'), 'the attacker arrives with UnitValueAttacker');
  assert.ok(defend.script.includes('call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, 2500)'));
});

// The enemy AI followed no data (TODO(ai)): free production of every building each period, the whole
// army in every wave, no rebuilding. It now uses ai.ini.
test('territory battle AI: ai.ini unit mix, defence share, rebuilding, retreat chance', opts, () => {
  const all = loadAll();
  assert.deepStrictEqual({ foot: all.ai?.foot, tank: all.ai?.tank, defencePercent: all.ai?.defencePercent, minMoneyToBuild: all.ai?.minMoneyToBuild, retreatChance: all.ai?.retreatChance }, { foot: 20, tank: 80, defencePercent: 24, minMoneyToBuild: 600, retreatChance: 50 });
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'ai', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('local boolean veh = GetRandomInt(1, 20 + 80) > 20'), 'Foot / Tank mix');
  assert.ok(m.script.includes('set send = home - IMinBJ(IMaxBJ(home * 24 / 100, EmpAiTMinDef[EmpAiT()]), EmpAiTMaxDef[EmpAiT()])'), 'defence share stays home (within ai_difficulty.ini bounds)');
  assert.ok(m.script.includes('local boolean stay = GetRandomInt(1, 100) > 50'), 'retreat chance');
  assert.ok(m.script.includes('if EmpEnemyGold() >= c + 600 then'), 'rebuild money');
  const yard = all.units.rawcode.get('HKConYard');
  assert.ok(m.script.includes(`set EmpTplType[16] = '${yard}'`), 'house 1 template starts with its construction yard');
  // Regression: the money the base builder saves (EmpAiReserve) kept its last value when
  // EmpEnemyProduce returned before the builder's turn (construction yard lost, template rebuild),
  // throttling unit production for a building nobody would start. Every early return of the
  // building part now sets it: 0 without a construction yard, the rebuild's price while saving for it.
  const produce = m.script.slice(m.script.indexOf('function EmpEnemyProduce'), m.script.indexOf('call EmpAiBuild()', m.script.indexOf('function EmpEnemyProduce')));
  const tail = produce.slice(produce.indexOf('// entry 0 of a template'));
  const returns = tail.split('\n').map((l, i, a) => [l, a.slice(Math.max(0, i - 3), i).join('\n')] as const).filter(([l]) => l.trim() === 'return');
  assert.ok(returns.length >= 2 && returns.every(([, before]) => before.includes('set EmpAiReserve = ')), 'reserve set before early returns');
  assert.ok(tail.includes('set EmpAiReserve = c + 600'), 'saves for the template rebuild');
  // Regression: the type within a category was random every turn, so while a factory (1000) was
  // too dear the next turn picked the cheaper barracks: 5 barracks, no factory in 7 minutes (HK_A02
  // report 2026-10-08). The type the AI has fewest of is picked (random among equals).
  const pick = m.script.slice(m.script.indexOf('function EmpAiPick'), m.script.indexOf('endfunction', m.script.indexOf('function EmpAiPick')));
  assert.ok(pick.includes('set have = EmpCount(1, t)') && pick.includes('if have < fewest then'), 'fewest-first pick');
});

// Briefings: sounds.txt section Briefing maps a mission script name to one or more Mentat lines
// (ATP1D19GN -> KK-M024, KK-M026). They were not played: only the text was shown.
test('mission start plays the spoken briefing of the chosen script', opts, () => {
  const all = loadAll();
  assert.ok(all.speech);
  assert.deepStrictEqual(all.speech.briefing('ATP1D19GN').map((l) => l.id), ['KK-M024', 'KK-M026']);
  const meta = readMeta(path.join(ensureMap('#T19 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW, 'ATP1D19GN.tok')), phase: 1, name: 'ATP1D19GN' }],
    meta, ...all, name: 'brief', playerHouse: 'Atreides', kind: 'defend', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  const fn = (m.script.split('function EmpBriefingSpeech takes nothing returns nothing')[1] ?? '').split('endfunction')[0] ?? '';
  assert.ok(fn.includes('KK-M024.') && fn.includes('KK-M026.'), 'both briefing lines queued');
  assert.ok(Object.keys(m.imports).some((k) => k.includes('KK-M026')), 'briefing speech imported');
});

// Debriefings: sounds.txt section Debriefing, keys <script>win / <script>lose / <script>debrief
// (206 of them match a script). They were not played.
test('mission result plays the win/lose debriefing of the chosen script', opts, () => {
  const all = loadAll();
  assert.ok(all.speech);
  assert.deepStrictEqual(all.speech.debrief('ATP1D4FR', true).map((l) => l.id), ['KK-D346']);
  assert.deepStrictEqual(all.speech.debrief('ATP1D4FR', false).map((l) => l.id), ['KK-D344']);
  const meta = readMeta(path.join(ensureMap('#T4 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW, 'ATP1D4FR.tok')), phase: 1, name: 'ATP1D4FR' }],
    meta, ...all, name: 'debrief', playerHouse: 'Atreides', kind: 'defend', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  const fn = (m.script.split('function EmpDebriefSpeech takes boolean win returns real')[1] ?? '').split('endfunction')[0] ?? '';
  assert.ok(fn.includes('KK-D346.') && fn.includes('KK-D344.'), 'win and lose lines');
  assert.match(m.script, /EmpDebriefSpeech\(win\)/);
});

// Regression: every side was hostile to every other side (each WC3 player on its own team), while
// Emperor sides are not enemies until a script says so: the scripts call SideEnemyTo 1404 times
// (e.g. the HK civil war declares sides v2..v9 enemies of the player and leaves v10, which later
// joins the player, alone). Created sides attacked the player without a reason. Guaranteed now:
// before the scripts run all sides are neutral to each other except the player vs the main enemy.
test('sides start neutral to each other except the player vs the main enemy', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#C1 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW, 'HHK Civil War Attack Mission.tok')), phase: 0, name: 'HHK Civil War Attack Mission' }],
    meta, ...all, name: 'civil war', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x' });
  const fn = (m.script.split('function EmpDefaultDiplomacy takes nothing returns nothing')[1] ?? '').split('endfunction')[0] ?? '';
  assert.ok(fn.includes('bj_ALLIANCE_NEUTRAL') && fn.includes('not ((a == 0 and b == 1) or (a == 1 and b == 0))'));
  const start = (m.script.split('function EmpStart takes nothing returns nothing')[1] ?? '').split('endfunction')[0] ?? '';
  const d = start.indexOf('call EmpDefaultDiplomacy()');
  assert.ok(d >= 0 && d < start.indexOf('call EmpPlaced()'), 'diplomacy set before placed objects and scripts');
});

// Story maps with a base of side 1 (#A1 / #A2 / #A3 homeworld assaults, #C1 civil war: a construction
// yard, factories, barracks placed on the map) had a dead base: the AI that builds, produces and
// attacks ran only in territory battles. In Emperor the AI runs it, tuned by ai_<house>_<map>.ini
// (ai_atreides_a1.ini "Homeworld attack with AI playing Atreides"), with the credits the script gives
// (T36 Atreides Homeworld Assault: AddSideCash(GetEnemySide(),40000)). Found 2026-10-08.
test('the AI runs the map\'s own base of side 1 in story missions, with ai_<house>_<map>.ini', opts, async () => {
  const { storyAiHouse } = await import('../src/emperor/battle.ts');
  const { loadAiRules, aiOverride } = await import('../src/emperor/ai-rules.ts');
  const all = loadAll();
  const metaOf = (p: string) => readMeta(path.join(ensureMap(p)[0] as string, 'test.xbf'));
  assert.deepStrictEqual(['#A1 ', '#A2 ', '#A3 ', '#C1 ', '#H1 ', '#D1 ', '#V1 '].map((p) => storyAiHouse(metaOf(p))), ['AT', 'OR', 'HK', 'HK', null, null, null]);
  assert.strictEqual(path.basename(aiOverride(RAW_DIR, 'AT', '#A1 ') ?? ''), 'ai_atreides_a1.ini');
  assert.strictEqual(path.basename(aiOverride(RAW_DIR, 'HK', '#C1 ') ?? ''), 'ai_harkonnen_c1.ini');
  assert.strictEqual(aiOverride(RAW_DIR, 'AT', '#Q9 '), null);
  const ai = loadAiRules(path.join(RAW_DIR, 'ai.ini'), aiOverride(RAW_DIR, 'AT', '#A1 '));
  assert.strictEqual(ai.buildsDefences, false);
  assert.strictEqual(ai.defencePercent, 20);
  const m = buildMission({ scripts: [], meta: metaOf('#A1 '), ...all, ai, name: 'a1', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x' });
  assert.ok(m.script.includes('function EmpStoryAiStart') && m.script.includes('    call EmpStoryAiStart()'), 'started');
  assert.ok(m.script.includes('    set EmpEnemyHouse = 0'), 'side 1 plays Atreides');
  const h1 = buildMission({ scripts: [], meta: metaOf('#H1 '), ...all, name: 'h1', playerHouse: 'Atreides', kind: 'story', hubMap: 'AT_Hub.w3x' });
  assert.ok(!h1.script.includes('    call EmpStoryAiStart()'), 'no base, no AI');
  // fourth audit: the AI took one of the map's two base points (EmpBaseOfSide), so script sides that
  // ask for a base later fell back to the player's point. It gets a point of its own at its yard.
  const start = m.script.slice(m.script.indexOf('function EmpStoryAiStart'), m.script.indexOf('endfunction', m.script.indexOf('function EmpStoryAiStart')));
  assert.ok(!start.includes('EmpBaseOfSide(1)') && start.includes('set EmpBaseCount = EmpBaseCount + 1') && start.includes('set EmpSideBase[1] = b'), 'own base point');
  // guards the map places away from the yard and story characters keep their posts (role 4): the
  // tactics pulled them home and sent them in waves
  assert.ok(start.includes('call SaveInteger(EmpWaveTab, GetHandleId(u), 1, 4)'), 'posts');
});
