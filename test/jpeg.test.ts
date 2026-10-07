// JPEG encoder (src/wc3/jpeg.ts) and JPEG BLP1 writers (src/wc3/blp.ts) checked against an
// independent reader: mdx-m3-viewer's BLP reader (MIT), which reads B, G, R, A planes like the game.

import test from 'node:test';
import assert from 'node:assert';
import { writeBlpJpeg, blpFromJpeg } from '../src/wc3/blp.ts';
import { AC_VALUES, scanStart } from '../src/wc3/jpeg.ts';
import type { RgbaImage } from '../src/wc3/blp.ts';
import blpModule from 'mdx-m3-viewer/dist/cjs/parsers/blp/image.js';
const { BlpImage } = blpModule;

// the reader returns browser ImageData; node has none
class FakeImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
}
(globalThis as unknown as { ImageData: typeof FakeImageData }).ImageData = FakeImageData;

function picture(w: number, h: number): RgbaImage {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    rgba[i] = (x * 255) / (w - 1); // red: left -> right
    rgba[i + 1] = (y * 255) / (h - 1); // green: top -> bottom
    rgba[i + 2] = ((x >> 3) + (y >> 3)) % 2 ? 200 : 40; // blue: 8x8 checks
    rgba[i + 3] = 255;
  }
  return { width: w, height: h, rgba };
}

const psnr = (a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray, c: number): number => {
  let se = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) { se += ((a[i + c] as number) - (b[i + c] as number)) ** 2; n++; }
  return 10 * Math.log10((255 * 255) / (se / n));
};

const read = (blp: Buffer): InstanceType<typeof BlpImage> => {
  const r = new BlpImage();
  r.load(new Uint8Array(blp)); // own ArrayBuffer: the reader views it from offset 0
  return r;
};

test('JPEG: the AC table holds every run/size symbol once', () => {
  const need = [0x00, 0xf0];
  for (let run = 0; run < 16; run++) for (let size = 1; size <= 10; size++) need.push((run << 4) | size);
  assert.deepStrictEqual([...AC_VALUES].sort((a, b) => a - b), need.sort((a, b) => a - b));
});

test('JPEG BLP: the independent reader decodes the picture with its colours in place', () => {
  const img = picture(64, 32);
  const r = read(writeBlpJpeg(img, 90));
  assert.strictEqual(r.content, 0);
  assert.strictEqual(r.width, 64);
  assert.strictEqual(r.height, 32);
  assert.strictEqual(r.hasMipmaps, false);
  const out = r.getMipmap(0) as unknown as FakeImageData;
  assert.strictEqual(out.width, 64);
  // R, G, B each close to the source (a swapped or misread plane would be far off)
  for (const c of [0, 1, 2]) assert.ok(psnr(img.rgba, out.data, c) > 30, `channel ${c}: ${psnr(img.rgba, out.data, c).toFixed(1)} dB`);
  assert.ok(Math.min(...[...out.data].filter((_, i) => i % 4 === 3)) > 250, 'alpha stays opaque');
});

test('JPEG BLP: a lower quality makes a smaller file', () => {
  const img = picture(128, 128);
  assert.ok(writeBlpJpeg(img, 40).length < writeBlpJpeg(img, 90).length);
});

test('JPEG BLP: header before the scan, scan data as level 0; the reader joins them back', () => {
  const j = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x12, 0x34, 0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x55, 0xff, 0x00, 0xff, 0xd9]);
  assert.strictEqual(scanStart(j), 14);
  const blp = blpFromJpeg(j, 512, 256);
  const r = read(blp);
  const off = r.mipmapOffsets[0] as number, size = r.mipmapSizes[0] as number;
  assert.deepStrictEqual(Buffer.concat([Buffer.from(r.jpgHeader as Uint8Array), blp.subarray(off, off + size)]), j);
});

// Bug (2026-10-08): at high quality (quantiser steps of 1) an AC coefficient can reach +-1024,
// size category 11, which the baseline AC table (sizes 1..10) has no code for: the encoder wrote a
// zero-length code and corrupted the rest of the scan. The 1.31.1 client froze on such a frame of
// I00_F01E (640x480 at quality 95), 98 s into the movie. AC values are now kept to +-1023.
test('JPEG: extreme contrast at quality 100 still decodes (no AC size category 11)', () => {
  const w = 16, h = 16;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (x + y) % 2 ? 255 : 0;
    const i = (y * w + x) * 4;
    rgba[i] = v; rgba[i + 1] = 255 - v; rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  const img = { width: w, height: h, rgba };
  const out = read(writeBlpJpeg(img, 100)).getMipmap(0) as unknown as FakeImageData;
  for (const c of [0, 1, 2]) assert.ok(psnr(img.rgba, out.data, c) > 30, `channel ${c}: ${psnr(img.rgba, out.data, c).toFixed(1)} dB`);
});
