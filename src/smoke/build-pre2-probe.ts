// Particle emitter probe: does the game draw our particle emitters 2 (src/wc3/mdx.ts PRE2)? Two looping
// models without geosets at the centre: A a white disc texture of our own, B the !cexp atlas of the
// effects (src/emperor/effects.ts), both emitting all the time (no tracks).
// Usage: node src/smoke/build-pre2-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\Pre2Probe.w3x -Seconds 20 -FramesPrefix ...

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { writeMdx } from '../wc3/mdx.ts';
import type { MdxModel, ParticleEmitter2 } from '../wc3/mdx.ts';
import { writeBlpImage } from '../wc3/blp.ts';
import { loadArtIni } from '../emperor/artini.ts';
import { buildEffects } from '../emperor/effects.ts';
import { BUILD_DIR, RAW_DIR } from '../config/paths.ts';

const out = path.join(BUILD_DIR, 'test', 'Pre2Probe.w3x');
// a white disc, its alpha fading to the edge
const side = 64;
const rgba = new Uint8Array(side * side * 4);
for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
  const d = Math.hypot(x - side / 2, y - side / 2) / (side / 2);
  const i = (y * side + x) * 4;
  rgba.set([255, 255, 255, Math.max(0, Math.round(255 * (1 - d)))], i);
}
const fxSet = buildEffects(['MissileHit'], loadArtIni(path.join(RAW_DIR, 'ArtIni.txt')));
const atlas = Object.keys(fxSet.files).find((k) => /_cexp_atlas\.blp$/i.test(k)) as string;
const ext = { radius: 100, min: [-100, -100, 0], max: [100, 100, 200] } as MdxModel['extent'];
const emitter = (textureId: number, rows: number, columns: number): ParticleEmitter2 => ({
  name: 'probe', parentId: -1, speed: 150, variation: 0.3, latitude: 30, gravity: 0, lifeSpan: 1.5, emissionRate: 20, width: 40, length: 40,
  flags: 0x8000, filterMode: 1, rows, columns, headOrTail: 0, tailLength: 0, timeMiddle: 0.5,
  colors: [[1, 1, 1], [1, 0.6, 0.2], [1, 0.2, 0]], alphas: [255, 200, 0], scaling: [40, 60, 80],
  headIntervals: [[0, rows * columns - 1, 1], [0, 0, 1]], tailIntervals: [[0, 0, 1], [0, 0, 1]],
  textureId, squirt: 0, priorityPlane: 0, replaceableId: 0,
});
const model = (name: string, texPath: string, rows: number, columns: number): Buffer => writeMdx({
  name, extent: ext, sequences: [{ name: 'Stand', start: 0, end: 1000, extent: ext }], textures: [{ path: texPath }], materials: [{ layers: [{ filterMode: 0, flags: 0x11, textureId: 0 }] }],
  // a triangle: shows that the model loaded
  geosets: [{ vertices: [0, 0, 0, 60, 0, 0, 0, 60, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 0, 1], faces: [0, 1, 2], bones: [0], materialId: 0, extent: ext, sequenceExtents: [ext] }],
  geosetAnimations: [], bones: [{ name: 'root', parentId: -1 }], pivots: [[0, 0, 0], [0, 0, 0]], emitters: [emitter(0, rows, columns)],
});
const m = buildMap({
  name: 'PRE2 Probe', width: 64, height: 64, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }, { id: 1, control: 'computer', race: 'human', team: 1, x: 1800, y: 1800 }],
  imports: {
    'Probe\\Disc.blp': writeBlpImage({ width: side, height: side, rgba }, { alpha: true }),
    'Probe\\A.mdx': model('A', 'Probe\\Disc.blp', 1, 1),
    'Probe\\Atlas.blp': fxSet.files[atlas] as Buffer,
    'Probe\\B.mdx': model('B', 'Probe\\Atlas.blp', 2, 8),
    // the converted MissileHit (particles only, Death with KP2V / KP2E) and its textures
    ...fxSet.files,
  },
  globals: '',
  functions: `function Pre2ProbeHit takes nothing returns nothing
    call DestroyEffect(AddSpecialEffect("Emperor\\\\Models\\\\FX_missileHit.mdl", -250.0, -300.0))
endfunction

function Pre2ProbeRun takes nothing returns nothing
    call FogEnable(false)
    call FogMaskEnable(false)
    call SetCameraPositionForPlayer(Player(0), 0.0, 0.0)
    call AddSpecialEffect("Probe\\\\A.mdl", -250.0, 0.0)
    call AddSpecialEffect("Probe\\\\B.mdl", 250.0, 0.0)
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 30.0, "left A: white disc, right B: !cexp atlas; below MissileHit: destroyed each 2 s (left), kept (right)")
    call AddSpecialEffect("Emperor\\\\Models\\\\FX_missileHit.mdl", 250.0, -300.0)
    call TimerStart(CreateTimer(), 2.0, true, function Pre2ProbeHit)
endfunction`,
  init: '    call TimerStart(CreateTimer(), 1.0, false, function Pre2ProbeRun)',
});
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('PRE2 probe ->', out, 'atlas', atlas);
