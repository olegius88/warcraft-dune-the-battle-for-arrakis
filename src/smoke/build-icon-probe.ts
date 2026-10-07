// Icon probe map: checks in game that a converted Emperor icon shows up through the object data
// icon field (uico) and that the grey one is found at the DISBTN path. The hero bar is used because
// it sits in the top-left corner that window captures always contain: a stock hero gets the icon of
// `name`, is shown, then killed (a dead hero's bar icon is the disabled one).
// Usage: node src/smoke/build-icon-probe.ts [name=ATTrike] [out=build/test/IconProbe.w3x], then
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\IconProbe.w3x -Seconds 22 -FramesPrefix build\test\iconprobe- -FrameEvery 4

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { writeObjects } from '../wc3/objects.ts';
import { renderFile } from '../wc3/template.ts';
import { loadAll } from '../emperor/build-mission.ts';
import { BUILD_DIR, jassFile } from '../config/paths.ts';
import { UNIT_FIELD } from '../config/wc3.ts';

const name = process.argv[2] || 'ATTrike';
const out = process.argv[3] || path.join(BUILD_DIR, 'test', 'IconProbe.w3x');
const PROBE_HERO = { base: 'Hpal', id: 'H0EP' } as const; // stock paladin
const KILL_AFTER = 10;
const all = loadAll();
const icon = all.units.objects.find((o) => o.emperor?.name === name)?.mods.find((m) => m.field === UNIT_FIELD.icon)?.value;
if (typeof icon !== 'string') throw new Error(`${name} has no icon`);
const w3u = writeObjects([{ base: PROBE_HERO.base, id: PROBE_HERO.id, mods: [{ field: UNIT_FIELD.icon, type: 'string', value: icon }] }]);
const m = buildMap({
  name: 'Icon Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '    unit udg_probeHero = null',
  functions: renderFile(jassFile('smoke/icon-probe'), { hero: PROBE_HERO.id, killAfter: `${KILL_AFTER}.0` }),
  init: '    call TimerStart( CreateTimer(), 1.0, false, function IconProbeRun )',
  imports: { 'war3map.w3u': w3u, ...all.units.icons },
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log('icon probe ->', out, icon);
