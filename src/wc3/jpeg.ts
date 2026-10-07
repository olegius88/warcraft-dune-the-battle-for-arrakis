// JPEG stream helpers for the JPEG content of BLP1 textures (movie frames: ffmpeg's baseline JPEGs,
// YCbCr 4:2:0, which the 1.31.1 client shows with the right colours on a UI backdrop — FMV probe
// src/smoke/build-fmv-probe.ts, 2026-10-07).

const SOI = 0xd8, EOI = 0xd9, SOS = 0xda;

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

/** Split concatenated JPEGs (ffmpeg -f image2pipe): header segments by their lengths, then the scan
 * up to EOI (in scan data 0xFF is followed only by 00 or a restart marker D0..D7). */
function splitJpegs(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let at = 0;
  while (at < buf.length) {
    let i = scanStart(buf, at);
    for (;;) {
      if (i + 1 >= buf.length) throw new Error('JPEG without EOI');
      if (buf[i] === 0xff) {
        const next = buf[i + 1] as number;
        if (next === EOI) break;
        if (next !== 0 && (next < 0xd0 || next > 0xd7)) throw new Error(`unexpected JPEG marker ${next.toString(16)} in scan`);
      }
      i++;
    }
    out.push(buf.subarray(at, i + 2));
    at = i + 2;
  }
  return out;
}

export { scanStart, splitJpegs };
