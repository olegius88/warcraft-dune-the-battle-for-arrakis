// Terrain heights from a map's own mesh (src/emperor/heightmap.ts). The terrain used uniform heights
// per tile type (TODO(terrain-height)); the map's test.xbf holds the real surface.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { heightsFromScene } from '../src/emperor/heightmap.ts';
import type { XbfScene, XbfNode } from '../src/emperor/xbf.ts';

/** A chunk node covering tiles [0..2]x[0..1] as two triangles, with a skirt triangle hanging down. */
function chunk(): XbfNode {
  const v = (x: number, y: number, z: number): { position: [number, number, number]; normal: [number, number, number] } => ({ position: [x, y, z], normal: [0, 1, 0] });
  const face = (a: number, b: number, c: number): XbfNode['faces'][number] => ({ vertices: [a, b, c], texture: 0, flags: 0, uv: [[0, 0], [0, 0], [0, 0]] });
  return {
    name: '', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], children: [],
    // x = column * 32, z = -row * 32; height rises with the column: 0, 16, 32
    vertices: [v(0, 0, 0), v(64, 32, 0), v(0, 0, -32), v(64, 32, -32), v(0, -500, 0)],
    faces: [face(0, 1, 2), face(1, 3, 2), face(0, 4, 1)],
    rgb: null, smoothingGroups: null, vertexAnimation: null, keyAnimation: null,
  };
}

test('mesh triangles are rasterized at the tile corners; skirts are ignored; gaps filled', () => {
  const scene: XbfScene = { version: 1, fx: Buffer.alloc(0), textures: [], nodes: [chunk()], error: null };
  const h = heightsFromScene(scene, 3, 1); // 4 x 2 corners; column 3 is not covered
  assert.deepStrictEqual([...h].map((x) => Math.round(x)), [0, 16, 32, 32, 0, 16, 32, 32]);
});

const maps = (await import('../src/config/paths.ts')).MAPS_DIR;
const dir = fs.existsSync(maps) ? fs.readdirSync(maps).find((d) => d.startsWith('#T9 ')) : undefined;
test('#T9: rock tiles stand high, sand lies near zero', { skip: dir ? false : 'map #T9 not extracted' }, async () => {
  const { readMeta } = await import('../src/emperor/mapxbf.ts');
  const meta = readMeta(path.join(maps, dir as string, 'test.xbf'));
  const [W, H] = meta.mapSize as [number, number];
  const h = meta.heights as Float64Array;
  assert.strictEqual(h.length, (W + 1) * (H + 1));
  const mean = (type: number): number => {
    let s = 0, n = 0;
    for (let row = 0; row < H; row++) for (let x = 0; x < W; x++) if (meta.tiles?.[row * W + x] === type) { s += h[row * (W + 1) + x] as number; n++; }
    return s / n;
  };
  assert.ok(mean(1) > 90, `rock ${mean(1)}`);
  assert.ok(Math.abs(mean(0)) < 20, `sand ${mean(0)}`);
});
