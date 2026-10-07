// Command card probe: a real mission map (icons and models imported) that selects, every 5 s, a
// starport, a factory and the two builders of the player's house, for screenshots of their buttons.
// Usage: node src/smoke/build-card-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\CardProbe.w3x -Seconds 32 -FramesPrefix build\test\shots\card- -FrameEvery 5

import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '../emperor/build-mission.ts';
import { readMeta } from '../emperor/mapxbf.ts';
import { ensureMap } from '../emperor/preview-map.ts';
import { buildMission } from '../emperor/mission.ts';
import { BUILD_DIR } from '../config/paths.ts';

const all = loadAll();
const id = (name: string): string => `'${all.units.rawcode.get(name)}'`;
const show = [id('ATStarport'), id('ATFactory'), `'${all.units.ids.builders.AT}'`, `'${all.units.ids.defenceBuilders.AT}'`];
const body = show.map((t) => `    set u = CreateUnit(Player(0), ${t}, x, y, 270.0)
    call SetCameraPositionForPlayer(Player(0), x, y)
    call SelectUnitForPlayerSingle(u, Player(0))
    call TriggerSleepAction(5.0)
    call RemoveUnit(u)`).join('\n');
const meta = readMeta(path.join(ensureMap('#T9 ')[0] as string, 'test.xbf'));
const m = buildMission({
  scripts: [], meta, ...all, name: 'Command cards', playerHouse: 'Atreides', kind: 'attack', territoryBattle: true, hubMap: 'AT_Hub.w3x',
  debugName: 'CardProbe',
  extraFunctions: `function CardProbeRun takes nothing returns nothing
    local unit u
    local real x = EmpMapMinX + 2500.0
    local real y = EmpMapMinY + 2500.0
    call SetPlayerTechMaxAllowed(Player(0), ${id('ATStarport')}, -1)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 50000)
    call TriggerSleepAction(4.0)
${body}
endfunction`,
  extraStart: 'CardProbeRun',
});
const out = path.join(BUILD_DIR, 'test', 'CardProbe.w3x');
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('command card probe ->', out);
