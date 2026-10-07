'use strict';
// BLP1 writer, palette content, no alpha, single level (the shape of real war3mapMap.blp
// minimaps: 256x256, picture type 5, hasMipmaps 0, one level at offset 156+1024).
// Header layout: mdx-m3-viewer src/parsers/blp/image.ts (39 int32: magic, content,
// alphaBits, width, height, type, hasMipmaps, offsets[16], sizes[16]) + 256 BGRA palette.

const BLP1_MAGIC = 0x31504c42; // "BLP1"
const CONTENT_PALETTE = 1;

/**
 * @param {number} width
 * @param {number} height
 * @param {(x:number,y:number)=>[number,number,number]} rgbAt  y=0 is the TOP row
 */
function writeBlpPaletted(width, height, rgbAt) {
  const palette = new Map(); // 0xRRGGBB -> index
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

module.exports = { writeBlpPaletted };
