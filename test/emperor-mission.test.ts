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
  assert.deepStrictEqual(dh?.fallout, { damage: 15, sizeTiles: 10, lifespanTicks: 1000, friendly: true });
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
  const id = (n: string): string => all.units.rawcode.get(n) as string;
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
  assert.ok(m.script.includes('function EmpMoundTimer') && m.script.includes('call SetResourceAmount(f, 50000)'), 'bloom of SpiceCapacity');
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
  assert.ok(m.script.includes('LoadInteger(EmpStormTab, GetUnitTypeId(u), 1) > 0'), 'only a class above 0 is picked up');
});

// [General] HarvReplacementDelay ("ticks before harvester gets replaced") and CashDeliveryWhenNoSpice*
// were not read.
test('a refinery without harvesters gets one after HarvReplacementDelay; cash comes when the spice is gone', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'harv', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('function EmpHarvReplaceTick'), 'replacement check');
  assert.ok(m.script.includes('EmpTick - EmpHarvGone[i] >= 1000'), 'HarvReplacementDelay ticks');
  assert.ok(m.script.includes('GetRandomInt(10000, 20000)') && m.script.includes('GetRandomInt(4000, 8000)'), 'cash delivery amounts and ticks');
});

// Starport prices did not change ([General] StarportCostUpdateDelay, StarportCostVariationPercent).
test('starport prices change every StarportCostUpdateDelay ticks within StarportCostVariationPercent', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
  const m = buildMission({ scripts: [], meta, ...all, name: 'port', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x' });
  assert.ok(m.script.includes('GetRandomInt(60, 140)'), '±40 %');
  assert.match(m.script, /TimerStart\(CreateTimer\(\), 60\.0, true, function EmpPortPrices\)/, '1500 ticks = 60 s');
  assert.ok(m.script.includes(`call SaveInteger(EmpPortTab, '${all.units.rawcode.get('ATTrike')}', 1, `), 'base cost of a starport type');
  assert.ok(m.script.includes('EVENT_PLAYER_UNIT_TRAIN_START') && m.script.includes('function EmpPortTrain'), 'charged at purchase');
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
