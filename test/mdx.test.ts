// MDX writer (src/wc3/mdx.ts) checked against an independent reader (mdx-m3-viewer, MIT), and the
// XBF -> MDX conversion (src/emperor/model.ts) of a shipped Emperor unit.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { writeMdx, readMdxChunks } from '../src/wc3/mdx.ts';
import type { MdxModel } from '../src/wc3/mdx.ts';
import modelModule from 'mdx-m3-viewer/dist/cjs/parsers/mdlx/model.js';
const MdlxModel = modelModule.default;

const tiny: MdxModel = {
  name: 'Tiny',
  extent: { radius: 1, min: [0, 0, 0], max: [1, 1, 1] },
  sequences: [{ name: 'Stand', start: 0, end: 1000, extent: { radius: 1, min: [0, 0, 0], max: [1, 1, 1] } }, { name: 'Death', start: 1100, end: 1500, nonLooping: true, extent: { radius: 1, min: [0, 0, 0], max: [1, 1, 1] } }],
  textures: [{ path: 'Emperor\\Textures\\x.blp' }],
  materials: [{ layers: [{ filterMode: 0, flags: 0x10, textureId: 0 }] }],
  geosets: [{
    vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 0, 1], faces: [0, 1, 2],
    bones: [0], materialId: 0, extent: { radius: 1, min: [0, 0, 0], max: [1, 1, 0] },
    sequenceExtents: [{ radius: 1, min: [0, 0, 0], max: [1, 1, 0] }, { radius: 1, min: [0, 0, 0], max: [1, 1, 0] }],
  }],
  geosetAnimations: [{ geosetId: 0, alpha: { frames: [1100, 1500], values: [[1], [0]] } }],
  bones: [{ name: 'root', parentId: -1, translation: { frames: [0, 1000], values: [[0, 0, 0], [0, 0, 5]] }, rotation: { frames: [0], values: [[0, 0, 0, 1]] } }],
  pivots: [[0, 0, 0]],
};

test('MDX: an independent reader loads our model and writes the same bytes back', () => {
  const buf = writeMdx(tiny);
  const chunks = readMdxChunks(buf);
  assert.deepStrictEqual([...chunks.keys()], ['VERS', 'MODL', 'SEQS', 'MTLS', 'TEXS', 'GEOS', 'GEOA', 'BONE', 'PIVT']);
  const m = new MdlxModel();
  m.load(new Uint8Array(buf));
  assert.strictEqual(m.version, 800);
  assert.deepStrictEqual(m.sequences.map((s: { name: string }) => s.name), ['Stand', 'Death']);
  assert.strictEqual(m.geosets[0].faces.length, 3);
  assert.strictEqual(m.textures[0].path, 'Emperor\\Textures\\x.blp');
  assert.strictEqual(m.bones[0].animations.length, 2);
  assert.deepStrictEqual(Buffer.from(m.saveMdx()), buf, 'byte-exact round trip');
});

const archive = (await import('../src/config/paths.ts')).gameData('3DDATA0001');
test('XBF -> MDX: AT_Trike_H0 converts, loads in the independent reader, has Stand/Walk/Attack/Death', { skip: fs.existsSync(archive + '.RFH') ? false : 'Emperor not installed' }, async () => {
  const { readArchive } = await import('../src/emperor/rfh.ts');
  const { readXbf, readAnimations } = await import('../src/emperor/xbf.ts');
  const { xbfToMdx } = await import('../src/emperor/model.ts');
  const f = [...readArchive(archive, (n) => /^Units\/AT_Trike_H0\.xbf$/i.test(n))][0];
  assert.ok(f);
  const { model, textures } = xbfToMdx('AT_Trike', readXbf(f.data), readAnimations(f.data), (file) => ({ path: `Emperor\\Textures\\${file}.blp`, alpha: false }));
  assert.ok(textures.includes('=At_Hk_patch_high0000_256.tga'));
  const buf = writeMdx(model);
  const m = new MdlxModel();
  m.load(new Uint8Array(buf));
  assert.deepStrictEqual(m.sequences.map((s: { name: string }) => s.name), ['Stand', 'Walk', 'Attack', 'Death']);
  assert.ok(m.geosets.length >= 5);
  // the trike is about 82 Emperor units long -> about 328 WC3 units along x (it faces +x)
  const len = model.extent.max[0] - model.extent.min[0];
  assert.ok(len > 300 && len < 360, `length ${len}`);
  // attachment points for effects (the veterancy elite effect goes on "origin")
  assert.deepStrictEqual(m.attachments.map((a: { name: string }) => a.name), ['Origin Ref', 'Chest Ref', 'Overhead Ref', 'Weapon Ref']);
  assert.strictEqual(m.pivotPoints.length, m.bones.length + m.attachments.length);
  assert.deepStrictEqual(Buffer.from(m.saveMdx()), buf);
});

