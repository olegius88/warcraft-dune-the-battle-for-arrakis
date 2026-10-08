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

// Emperor effects play texture sequences (Textures/!%boom0..10.tga): a layer flips through textures by
// a texture id track (KMTF, integer values; mdx-m3-viewer layer.ts / animations.ts UintAnimation).
test('MDX: a layer texture id track (KMTF), read back by the independent reader', () => {
  const flip: MdxModel = { ...tiny, textures: [{ path: 'a.blp' }, { path: 'b.blp' }, { path: 'c.blp' }],
    materials: [{ layers: [{ filterMode: 3, flags: 0x11, textureId: 0, textureIds: { frames: [1100, 1200, 1300], values: [[0], [1], [2]], interpolation: 0 } }] }] };
  const buf = writeMdx(flip);
  const m = new MdlxModel();
  m.load(new Uint8Array(buf));
  const anim = m.materials[0].layers[0].animations[0];
  assert.strictEqual(anim.name, 'KMTF');
  assert.deepStrictEqual([...anim.frames], [1100, 1200, 1300]);
  assert.deepStrictEqual(anim.values.map((v: ArrayLike<number>) => Array.from(v)), [[0], [1], [2]]);
  assert.deepStrictEqual(Buffer.from(m.saveMdx()), buf, 'byte-exact round trip');
});

// Emperor's FXData particle emitters (hits, sparks, smoke) become particle emitters 2 (PRE2): a
// generic object (flags 0x1000) after the attachments, its pivot after theirs, the emitter fields and
// a visibility track (KP2V) (mdx-m3-viewer particleemitter2.ts).
test('MDX: a particle emitter 2 (PRE2), read back by the independent reader', () => {
  const emit: MdxModel = { ...tiny, attachments: [{ name: 'Origin Ref', parentId: -1, attachmentId: 0 }], pivots: [[0, 0, 0], [0, 0, 0], [1, 2, 3]],
    emitters: [{ name: 'spark', parentId: 0, speed: 200, variation: 0.3, latitude: 30, gravity: 50, lifeSpan: 0.8, emissionRate: 20, width: 10, length: 10,
      filterMode: 1, rows: 2, columns: 4, headOrTail: 0, tailLength: 0, timeMiddle: 0.5,
      colors: [[1, 0.5, 0], [1, 0.3, 0], [0.2, 0.1, 0]], alphas: [255, 200, 0], scaling: [1, 1.5, 2],
      headIntervals: [[0, 7, 1], [0, 0, 1]], tailIntervals: [[0, 0, 1], [0, 0, 1]], textureId: 0, squirt: 0, priorityPlane: 0, replaceableId: 0,
      visibility: { frames: [1100, 1300], values: [[1], [0]], interpolation: 0 } }] };
  const buf = writeMdx(emit);
  const m = new MdlxModel();
  m.load(new Uint8Array(buf));
  const e = m.particleEmitters2[0];
  assert.strictEqual(e.name, 'spark');
  assert.strictEqual(e.objectId, 2, 'after the bone and the attachment');
  assert.strictEqual(e.parentId, 0);
  assert.strictEqual(e.speed, 200);
  assert.strictEqual(e.columns, 4);
  assert.deepStrictEqual([...e.segmentAlphas], [255, 200, 0]);
  assert.strictEqual(e.animations[0].name, 'KP2V');
  assert.deepStrictEqual([...m.pivotPoints[2]], [1, 2, 3]);
  assert.deepStrictEqual(Buffer.from(m.saveMdx()), buf, 'byte-exact round trip');
});

