// Loading screen probe: a small map whose w3i names the contest loading screen model
// (src/emperor/loading-screen.ts) - does the 1.31.1 loading glue show it?
// Usage: node src/smoke/build-loading-probe.ts [--mdl] (the w3i names the .mdl; the .mdx name works,
//        capture 2026-10-09), then pwsh tools/run-wc3-classic.ps1 -Map build\test\LoadingProbe.w3x
//        -Seconds 15 -FramesPrefix <png prefix> -FrameEvery 1

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildMap } from '../wc3/map.ts';
import { loadingScreen } from '../emperor/loading-screen.ts';
import { CONTEST } from '../config/contest.ts';
import { BUILD_DIR, gameData } from '../config/paths.ts';

const args = process.argv.slice(2);
const L = CONTEST.loading;
const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(L.at), '-i', gameData('MOVIES', `${L.movie}.BIK`), '-frames:v', '1', '-vf', 'scale=640:480', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 24 });
const imports = loadingScreen({ width: 640, height: 480, rgba: new Uint8Array(raw) });
const model = args.includes('--mdl') ? L.model.replace(/\.mdx$/i, '.mdl') : L.model;
const out = path.join(BUILD_DIR, 'test', 'LoadingProbe.w3x');
const m = buildMap({
  name: 'Loading Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }, { id: 1, control: 'computer', race: 'human', team: 1, x: 800, y: 800 }],
  imports, loadingScreenModel: model, loadingTitle: 'Loading Probe', loadingText: model,
  globals: '', functions: '', init: '',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log(`loading probe -> ${out}: model ${model}`);
