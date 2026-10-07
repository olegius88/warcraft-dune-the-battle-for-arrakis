// Movie slide-show probe map (src/jass/smoke/fmv-probe.j): the start of an Emperor movie as JPEG BLP
// frames on a UI backdrop with its MP3.
// Usage: node src/smoke/build-fmv-probe.ts [movie=A01_F00E] [seconds=20] [out=build/test/FmvProbe.w3x], then
//        (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\FmvProbe.w3x -Seconds 40 -FramesPrefix build\test\shots\fmv- -FrameEvery 3

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { convertMovie, blackTexture } from '../emperor/fmv.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { MOVIE_FPS, MOVIE_FRAME_SIZE, MOVIE_PATH, MOVIE_AREA, MOVIE_BLACK_AREA } from '../config/movies.ts';

const movie = process.argv[2] || 'A01_F00E';
const seconds = Number(process.argv[3] || 20);
const out = process.argv[4] || path.join(BUILD_DIR, 'test', 'FmvProbe.w3x');

const { files, frames } = convertMovie(movie, seconds);
files[MOVIE_PATH.black] = blackTexture();

const m = buildMap({
  name: 'FMV Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: ['timer udg_clock = null', 'string udg_log = ""', 'framehandle udg_movie = null', 'framehandle udg_black = null', 'integer udg_frame = 0'].map((g) => `    ${g}`).join('\n'),
  functions: renderFile(jassFile('smoke/fmv-probe'), {
    frames, fps: MOVIE_FPS, period: 1 / MOVIE_FPS, size: `${MOVIE_FRAME_SIZE.width}x${MOVIE_FRAME_SIZE.height}`,
    framePrefix: MOVIE_PATH.frame(movie, 0).replace(/0000\.blp$/, ''), sound: MOVIE_PATH.sound(movie),
    blackTexture: MOVIE_PATH.black, area: MOVIE_AREA, black: MOVIE_BLACK_AREA, report: 'DuneSmoke\\fmv.pld',
  }),
  init: '    set udg_clock = CreateTimer()\n    call TimerStart(udg_clock, 1000.0, false, null)\n    call TimerStart( CreateTimer(), 3.0, false, function FmvProbeRun )',
  imports: files,
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('fmv probe ->', out, `${frames} frames, ${(m.buffer.length / 1e6).toFixed(1)} MB`);
