// Range probe map (src/jass/smoke/range-probe.j): does setting a unit's weapon attack range change
// how far it shoots (veterancy ExtraRange)? No in 1.31.1 (2026-10-08): veterancy.j morphs the unit instead.
// Usage: node src/smoke/build-range-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\RangeProbe.w3x -Seconds 40

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';

const out = path.join(BUILD_DIR, 'test', 'RangeProbe.w3x');
const m = buildMap({
  name: 'Range Probe', width: 64, height: 64, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [
    { id: 0, control: 'user', race: 'human', team: 0, x: -1800, y: -1800 },
    { id: 1, control: 'computer', race: 'human', team: 1, x: 1800, y: 1800 },
  ],
  globals: '    string array udg_log\n    integer udg_n = 0\n    integer udg_i = 0\n    unit array udg_s\n    unit array udg_t\n    real array udg_x\n    real array udg_y\n    real array udg_hp\n    trigger udg_run = null',
  // rifleman: base range 400 (Long Rifles not researched); targets 700 apart, range set to 900
  functions: renderFile(jassFile('smoke/range-probe'), { report: 'DuneSmoke\\range.pld', shooter: "'hrif'", target: "'hfoo'", half: 350, range: 900, wait: 8 }),
  init: '    set udg_run = CreateTrigger()\n    call TriggerAddAction(udg_run, function RangeProbeRun)\n    call TriggerRegisterTimerEvent(udg_run, 2.0, false)',
});
fs.writeFileSync(out, m.buffer);
// the script next to the map, for pjass
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('range probe ->', out);
