// The contest loading screen model (src/emperor/loading-screen.ts). The first version stood a plane in
// front of a model camera, as the campaign screen model does; the loading glue ignores model cameras
// and drew nothing (black loading screen, capture 2026-10-09). The glue draws the model in its own
// screen units, so the plane must span 0..0.8 x 0..0.6 at z 0 with the picture's top row at the top.
import test from 'node:test';
import assert from 'node:assert';
import modelModule from 'mdx-m3-viewer/dist/cjs/parsers/mdlx/model.js';
import { loadingScreen } from '../src/emperor/loading-screen.ts';
import { CONTEST } from '../src/config/contest.ts';
const MdlxModel = modelModule.default;

test('loading screen: one screen-space plane naming the picture, no camera', () => {
  const files = loadingScreen({ width: 4, height: 3, rgba: new Uint8Array(4 * 3 * 4).fill(200) });
  assert.deepStrictEqual(Object.keys(files).sort(), [CONTEST.loading.model, CONTEST.loading.picture].sort());
  const m = new MdlxModel();
  m.load(new Uint8Array(files[CONTEST.loading.model] as Buffer));
  assert.strictEqual(m.cameras.length, 0);
  assert.strictEqual(m.textures[0].path, CONTEST.loading.picture);
  const v = [...m.geosets[0].vertices];
  const xs = v.filter((_, i) => i % 3 === 0), ys = v.filter((_, i) => i % 3 === 1), zs = v.filter((_, i) => i % 3 === 2);
  assert.deepStrictEqual([Math.min(...xs), Math.max(...xs)], [0, Math.fround(0.8)]);
  assert.deepStrictEqual([Math.min(...ys), Math.max(...ys)], [0, Math.fround(0.6)]);
  assert.ok(zs.every((z) => z === 0));
  // the vertex at the top (y max) takes the picture's top row (v 0)
  const uv = [...m.geosets[0].uvSets[0]];
  for (let i = 0; i < 4; i++) assert.strictEqual(uv[i * 2 + 1], ys[i] === 0 ? 1 : 0);
});
