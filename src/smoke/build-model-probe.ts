// Model probe map: converted Emperor models (src/emperor/models.ts) in game next to a stock
// footman, to check axes, mirroring, scale, textures and the Walk sequence.
// Usage: node src/smoke/build-model-probe.ts [objects=ATTrike,HKBuzzsaw,ATInfantry,ATBarracks] [out=build/test/ModelProbe.w3x]
//        then (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\ModelProbe.w3x -Seconds 20 -FramesPrefix build\test\modelprobe- -FrameEvery 4

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { writeObjects } from '../wc3/objects.ts';
import type { ObjectDef } from '../wc3/objects.ts';
import { renderFile } from '../wc3/template.ts';
import { loadRules } from '../emperor/rules.ts';
import { loadArtIni } from '../emperor/artini.ts';
import { buildModels } from '../emperor/models.ts';
import { BUILD_DIR, RAW_DIR, jassFile } from '../config/paths.ts';
import { UNIT_FIELD } from '../config/wc3.ts';

const names = (process.argv[2] || 'ATTrike,HKBuzzsaw,ATInfantry,ATBarracks').split(',');
const out = process.argv[3] || path.join(BUILD_DIR, 'test', 'ModelProbe.w3x');
const rules = loadRules(path.join(RAW_DIR, 'Rules.txt'));
const models = buildModels(names, loadArtIni(path.join(RAW_DIR, 'ArtIni.txt')));
// probe objects: a stock footman / farm with the converted model, ids M000..
const defs: ObjectDef[] = [];
const ids: string[] = [];
names.forEach((n, i) => {
  const field = models.model.get(n);
  if (!field) throw new Error(`${n}: ${models.failed.get(n) ?? 'no model'}`);
  const id = `M00${i}`;
  ids.push(id);
  const building = rules.objects.get(n)?.category === 'Building';
  defs.push({ base: building ? 'hhou' : 'hfoo', id, mods: [
    { field: UNIT_FIELD.model, type: 'string', value: field },
    { field: UNIT_FIELD.scale, type: 'real', value: 1 },
    { field: UNIT_FIELD.name, type: 'string', value: n },
  ] });
});
const placeLines = ids.map((id, i) => `    call CreateUnit(Player(0), '${id}', ${(i * 350 - 400).toFixed(1)}, -250.0, 0.0)`).join('\n');
const m = buildMap({
  name: 'Model Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  functions: renderFile(jassFile('smoke/model-probe'), { placeLines, walker: ids[0] }),
  init: '    call TimerStart( CreateTimer(), 1.0, false, function ModelProbeRun )',
  imports: { 'war3map.w3u': writeObjects(defs), ...models.files },
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('model probe ->', out, names.map((n) => `${n}=${models.model.get(n)}`).join(' '));
