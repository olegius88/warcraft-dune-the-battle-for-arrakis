// BLP1 writer, palette content, no alpha, single level (the shape of real war3mapMap.blp
// minimaps: 256x256, picture type 5, hasMipmaps 0, one level at offset 156+1024).
// Header layout: mdx-m3-viewer src/parsers/blp/image.ts (39 int32: magic, content,
// alphaBits, width, height, type, hasMipmaps, offsets[16], sizes[16]) + 256 BGRA palette.

import { encodeJpeg, scanStart } from './jpeg.ts';

const BLP1_MAGIC = 0x31504c42; // "BLP1"
const CONTENT_PALETTE = 1;
const CONTENT_JPEG = 0;

export type Rgb = [number, number, number];

/** rgbAt: colour of a pixel, y=0 is the TOP row. */
function writeBlpPaletted(width: number, height: number, rgbAt: (x: number, y: number) => Rgb): Buffer {
  const palette = new Map<number, number>(); // 0xRRGGBB -> index
  const indices = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(x, y);
      // Quantize to 5 bits per channel, which keeps a generated minimap within 256 colours.
      const key = ((r & 0xF8) << 16) | ((g & 0xF8) << 8) | (b & 0xF8);
      let idx = palette.get(key);
      if (idx === undefined) {
        if (palette.size >= 256) throw new Error('minimap uses more than 256 colours');
        idx = palette.size;
        palette.set(key, idx);
      }
      indices[y * width + x] = idx;
    }
  }
  const header = Buffer.alloc(156);
  header.writeInt32LE(BLP1_MAGIC, 0);
  header.writeInt32LE(CONTENT_PALETTE, 4);
  header.writeInt32LE(0, 8); // alpha bits
  header.writeInt32LE(width, 12);
  header.writeInt32LE(height, 16);
  header.writeInt32LE(5, 20); // picture type, as in real minimaps
  header.writeInt32LE(0, 24); // no mipmaps
  header.writeInt32LE(156 + 1024, 28); // offset of level 0
  header.writeInt32LE(width * height, 92); // size of level 0
  const pal = Buffer.alloc(1024);
  for (const [key, idx] of palette) {
    pal[idx * 4] = key & 0xFF; // B
    pal[idx * 4 + 1] = (key >> 8) & 0xFF; // G
    pal[idx * 4 + 2] = (key >> 16) & 0xFF; // R
    pal[idx * 4 + 3] = 0;
  }
  return Buffer.concat([header, pal, indices]);
}

/** A full-colour image (RGBA, row 0 = top). */
export interface RgbaImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** Median-cut palette of at most 256 colours for the opaque-ish pixels of an image. */
function medianCut(rgba: Uint8Array, maxColours = 256): Rgb[] {
  const pixels: Rgb[] = [];
  for (let i = 0; i < rgba.length; i += 4) pixels.push([rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number]);
  if (!pixels.length) return [[0, 0, 0]];
  let boxes: Rgb[][] = [pixels];
  while (boxes.length < maxColours) {
    // split the box with the widest channel range
    let best = -1, bestRange = 0, bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const p of box) { const v = p[ch] as number; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bestRange) { bestRange = hi - lo; best = i; bestCh = ch; }
      }
    });
    if (best < 0) break;
    const box = (boxes[best] as Rgb[]).sort((a, b) => (a[bestCh] as number) - (b[bestCh] as number));
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }
  return boxes.map((box) => {
    const s = [0, 0, 0];
    for (const p of box) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return [Math.round((s[0] as number) / box.length), Math.round((s[1] as number) / box.length), Math.round((s[2] as number) / box.length)] as Rgb;
  });
}

/** Bilinear resample to width x height (sides that are not powers of two -> the next one). */
function resize(img: RgbaImage, width: number, height: number): RgbaImage {
  if (img.width === width && img.height === height) return img;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(img.height - 1, ((y + 0.5) * img.height) / height - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(img.width - 1, ((x + 0.5) * img.width) / width - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(img.width - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const p = (xx: number, yy: number): number => img.rgba[(yy * img.width + xx) * 4 + c] as number;
        const top = p(x0, y0) * (1 - tx) + p(x1, y0) * tx;
        const bottom = p(x0, y1) * (1 - tx) + p(x1, y1) * tx;
        out[(y * width + x) * 4 + c] = Math.round(top * (1 - ty) + bottom * ty);
      }
    }
  }
  return { width, height, rgba: out };
}

/** The next power of two >= n. */
const pow2Ceil = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/** Next level of a mipmap chain: 2x2 box filter (a 1-pixel side stays 1). */
function halve(img: RgbaImage): RgbaImage {
  const w = Math.max(1, img.width >> 1), h = Math.max(1, img.height >> 1);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(img.width - 1, x * 2 + dx), sy = Math.min(img.height - 1, y * 2 + dy);
          s += img.rgba[(sy * img.width + sx) * 4 + c] as number; n++;
        }
        out[(y * w + x) * 4 + c] = Math.round(s / n);
      }
    }
  }
  return { width: w, height: h, rgba: out };
}

/**
 * BLP1 with palette content for any image: median-cut palette, a full mipmap chain (textures need
 * it; WC3 samples smaller levels at a distance), 8-bit alpha after the indices of each level when
 * `alpha` (layout: mdx-m3-viewer src/parsers/blp/image.ts getMipmap). Sides must be powers of two.
 */
