// Subtitle text probe map (src/jass/smoke/text-probe.j) over a movie frame from the WC3 folder.
// Usage: node src/smoke/build-text-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\TextProbe.w3x -Seconds 15 -FramesPrefix build\test\shots\text- -FrameEvery 5

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { convertMovie } from '../emperor/fmv.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { MOVIE_PATH } from '../config/movies.ts';

const out = path.join(BUILD_DIR, 'test', 'TextProbe.w3x');
await convertMovie('H01_F00E');
const m = buildMap({
  name: 'Text Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '',
  functions: renderFile(jassFile('smoke/text-probe'), { font: 'Fonts\\FRIZQT__.TTF', height: 0.016, back: MOVIE_PATH.frame('H01_F00E', 1500) }),
  init: '    call TimerStart( CreateTimer(), 2.0, false, function TextProbeRun )',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log('text probe ->', out);
