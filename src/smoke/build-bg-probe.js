'use strict';
// Probe for the ChangeLevel/campaign crash: target maps that differ only in the w3i
// "campaign background" index. Each writes CustomMapData\DuneSmoke\target<bg>.pld when it runs.
// Usage: node src/smoke/build-bg-probe.js <bg> [<bg>...]   (writes Documents\...\Maps\DuneSmoke\TargetBG<bg>.w3x)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildMap } = require('../wc3/map');
const { str } = require('../wc3/jass');

const outDir = path.join(os.homedir(), 'Documents', 'Warcraft III', 'Maps', 'DuneSmoke');
fs.mkdirSync(outDir, { recursive: true });
for (const arg of process.argv.slice(2)) {
  const bg = Number(arg);
  const m = buildMap({
    name: `Target BG${bg}`, width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
    campaignBackground: bg,
    players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
    functions: `function W takes nothing returns nothing
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload( ${str(`target loaded bg${bg}`)} )
    call PreloadGenEnd( ${str(`DuneSmoke\\target${bg}.pld`)} )
endfunction`,
    init: '    call TimerStart( CreateTimer(), 1.0, false, function W )',
  });
  const file = path.join(outDir, `TargetBG${bg}.w3x`);
  fs.writeFileSync(file, m.buffer);
  if (!m.script.includes('"DuneSmoke\\\\target')) throw new Error('bad escaping in probe script');
  console.log('written', file);
}
