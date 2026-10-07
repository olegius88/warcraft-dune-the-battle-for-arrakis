// Model probe map: converted Emperor models (src/emperor/models.ts) in game next to a stock
// footman, to check axes, mirroring, scale, textures and the Walk sequence.
// Usage: node src/smoke/build-model-probe.ts [objects=ATTrike,HKBuzzsaw,ATInfantry,ATBarracks] [out=build/test/ModelProbe.w3x]
//        then (idle-gated) pwsh tools/run-wc3-classic.ps1 -Map build\test\ModelProbe.w3x -Seconds 20 -FramesPrefix build\test\modelprobe- -FrameEvery 4

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { writeObjects } from '../wc3/objects.ts';
import { writeMdx } from '../wc3/mdx.ts';
import type { ObjectDef } from '../wc3/objects.ts';
import { renderFile } from '../wc3/template.ts';
import { loadRules } from '../emperor/rules.ts';
import { loadArtIni } from '../emperor/artini.ts';
import { buildModels } from '../emperor/models.ts';
import { readArchive } from '../emperor/rfh.ts';
import { readXbf, readAnimations } from '../emperor/xbf.ts';
import { xbfToMdx } from '../emperor/model.ts';
import type { TextureRef } from '../emperor/model.ts';
import type { MdxModel } from '../wc3/mdx.ts';
import { MODEL_PATH } from '../config/models.ts';
import { BUILD_DIR, RAW_DIR, jassFile, gameData } from '../config/paths.ts';
import { UNIT_FIELD } from '../config/wc3.ts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = (args[0] || 'ATTrike,HKBuzzsaw,ATInfantry,ATBarracks').split(',');
const out = args[1] || path.join(BUILD_DIR, 'test', 'ModelProbe.w3x');
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
// --paths: which model path form does the game load? A row of controls: the first object with a
// .mdx field, a one-triangle model of our writer, a stock model path (the field itself works)
const extra: Record<string, Buffer> = {};
if (process.argv.includes('--paths')) {
  const first = models.model.get(names[0] as string) as string;
  const variants: Array<[string, string]> = [
    ['P000', first.replace(/\.mdl$/i, '.mdx')],
    ['P001', 'Emperor\\Models\\Triangle.mdl'],
    ['P002', 'units\\human\\Peasant\\Peasant.mdl'],
  ];
  extra['Emperor\\Models\\Triangle.mdx'] = writeMdx({
    name: 'Triangle', extent: { radius: 150, min: [-100, -100, 0], max: [100, 100, 200] },
    sequences: [{ name: 'Stand', start: 0, end: 1000, extent: { radius: 150, min: [-100, -100, 0], max: [100, 100, 200] } }],
    textures: [{ path: 'Textures\\white.blp' }], materials: [{ layers: [{ filterMode: 0, flags: 0x10, textureId: 0 }] }],
    geosets: [{ vertices: [-100, -100, 0, 100, -100, 0, 0, 0, 200], normals: [0, -1, 0, 0, -1, 0, 0, -1, 0], uvs: [0, 1, 1, 1, 0.5, 0], faces: [0, 1, 2],
      bones: [0], materialId: 0, extent: { radius: 150, min: [-100, -100, 0], max: [100, 0, 200] }, sequenceExtents: [{ radius: 150, min: [-100, -100, 0], max: [100, 0, 200] }] }],
    geosetAnimations: [], bones: [{ name: 'root', parentId: -1 }], pivots: [[0, 0, 0]],
  });
  for (const [id, field] of variants) {
    ids.push(id);
    defs.push({ base: 'hfoo', id, mods: [{ field: UNIT_FIELD.model, type: 'string', value: field }, { field: UNIT_FIELD.name, type: 'string', value: field }] });
  }
}
// --bisect: variants of the first object's model (which part keeps it from being drawn?)
if (process.argv.includes('--bisect')) {
  const name = names[0] as string;
  const art = loadArtIni(path.join(RAW_DIR, 'ArtIni.txt')).get(name.toLowerCase());
  const file = [...readArchive(gameData('3DDATA0001'), (n) => new RegExp(`^(Units|Buildings)/${art?.xaf}_H0\\.xbf$`, 'i').test(n))][0];
  if (!file) throw new Error(`${name}: no model`);
  const tex = (t: string): TextureRef => ({ path: MODEL_PATH.texture(t), alpha: false });
  const base = (): MdxModel => xbfToMdx('Bisect', readXbf(file.data), readAnimations(file.data), tex).model;
  const white = (m: MdxModel): MdxModel => ({ ...m, textures: m.textures.map(() => ({ path: 'Textures\\white.blp' })) });
  const still = (m: MdxModel): MdxModel => ({ ...m, bones: m.bones.map((b) => ({ name: b.name, parentId: b.parentId })) });
  const variants: Array<[string, MdxModel]> = [
    ['full', base()],
    ['still', still(base())],
    ['white', white(base())],
    ['one', (() => { const m = white(still(base())); return { ...m, geosets: m.geosets.slice(0, 1), geosetAnimations: [] }; })()],
    ['onesided', { ...base(), materials: base().materials.map((mat) => ({ ...mat, layers: mat.layers.map((l) => ({ ...l, flags: 0 })) })) }],
  ];
  variants.forEach(([v, model], i) => {
    const id = `B00${i}`;
    extra[`Emperor\\Models\\Bisect_${v}.mdx`] = writeMdx(model);
    ids.push(id);
    defs.push({ base: 'hfoo', id, mods: [{ field: UNIT_FIELD.model, type: 'string', value: `Emperor\\Models\\Bisect_${v}.mdl` }, { field: UNIT_FIELD.name, type: 'string', value: v }] });
  });
}
const placeLines = ids.map((id, i) => `    call CreateUnit(Player(0), '${id}', ${((i % 4) * 350 - 400).toFixed(1)}, ${(-250 - Math.floor(i / 4) * 350).toFixed(1)}, 0.0)`).join('\n');
const m = buildMap({
  name: 'Model Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  functions: renderFile(jassFile('smoke/model-probe'), { placeLines, walker: ids[0] }),
  init: '    call TimerStart( CreateTimer(), 1.0, false, function ModelProbeRun )',
  imports: { 'war3map.w3u': writeObjects(defs), ...models.files, ...extra },
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
fs.writeFileSync(out.replace(/\.w3x$/i, '.j'), m.script);
console.log('model probe ->', out, names.map((n) => `${n}=${models.model.get(n)}`).join(' '));