// Infantry are vertex (morph) animated; the conversion drew only the bind pose (TODO(models)).
test('XBF -> MDX: infantry vertex animation becomes per-frame geosets with step alpha tracks', { skip: fs.existsSync(archive + '.RFH') ? false : 'Emperor not installed' }, async () => {
  const { readArchive } = await import('../src/emperor/rfh.ts');
  const { readXbf, readAnimations, allNodes } = await import('../src/emperor/xbf.ts');
  const { xbfToMdx } = await import('../src/emperor/model.ts');
  const f = [...readArchive(archive, (n) => /^Units\/AT_inf_H0\.xbf$/i.test(n))][0];
  assert.ok(f);
  const scene = readXbf(f.data);
  // the first stored pose is the bind pose: int16 / 2^(scale & 0xff)
  const body = [...allNodes(scene.nodes)].find((n) => n.vertexAnimation);
  const va = body?.vertexAnimation;
  assert.ok(body && va && va.scale !== null);
  const div = 2 ** (va.scale & 0xff);
  const p0 = va.frames[0]?.[0]?.position;
  assert.ok(p0);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs((p0[i] as number) / div - (body.vertices[0]?.position[i] as number)) < 0.01);
  const { model } = xbfToMdx('AT_inf', scene, readAnimations(f.data), (file) => ({ path: `Emperor\\Textures\\${file}.blp`, alpha: false }));
  const steps = model.geosetAnimations.filter((a) => a.alpha?.interpolation === 0);
  assert.ok(steps.length > 50, `${steps.length} frame geosets`);
  assert.ok(model.geosetAnimations.some((a) => a.staticAlpha === 0), 'bind-pose geoset hidden');
  // Regression: a frame geoset had alpha keys only inside its own sequence; in the others the game
  // found no key in the sequence's interval and drew it (in game 2026-10-07 all poses of the
  // infantryman at once). Guaranteed now: every frame geoset has a key at the start and end of
  // every sequence.
  for (const a of steps) {
    for (const s of model.sequences) {
      assert.ok(a.alpha?.frames.includes(s.start) && a.alpha.frames.includes(s.end), `geoset ${a.geosetId}: keys at ${s.name} ${s.start}..${s.end}`);
    }
  }
  const buf = writeMdx(model);
  const m = new MdlxModel();
  m.load(new Uint8Array(buf));
  assert.deepStrictEqual(Buffer.from(m.saveMdx()), buf);
  assert.ok(buf.length < 3_000_000, `${buf.length} bytes`);
});

