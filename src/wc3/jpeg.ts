// JPEG for the JPEG content of BLP1 textures. Warcraft III reads that JPEG as B, G, R, A planes
// without a colour transform (mdx-m3-viewer src/parsers/blp/jpg.ts getData: "we know this is going
// to be a hacky BGRA BLP file"); a YCbCr JPEG (ffmpeg's, 4:2:0 or 4:4:4) is drawn grey with
// vertical stripes at 3/4 of its width (BLP probe src/smoke/build-blp-probe.ts, 2026-10-07). So the
// encoder writes every plane full size (no subsampling) with no APP14 marker. Tables: ITU-T T.81
// Annex K (K.1 luminance quantisation, K.3 luminance DC / AC Huffman codes), for every plane.

const SOI = 0xd8, EOI = 0xd9, SOS = 0xda;

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21,
  28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61,
  54, 47, 55, 62, 63,
];

const QUANT_K1 = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

interface Huffman { code: Int32Array; size: Int32Array }

/** Canonical codes of a table given as code-length counts + symbols (T.81 Annex C). */
function huffman(bits: number[], values: number[]): Huffman {
  const code = new Int32Array(256), size = new Int32Array(256);
  let c = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < (bits[len - 1] as number); i++) {
      const v = values[k++] as number;
      code[v] = c++;
      size[v] = len;
    }
    c <<= 1;
  }
  return { code, size };
}

const DC = huffman(DC_BITS, DC_VALUES);
const AC = huffman(AC_BITS, AC_VALUES);

/** Quality 1..100 -> quantisation table in zigzag order (the IJG scaling of Annex K.1). */
function quantTable(quality: number): number[] {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const scale = q < 50 ? 5000 / q : 200 - q * 2;
  return ZIGZAG.map((i) => Math.min(255, Math.max(1, Math.floor(((QUANT_K1[i] as number) * scale + 50) / 100))));
}

// cos((2x + 1) u pi / 16) * C(u) / 2
const DCT = new Float64Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) DCT[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16) * (u === 0 ? Math.SQRT1_2 : 1) / 2;

class BitWriter {
  out: number[] = [];
  private acc = 0;
  private n = 0;
  write(code: number, size: number): void {
    for (let i = size - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((code >> i) & 1);
      if (++this.n === 8) this.flushByte();
    }
  }
  private flushByte(): void {
    this.out.push(this.acc);
    if (this.acc === 0xff) this.out.push(0); // byte stuffing
    this.acc = 0;
    this.n = 0;
  }
  /** pad the last byte with 1 bits */
  end(): void {
    while (this.n) this.write(1, 1);
  }
}

/** Number of bits of |v| and the value's bit pattern (T.81 F.1.2.1). */
function category(v: number): [number, number] {
  const a = Math.abs(v);
  let s = 0;
  while (a >> s) s++;
  return [s, v < 0 ? v + (1 << s) - 1 : v];
}

/**
 * Encode planes (each width * height bytes, row 0 = top) as a baseline JPEG, one 8-bit component
 * per plane in the given order, 1x1 sampling, component ids 1..n.
 */
function encodeJpeg(width: number, height: number, planes: Uint8Array[], quality: number): Buffer {
  const qt = quantTable(quality);
  const seg = (marker: number, body: number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const n = planes.length;
  const head: number[] = [0xff, SOI];
  head.push(...seg(0xdb, [0, ...qt]));
  head.push(...seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, n, ...planes.flatMap((_, i) => [i + 1, 0x11, 0])]));
  head.push(...seg(0xc4, [0x00, ...DC_BITS, ...DC_VALUES]));
  head.push(...seg(0xc4, [0x10, ...AC_BITS, ...AC_VALUES]));
  head.push(...seg(SOS, [n, ...planes.flatMap((_, i) => [i + 1, 0x00]), 0, 63, 0]));
  const bw = new BitWriter();
  const pred = Array.from({ length: n }, () => 0);
  const block = new Float64Array(64), tmp = new Float64Array(64);
  const coef = new Int32Array(64);
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let c = 0; c < n; c++) {
        const p = planes[c] as Uint8Array;
        // level-shifted samples, edges repeated
        for (let y = 0; y < 8; y++) {
          const row = Math.min(by + y, height - 1) * width;
          for (let x = 0; x < 8; x++) block[y * 8 + x] = (p[row + Math.min(bx + x, width - 1)] as number) - 128;
        }
        // separable 2-D DCT: rows, then columns
        for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let x = 0; x < 8; x++) s += (DCT[u * 8 + x] as number) * (block[y * 8 + x] as number);
          tmp[y * 8 + u] = s;
        }
        for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let y = 0; y < 8; y++) s += (DCT[v * 8 + y] as number) * (tmp[y * 8 + u] as number);
          block[v * 8 + u] = s;
        }
        for (let k = 0; k < 64; k++) coef[k] = Math.round((block[ZIGZAG[k] as number] as number) / (qt[k] as number));
        // DC difference
        const diff = (coef[0] as number) - (pred[c] as number);
        pred[c] = coef[0] as number;
        const [ds, dv] = category(diff);
        bw.write(DC.code[ds] as number, DC.size[ds] as number);
        if (ds) bw.write(dv, ds);
        // AC run-length
        let run = 0;
        for (let k = 1; k < 64; k++) {
          const v = coef[k] as number;
          if (v === 0) { run++; continue; }
          while (run > 15) { bw.write(AC.code[0xf0] as number, AC.size[0xf0] as number); run -= 16; }
          const [s, bits] = category(v);
          const sym = (run << 4) | s;
          bw.write(AC.code[sym] as number, AC.size[sym] as number);
          bw.write(bits, s);
          run = 0;
        }
        if (run) bw.write(AC.code[0] as number, AC.size[0] as number);
      }
    }
  }
  bw.end();
  return Buffer.from([...head, ...bw.out, 0xff, EOI]);
}

/** Offset of the entropy-coded data of the JPEG at `at`: just after its SOS segment. */
function scanStart(jpeg: Buffer, at = 0): number {
  if (jpeg[at] !== 0xff || jpeg[at + 1] !== SOI) throw new Error(`no JPEG at ${at}`);
  let i = at + 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) throw new Error(`JPEG marker expected at ${i}`);
    const marker = jpeg[i + 1] as number;
    i += 2 + jpeg.readUInt16BE(i + 2);
    if (marker === SOS) return i;
  }
  throw new Error('no SOS segment');
}

export { encodeJpeg, scanStart, AC_VALUES };
