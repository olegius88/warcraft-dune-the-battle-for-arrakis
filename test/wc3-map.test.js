'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildMap } = require('../src/wc3/map');
const MpqArchive = require('mdx-m3-viewer/dist/cjs/parsers/mpq/archive').default;
const { BlpImage } = require('mdx-m3-viewer/dist/cjs/parsers/blp/image');

function sampleMap() {
  return buildMap({
    name: 'T', width: 32, height: 32, tileset: 'B', ground: ['Bdsr', 'Bflr'], cliffs: ['CBde'],
    corner: (x) => ({ texture: x < 16 ? 0 : 1 }),
    players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  });
}

// Regression: maps without war3mapMap.blp crash Warcraft III 3.0.0.24268 with 0xC0000005
// both when loaded (-loadfile) and when previewed in the map browser. Found 2026-10-07 by
// bisecting in the real client: our map + only the minimap of a working map loads, our map
// + every other auxiliary file still crashes. Not caught earlier because no reader/spec marks
// the minimap as mandatory. We now always generate a 256x256 BLP1 minimap.
test('buildMap always emits a readable 256x256 war3mapMap.blp', () => {
  const archive = new MpqArchive();
  archive.load(new Uint8Array(sampleMap().buffer), true);
  const file = archive.get('war3mapMap.blp');
  assert.ok(file, 'war3mapMap.blp must be present');
  const blp = new BlpImage();
  blp.load(file.bytes());
  assert.strictEqual(blp.width, 256);
  assert.strictEqual(blp.height, 256);
  assert.strictEqual(blp.content, 1);
  assert.strictEqual(blp.mipmapSizes[0], 256 * 256);
  const pixels = blp.uint8array.subarray(blp.mipmapOffsets[0], blp.mipmapOffsets[0] + 256 * 256);
  // left half (texture 0) and right half (texture 1) must use different palette entries
  assert.notStrictEqual(pixels[128 * 256 + 10], pixels[128 * 256 + 250]);
});
