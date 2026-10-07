// Level-change probe: a loader map (run via -loadfile) that wins after 3 s and ChangeLevels into
// <target> (a path relative to Documents\Warcraft III, e.g. Maps\DuneSmoke\X.w3x). Used to bisect
// why our maps crash when loaded through ChangeLevel / a campaign while -loadfile works.
// Usage: node src/smoke/build-hop.js "Maps\\DuneSmoke\\Target.w3x" [out=build/test/Hop.w3x]

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { str } from '../wc3/jass.ts';

const target = process.argv[2];
const out = process.argv[3] || path.join(import.meta.dirname, '..', '..', 'build', 'test', 'Hop.w3x');
const mode = process.argv[4] || 'victory'; // 'victory' = SetNextLevelBJ+CustomVictoryBJ, 'direct' = ChangeLevel only
if (!target) throw new Error('target map path required');

const hopBody = mode === 'direct'
  ? `    call ChangeLevel( ${str(target)}, false )`
  : `    call SetNextLevelBJ( ${str(target)} )\n    call CustomVictoryBJ( Player(0), false, false )`;
const m = buildMap({
  name: 'Hop', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  functions: `function Hop takes nothing returns nothing
${hopBody}
endfunction`,
  init: '    call TimerStart( CreateTimer(), 3.0, false, function Hop )',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log('hop ->', target, out);
