// TGA reader (Emperor's textures and icons): image types 1/2/3 (colour-mapped, true-colour,
// grey) and their RLE forms 9/10/11, 8/16/24/32 bits per pixel, origin bottom-left or top-left.
// Header (18 bytes): idLength, colorMapType, imageType, cmFirst u16, cmLength u16, cmDepth,
// xOrigin u16, yOrigin u16, width u16, height u16, pixelDepth, descriptor (bit 5 = top-left).

export interface Image {
  width: number;
  height: number;
  /** RGBA, row 0 = top */
  rgba: Uint8Array;
}

function readTga(buf: Buffer): Image {
  const idLength = buf.readUInt8(0);
  const colorMapType = buf.readUInt8(1);
  const imageType = buf.readUInt8(2);
  const cmFirst = buf.readUInt16LE(3);
  const cmLength = buf.readUInt16LE(5);
  const cmDepth = buf.readUInt8(7);
  const width = buf.readUInt16LE(12);
  const height = buf.readUInt16LE(14);
  const depth = buf.readUInt8(16);
  const descriptor = buf.readUInt8(17);
  const topLeft = (descriptor & 0x20) !== 0;
  const base = imageType & 7;
  const rle = (imageType & 8) !== 0;
  if (![1, 2, 3].includes(base)) throw new Error(`TGA image type ${imageType} not supported`);
  let p = 18 + idLength;
  // colour map: entries of cmDepth bits, stored BGR(A)
  const palette: number[][] = [];
  if (colorMapType === 1) {
    const bytes = Math.ceil(cmDepth / 8);
    for (let i = 0; i < cmLength; i++) { palette[cmFirst + i] = pixelOf(buf, p, cmDepth); p += bytes; }
  }
  const pixelBytes = Math.ceil(depth / 8);
  const decode = (at: number): number[] => {
    if (base === 1) return palette[pixelBytes === 1 ? buf.readUInt8(at) : buf.readUInt16LE(at)] ?? [0, 0, 0, 255];
    if (base === 3) { const g = buf.readUInt8(at); return [g, g, g, 255]; }
    return pixelOf(buf, at, depth);
  };
  const n = width * height;
  const pixels: number[][] = Array.from({ length: n });
  if (!rle) {
    for (let i = 0; i < n; i++) { pixels[i] = decode(p); p += pixelBytes; }
  } else {
    let i = 0;
    while (i < n) {
      const h = buf.readUInt8(p++);
      const count = (h & 0x7f) + 1;
      if (h & 0x80) {
        const px = decode(p); p += pixelBytes;
        for (let k = 0; k < count && i < n; k++) pixels[i++] = px;
      } else {
        for (let k = 0; k < count && i < n; k++) { pixels[i++] = decode(p); p += pixelBytes; }
      }
    }
  }
  const rgba = new Uint8Array(n * 4);
  for (let y = 0; y < height; y++) {
    const src = topLeft ? y : height - 1 - y;
    for (let x = 0; x < width; x++) rgba.set(pixels[src * width + x] as number[], (y * width + x) * 4);
  }
  return { width, height, rgba };
}

/** One pixel of `depth` bits at `at` as [r, g, b, a] (TGA stores BGR(A); 16 bit = A1R5G5B5). */
function pixelOf(buf: Buffer, at: number, depth: number): number[] {
  if (depth === 32) return [buf[at + 2] as number, buf[at + 1] as number, buf[at] as number, buf[at + 3] as number];
  if (depth === 24) return [buf[at + 2] as number, buf[at + 1] as number, buf[at] as number, 255];
  if (depth === 16 || depth === 15) {
    const v = buf.readUInt16LE(at);
    const c = (s: number): number => (((v >> s) & 31) * 255 / 31) | 0;
    return [c(10), c(5), c(0), 255]; // the attribute bit is not used as alpha by most writers
  }
  if (depth === 8) { const g = buf[at] as number; return [g, g, g, 255]; }
  throw new Error(`TGA pixel depth ${depth} not supported`);
}

/** Uncompressed 32-bit TGA, origin top-left (the map preview war3mapPreview.tga). */
function writeTga(img: Image): Buffer {
  const out = Buffer.alloc(18 + img.width * img.height * 4);
  out.writeUInt8(2, 2);
  out.writeUInt16LE(img.width, 12);
  out.writeUInt16LE(img.height, 14);
  out.writeUInt8(32, 16);
  out.writeUInt8(0x28, 17); // top-left origin, 8 alpha bits
  for (let i = 0; i < img.width * img.height; i++) {
    out[18 + i * 4] = img.rgba[i * 4 + 2] as number;
    out[18 + i * 4 + 1] = img.rgba[i * 4 + 1] as number;
    out[18 + i * 4 + 2] = img.rgba[i * 4] as number;
    out[18 + i * 4 + 3] = img.rgba[i * 4 + 3] as number;
  }
  return out;
}

export { readTga, writeTga };
