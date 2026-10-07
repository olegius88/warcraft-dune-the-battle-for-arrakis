// Movie slide-show probe map (src/jass/smoke/fmv-probe.j): a whole Emperor movie at its own size and
// rate from the loose files in the Warcraft III folder (src/emperor/fmv.ts converts it there), on a UI
// backdrop with its WAV. Does the client keep up with 15 frames a second, and does its memory grow?
// Usage: node src/smoke/build-fmv-probe.ts [movie=H01_F00E] [out=build/test/FmvProbe.w3x], then
//        (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\FmvProbe.w3x -Seconds 180 -FramesPrefix build\test\shots\fmv- -FrameEvery 20

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { convertMovie, installBlack } from '../emperor/fmv.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { MOVIE_PATH, MOVIE_AREA, MOVIE_BLACK_AREA } from '../config/movies.ts';

const movie = process.argv[2] || 'H01_F00E';
const out = process.argv[3] || path.join(BUILD_DIR, 'test', 'FmvProbe.w3x');

const info = await convertMovie(movie);
installBlack();
const m = buildMap({
  name: 'FMV Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: ['timer udg_clock = null', 'string udg_log = ""', 'framehandle udg_movie = null', 'framehandle udg_black = null', 'integer udg_frame = 0'].map((g) => `    ${g}`).join('\n'),
  functions: renderFile(jassFile('smoke/fmv-probe'), {
    frames: info.frames, fps: info.fps, logEvery: Math.round(info.fps * 10), period: 1 / info.fps, size: `${info.width}x${info.height}`,
    framePrefix: MOVIE_PATH.frame(movie, 0).replace(/0000\.blp$/, ''), sound: MOVIE_PATH.sound(movie),
    blackTexture: MOVIE_PATH.black, area: MOVIE_AREA, black: MOVIE_BLACK_AREA, report: 'DuneSmoke\\fmv.pld',
  }),
  init: '    set udg_clock = CreateTimer()\n    call TimerStart(udg_clock, 1000.0, false, null)\n    call TimerStart( CreateTimer(), 3.0, false, function FmvProbeRun )',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/.w3x$/i, '.j'), m.script);
console.log('fmv probe ->', out, `${info.frames} frames at ${info.fps} fps`);
