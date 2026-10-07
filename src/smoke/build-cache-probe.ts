// Texture cache probe map (src/jass/smoke/cache-probe.j): which use of UI backdrop textures lets the
// game release the frames of a slide show? Uses the movie frames fmv.ts wrote to the WC3 folder.
// Usage: node src/smoke/build-cache-probe.ts [movie=H01_F00E] [phase=30], then (idle-gated, memory
// sampled by the caller) pwsh tools/run-wc3-classic.ps1 -Map build\test\CacheProbe.w3x -Seconds 130

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { convertMovie } from '../emperor/fmv.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { MOVIE_PATH } from '../config/movies.ts';

const movie = process.argv[2] || 'H01_F00E';
const phase = Number(process.argv[3] || 30);
const out = path.join(BUILD_DIR, 'test', 'CacheProbe.w3x');
const info = await convertMovie(movie);
const n = Math.round(info.fps * phase);
if (3 * n > info.frames) throw new Error(`${movie} has ${info.frames} frames, the probe needs ${3 * n}`);
const m = buildMap({
  name: 'Cache Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: ['timer udg_clock = null', 'string udg_log = ""', 'framehandle udg_movie = null', 'integer udg_tick = 0'].map((g) => `    ${g}`).join('\n'),
  functions: renderFile(jassFile('smoke/cache-probe'), {
    n, fps: Math.round(info.fps), period: 1 / info.fps, phase,
    framePrefix: MOVIE_PATH.frame(movie, 0).replace(/0000\.blp$/, ''), report: 'DuneSmoke\\cache.pld',
  }),
  init: '    set udg_clock = CreateTimer()\n    call TimerStart(udg_clock, 1000.0, false, null)\n    call TimerStart( CreateTimer(), 3.0, false, function CacheProbeRun )',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log('cache probe ->', out, `phases of ${n} frames`);
