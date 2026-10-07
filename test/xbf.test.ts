// XBF reader (src/emperor/xbf.ts, port of xanlib) on a synthetic scene and on the game's models.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { readXbf, allNodes, readAnimations } from '../src/emperor/xbf.ts';
import { readArchive } from '../src/emperor/rfh.ts';
import { gameData } from '../src/config/paths.ts';

/** One node with a triangle and sparse key frames, children none. */
function sceneBuffer(): Buffer {
  const parts: Buffer[] = [];
  const i32 = (v: number): void => { const b = Buffer.alloc(4); b.writeInt32LE(v); parts.push(b); };
  const i16 = (v: number): void => { const b = Buffer.alloc(2); b.writeInt16LE(v); parts.push(b); };
  const f32 = (v: number): void => { const b = Buffer.alloc(4); b.writeFloatLE(v); parts.push(b); };
  const f64 = (v: number): void => { const b = Buffer.alloc(8); b.writeDoubleLE(v); parts.push(b); };
  i32(1); i32(0); // version, fx size
  const tex = Buffer.from('a.tga\0\0b.tga\0\0', 'latin1'); i32(tex.length); parts.push(tex);
  i32(3); i32(8); i32(1); i32(0); // vertices, flags (key animation), faces, children
  for (let k = 0; k < 16; k++) f64(k % 5 === 0 ? 1 : 0); // identity
  const name = Buffer.from('body', 'latin1'); i32(name.length); parts.push(name);
  for (const v of [[0, 0, 0], [1, 0, 0], [0, 1, 0]]) { v.forEach(f32); [0, 0, 1].forEach(f32); }
  [0, 1, 2, 1, 0].forEach(i32); [0, 0, 1, 0, 0, 1].forEach(f32);
  i32(10); i32(1); // key animation: frame count, 1 key frame
  i16(5); i16(0b101 << 12); // frame 5: rotation + translation
  [1, 0, 0, 0].forEach(f32); [3, 4, 5].forEach(f32);
  i32(-1);
  return Buffer.concat(parts);
}

test('XBF: textures, node geometry, sparse key frames', () => {
  const s = readXbf(sceneBuffer());
  assert.strictEqual(s.error, null);
  assert.deepStrictEqual(s.textures, ['a.tga', 'b.tga']);
  const n = s.nodes[0];
  assert.strictEqual(n?.name, 'body');
  assert.deepStrictEqual(n?.faces[0]?.vertices, [0, 1, 2]);
  assert.deepStrictEqual(n?.keyAnimation?.frames[0], { frame: 5, flag: 0b101 << 12, rotation: [1, 0, 0, 0], scale: null, translation: [3, 4, 5] });
});

const archive = gameData('3DDATA0001');
test('XBF: the game models parse completely (AT_Trike_H0)', { skip: fs.existsSync(archive + '.RFH') ? false : 'Emperor not installed' }, () => {
  const f = [...readArchive(archive, (n) => /^Units\/AT_Trike_H0\.xbf$/i.test(n))][0];
  assert.ok(f);
  const s = readXbf(f.data);
  assert.strictEqual(s.error, null);
  const names = [...allNodes(s.nodes)].map((n) => n.name);
  assert.ok(names.includes('Front wheel') && names.includes('Gun'));
  const anims = readAnimations(f.data);
  assert.deepStrictEqual(anims.get('Move')?.map((r) => [r.start, r.end]), [[92, 105]]);
});
