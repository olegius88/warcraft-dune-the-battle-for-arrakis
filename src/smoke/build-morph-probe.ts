// Morph probe map (src/jass/smoke/morph-probe.j): does a Chaos-based ability switch a unit to a type
// with a longer range while it stays the same unit (veterancy ExtraRange, TODO(veterancy) in
// src/jass/mission/veterancy.j)? Chaos 'Sca1', field Cha1 = new unit type (common.j:
// ABILITY_ILF_NEW_UNIT_TYPE = 'Cha1').
// Usage: node src/smoke/build-morph-probe.ts, then
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\MorphProbe.w3x -Seconds 30

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { writeObjects } from '../wc3/objects.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { UNIT_FIELD } from '../config/wc3.ts';

const out = path.join(BUILD_DIR, 'test', 'MorphProbe.w3x');
const VETERAN = 'h000';
const MORPH = 'A000';
const RANGE = 900;
// the rifleman's own range without Long Rifles is 400; the target stands 700 away
const w3u = writeObjects([{ base: 'hrif', id: VETERAN, mods: [
  { field: UNIT_FIELD.range, type: 'int', value: RANGE },
  { field: UNIT_FIELD.acquireRange, type: 'unreal', value: RANGE },
] }]);
// Sca1 needs the Chaos research (areq Roch, AbilityData of 1.31); Cha1 is the UnitID1 column, no data
// pointer (as in WarcraftLegacies' object data, mapdata/WarcraftLegacies/AbilityData/S00Y.json)
const w3a = writeObjects([{ base: 'Sca1', id: MORPH, mods: [
  { field: 'areq', type: 'string', value: '' },
  { field: 'Cha1', type: 'string', value: VETERAN, level: 1 },
] }], true);
const code = (id: string): string => `'${id}'`;
const m = buildMap({
  name: 'Morph Probe', width: 64, height: 64, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [
    { id: 0, control: 'user', race: 'human', team: 0, x: -1800, y: -1800 },
    { id: 1, control: 'computer', race: 'human', team: 1, x: 1800, y: 1800 },
  ],
  globals: '    string array udg_log\n    integer udg_n = 0\n    integer udg_i = 0\n    unit array udg_s\n    unit array udg_t\n    real array udg_x\n    real array udg_y\n    real array udg_hp\n    hashtable udg_tab = null\n    group udg_g = null\n    trigger udg_run = null',
  functions: renderFile(jassFile('smoke/morph-probe'), { report: 'DuneSmoke\\morph.pld', shooter: "'hrif'", target: "'hfoo'", half: 350, distance: 700, wait: 8, morph: code(MORPH), veteran: code(VETERAN) }),
  init: '    set udg_run = CreateTrigger()\n    call TriggerAddAction(udg_run, function MorphProbeRun)\n    call TriggerRegisterTimerEvent(udg_run, 2.0, false)',
  imports: { 'war3map.w3u': w3u, 'war3map.w3a': w3a },
});
fs.writeFileSync(out, m.buffer);
// the script next to the map, for pjass
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('morph probe ->', out);
