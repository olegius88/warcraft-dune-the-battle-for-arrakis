// Engine probe map: settles engine questions the documentation does not (weapon index base of the
// Blz weapon natives, whether the invisibility ability code exists, the art paths of the effect
// abilities) and writes the answers to Documents\Warcraft III\CustomMapData\DuneSmoke\probe.pld.
// Usage: node src/smoke/build-probe.ts [out=build/test/Probe.w3x], then
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\Probe.w3x -Seconds 25

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { ABILITY, ART_ABILITY } from '../config/wc3.ts';

const out = process.argv[2] || path.join(BUILD_DIR, 'test', 'Probe.w3x');
const m = buildMap({
  name: 'Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  functions: renderFile(jassFile('smoke/probe'), { ABILITY, ART_ABILITY, file: 'DuneSmoke\\probe.pld' }),
  init: '    call TimerStart( CreateTimer(), 1.0, false, function ProbeRun )',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
// the script next to the map, for pjass
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('probe ->', out);
