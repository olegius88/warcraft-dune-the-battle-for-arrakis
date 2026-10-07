// Super weapons in a real mission map (src/jass/smoke/superweapon-mission.j): palace training and the
// three strikes with the mission runtime (src/jass/runtime/helpers.j EmpSwStrike).
// Usage: node src/smoke/build-superweapon-mission.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\SwMission.w3x -Seconds 50

import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '../emperor/build-mission.ts';
import { readMeta } from '../emperor/mapxbf.ts';
import { ensureMap } from '../emperor/preview-map.ts';
import { buildMission } from '../emperor/mission.ts';
import { superweapons } from '../emperor/superweapons.ts';
import { renderFile } from '../wc3/template.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { TICKS_PER_SECOND } from '../config/scale.ts';

const all = loadAll();
const id = (name: string): string => `'${all.units.rawcode.get(name)}'`;
const sw = superweapons(all.rules);
const beam = sw.find((w) => w.kind === 'beam');
const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
const m = buildMission({
  scripts: [], meta, ...all, name: 'Super weapons', playerHouse: 'Harkonnen', kind: 'attack', territoryBattle: true, hubMap: 'HK_Hub.w3x',
  debugName: 'SwMission',
  extraFunctions: renderFile(jassFile('smoke/superweapon-mission'), {
    report: 'DuneSmoke\\swmission.pld', palace: id('HKPalace'), dh: id('HKDeathHand'), beam: id('ORBeamWeapon'), hawk: id('ATHawkWeapon'),
    victim: id('ATTrike'), tank: id('ATMinotaurus'), beamSeconds: (beam?.effectTicks ?? 0) / TICKS_PER_SECOND,
  }),
  extraStart: 'SwMissionRun',
});
const out = path.join(BUILD_DIR, 'test', 'SwMission.w3x');
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('super weapon mission probe ->', out);
