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
  assert.strictEqual(k.veterancy[1].selfRepair, true);
  assert.strictEqual(k.veterancy[2].elite, true);
  assert.strictEqual(k.veterancy[2].extraDamage, 100);
  const meta = readMeta(path.join(ensureMap('#H3 ')[0], 'test.xbf'));
  const m = buildMission({
    scripts: [{ tok: fs.readFileSync(path.join(RAW, 'HHK Heighliner Mission.tok')), phase: 1, name: 'HHK Heighliner Mission' }],
    meta, ...all, name: 'HK_S_Heighliner', playerHouse: 'Harkonnen', kind: 'story', hubMap: 'HK_Hub.w3x',
  });
  const id = all.units.rawcode.get('ATKindjal');
  // level 1 of ATKindjal: threshold 2, health 800 -> WC3 400
  assert.ok(m.script.includes(`call EmpVetLevel('${id}', 1, 2, 400, 50, 0, 0, 0, false, false)`), 'ATKindjal level 1 registered');
  assert.match(m.script, /EVENT_PLAYER_UNIT_DEATH/);
  assert.match(m.script, /function EmpOnKill takes nothing returns nothing/);
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