// FXData rings (Game.exe 1.09 0x4b074e: +0x3c < 0 emits in one of three planes) are line emitters
// (flags 0x20000: directions only in the emitter's XZ plane, mdx-m3-viewer particle2.ts) turned into
// their plane by a rotation track (KGRT) of the emitter's generic object.
test('MDX: a particle emitter 2 with a rotation track and the line emitter flag', () => {
  const ring: MdxModel = { ...tiny, pivots: [[0, 0, 0], [0, 0, 0]],
    emitters: [{ name: 'ring', parentId: -1, flags: 0x8000 | 0x20000, speed: 100, variation: 0, latitude: 180, gravity: 0, lifeSpan: 1, emissionRate: 20, width: 1, length: 1,
      filterMode: 1, rows: 1, columns: 1, headOrTail: 0, tailLength: 0, timeMiddle: 0.5,
      colors: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], alphas: [255, 255, 0], scaling: [10, 10, 10],
      headIntervals: [[0, 0, 1], [0, 0, 1]], tailIntervals: [[0, 0, 1], [0, 0, 1]], textureId: 0, squirt: 0, priorityPlane: 0, replaceableId: 0,
      rotation: { frames: [0, 1000], values: [[Math.SQRT1_2, 0, 0, Math.SQRT1_2], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]], interpolation: 0 },
      visibility: { frames: [0], values: [[1]], interpolation: 0 } }] };
  const buf = writeMdx(ring);
  const m = new MdlxModel();
  m.load(new Uint8Array(buf));
  const e = m.particleEmitters2[0];
  assert.strictEqual(e.flags & 0x20000, 0x20000, 'line emitter');
  assert.deepStrictEqual(e.animations.map((a: { name: string }) => a.name), ['KGRT', 'KP2V']);
  assert.ok(Math.abs((e.animations[0].values[0] as ArrayLike<number>)[0] as number - Math.SQRT1_2) < 1e-6, 'rotation value');
  assert.deepStrictEqual(Buffer.from(m.saveMdx()), buf, 'byte-exact round trip');
});

// Glue-screen models (the campaign background, src/emperor/menu-scene.ts) need a camera and tracks
// that loop on their own (global sequences).
test('MDX: global sequences and a camera, read back by the independent reader', () => {
  const bone = { ...(tiny.bones[0] as MdxModel['bones'][number]), rotation: { frames: [0, 500], values: [[0, 0, 0, 1], [0, 0, 1, 0]], globalSequenceId: 0 } };
  const buf = writeMdx({ ...tiny, bones: [bone], globalSequences: [1000], cameras: [{ name: 'Camera01', position: [0, 0, 0], fieldOfView: 1.08, farClip: 20000, nearClip: 10, target: [-1000, 0, 0] }] });
  assert.deepStrictEqual([...readMdxChunks(buf).keys()], ['VERS', 'MODL', 'SEQS', 'GLBS', 'MTLS', 'TEXS', 'GEOS', 'GEOA', 'BONE', 'PIVT', 'CAMS']);
  const m = new MdlxModel();
  m.load(new Uint8Array(buf));
  assert.deepStrictEqual([...m.globalSequences], [1000]);
  assert.strictEqual(m.cameras.length, 1);
  assert.strictEqual(m.cameras[0].name, 'Camera01');
  assert.ok(Math.abs(m.cameras[0].fieldOfView - 1.08) < 1e-6);
  assert.deepStrictEqual([...m.cameras[0].targetPosition], [-1000, 0, 0]);
  assert.strictEqual(m.bones[0].animations.find((a: { name: string }) => a.name === 'KGRT')?.globalSequenceId, 0);
  assert.deepStrictEqual(Buffer.from(m.saveMdx()), buf, 'byte-exact round trip');
});

const archive =(await import('../src/config/paths.ts')).gameData('3DDATA0001');
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

// Colour key: Emperor's girder, pipe and scaffold textures are mostly pure magenta (AT_pipes_64: 82 %
// of the pixels), the see-through parts of a lattice. The converted models drew them opaque: magenta
// panels on the Atreides refinery and factory (contest map, 2026-10-09). The key becomes transparent
// and the layer alpha-tested.
test('XBF -> MDX: magenta colour-key texels are transparent and their layers alpha-tested', { skip: fs.existsSync(archive + '.RFH') ? false : 'Emperor not installed' }, async () => {
  const path = await import('node:path');
  const { loadArtIni } = await import('../src/emperor/artini.ts');
  const { buildModels } = await import('../src/emperor/models.ts');
  const { readBlpPaletted } = await import('../src/wc3/blp.ts');
  const { RAW_DIR } = await import('../src/config/paths.ts');
  const set = buildModels(['ATRefinery'], loadArtIni(path.join(RAW_DIR, 'ArtIni.txt')));
  const pipes = 'Emperor\\Textures\\AT_pipes_64.blp';
  const blp = readBlpPaletted(set.files[pipes] as Buffer);
  let magenta = 0, clear = 0;
  for (let i = 0; i < blp.rgba.length; i += 4) {
    if ((blp.rgba[i + 3] as number) === 0) clear++;
    else if ((blp.rgba[i] as number) > 200 && (blp.rgba[i + 2] as number) > 200 && (blp.rgba[i + 1] as number) < 60) magenta++;
  }
  assert.ok(clear > blp.rgba.length / 4 * 0.5 && magenta === 0, `clear ${clear}, magenta left ${magenta}`);
  const m = new MdlxModel();
  m.load(new Uint8Array(set.files['Emperor\\Models\\at_refinery.mdx'] as Buffer));
  const tex = m.textures.findIndex((t: { path: string }) => t.path === pipes);
  const layer = m.materials.flatMap((x: { layers: Array<{ textureId: number; filterMode: number }> }) => x.layers).find((l: { textureId: number }) => l.textureId === tex);
  assert.strictEqual(layer?.filterMode, 1, 'alpha-tested (transparent)');
});

