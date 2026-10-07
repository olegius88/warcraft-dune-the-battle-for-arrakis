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

import { RAW_DIR, LOCAL_STRINGS_DIR, MAPS_DIR, GAME_EXE, PJASS_OUT_DIR, PJASS_EXE, COMMON_J, BLIZZARD_J, FIRST_FAILURE_J } from '../config/paths.ts';
import { CHECK_ALL_MAP } from '../config/campaign.ts';
const table = loadTokenTable(GAME_EXE);
const ctx = loadContext(RAW_DIR, LOCAL_STRINGS_DIR);
const units = buildUnitData(loadRules(path.join(RAW_DIR, 'Rules.txt')));
const meta = readMeta(path.join(MAPS_DIR, CHECK_ALL_MAP, 'test.xbf'));
const filter = process.argv[2] || '';
const tmp = PJASS_OUT_DIR; // overwritten on every run, never deleted
fs.mkdirSync(tmp, { recursive: true });
let ok = 0;
const failures = [];
{
  for (const f of fs.readdirSync(RAW_DIR).filter((x) => /\.tok$/i.test(x) && x !== 'header.tok' && x.includes(filter))) {
    const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW_DIR, f)), phase: 1, name: f }], meta, table, ctx, units, name: f, playerHouse: 'Atreides', territoryBattle: true, hubMap: 'Arrakis.w3x' });
    const jf = path.join(tmp, 'war3map.j');
    fs.writeFileSync(jf, m.script);
    try {
      execFileSync(PJASS_EXE, [COMMON_J, BLIZZARD_J, jf], { stdio: 'pipe' });
      ok++;
    } catch (e) {
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      const out = String(err.stdout || '') + String(err.stderr || '');
      failures.push({ f, out: out.split('\n').filter((l) => /war3map\.j/.test(l)).slice(0, 5).join('\n') });
      if (failures.length === 1) fs.copyFileSync(jf, FIRST_FAILURE_J);
    }
  }
}
console.log(`pjass ok ${ok}, failed ${failures.length}`);
for (const x of failures.slice(0, 8)) console.log('---', x.f, '\n' + x.out);
