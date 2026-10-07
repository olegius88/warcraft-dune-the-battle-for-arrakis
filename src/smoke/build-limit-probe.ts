// Texture limit probe (src/jass/smoke/limit-probe.j): a 15 fps 640x480 slide show froze the 1.31.1
// client after ~3000 frames in one map (~5 GB private memory, 2026-10-08). Is the limit the number of
// distinct textures or their memory? This shows `count` distinct textures of `size` x `size` pixels
// one after the other on a backdrop (loose files in the Warcraft III folder) and logs every 250th.
// Usage: node src/smoke/build-limit-probe.ts [count=6000] [size=32] [perSecond=60], then
//        (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\LimitProbe.w3x -Seconds 130

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { writeBlpJpeg } from '../wc3/blp.ts';
import { BUILD_DIR, WC3_DIR, jassFile } from '../config/paths.ts';

const count = Number(process.argv[2] || 6000);
const size = Number(process.argv[3] || 32);
const perSecond = Number(process.argv[4] || 60);
const dir = `EmperorProbe\\Limit${size}`;
fs.mkdirSync(path.join(WC3_DIR, ...dir.split('\\')), { recursive: true });
for (let i = 0; i < count; i++) {
  const file = path.join(WC3_DIR, ...dir.split('\\'), `${String(i).padStart(5, '0')}.blp`);
  if (fs.existsSync(file)) continue;
  const rgba = new Uint8Array(size * size * 4);
  for (let p = 0; p < size * size; p++) { rgba[p * 4] = (i * 37) & 255; rgba[p * 4 + 1] = (i * 91 + p) & 255; rgba[p * 4 + 2] = (p * 7) & 255; rgba[p * 4 + 3] = 255; }
  fs.writeFileSync(file, writeBlpJpeg({ width: size, height: size, rgba }, 90));
}
const out = path.join(BUILD_DIR, 'test', 'LimitProbe.w3x');
const m = buildMap({
  name: 'Limit Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '    timer udg_clock = null\n    integer udg_n = 0\n    framehandle udg_view = null\n    string udg_log = ""',
  functions: renderFile(jassFile('smoke/limit-probe'), { count, period: 1 / perSecond, prefix: `${dir}\\`, report: 'DuneSmoke\\limit.pld' }),
  init: '    set udg_clock = CreateTimer()\n    call TimerStart(udg_clock, 10000.0, false, null)\n    call TimerStart( CreateTimer(), 2.0, false, function LimitProbeRun )',
});
fs.writeFileSync(out, m.buffer);
console.log('limit probe ->', out, `${count} textures of ${size}x${size}`);
