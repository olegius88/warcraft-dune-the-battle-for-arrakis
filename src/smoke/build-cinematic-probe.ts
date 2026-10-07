// Cinematic probe map: an Emperor movie converted like the client's own (VP9 AVI + MP3 next to it),
// imported into the map and played with PlayCinematic. Converts with ffmpeg (on PATH).
// Usage: node src/smoke/build-cinematic-probe.ts [movie=A00_F00E.BIK] [out=build/test/CinematicProbe.w3x], then
//        (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\CinematicProbe.w3x -Seconds 30 -FramesPrefix build\test\cine- -FrameEvery 5

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { BUILD_DIR, gameData, jassFile } from '../config/paths.ts';

// --stock: play a movie of the client itself instead (does PlayCinematic work at all?)
const stock = process.argv.includes('--stock');
const STOCK_MOVIE = 'Movies\\HumanEd.avi';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const movie = args[0] || 'A00_F00E.BIK';
const out = args[1] || path.join(BUILD_DIR, 'test', stock ? 'CinematicStock.w3x' : 'CinematicProbe.w3x');
const work = path.join(BUILD_DIR, 'test', 'fmv');
fs.mkdirSync(work, { recursive: true });
const avi = path.join(work, 'probe.avi'), mp3 = path.join(work, 'probe.mp3');
const src = gameData('MOVIES', movie);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-an', '-c:v', 'libvpx-vp9', '-b:v', '1200k', '-deadline', 'realtime', '-cpu-used', '8', avi]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', mp3]);
const name = 'EmpProbe';
const m = buildMap({
  name: 'Cinematic Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '    timer udg_clock = null',
  functions: renderFile(jassFile('smoke/cinematic-probe'), { movie: stock ? STOCK_MOVIE : `Movies\\${name}.avi`, report: 'DuneSmoke\\cinematic.pld' }),
  init: '    set udg_clock = CreateTimer()\n    call TimerStart(udg_clock, 1000.0, false, null)\n    call TimerStart( CreateTimer(), 2.0, false, function CinematicProbeRun )',
  imports: { [`Movies\\${name}.avi`]: fs.readFileSync(avi), [`Movies\\audio\\${name}.mp3`]: fs.readFileSync(mp3) },
});
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('cinematic probe ->', out, `(${(m.buffer.length / 1e6).toFixed(1)} MB)`);
