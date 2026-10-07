// Build a single mission map. Usage:
//   node src/emperor/build-mission.js <Script.tok> "<map folder substring>" [out.w3x]
import fs from 'node:fs';
import path from 'node:path';
import { loadTokenTable } from './tok.ts';
import { loadContext } from './context.ts';
import { loadRules } from './rules.ts';
import { loadArtIni } from './artini.ts';
import { buildIcons } from './icons.ts';
import { buildUnitData } from './units.ts';
import { readMeta } from './mapxbf.ts';
import { buildMission } from './mission.ts';
import { ensureMap } from './preview-map.ts';
import { loadSpeech } from './speech.ts';
import type { House } from '../config/houses.ts';
import { HOUSE_BY_CODE, isHouse, isHouseCode } from '../config/houses.ts';
import { DEFAULT_TECH, DEFAULT_ENEMY, DEBUG_HUB_MAP } from '../config/campaign.ts';
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
  const artIni = path.join(RAW_DIR, 'ArtIni.txt');
  const icons = fs.existsSync(artIni) ? buildIcons(rules.objects.keys(), loadArtIni(artIni)) : undefined;
  const units = buildUnitData(rules, (n) => tooltipName.get(n.toLowerCase()) || n, icons);
  const table = loadTokenTable(GAME_EXE);
  const speech = loadSpeech(GAME_DIR);
  return { ctx, rules, units, table, speech };
}

const asHouse = (s: string | null | undefined): House | undefined => (isHouse(s) ? s : undefined);

/** House of a script by its name prefix (ATStart -> Atreides); Atreides when there is none. */
const playerHouseOf = (script: string): House => { const c = script.slice(0, 2).toUpperCase(); return isHouseCode(c) ? HOUSE_BY_CODE[c] : 'Atreides'; };

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (n: string): string | null | undefined => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const enemyHouse = flag('--enemy');
  const techLevel = Number(flag('--tech') || DEFAULT_TECH);
  const territory = args.includes('--territory');
  if (territory) args.splice(args.indexOf('--territory'), 1);
  const [script, mapNeedle, outArg] = args;
  const all = loadAll();
  const folder = ensureMap(mapNeedle)[0];
  const meta = readMeta(path.join(folder, 'test.xbf'));
  const m = buildMission({ scripts: [{ tok: fs.readFileSync(path.join(RAW_DIR, script)), phase: 1, name: script }], meta, ...all, name: path.basename(script, '.tok'),
    territoryBattle: territory, defaultEnemyHouse: asHouse(enemyHouse) || HOUSE_BY_CODE[DEFAULT_ENEMY.AT], playerHouse: playerHouseOf(script), defaultTech: techLevel,
    debugName: path.basename(script, '.tok'), hubMap: DEBUG_HUB_MAP });
  const out = outArg || path.join(MISSIONS_OUT_DIR, path.basename(script, '.tok') + '.w3x');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, m.buffer);
  fs.writeFileSync(out.replace(/\.w3x$/, '.j'), m.script);
  console.log('mission', script, 'on', path.basename(folder), '->', out, `(${m.buffer.length} bytes; stubbed API: ${m.stubbed.filter((n) => m.used.has(n)).join(', ') || 'none'})`);
}

export { loadAll };