function writeBlpImage(img: RgbaImage, { alpha = false, mipmaps = true }: { alpha?: boolean; mipmaps?: boolean } = {}): Buffer {
  const pow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;
  if (!pow2(img.width) || !pow2(img.height)) throw new Error(`BLP sides must be powers of two, got ${img.width}x${img.height}`);
  const palette = medianCut(img.rgba);
  const cache = new Map<number, number>();
  const nearest = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    let idx = cache.get(key);
    if (idx !== undefined) return idx;
    let bd = Infinity;
    idx = 0;
    palette.forEach(([pr, pg, pb], i) => { const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (d < bd) { bd = d; idx = i; } });
    cache.set(key, idx);
    return idx;
  };
  const levels: Buffer[] = [];
  let cur = img;
  for (;;) {
    const n = cur.width * cur.height;
    const data = Buffer.alloc(alpha ? n * 2 : n);
    for (let i = 0; i < n; i++) {
      data[i] = nearest(cur.rgba[i * 4] as number, cur.rgba[i * 4 + 1] as number, cur.rgba[i * 4 + 2] as number);
      if (alpha) data[n + i] = cur.rgba[i * 4 + 3] as number;
    }
    levels.push(data);
    if (!mipmaps || (cur.width === 1 && cur.height === 1) || levels.length === 16) break;
    cur = halve(cur);
  }
  const header = Buffer.alloc(156);
  header.writeInt32LE(BLP1_MAGIC, 0);
  header.writeInt32LE(CONTENT_PALETTE, 4);
  header.writeInt32LE(alpha ? 8 : 0, 8);
  header.writeInt32LE(img.width, 12);
  header.writeInt32LE(img.height, 16);
  // picture type: 5 as in real minimaps; 4 with alpha is an assumption (mdx-m3-viewer does not read it)
  header.writeInt32LE(alpha ? 4 : 5, 20);
  header.writeInt32LE(mipmaps ? 1 : 0, 24);
  let offset = 156 + 1024;
  levels.forEach((l, i) => { header.writeInt32LE(offset, 28 + i * 4); header.writeInt32LE(l.length, 92 + i * 4); offset += l.length; });
  const pal = Buffer.alloc(1024);
  palette.forEach(([r, g, b], i) => { pal[i * 4] = b; pal[i * 4 + 1] = g; pal[i * 4 + 2] = r; });
  return Buffer.concat([header, pal, ...levels]);
}

/**
 * BLP1 with JPEG content (content 0) around a whole baseline JPEG: the shared header is everything
 * up to the scan data (size at offset 156, bytes from 160), the single level is the scan data; the
 * reader joins the two (mdx-m3-viewer src/parsers/blp/image.ts getMipmap). No mipmaps: movie
 * frames are UI textures. The game reads the JPEG as B, G, R, A planes (src/wc3/jpeg.ts): write
 * it with writeBlpJpeg, other JPEGs only for probes.
 */
function blpFromJpeg(jpeg: Buffer, width: number, height: number): Buffer {
  const split = scanStart(jpeg);
  const header = Buffer.alloc(160);
  header.writeInt32LE(BLP1_MAGIC, 0);
  header.writeInt32LE(CONTENT_JPEG, 4);
  header.writeInt32LE(0, 8); // alpha bits
  header.writeInt32LE(width, 12);
  header.writeInt32LE(height, 16);
  header.writeInt32LE(5, 20); // picture type, as writeBlpImage without alpha
  header.writeInt32LE(0, 24); // no mipmaps
  header.writeInt32LE(160 + split, 28);
  header.writeInt32LE(jpeg.length - split, 92);
  header.writeInt32LE(split, 156);
  return Buffer.concat([header, jpeg]);
}

/** JPEG BLP1 of a picture: its B, G, R, A planes as one JPEG (no alpha bits: the A plane is kept as given). */
function writeBlpJpeg(img: RgbaImage, quality: number): Buffer {
  const n = img.width * img.height;
  const planes = [2, 1, 0, 3].map((c) => {
    const p = new Uint8Array(n);
    for (let i = 0; i < n; i++) p[i] = img.rgba[i * 4 + c] as number;
    return p;
  });
  return blpFromJpeg(encodeJpeg(img.width, img.height, planes, quality), img.width, img.height);
}

/** Decode one level of a palette BLP1 (tests; the inverse of writeBlpImage). */
function readBlpPaletted(buf: Buffer, level = 0): RgbaImage {
  if (buf.readInt32LE(0) !== BLP1_MAGIC || buf.readInt32LE(4) !== CONTENT_PALETTE) throw new Error('not a palette BLP1');
  const alphaBits = buf.readInt32LE(8);
  const width = Math.max(1, buf.readInt32LE(12) >> level), height = Math.max(1, buf.readInt32LE(16) >> level);
  const offset = buf.readInt32LE(28 + level * 4);
  const n = width * height;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = 156 + (buf[offset + i] as number) * 4;
    rgba[i * 4] = buf[p + 2] as number; rgba[i * 4 + 1] = buf[p + 1] as number; rgba[i * 4 + 2] = buf[p] as number;
    rgba[i * 4 + 3] = alphaBits === 8 ? buf[offset + n + i] as number : 255;
  }
  return { width, height, rgba };
}

export { writeBlpPaletted, writeBlpImage, blpFromJpeg, writeBlpJpeg, readBlpPaletted, medianCut, resize, pow2Ceil };
