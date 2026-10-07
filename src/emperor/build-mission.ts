// Build a single mission map. Usage:
//   node src/emperor/build-mission.js <Script.tok> "<map folder substring>" [out.w3x]
import fs from 'node:fs';
import path from 'node:path';
import { loadTokenTable } from './tok.ts';
import { loadContext } from './context.ts';
import { loadRules } from './rules.ts';
import { buildUnitData } from './units.ts';
import { readMeta } from './mapxbf.ts';
import { buildMission } from './mission.ts';
import { ensureMap } from './preview-map.ts';
import { loadSpeech } from './speech.ts';
import type { House } from './battle.ts';
import type { MissionContext } from './context.ts';
import type { Rules } from './rules.ts';
import type { UnitData } from './units.ts';
import type { TokenTable } from './tok.ts';
import type { Speech } from './speech.ts';

import { RAW_DIR, LOCAL_STRINGS_DIR, GAME_DIR, GAME_EXE, MISSIONS_OUT_DIR } from '../config/paths.ts';

/** Everything a mission build needs from the extracted game data. */
export interface EmperorData {
  ctx: MissionContext;
  rules: Rules;
  units: UnitData;
  table: TokenTable;
  speech: Speech | null;
}

function loadAll(): EmperorData {
  const ctx = loadContext(RAW_DIR, LOCAL_STRINGS_DIR);
  const rules = loadRules(path.join(RAW_DIR, 'Rules.txt'));
  const tooltipName = new Map(ctx.tooltips.map((t) => [t.key.toLowerCase(), ctx.tooltipText(ctx.tooltips.indexOf(t))]));
  const units = buildUnitData(rules, (n) => tooltipName.get(n.toLowerCase()) || n);
  const table = loadTokenTable(GAME_EXE);
  const speech = loadSpeech(GAME_DIR);
  return { ctx, rules, units, table, speech };
}

const HOUSES: House[] = ['Atreides', 'Harkonnen', 'Ordos'];
const HOUSE_BY_CODE: Partial<Record<string, House>> = { AT: 'Atreides', HK: 'Harkonnen', OR: 'Ordos' };
const asHouse = (s: string | null | undefined): House | undefined => HOUSES.find((h) => h === s);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (n: string): string | null | undefined => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const enemyHouse = flag('--enemy');
  const techLevel = Number(flag('--tech') || 3);
  const territory = args.includes('--territory');
  if (territory) args.splice(args.indexOf('--territory'), 1);
  const [script, mapNeedle, outArg] = args;
  const all = loadAll();
  const folder = ensureMap(mapNeedle)[0];
  const meta = readMeta(path.join(folder, 'test.xbf'));
  const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW_DIR, script)), phase: 1, name: script }], meta, ...all, name: path.basename(script, '.tok'),
    territoryBattle: territory, defaultEnemyHouse: asHouse(enemyHouse) || 'Harkonnen', playerHouse: HOUSE_BY_CODE[script.slice(0, 2).toUpperCase()] || 'Atreides', defaultTech: techLevel,
    debugName: path.basename(script, '.tok'), hubMap: 'Arrakis.w3x' });
  const out = outArg || path.join(MISSIONS_OUT_DIR, path.basename(script, '.tok') + '.w3x');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, m.buffer);
  fs.writeFileSync(out.replace(/\.w3x$/, '.j'), m.script);
  console.log('mission', script, 'on', path.basename(folder), '->', out, `(${m.buffer.length} bytes; stubbed API: ${m.stubbed.filter((n) => m.used.has(n)).join(', ') || 'none'})`);
}

export { loadAll };
