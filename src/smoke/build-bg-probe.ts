// Probe for the ChangeLevel/campaign crash: target maps that differ only in the w3i
// "campaign background" index. Each writes CustomMapData\DuneSmoke\target<bg>.pld when it runs.
// Usage: node src/smoke/build-bg-probe.js <bg> [<bg>...]   (writes Documents\...\Maps\DuneSmoke\TargetBG<bg>.w3x)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { jassFile } from '../config/paths.ts';

const outDir = path.join(os.homedir(), 'Documents', 'Warcraft III', 'Maps', 'DuneSmoke');
fs.mkdirSync(outDir, { recursive: true });
for (const arg of process.argv.slice(2)) {
  const bg = Number(arg);
  const m = buildMap({
    name: `Target BG${bg}`, width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
    campaignBackground: bg,
    players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
    functions: renderFile(jassFile('smoke/bg-probe'), { text: `target loaded bg${bg}`, file: `DuneSmoke\\target${bg}.pld` }),
    init: '    call TimerStart( CreateTimer(), 1.0, false, function W )',
  });
  const file = path.join(outDir, `TargetBG${bg}.w3x`);
  fs.writeFileSync(file, m.buffer);
  if (!m.script.includes('"DuneSmoke\\\\target')) throw new Error('bad escaping in probe script');
  console.log('written', file);
}
