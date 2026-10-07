// Extract the small Emperor archives (campaign, missions, rules, strings, AI, UI) from the
// user's installed game into data/emperor/raw/. Later archives override earlier ones
// (MODEL0002 patches MODEL0001), matching the game's own load order.
//
// Usage: node src/emperor/extract.js [--game G:\Games\Emperor] [--out data/emperor/raw]

import fs from 'node:fs';
import path from 'node:path';
import { extractArchive } from './rfh.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string): string => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] as string : d; };
const game = opt('--game', process.env.EMPEROR_DIR || 'G:\\Games\\Emperor');
const out = opt('--out', path.join(import.meta.dirname, '..', '..', 'data', 'emperor', 'raw'));

const ARCHIVES = ['CAMPAIGN0001', 'MISSIONS0001', 'MODEL0001', 'MODEL0002', 'STRINGS0001', 'STRINGS0002', 'AI0001', 'UI0001', 'UI0002'];

for (const a of ARCHIVES) {
  const base = path.join(game, 'DATA', a);
  if (!fs.existsSync(base + '.RFH')) { console.log('missing', a); continue; }
  const n = extractArchive(base, out);
  console.log(a.padEnd(14), n, 'files');
}
// Loose override/text folders shipped next to the archives.
for (const dir of ['strings', 'DIALOG']) {
  const src = path.join(game, 'DATA', dir);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(out, 'loose', dir), { recursive: true, filter: (p) => !/\.bag$/i.test(p) });
  console.log('copied', dir);
}
