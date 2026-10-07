// Bisect helper: take a real editor-saved map, replace selected files with ours, repack.
// Usage: node src/smoke/build-hybrid.js <real.w3x | real.w3n:inner.w3x> <ours.w3x> <out.w3x> <file> [<file>...]
//   copies <file>s from ours into the real map (e.g. war3map.j).

import fs from 'node:fs';
import { MpqWriter } from '../wc3/mpq.ts';
import mpqArchiveModule from 'mdx-m3-viewer/dist/cjs/parsers/mpq/archive.js';
const MpqArchive = mpqArchiveModule.default;

const [src, ours, out, ...take] = process.argv.slice(2);
const open = (buf) => { const a = new MpqArchive(); a.load(new Uint8Array(buf), true); return a; };
let realBuf;
if (src.includes('.w3n:')) {
  const [camp, inner] = src.split('.w3n:');
  realBuf = Buffer.from(open(fs.readFileSync(camp + '.w3n')).get(inner).bytes());
} else realBuf = fs.readFileSync(src);
const real = open(realBuf);
const mine = open(fs.readFileSync(ours));
const w = new MpqWriter();
for (const n of real.getFileNames()) {
  if (n === '(listfile)' || n === '(attributes)' || take.includes(n)) continue;
  const f = real.get(n);
  let b;
  try { b = f && f.bytes(); } catch { b = null; }
  if (b) w.add(n, Buffer.from(b));
}
for (const n of take) w.add(n, Buffer.from(mine.get(n).bytes()));
fs.writeFileSync(out, w.toBuffer());
console.log('hybrid written', out, 'took', take.join(','));