// Texture names differ by flag characters (@nebulas_256 / %nebulas_256) that the archive path does
// not keep for units; two names on one path must be the same file (only ix-grille-128 /
// ix_grille_128 are, byte for byte). The menu scene keeps every flag in its paths.
test('texture paths: unit names on one path are the same file; menu scene paths are all distinct', { skip: fs.existsSync(archive + '.RFH') ? false : 'game data not found' }, async () => {
  const { readArchive } = await import('../src/emperor/rfh.ts');
  const { readXbf } = await import('../src/emperor/xbf.ts');
  const { MODEL_PATH, EFFECT_TEXTURE } = await import('../src/config/models.ts');
  const { MENU_MODEL } = await import('../src/config/menu.ts');
  const used = new Set<string>();
  for (const f of readArchive(archive, (n) => /^(units|buildings)\/.*_h0\.xbf$/i.test(n))) {
    try { for (const t of readXbf(f.data).textures) if (!EFFECT_TEXTURE(t)) used.add(t.toLowerCase()); } catch { /* not a model this build converts */ }
  }
  const byPath = new Map<string, string[]>();
  for (const t of used) { const p = MODEL_PATH.texture(t).toLowerCase(); byPath.set(p, [...(byPath.get(p) ?? []), t]); }
  const shared = [...byPath.values()].filter((v) => v.length > 1);
  const data = new Map<string, Buffer>();
  for (const f of readArchive(archive, (n) => shared.flat().includes(n.split('/').pop()?.toLowerCase() ?? ''))) data.set((f.name.split('/').pop() as string).toLowerCase(), f.data);
  for (const names of shared) assert.ok(names.every((n) => (data.get(n) as Buffer).equals(data.get(names[0] as string) as Buffer)), names.join(' / '));
  assert.notStrictEqual(MENU_MODEL.texture('@nebulas_256.tga'), MENU_MODEL.texture('%nebulas_256.tga'));
});

// The campaign screen background (src/emperor/menu-scene.ts): Emperor's menu scene with a camera, the
// planet turning and the stars moving on their own loops (sparse key frames of MAIN.XBF).
test('menu scene: camera, global sequences, the planet turns, no texture path shared', { skip: fs.existsSync(archive + '.RFH') ? false : 'game data not found' }, async () => {
  const { buildMenuScene } = await import('../src/emperor/menu-scene.ts');
  const { MENU_MODEL } = await import('../src/config/menu.ts');
  const files = buildMenuScene();
  const m = new MdlxModel();
  m.load(new Uint8Array(files[MENU_MODEL.model] as Buffer));
  assert.strictEqual(m.cameras.length, 1);
  assert.deepStrictEqual([...m.globalSequences], [80000, 80320, 273360]);
  const planet = m.bones.find((b: { name: string }) => b.name === '^planet');
  const rot = planet?.animations.find((a: { name: string }) => a.name === 'KGRT');
  assert.ok(rot && rot.globalSequenceId >= 0 && rot.frames.length > 2, 'the planet has a looping rotation');
  const star = m.bones.find((b: { name: string }) => b.name === '#star1');
  assert.ok(star?.animations.some((a: { name: string }) => a.name === 'KGTR'), 'the star moves');
  const paths = m.textures.map((t: { path: string }) => t.path.toLowerCase());
  for (const p of paths) assert.ok(files[Object.keys(files).find((k) => k.toLowerCase() === p) as string], `${p} is converted`);
  assert.strictEqual(new Set(Object.keys(files)).size, Object.keys(files).length);
});
