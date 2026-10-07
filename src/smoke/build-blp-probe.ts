// BLP texture probe map (src/jass/smoke/blp-probe.j): one movie frame in four encodings, one per
// quarter of the screen: top left palette 512x512 (writeBlpImage, a known good path), top right
// JPEG YCbCr 4:2:0 512x512, bottom left JPEG YCbCr 4:2:0 256x256, bottom right JPEG YCbCr 4:4:4
// 512x512. 2026-10-07: 512x512 4:2:0 movie frames showed as grey vertical stripes in the hub.
// Usage: node src/smoke/build-blp-probe.ts [movie=A01_F00E] [at=10] [out=build/test/BlpProbe.w3x], then
//        (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\BlpProbe.w3x -Seconds 20 -FramesPrefix build\test\shots\blp- -FrameEvery 5

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { blpFromJpeg, writeBlpImage } from '../wc3/blp.ts';
import { BUILD_DIR, gameData, jassFile } from '../config/paths.ts';

const movie = process.argv[2] || 'A01_F00E';
const at = process.argv[3] || '10';
const out = process.argv[4] || path.join(BUILD_DIR, 'test', 'BlpProbe.w3x');
const src = gameData('MOVIES', `${movie}.BIK`);
const ff = (size: number, extra: string[]): Buffer => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', at, '-i', src, '-frames:v', '1', '-vf', `scale=${size}:${size}`, ...extra, '-']);
const jpeg = (size: number, pix: string): Buffer => blpFromJpeg(ff(size, ['-pix_fmt', pix, '-c:v', 'mjpeg', '-q:v', '3', '-f', 'mjpeg']), size, size);
const raw = ff(512, ['-f', 'rawvideo', '-pix_fmt', 'rgba']);
const tex = ['Emperor\\Probe\\pal512.blp', 'Emperor\\Probe\\j420_512.blp', 'Emperor\\Probe\\j420_256.blp', 'Emperor\\Probe\\j444_512.blp'];
const files: Record<string, Buffer> = {
  [tex[0] as string]: writeBlpImage({ width: 512, height: 512, rgba: new Uint8Array(raw) }, { mipmaps: false }),
  [tex[1] as string]: jpeg(512, 'yuvj420p'),
  [tex[2] as string]: jpeg(256, 'yuvj420p'),
  [tex[3] as string]: jpeg(512, 'yuvj444p'),
};
const m = buildMap({
  name: 'BLP Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '',
  functions: renderFile(jassFile('smoke/blp-probe'), { tex }),
  init: '    call TimerStart( CreateTimer(), 2.0, false, function BlpProbeRun )',
  imports: files,
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log('blp probe ->', out);
