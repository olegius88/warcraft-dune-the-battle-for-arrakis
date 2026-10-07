// Game speed probe map (src/jass/smoke/speed-probe.j): JASS timer time against real time, first at
// the speed the client starts the map with, then at MAP_SPEED_NORMAL. Watch the report from outside
// and note when each write lands (real time), e.g. a loop over Get-Item ... LastWriteTime.
// Usage: node src/smoke/build-speed-probe.ts [out=build/test/SpeedProbe.w3x]

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';

const out = process.argv[2] || path.join(BUILD_DIR, 'test', 'SpeedProbe.w3x');
const STEP = 2; // game seconds between reports
const SWITCH_AT = 15; // report number that switches to MAP_SPEED_NORMAL
const m = buildMap({
  name: 'Speed Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '    timer udg_clock = null\n    integer udg_n = 0',
  functions: renderFile(jassFile('smoke/speed-probe'), { step: STEP, switchAt: SWITCH_AT, report: 'DuneSmoke\\speed.pld' }),
  init: '    set udg_clock = CreateTimer()\n    call TimerStart(udg_clock, 10000.0, false, null)\n    call SpeedProbeRun()',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log('speed probe ->', out);