// Regression: texture names in XBF carry flag characters that are part of the file name
// (Textures/=At_Hk_patch_high0000_256.tga). The converter cut them off, found no such file, and the
// models referred to BLPs that were never written: the game drew nothing (in-game probe
// 2026-10-07: only shadows). Guaranteed now: every texture a converted model refers to is converted.
test('XBF -> MDX: every texture a converted model refers to is among the converted files', { skip: fs.existsSync(archive + '.RFH') ? false : 'Emperor not installed' }, async () => {
  const path = await import('node:path');
  const { loadArtIni } = await import('../src/emperor/artini.ts');
  const { buildModels } = await import('../src/emperor/models.ts');
  const { RAW_DIR } = await import('../src/config/paths.ts');
  const set = buildModels(['ATTrike', 'ATInfantry'], loadArtIni(path.join(RAW_DIR, 'ArtIni.txt')));
  for (const [file, buf] of Object.entries(set.files)) {
    if (!file.endsWith('.mdx')) continue;
    const m = new MdlxModel();
    m.load(new Uint8Array(buf));
    for (const t of m.textures as Array<{ path: string; replaceableId: number }>) {
      if (t.replaceableId) continue;
      assert.ok(set.files[t.path], `${file} refers to ${t.path}, which was not converted`);
    }
  }
});

test('unit data: a converted model goes into the model field, at scale 1', { skip: fs.existsSync(archive + '.RFH') ? false : 'Emperor not installed' }, async () => {
  const path = await import('node:path');
  const { loadArtIni } = await import('../src/emperor/artini.ts');
  const { buildModels } = await import('../src/emperor/models.ts');
  const { loadRules } = await import('../src/emperor/rules.ts');
  const { buildUnitData } = await import('../src/emperor/units.ts');
  const { RAW_DIR } = await import('../src/config/paths.ts');
  const { UNIT_FIELD } = await import('../src/config/wc3.ts');
  const rules = loadRules(path.join(RAW_DIR, 'Rules.txt'));
  const models = buildModels(['ATTrike'], loadArtIni(path.join(RAW_DIR, 'ArtIni.txt')));
  const data = buildUnitData(rules, (n) => n, undefined, models);
  const trike = data.objects.find((o) => o.emperor?.name === 'ATTrike');
  assert.strictEqual(trike?.mods.find((m) => m.field === UNIT_FIELD.model)?.value, 'Emperor\\Models\\AT_Trike.mdl');
  assert.strictEqual(trike?.mods.find((m) => m.field === UNIT_FIELD.scale)?.value, 1);
  assert.ok(data.models['Emperor\\Models\\AT_Trike.mdx'], 'the model file comes with the unit data');
});

// House colour: Emperor recolours the saturated blue panels of its "=" textures to the side's
// colour (ArtIni.txt Recolor); converted models showed them blue for every side. Now they use the
// WC3 team colour: a team colour layer under the texture, whose blue panels are transparent.
test('XBF -> MDX: house-colour textures ("=") get a team colour layer and see-through blue panels', { skip: fs.existsSync(archive + '.RFH') ? false : 'Emperor not installed' }, async () => {
  const path = await import('node:path');
  const { loadArtIni } = await import('../src/emperor/artini.ts');
  const { buildModels } = await import('../src/emperor/models.ts');
  const { readBlpPaletted } = await import('../src/wc3/blp.ts');
  const { RAW_DIR } = await import('../src/config/paths.ts');
  const set = buildModels(['ATTrike'], loadArtIni(path.join(RAW_DIR, 'ArtIni.txt')));
  const m = new MdlxModel();
  m.load(new Uint8Array(set.files['Emperor\\Models\\AT_Trike.mdx'] as Buffer));
  const team = m.textures.findIndex((t: { replaceableId: number }) => t.replaceableId === 1);
  assert.ok(team >= 0, 'a team colour texture');
  const mat = m.materials.find((x: { layers: Array<{ textureId: number }> }) => x.layers.length === 2);
  assert.ok(mat && mat.layers[0].textureId === team, 'team colour under the texture');
  const tex = m.textures[mat.layers[1].textureId].path as string;
  const blp = readBlpPaletted(set.files[tex] as Buffer);
  let clear = 0;
  for (let i = 3; i < blp.rgba.length; i += 4) if (blp.rgba[i] === 0) clear++;
  assert.ok(clear > blp.rgba.length / 4 * 0.03, `${clear} transparent pixels`);
});
