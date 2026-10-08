// Territory probe: a plain mission (no scripts) on one territory's map, to tell a map that does not
// load (terrain / pathing data) from a script or object data problem.
// Usage: node src/smoke/build-territory-probe.ts 7, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\Territory7.w3x -Seconds 30

import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '../emperor/build-mission.ts';
import { readMeta } from '../emperor/mapxbf.ts';
import { ensureMap } from '../emperor/preview-map.ts';
import { buildMission } from '../emperor/mission.ts';
import { BUILD_DIR, RAW_DIR } from '../config/paths.ts';
import { territoryMapPrefix } from '../config/story.ts';

// node src/smoke/build-territory-probe.ts <territory> [script ...]: the scripts (phase 1, 2, ...) too
// flags as build-campaign.ts sets them: --briefing (of the first script), --no-icons, --autowin
const n = Number(process.argv[2] ?? 7);
const args = process.argv.slice(3);
const names = args.filter((a) => !a.startsWith('--'));
const flag = (f: string): boolean => args.includes(f);
const all = loadAll();
const meta = readMeta(path.join(ensureMap(territoryMapPrefix(n))[0] as string, 'test.xbf'));
const scripts = names.map((s, i) => ({ tok: fs.readFileSync(path.join(RAW_DIR, `${s}.tok`)), phase: i + 1, name: s }));
const m = buildMission({
  scripts, meta, ...all, name: `Territory ${n}`, playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x', debugName: `Territory${n}`,
  ...(flag('--briefing') && names[0] ? { briefing: all.ctx.textByKey(names[0]) ?? '' } : {}),
  ...(flag('--no-icons') ? { iconsInMap: false } : {}), ...(flag('--autowin') ? { autoWinSeconds: 15 } : {}),
});
const out = path.join(BUILD_DIR, 'test', `Territory${n}${args.map((s) => `-${s.replace(/^--/, '')}`).join('')}.w3x`);
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('territory probe ->', out);
