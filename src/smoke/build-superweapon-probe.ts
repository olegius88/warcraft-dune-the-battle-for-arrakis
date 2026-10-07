// Super weapon probe map (src/jass/smoke/superweapon-probe.j): a palace trains a charge marker
// (cost 0, BuildTime) that is a mortar team: its attack-ground order (any distance) is the strike
// point. (Stock Detonate on a wisp did not cast from a trigger order, 2026-10-08.)
// Usage: node src/smoke/build-superweapon-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\SuperweaponProbe.w3x -Seconds 30

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { writeObjects } from '../wc3/objects.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { UNIT_FIELD as F } from '../config/wc3.ts';

const palace = 'h000';
const marker = 'h001';
const w3u = writeObjects([
  { base: 'htow', id: palace, mods: [{ field: F.trains, type: 'string', value: marker }, { field: F.upgrades, type: 'string', value: '' }, { field: F.researches, type: 'string', value: '' }] },
  { base: 'hmtm', id: marker, mods: [{ field: F.requires, type: 'string', value: '' }, { field: F.goldCost, type: 'int', value: 0 }, { field: F.lumberCost, type: 'int', value: 0 }, { field: F.foodCost, type: 'int', value: 0 }, { field: F.buildTime, type: 'int', value: 3 }] },
]);
const out = path.join(BUILD_DIR, 'test', 'SuperweaponProbe.w3x');
const m = buildMap({
  name: 'Superweapon Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '    string array udg_log\n    integer udg_n = 0\n    integer udg_i = 0\n    unit udg_m = null\n    trigger udg_run = null',
  functions: renderFile(jassFile('smoke/superweapon-probe'), { report: 'DuneSmoke\\superweapon.pld', palace: `'${palace}'`, marker: `'${marker}'`, wait: 5 }),
  init: '    set udg_run = CreateTrigger()\n    call TriggerAddAction(udg_run, function SwProbeRun)\n    call TriggerRegisterTimerEvent(udg_run, 2.0, false)',
  imports: { 'war3map.w3u': w3u },
});
fs.writeFileSync(out, m.buffer);
// the script next to the map, for pjass
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('superweapon probe ->', out);
