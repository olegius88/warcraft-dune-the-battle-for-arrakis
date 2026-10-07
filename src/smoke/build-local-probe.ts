// Local files probe (src/jass/smoke/local-probe.j): movies at full quality are several GB, more than a
// campaign archive holds. The client can read loose files from its install folder when the
// registry value "Allow Local Files" is 1; this writes test textures and a sound to
// <WC3 dir>\EmperorProbe\ and a map that uses them next to one imported into the map.
// Usage: node src/smoke/build-local-probe.ts [out=build/test/LocalProbe.w3x], then
//        (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\LocalProbe.w3x -Seconds 15 -FramesPrefix build\test\shots\local- -FrameEvery 5

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { writeBlpJpeg } from '../wc3/blp.ts';
import { BUILD_DIR, WC3_DIR, gameData, jassFile } from '../config/paths.ts';

const out = process.argv[2] || path.join(BUILD_DIR, 'test', 'LocalProbe.w3x');
const src = gameData('MOVIES', 'A01_F00E.BIK');
const frame = (w: number, h: number): Buffer => {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', '10', '-i', src, '-frames:v', '1', '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 });
  return writeBlpJpeg({ width: w, height: h, rgba: new Uint8Array(raw) }, 90);
};
const mp3 = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-t', '7', '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', '-f', 'mp3', '-'], { maxBuffer: 1 << 26 });
const tex = ['Probe\\inmap.blp', 'EmperorProbe\\local512.blp', 'EmperorProbe\\local640x480.blp', 'EmperorProbe\\local1024x512.blp'];
const local: Record<string, Buffer> = {
  [tex[1] as string]: frame(512, 512), [tex[2] as string]: frame(640, 480), [tex[3] as string]: frame(1024, 512),
  'EmperorProbe\\local.mp3': mp3,
};
for (const [p, data] of Object.entries(local)) {
  const file = path.join(WC3_DIR, ...p.split('\\'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}
const m = buildMap({
  name: 'Local Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '',
  functions: renderFile(jassFile('smoke/local-probe'), { tex, mapSound: 'Probe\\inmap.mp3', localSound: 'EmperorProbe\\local.mp3', report: 'DuneSmoke\\local.pld' }),
  init: '    call TimerStart( CreateTimer(), 2.0, false, function LocalProbeRun )',
  imports: { [tex[0] as string]: frame(512, 512), 'Probe\\inmap.mp3': mp3 },
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log('local probe ->', out, '; files in', path.join(WC3_DIR, 'EmperorProbe'));
