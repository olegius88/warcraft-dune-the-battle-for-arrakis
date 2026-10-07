// Sub-house probe: a real mission map where the player is (made) allied with the Fremen: after
// EmpSubhouseLimits the Fremen camp is allowed for the player and the other sub-house buildings are not.
// Usage: node src/smoke/build-subhouse-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\SubhouseProbe.w3x -Seconds 15

import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '../emperor/build-mission.ts';
import { readMeta } from '../emperor/mapxbf.ts';
import { ensureMap } from '../emperor/preview-map.ts';
import { buildMission } from '../emperor/mission.ts';
import { str } from '../wc3/jass.ts';
import { BUILD_DIR } from '../config/paths.ts';
import { CACHE_KEY, J_CACHE_CATEGORY } from '../config/campaign.ts';

const all = loadAll();
const id = (name: string): string => `'${all.units.rawcode.get(name)}'`;
const limit = (n: string): string => `" ${n}=" + I2S(GetPlayerTechMaxAllowed(Player(0), ${id(n)}))`;
const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
const m = buildMission({
  scripts: [], meta, ...all, name: 'Sub-houses', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x',
  debugName: 'SubhouseProbe',
  extraFunctions: `function SubhouseProbeRun takes nothing returns nothing
    local string s = "before:" + ${limit('FRCamp')} + ${limit('IXResCentre')}
    set EmpInCampaign = true
    call StoreInteger(EmpCache, ${J_CACHE_CATEGORY}, ${str(CACHE_KEY.allyPrefix + 'FR')}, 1)
    // the map ran EmpSubhouseLimits at its start (no alliance then); start again from unlimited
${['FRCamp', 'IXResCentre', 'IMBarracks', 'GUPalace'].map((n) => `    call SetPlayerTechMaxAllowed(Player(0), ${id(n)}, -1)`).join('\n')}
    call EmpSubhouseLimits()
    set s = s + " | allied FR:" + ${limit('FRCamp')} + ${limit('IXResCentre')} + ${limit('IMBarracks')} + ${limit('GUPalace')}
    call StoreInteger(EmpCache, ${J_CACHE_CATEGORY}, ${str(CACHE_KEY.allyPrefix + 'FR')}, 0)
    set EmpInCampaign = false
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s)
    call PreloadGenEnd(${str('DuneSmoke\\subhouse.pld')})
endfunction`,
  extraStart: 'SubhouseProbeRun',
});
const out = path.join(BUILD_DIR, 'test', 'SubhouseProbe.w3x');
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('sub-house probe ->', out);
