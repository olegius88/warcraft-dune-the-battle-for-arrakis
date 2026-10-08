// Art probe: which stock abilities give a model path through GetAbilityEffectById (the runtime takes
// effect models from stock abilities so the paths exist). Prints the non-empty ones.
// Usage: node src/smoke/build-art-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\ArtProbe.w3x -Seconds 12

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { str } from '../wc3/jass.ts';
import { BUILD_DIR } from '../config/paths.ts';

const ids = ['Acyc', 'ACcy', 'Aapl', 'Aap1', 'Aap2', 'Aap3', 'Aap4', 'ANto', 'Atdg', 'Atsp', 'Aclf', 'ACcl', 'AEtq', 'Adis', 'Apts', 'ANsi', 'ANdh', 'Advc'];
const types = ['EFFECT_TYPE_EFFECT', 'EFFECT_TYPE_TARGET', 'EFFECT_TYPE_CASTER', 'EFFECT_TYPE_SPECIAL'];
const lines = ids.flatMap((a) => types.map((t) => `    set s = GetAbilityEffectById('${a}', ${t}, 0)\n    if s != "" then\n        call Preload(${str(`${a} ${t} `)} + s)\n    endif`));
const out = path.join(BUILD_DIR, 'test', 'ArtProbe.w3x');
const m = buildMap({
  name: 'Art Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  functions: `function ArtProbeRun takes nothing returns nothing\n    local string s\n    call PreloadGenClear()\n    call PreloadGenStart()\n${lines.join('\n')}\n    call PreloadGenEnd(${str('DuneSmokeart.pld')})\nendfunction`,
  init: '    call TimerStart(CreateTimer(), 1.0, false, function ArtProbeRun)',
});
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('art probe ->', out);
