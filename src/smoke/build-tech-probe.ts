// Tech probe map (src/jass/smoke/tech-probe.j): custom upgrade objects (war3map.w3q) as Emperor's
// building upgrades. Field ids of upgrades: WurstStdlib2 objediting/UpgradeObjEditing.wurst
// (gnam/gtp1 per level, gglb/glmb/gtib/glvl at level 0).
// Usage: node src/smoke/build-tech-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\TechProbe.w3x -Seconds 30

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { writeObjects } from '../wc3/objects.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { UNIT_FIELD as F, UPGRADE_FIELD as G } from '../config/wc3.ts';

const barracks = 'h000';
const unit = 'h001';
const upgrade = 'R000';
const w3u = writeObjects([
  { base: 'hbar', id: barracks, mods: [{ field: F.trains, type: 'string', value: unit }, { field: F.researches, type: 'string', value: upgrade }, { field: F.upgrades, type: 'string', value: '' }] },
  { base: 'hfoo', id: unit, mods: [{ field: F.requires, type: 'string', value: upgrade }] },
]);
const w3q = writeObjects([{ base: 'Rhme', id: upgrade, mods: [
  { field: G.name, type: 'string', value: 'Probe Upgrade', level: 1 },
  { field: G.goldBase, type: 'int', value: 100 }, { field: G.lumberBase, type: 'int', value: 0 },
  { field: G.timeBase, type: 'int', value: 3 }, { field: G.levels, type: 'int', value: 1 },
] }], true);
const out = path.join(BUILD_DIR, 'test', 'TechProbe.w3x');
const m = buildMap({
  name: 'Tech Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '    string array udg_log\n    integer udg_n = 0\n    integer udg_i = 0\n    trigger udg_run = null',
  functions: renderFile(jassFile('smoke/tech-probe'), { report: 'DuneSmoke\\tech.pld', barracks: `'${barracks}'`, unit: `'${unit}'`, upgrade: `'${upgrade}'`, wait: 6 }),
  init: '    set udg_run = CreateTrigger()\n    call TriggerAddAction(udg_run, function TechProbeRun)\n    call TriggerRegisterTimerEvent(udg_run, 2.0, false)',
  imports: { 'war3map.w3u': w3u, 'war3map.w3q': w3q },
});
fs.writeFileSync(out, m.buffer);
// the script next to the map, for pjass
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('tech probe ->', out);
