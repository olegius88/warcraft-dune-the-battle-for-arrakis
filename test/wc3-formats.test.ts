// Our writers are checked against an independent reader (mdx-m3-viewer, MIT),
// whose own readers round-trip real v31/v25 map files byte-exactly.

import test from 'node:test';
import assert from 'node:assert';
import zlib from 'node:zlib';
import * as F from '../src/wc3/formats.ts';
import { MpqWriter } from '../src/wc3/mpq.ts';
import { writeObjects } from '../src/wc3/objects.ts';
import w3xModule from 'mdx-m3-viewer/dist/cjs/parsers/w3x/index.js';
const w3x = w3xModule.default;
import mpqArchiveModule from 'mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js';
const MpqArchive = mpqArchiveModule.default;

test('MPQ: files written by MpqWriter are readable by an independent reader', () => {
  const big = Buffer.alloc(20000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 0xff; // several sectors
  const rnd = zlib.deflateRawSync(Buffer.from('x'.repeat(10)));
  const mpq = new MpqWriter()
    .add('war3map.j', 'function main takes nothing returns nothing\r\nendfunction\r\n')
    .add('war3mapImported\\a.bin', big)
    .add('plain.w3x', big, { compress: false })
    .add('tiny.bin', rnd)
    .add('empty.txt', Buffer.alloc(0));
  const archive = new MpqArchive();
  archive.load(new Uint8Array(mpq.toBuffer()), true); // fresh ArrayBuffer: the reader ignores byteOffset
  assert.deepStrictEqual(new Set(archive.getFileNames()),
    new Set(['war3map.j', 'war3mapImported\\a.bin', 'plain.w3x', 'tiny.bin', 'empty.txt', '(listfile)']));
  const bytes = (name: string): Buffer => {
    const f = archive.get(name);
    assert.ok(f, `${name} in archive`);
    const b = f.bytes();
    assert.ok(b, `${name} readable`);
    return Buffer.from(b);
  };
  assert.strictEqual(bytes('war3map.j').toString(), 'function main takes nothing returns nothing\r\nendfunction\r\n');
  assert.ok(bytes('war3mapImported\\a.bin').equals(big));
  assert.ok(bytes('plain.w3x').equals(big));
  assert.ok(bytes('tiny.bin').equals(rnd));
});

test('w3i v31: independent reader parses our fields and consumes the whole file', () => {
  const buf = F.writeW3i({
    version: 31, name: 'Name', author: 'Author', description: 'Desc', width: 64, height: 64, tileset: 'B',
    players: [{ id: 0, type: 1, race: 1, name: 'P1', x: 10, y: 20 }, { id: 3, type: 2, race: 2, name: 'P4', x: -5, y: 6 }],
    forces: [{ flags: 3, playerMask: 0b1001, name: 'F1' }],
  });
  const f = new w3x.w3i.File();
  f.load(buf);
  assert.strictEqual(f.version, 31);
  assert.strictEqual(f.name, 'Name');
  assert.strictEqual(f.tileset, 'B');
  assert.deepStrictEqual([...f.playableSize], [52, 52]);
  assert.strictEqual(f.players.length, 2);
  assert.strictEqual(f.players[1].id, 3);
  assert.strictEqual(f.players[1].race, 2);
  assert.deepStrictEqual([...f.players[0].startLocation], [10, 20]);
  assert.strictEqual(f.forces[0].playerMasks, 0b1001);
  assert.strictEqual(f.getByteLength(), buf.length, 'reader must consume exactly the bytes we wrote');
});

test('w3e v11: corners decode to the requested texture/layer/cliff/boundary', () => {
  const buf = F.writeW3e({
    tileset: 'B', ground: ['Bdsr', 'Bflr'], cliffs: ['CBde'], width: 4, height: 2,
    corner: (x, y) => ({ texture: x % 2, layer: y === 2 ? 3 : 2, cliff: 0, boundary: x === 0, height: 0.5 }),
  });
  const f = new w3x.w3e.File();
  f.load(buf);
  assert.strictEqual(f.version, 11);
  assert.deepStrictEqual([...f.mapSize], [5, 3]);
  assert.deepStrictEqual([...f.centerOffset], [-256, -128]);
  assert.deepStrictEqual(f.groundTilesets, ['Bdsr', 'Bflr']);
  const c = f.corners[2][1]; // row y=2, column x=1
  assert.strictEqual(c.groundTexture, 1);
  assert.strictEqual(c.layerHeight, 3);
  assert.strictEqual(c.cliffTexture, 0);
  assert.strictEqual(c.groundHeight, 0.5);
  assert.strictEqual(f.corners[0][0].mapEdge, 0x4000);
  assert.strictEqual(f.corners[0][1].mapEdge, 0);
});

test('wpm: header and size match the terrain', () => {
  const buf = F.writeWpm(8, 4, (x, y) => (x === 0 ? F.PATH.NO_WALK : F.PATH.NO_WATER));
  const f = new w3x.wpm.File();
  f.load(buf);
  assert.deepStrictEqual([...f.size], [32, 16]);
  assert.strictEqual(f.pathing[0], F.PATH.NO_WALK);
  assert.strictEqual(f.pathing[1], F.PATH.NO_WATER);
});

test('w3f v1: independent reader parses the campaign map list', () => {
  const buf = F.writeW3f({ name: 'Camp', author: 'A', description: 'D', maps: [
    { file: '1.w3x', chapter: 'Ch1', title: 'T1' }, { file: '2.w3x', chapter: 'Ch1', title: 'T2', visible: false }] });
  const f = new w3x.w3f.File();
  f.load(buf);
  assert.strictEqual(f.name, 'Camp');
  assert.strictEqual(f.mapTitles.length, 2);
  assert.strictEqual(f.mapTitles[1].path, '2.w3x');
  assert.strictEqual(f.mapTitles[1].visible, 0);
  assert.strictEqual(f.mapOrders[0].path, '1.w3x');
  assert.strictEqual(f.getByteLength(), buf.length);
});

// w3i fields "supported graphics modes" and "game data version" match what the 1.32+ editor
// writes (3 = SD|HD, 2). They were first suspected for the 3.0 map-browser crash; the in-game
// bisect proved the cause was the missing minimap (see test/wc3-map.test.js).
test('w3i v31: graphics modes = SD|HD and game data version = 2 (editor values)', () => {
  const f = new w3x.w3i.File();
  f.load(new Uint8Array(F.writeW3i({ version: 31, name: 'N', width: 64, height: 64, tileset: 'B', players: [], forces: [] })));
  assert.strictEqual(f.graphicsMode, 3);
  assert.strictEqual(f.unknown1, 2);
});

test('w3i v28 (1.31.1 classic, the default): fields parse and the reader consumes the whole file', () => {
  const buf = F.writeW3i({ name: 'C', width: 64, height: 64, tileset: 'B',
    players: [{ id: 0, type: 1, race: 1, name: 'P', x: 1, y: 2 }], forces: [{ flags: 3, playerMask: 1, name: 'F' }] });
  const f = new w3x.w3i.File();
  f.load(new Uint8Array(buf));
  assert.strictEqual(f.version, 28);
  assert.strictEqual(f.editorVersion, 6072);
  assert.deepStrictEqual([...f.buildVersion], [1, 31, 1, 12164]);
  assert.strictEqual(f.players[0].name, 'P');
  assert.strictEqual(f.getByteLength(), buf.length);
});

test('w3u v2: custom unit modifications parse with an independent reader', () => {
  const buf = writeObjects([
    { base: 'hfoo', mods: [{ field: 'uhpm', type: 'int', value: 999 }] },
    { base: 'hfoo', id: 'h000', mods: [{ field: 'unam', type: 'string', value: 'Пехота' }, { field: 'usca', type: 'real', value: 1.5 }] },
  ]);
  const f = new w3x.w3u.File();
  f.load(new Uint8Array(buf));
  assert.strictEqual(f.version, 2);
  assert.strictEqual(f.originalTable.objects[0].oldId, 'hfoo');
  assert.strictEqual(f.originalTable.objects[0].modifications[0].value, 999);
  const c = f.customTable.objects[0];
  assert.strictEqual(c.newId, 'h000');
  assert.strictEqual(c.modifications[0].value, 'Пехота');
  assert.ok(Math.abs(Number(c.modifications[1].value) - 1.5) < 1e-6);
});
