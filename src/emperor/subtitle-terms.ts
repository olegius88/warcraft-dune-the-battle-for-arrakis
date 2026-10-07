// One terminology for the Russian movie subtitles (data/emperor/subtitles/ru), which were translated
// in parts: variants of a name or term become the agreed one (config/movies.ts SUBTITLE_TERMS).
// Usage: node src/emperor/subtitle-terms.ts [--check]   (--check: list what would change, write nothing)

import fs from 'node:fs';
import path from 'node:path';
import { SUBTITLES_DIR } from '../config/paths.ts';
import { SUBTITLE_TERMS } from '../config/movies.ts';

/** Apply the agreed terms to one line of text. */
function unifyTerms(text: string): string {
  let t = text;
  for (const [from, to] of SUBTITLE_TERMS) t = t.replace(from, to);
  return t;
}

if (import.meta.main) {
  const check = process.argv.includes('--check');
  const dir = path.join(SUBTITLES_DIR, 'ru');
  let changed = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const file = path.join(dir, f);
    const before = fs.readFileSync(file, 'utf8');
    const after = before.split('\n').map((l) => l.replace(/("text":")(.*)("\}\s*)$/, (_m, a: string, t: string, b: string) => a + unifyTerms(t) + b)).join('\n');
    if (after === before) continue;
    changed++;
    const a = before.split('\n'), b = after.split('\n');
    a.forEach((l, i) => { if (l !== b[i]) console.log(`${f}: ${l.replace(/.*"text":"/, '').slice(0, 90)}\n    -> ${(b[i] as string).replace(/.*"text":"/, '').slice(0, 90)}`); });
    if (!check) fs.writeFileSync(file, after);
  }
  console.log(`${changed} files ${check ? 'would change' : 'changed'}`);
}

export { unifyTerms };
