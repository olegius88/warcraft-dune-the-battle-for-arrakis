
import test from 'node:test';
import assert from 'node:assert';
import { buildMap } from '../src/wc3/map.ts';
import mpqArchiveModule from 'mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js';
const MpqArchive = mpqArchiveModule.default;
import blpImageModule from 'mdx-m3-viewer/dist/cjs/parsers/blp/image.js';
const { BlpImage } = blpImageModule;

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
  assert.ok(blp.uint8array, 'BLP data loaded');
  const pixels = blp.uint8array.subarray(blp.mipmapOffsets[0], blp.mipmapOffsets[0] + 256 * 256);
  // left half (texture 0) and right half (texture 1) must use different palette entries
  assert.notStrictEqual(pixels[128 * 256 + 10], pixels[128 * 256 + 250]);
});

// Regression: the map's texts were written straight into war3map.w3i and config(). The 1.31.1
// client crashed while loading AT_A07 ("Not enough memory ... Requested 437369793696 bytes",
// 2026-10-08): its briefing (ATP1M7FR, 432 characters) is the loading screen text and description;
// the same map without the briefing loaded (src/smoke/build-territory-probe.ts --briefing). Maps the
// editor saves keep these texts in war3map.wts and refer to them as TRIGSTR_nnn; so do ours now.
test('map texts go to war3map.wts and the w3i / config() refer to them as TRIGSTR', () => {
  const long = 'Вы должны знать, что были сообщения о злодеяниях. '.repeat(10);
  const m = buildMap({
    name: 'Атака: Bilar Slopes', description: long, loadingText: long, width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'],
    corner: () => ({}), players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  });
  const archive = new MpqArchive();
  archive.load(new Uint8Array(m.buffer), true);
  const w3i = Buffer.from(archive.get('war3map.w3i')?.bytes() ?? new Uint8Array()).toString('utf8');
  const wts = Buffer.from(archive.get('war3map.wts')?.bytes() ?? new Uint8Array()).toString('utf8');
  assert.ok(!w3i.includes('злодеяниях') && !w3i.includes('Bilar'), 'no text inline in w3i');
  assert.match(w3i, /TRIGSTR_\d{3}/);
  assert.ok(wts.includes(long.trim()) && wts.includes('Атака: Bilar Slopes'), 'texts in wts');
  assert.match(m.script, /call SetMapName\( "TRIGSTR_\d{3}" \)/);
  assert.match(m.script, /call SetMapDescription\( "TRIGSTR_\d{3}" \)/);
});
