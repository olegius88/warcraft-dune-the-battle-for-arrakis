// Build the JASS of every mission (against one map's points) and syntax-check it with pjass.
// Usage: node src/emperor/check-all.js [filter]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadTokenTable } from './tok.ts';
import { loadContext } from './context.ts';
import { loadRules } from './rules.ts';
import { buildUnitData } from './units.ts';
import { readMeta } from './mapxbf.ts';
import { buildMission } from './mission.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const RAW = path.join(ROOT, 'data', 'emperor', 'raw');
const table = loadTokenTable(path.join(process.env.EMPEROR_DIR || 'G:\\Games\\Emperor', 'Game.exe'));
const ctx = loadContext(RAW, path.join(RAW, 'loose', 'strings'));
const units = buildUnitData(loadRules(path.join(RAW, 'Rules.txt')));
const meta = readMeta(path.join(ROOT, 'data', 'emperor', 'maps', '#U1 AT Start S LOD2', 'test.xbf'));
const filter = process.argv[2] || '';
const tmp = path.join(ROOT, 'build', 'pjass'); // overwritten on every run, never deleted
fs.mkdirSync(tmp, { recursive: true });
let ok = 0;
const failures = [];
{
  for (const f of fs.readdirSync(RAW).filter((x) => /\.tok$/i.test(x) && x !== 'header.tok' && x.includes(filter))) {
    const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW, f)), phase: 1, name: f }], meta, table, ctx, units, name: f, playerHouse: 'Atreides', territoryBattle: true, hubMap: 'Arrakis.w3x' });
    const jf = path.join(tmp, 'war3map.j');
    fs.writeFileSync(jf, m.script);
    try {
      execFileSync(path.join(ROOT, 'tools', 'bin', 'pjass.exe'), [path.join(ROOT, 'data', 'wc3', 'common.j'), path.join(ROOT, 'data', 'wc3', 'blizzard.j'), jf], { stdio: 'pipe' });
      ok++;
    } catch (e) {
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      const out = String(err.stdout || '') + String(err.stderr || '');
      failures.push({ f, out: out.split('\n').filter((l) => /war3map\.j/.test(l)).slice(0, 5).join('\n') });
      if (failures.length === 1) fs.copyFileSync(jf, path.join(ROOT, 'build', 'first-failure.j'));
    }
  }
}
console.log(`pjass ok ${ok}, failed ${failures.length}`);
for (const x of failures.slice(0, 8)) console.log('---', x.f, '\n' + x.out);
