// TGA reader (src/wc3/tga.ts) and the full-colour BLP1 writer (src/wc3/blp.ts writeBlpImage).

import test from 'node:test';
import assert from 'node:assert';
import { readTga } from '../src/wc3/tga.ts';
import { writeBlpImage, readBlpPaletted } from '../src/wc3/blp.ts';

/** A TGA of the given type/depth with optional RLE packets (pixels given top row first). */
function tga(width: number, height: number, depth: 24 | 32, pixels: number[][], { topLeft = false, rle = false } = {}): Buffer {
  const header = Buffer.alloc(18);
  header[2] = rle ? 10 : 2;
  header.writeUInt16LE(width, 12);
  header.writeUInt16LE(height, 14);
  header[16] = depth;
  header[17] = topLeft ? 0x20 : 0;
  const rows: number[][][] = [];
  for (let y = 0; y < height; y++) rows.push(pixels.slice(y * width, (y + 1) * width));
  const ordered = (topLeft ? rows : rows.reverse()).flat();
  const px = (p: number[]): number[] => (depth === 32 ? [p[2], p[1], p[0], p[3]] : [p[2], p[1], p[0]]) as number[];
  const body: number[] = [];
  if (!rle) ordered.forEach((p) => body.push(...px(p)));
  else ordered.forEach((p) => body.push(0x80, ...px(p))); // run packets of one pixel
  return Buffer.concat([header, Buffer.from(body)]);
}

test('TGA: 24/32 bit, bottom-left and top-left origin, RLE', () => {
  const pixels = [[255, 0, 0, 255], [0, 255, 0, 128], [0, 0, 255, 255], [10, 20, 30, 0]];
  for (const opts of [{}, { topLeft: true }, { rle: true }]) {
    const img = readTga(tga(2, 2, 32, pixels, opts));
    assert.deepStrictEqual([...img.rgba], pixels.flat(), JSON.stringify(opts));
  }
  const img24 = readTga(tga(2, 2, 24, pixels));
  assert.deepStrictEqual(Array.from(img24.rgba.slice(0, 8)), [255, 0, 0, 255, 0, 255, 0, 255]);
});

test('BLP1 palette image: colours survive when there are <= 256, alpha, mipmaps down to 1x1', () => {
  const w = 8, h = 4;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([i * 8, 255 - i * 8, (i * 37) & 255, i * 7], i * 4);
  const blp = writeBlpImage({ width: w, height: h, rgba }, { alpha: true });
  const back = readBlpPaletted(blp);
  assert.deepStrictEqual([...back.rgba], [...rgba]);
  assert.strictEqual(blp.readInt32LE(24), 1, 'has mipmaps');
  // levels 8x4, 4x2, 2x1, 1x1
  assert.deepStrictEqual([0, 1, 2, 3, 4].map((l) => blp.readInt32LE(92 + l * 4)), [64, 16, 4, 2, 0]);
  const last = readBlpPaletted(blp, 3);
  assert.deepStrictEqual([last.width, last.height], [1, 1]);
  assert.throws(() => writeBlpImage({ width: 3, height: 4, rgba: new Uint8Array(48) }), /powers of two/);
});

test('BLP1 palette image: more than 256 colours are quantized close to the original', () => {
  const w = 64, h = 64;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([x * 4, y * 4, (x + y) * 2, 255], (y * w + x) * 4);
  const back = readBlpPaletted(writeBlpImage({ width: w, height: h, rgba }));
  let err = 0;
  for (let i = 0; i < rgba.length; i++) if (i % 4 !== 3) err = Math.max(err, Math.abs((back.rgba[i] as number) - (rgba[i] as number)));
  assert.ok(err <= 24, `max channel error ${err}`);
});

test('ArtIni.txt: icon, grey icon, model, construction model; C-string paths', async () => {
  const { parseArtIni, baseName } = await import('../src/emperor/artini.ts');
  const art = parseArtIni([
    '\t[ATConYard]',
    '\tIcon\t\t\t= "icons\\\\ico2_acy.tga"\t',
    '\tIconGrey\t\t= "icons\\\\grey_ico2_acy.tga"',
    '\tXaf\t\t\t\t= "AT_Conyard"',
    '\tXafConstruction = "construction_AT_construction_yard_high.XBF"',
    '\tClipSphere = 140 // c',
    '\tLoadFlagOnlyPreplaced',
  ].join('\r\n'));
  const e = art.get('atconyard');
  assert.strictEqual(e?.icon, 'icons\\ico2_acy.tga');
  assert.strictEqual(baseName(e?.iconGrey ?? ''), 'grey_ico2_acy.tga');
  assert.strictEqual(e?.xaf, 'AT_Conyard');
  assert.strictEqual(e?.xafConstruction, 'construction_AT_construction_yard_high.XBF');
  assert.strictEqual(e?.raw.ClipSphere, '140');
});
