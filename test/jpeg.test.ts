// JPEG stream helpers (src/wc3/jpeg.ts) and the JPEG BLP1 wrapper (blpFromJpeg), read back with an
// independent BLP reader (mdx-m3-viewer, MIT). Movie frames are ffmpeg JPEGs (src/emperor/fmv.ts).

import test from 'node:test';
import assert from 'node:assert';
import { blpFromJpeg } from '../src/wc3/blp.ts';
import { scanStart, splitJpegs } from '../src/wc3/jpeg.ts';
import blpModule from 'mdx-m3-viewer/dist/cjs/parsers/blp/image.js';
const { BlpImage } = blpModule;

/** A JPEG-shaped stream: SOI, an APP0 segment holding FF D9 bytes, SOS, scan data with a stuffed
 * FF 00 and a restart marker, EOI. */
const fakeJpeg = (fill: number): Buffer => Buffer.from([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x06, 0xff, 0xd9, 0x12, 0x34,
  0xff, 0xda, 0x00, 0x04, 0x01, 0x02,
  fill, 0xff, 0x00, fill, 0xff, 0xd3, fill,
  0xff, 0xd9,
]);

test('JPEG: the scan starts after SOS; concatenated JPEGs split at their EOI, not at FF D9 in a header', () => {
  const a = fakeJpeg(0x11), b = fakeJpeg(0x22);
  assert.strictEqual(scanStart(a), 16);
  const parts = splitJpegs(Buffer.concat([a, b, a]));
  assert.strictEqual(parts.length, 3);
  assert.deepStrictEqual(parts[1], b);
  assert.throws(() => splitJpegs(a.subarray(0, a.length - 2)), /without EOI/);
});

test('JPEG BLP: header before the scan, scan data as level 0; the reader joins them back', () => {
  const j = fakeJpeg(0x33);
  const blp = blpFromJpeg(j, 512, 256);
  const r = new BlpImage();
  r.load(new Uint8Array(blp)); // own ArrayBuffer: the reader views it from offset 0
  assert.strictEqual(r.content, 0);
  assert.strictEqual(r.width, 512);
  assert.strictEqual(r.height, 256);
  assert.strictEqual(r.hasMipmaps, false);
  const head = r.jpgHeader as Uint8Array;
  const off = r.mipmapOffsets[0] as number, size = r.mipmapSizes[0] as number;
  assert.deepStrictEqual(Buffer.concat([Buffer.from(head), Buffer.from(blp.subarray(off, off + size))]), j);
});
