// Tornado probe: what can stand for a sandstorm on screen? The stock unit 'ntor' (left) and the model
// Abilities\Spells\NightElf\Cyclone\CycloneTarget.mdl as an effect (right); map revealed, one frame.
// Usage: node src/smoke/build-tornado-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\TornadoProbe.w3x -Seconds 15 -FramesPrefix build\test\shots\tornado- -FrameEvery 5

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { str } from '../wc3/jass.ts';
import { BUILD_DIR } from '../config/paths.ts';

const out = path.join(BUILD_DIR, 'test', 'TornadoProbe.w3x');
const m = buildMap({
  name: 'Tornado Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  functions: `function TornadoProbeRun takes nothing returns nothing
    local unit u = CreateUnit(Player(PLAYER_NEUTRAL_AGGRESSIVE), 'ntor', -300.0, 0.0, 0.0)
    call FogEnable(false)
    call FogMaskEnable(false)
    call AddSpecialEffect(${str('AbilitiesSpellsNightElfCycloneCycloneTarget.mdl')}, 300.0, 0.0)
    call SetCameraPositionForPlayer(Player(0), 0.0, 0.0)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("ntor exists=" + I2S(IntegerTertiaryOp(GetUnitTypeId(u) != 0, 1, 0)) + " name=" + GetUnitName(u))
    call PreloadGenEnd(${str('DuneSmoke\tornado.pld')})
    set u = null
endfunction`,
  init: '    call TimerStart(CreateTimer(), 1.0, false, function TornadoProbeRun)',
});
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('tornado probe ->', out);
