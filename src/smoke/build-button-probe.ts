// Button probe: command card cells (BlzGetAbilityPosX/Y) of the stock abilities a building or unit
// shows besides its train buttons, so the train buttons (ubpx/ubpy, units.ts) avoid them.
// Usage: node src/smoke/build-button-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\ButtonProbe.w3x -Seconds 15

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { str } from '../wc3/jass.ts';
import { BUILD_DIR } from '../config/paths.ts';

const ids = ['ARal', 'Amov', 'Aatk', 'Ahol', 'Apat', 'Asto', 'AHbu', 'AHer', 'Ahar', 'Arep'];
const line = ids.map((a) => `"${a}=" + I2S(BlzGetAbilityPosX('${a}')) + "," + I2S(BlzGetAbilityPosY('${a}'))`).join(' + " " + ');
const out = path.join(BUILD_DIR, 'test', 'ButtonProbe.w3x');
const m = buildMap({
  name: 'Button Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  functions: `function ButtonProbeRun takes nothing returns nothing\n    call PreloadGenClear()\n    call PreloadGenStart()\n    call Preload(${line})\n    call PreloadGenEnd(${str('DuneSmoke\\buttons.pld')})\nendfunction`,
  init: '    call TimerStart(CreateTimer(), 1.0, false, function ButtonProbeRun)',
});
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('button probe ->', out);
