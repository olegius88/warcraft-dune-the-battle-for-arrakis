// Smoke test: two generated maps in one generated campaign.
//   Smoke1.w3x  - terrain with a plateau, a unit, stores 42 in a game cache, wins -> Smoke2.w3x
//   Smoke2.w3x  - reads the cache back, writes the result to CustomMapData via Preload,
//                 then tries PlayCinematic on an imported Emperor .bik (if available).
// Results land in Documents\Warcraft III\CustomMapData\DuneSmoke\*.pld so they can be
// checked without looking at the screen.
//
// Usage: node src/smoke/build-smoke.js [--bik <path-to-.bik>] [--out <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { buildMap, buildCampaign } from '../wc3/map.ts';
import { PATH } from '../wc3/formats.ts';
import { renderFile } from '../wc3/template.ts';
import type { Scope } from '../wc3/template.ts';
import { SMOKE_OUT_DIR, jassFile } from '../config/paths.ts';
import type { ScriptPlayer } from '../wc3/jass.ts';
import type { Boundary, Corner } from '../wc3/formats.ts';

const args = process.argv.slice(2);
const opt = <D extends string | null>(name: string, def: D): string | D => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] as string : def; };
const outDir = opt('--out', SMOKE_OUT_DIR);
const bikPath = opt('--bik', null);

const W = 64, H = 64;
const BOUNDARY: Boundary = [6, 6, 4, 8];
const inBoundary = (x: number, y: number): boolean => x < BOUNDARY[0] || x > W - BOUNDARY[1] || y < BOUNDARY[2] || y > H - BOUNDARY[3];
// Plateau (cliff layer 3) occupying corners 40..50 x 40..50.
const onPlateau = (x: number, y: number): boolean => x >= 40 && x <= 50 && y >= 40 && y <= 50;

const GROUND = ['Bdsr', 'Bdsd', 'Bflr', 'Bdrh'];
function corner(x: number, y: number): Corner {
  const c: Corner = { texture: 0, layer: 2, cliff: 0, boundary: inBoundary(x, y) };
  if (onPlateau(x, y)) { c.layer = 3; c.texture = 2; }
  else if ((x * 7 + y * 13) % 11 === 0) c.texture = 1;
  if (x >= 20 && x <= 28 && y >= 20 && y <= 28) c.texture = 3;
  return c;
}
function pathing(px: number, py: number): number {
  const cx = px / 4, cy = py / 4;
  if (cx < BOUNDARY[0] || cx >= W - BOUNDARY[1] || cy < BOUNDARY[2] || cy >= H - BOUNDARY[3]) {
    return PATH.UNKNOWN | PATH.NO_WATER | PATH.NO_BUILD | PATH.NO_FLY | PATH.NO_WALK;
  }
  // Cliff ring around the plateau: cells touching both layers are unwalkable.
  const x0 = Math.floor(cx), y0 = Math.floor(cy);
  const layers = [onPlateau(x0, y0), onPlateau(x0 + 1, y0), onPlateau(x0, y0 + 1), onPlateau(x0 + 1, y0 + 1)];
  if (layers.some(Boolean) && !layers.every(Boolean)) return PATH.NO_WATER | PATH.NO_WALK | PATH.NO_BUILD;
  return PATH.NO_WATER;
}

const jass = (name: string, scope: Scope = {}): string => renderFile(jassFile(`smoke/${name}`), scope);

// Run a function 0.5 s after the game starts (sleeps are not allowed during map init).
const startAfter = (fn: string): string => jass('start-after', { fn });

const players: ScriptPlayer[] = [{ id: 0, control: 'user', race: 'human', team: 0, x: -1024, y: -1024, name: 'Atreides' }];

// Preload-based file output: PreloadGenEnd writes CustomMapData\<file>.
const logFn = `\n${jass('log')}\n`;

// nextLevel: inside the campaign the embedded name; standalone a path under Documents\Warcraft III.
const makeMap1 = (nextLevel: string) => buildMap({
  name: 'Dune Smoke 1', description: 'Generated smoke test map 1', width: W, height: H, boundary: BOUNDARY,
  globals: '    trigger udg_t = null',
  tileset: 'B', ground: GROUND, cliffs: ['CBde'], corner, pathing, players, tilesetDnc: 'Lordaeron',
  functions: `${logFn}\n${jass('smoke1', { nextLevel })}\n`,
  init: startAfter('Smoke1Actions'),
});
const map1 = makeMap1('Smoke2.w3x');
const map1Standalone = makeMap1('Maps\\DuneSmoke\\Smoke2.w3x');

const bikName = 'war3mapImported\\DuneSmoke.bik';
const map2 = buildMap({
  name: 'Dune Smoke 2', description: 'Generated smoke test map 2', width: W, height: H, boundary: BOUNDARY,
  globals: '    trigger udg_t = null',
  tileset: 'B', ground: GROUND, cliffs: ['CBde'], corner, pathing, players,
  imports: bikPath ? { [bikName]: fs.readFileSync(bikPath) } : {},
  functions: `${logFn}\n${jass('smoke2', { bikName })}\n`,
  init: startAfter('Smoke2Actions'),
});

const campaign = buildCampaign({
  name: 'AAA Dune Smoke Campaign', author: 'warcraft-dune', description: 'Generated smoke-test campaign', difficulty: 'Test',
  maps: [
    { file: 'Smoke1.w3x', chapter: 'Smoke', title: 'Smoke 1', buffer: map1.buffer },
    { file: 'Smoke2.w3x', chapter: 'Smoke', title: 'Smoke 2', buffer: map2.buffer },
  ],
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'Smoke1.w3x'), map1.buffer);
fs.writeFileSync(path.join(outDir, 'Smoke2.w3x'), map2.buffer);
fs.writeFileSync(path.join(outDir, 'Smoke1-standalone.w3x'), map1Standalone.buffer);
fs.writeFileSync(path.join(outDir, 'Smoke1.j'), map1.script);
fs.writeFileSync(path.join(outDir, 'Smoke2.j'), map2.script);
fs.writeFileSync(path.join(outDir, 'DuneSmoke.w3n'), campaign);
console.log('written to', outDir, { map1: map1.buffer.length, map2: map2.buffer.length, campaign: campaign.length });
