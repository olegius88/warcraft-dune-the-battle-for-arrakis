// Emperor effects -> WC3 effect models. Rules.txt names them: an object's ExplosionType (when it dies),
// a bullet's ExplosionType (where it hits), a turret's TurretMuzzleFlash (where it fires). ArtIni.txt
// [<effect>] Xaf names the XBF (Explosion/<Xaf>.xbf, bullets/), which model.ts converts like a unit:
// glow textures (! @) additive and self-lit, texture sequences (%) flipped over the animation, bones
// scaled, the one animation as Death (config/models.ts EFFECT_*). The runtime plays them with
// DestroyEffect(AddSpecialEffect(...)) (mission effects.j).

import type { Rules } from './rules.ts';
import type { ArtEntry } from './artini.ts';
import { baseName } from './artini.ts';
import { readArchive, readIndex } from './rfh.ts';
import { readXbf, readAnimations } from './xbf.ts';
import { xbfToMdx, nodePivots } from './model.ts';
import type { TextureRef } from './model.ts';
import { convertTextures, lightAlpha } from './models.ts';
import { readTga } from '../wc3/tga.ts';
import type { Image } from '../wc3/tga.ts';
import { writeBlpImage, resize, pow2Ceil } from '../wc3/blp.ts';
import type { MdxModel, Track, V3 } from '../wc3/mdx.ts';
import { writeMdx, FILTER } from '../wc3/mdx.ts';
import { gameData } from '../config/paths.ts';
import { MODEL_PATH, EFFECT_SEQUENCES, EFFECT_ADDITIVE, EFFECT_FLIPBOOK, EFFECT_FOLDERS, EFFECT_HIDDEN_NODE, EFFECT_FADE, FX_EVENT_MARK, FX_TEXTURE_EVENT, EFFECT_MAX_GEOSETS, FX_PARTICLE, FX_PARTICLE_FILTER, FX_EMIT_EVENTS, FX_ATLAS_SUFFIX, MS_PER_FRAME, MODEL_SCALE, MAX_TEXTURE_SIZE } from '../config/models.ts';

export interface EffectUse {
  /** object -> effect when it dies (ExplosionType) */
  death: Map<string, string>;
  /** object -> effect where its bullet hits (the first turret's bullet ExplosionType) */
  hit: Map<string, string>;
  /** object -> effect where it fires (the first turret's TurretMuzzleFlash) */
  muzzle: Map<string, string>;
}

export interface EffectSet {
  /** effect name (lower case) -> model path for AddSpecialEffect */
  model: Map<string, string>;
  /** model path -> how far it reaches (WC3 units): bind radius times its largest bone scale */
  radius: Map<string, number>;
  /** archive path -> MDX / BLP */
  files: Record<string, Buffer>;
  /** effects that could not be converted, with the reason */
  failed: Map<string, string>;
}

const value = (v: string | undefined): string => (v ?? '').split('//')[0]?.trim() ?? '';

/**
 * The texture each node shows over the effect, in order: the MASTER section of the XBF's FXData is a
 * list of events, each u32 type, u32 100, u32 size, then its data; type 6 sets a node's texture
 * (two zero-terminated strings: node, texture; Explosion/explosion.xbf: ?shockwave !choc0 .. !choc7,
 * ?innerfire !%boom0 .. !%boom10). The other types (3 / 4 start an emitter at a node, 7, 8, 9) are
 * skipped by their strings. No times are stored with the events, so the frames are spread evenly.
 */
function nodeTextures(fx: Buffer): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const m = fx.indexOf('MASTER');
  if (m < 0) return out;
  // an event starts where a small type is followed by 100 (FX_EVENT_MARK)
  for (let p = m + 7; p + 12 <= fx.length; p++) {
    if (fx.readUInt32LE(p) !== FX_TEXTURE_EVENT || fx.readUInt32LE(p + 4) !== FX_EVENT_MARK) continue;
    let q = p + 12;
    const zs = (): string => { const e = fx.indexOf(0, q); const s = e < 0 ? '' : fx.subarray(q, e).toString('latin1'); q = e + 1; return s; };
    const node = zs(), tex = zs();
    if (!node || !/\.tga$/i.test(tex)) continue;
    const list = out.get(node) ?? [];
    list.push(tex);
    out.set(node, list);
    p = q - 1;
  }
  // a list that comes back to its first frame (?innerfire ... !%boom10, !%boom0) ends on the frame before:
  // the bright first frame flashed again before the end (sixth audit)
  for (const list of out.values()) if (list.length > 2 && list[list.length - 1]?.toLowerCase() === list[0]?.toLowerCase()) list.pop();
  return out;
}

/** An FXData particle emitter record (config FX_PARTICLE: how it is shown). */
export interface FxEmitter {
  id: string; kind: number; count: number; life: number; delay: number;
  speed: number; spread: number; size: number; rgb: V3; vec: V3;
  frames: number; texture: string; delta: V3; grow: number;
}

/**
 * The particle emitters of an XBF's FXData and the nodes they start at. FXData: "FXDataHeader\0",
 * 0xcc padding, u32 version, u32, u8, u32 count; then count records: u32-prefixed id ("3BCA1B10#49"),
 * i32 kind, count, life (frames), delay (frames), f32 speed, spread, size, i32 r, g, b, i32 flag,
 * f32 x3 (a vector: -3 in its second for falling bits), f32 (spread again), i32 texture frames,
 * u32-prefixed texture prefix ("!cexp" with 16 frames: Textures/!cexp0 .. !cexp15), i32 alpha,
 * dr, dg, db (colour step a frame), i32 x3, f32 growth a frame. Read from the files: 100 bytes and the
 * texture name each, the frame count matching the textures in every file checked. MASTER events of
 * types FX_EMIT_EVENTS name an emitter and the node it starts at.
 */
function fxEmitters(fx: Buffer): { emitters: FxEmitter[]; attach: Array<{ id: string; node: string }> } {
  const emitters: FxEmitter[] = [];
  const attach: Array<{ id: string; node: string }> = [];
  if (fx.length < 40 || fx.subarray(0, 12).toString('latin1') !== 'FXDataHeader') return { emitters, attach };
  try {
    let o = 13;
    while (fx[o] === 0xcc) o++;
    const count = fx.readUInt32LE(o + 9);
    o += 13;
    const I = (): number => { const v = fx.readInt32LE(o); o += 4; return v; };
    const F = (): number => { const v = fx.readFloatLE(o); o += 4; return Number.isFinite(v) ? v : 0; };
    const S = (): string => { const n = fx.readUInt32LE(o); const s = fx.subarray(o + 4, o + 3 + n).toString('latin1'); o += 4 + n; return s; };
    for (let r = 0; r < count; r++) {
      const id = S();
      const kind = I(), n = I(), life = I(), delay = I();
      const speed = F(), spread = F(), size = F();
      const rgb: V3 = [I(), I(), I()];
      I();
      const vec: V3 = [F(), F(), F()];
      F();
      const frames = I();
      const texture = S();
      I();
      const delta: V3 = [I(), I(), I()];
      I(); I(); I();
      const grow = F();
      if (!/^[ -~]+$/.test(texture) || frames < 1 || frames > 64) break;
      emitters.push({ id, kind, count: n, life, delay, speed, spread, size, rgb, vec, frames, texture, delta, grow });
    }
  } catch {
    // a record of another layout ends the list (the files with another header variant)
  }
  const m = fx.indexOf('MASTER');
  if (m >= 0) {
    for (let p = m + 7; p + 12 <= fx.length; p++) {
      if (!FX_EMIT_EVENTS.includes(fx.readUInt32LE(p)) || fx.readUInt32LE(p + 4) !== FX_EVENT_MARK) continue;
      let q = p + 12;
      const zs = (): string => { const e = fx.indexOf(0, q); const s = e < 0 ? '' : fx.subarray(q, e).toString('latin1'); q = e + 1; return s; };
      const id = zs(), node = zs();
      if (emitters.some((x) => x.id === id) && node && !attach.some((a) => a.id === id && a.node === node)) attach.push({ id, node });
      p = q - 1;
    }
  }
  return { emitters, attach };
}

/** The size of the texture atlas of an emitter's frames: columns, rows. */
function atlasGrid(frames: number): [number, number] {
  const cols = Math.min(frames, FX_PARTICLE.atlasColumns);
  return [cols, Math.ceil(frames / cols)];
}

/**
 * The FXData emitters of an effect as particle emitters 2 of its model (config FX_PARTICLE): one per
 * emitter and node it starts at (at the model's origin without a MASTER event), emitting its burst
 * within the Death sequence and shown only there. Returns how far the particles reach.
 */
function addParticles(model: MdxModel, fx: ReturnType<typeof fxEmitters>, pivots: Map<string, V3>, atlasPath: (prefix: string) => string): number {
  const death = model.sequences.find((s) => s.name === EFFECT_SEQUENCES[0]?.[1]);
  if (!death || !fx.emitters.length) return 0;
  const sec = MS_PER_FRAME / 1000;
  const unit = (v: number): number => Math.max(0, Math.min(1, v / 255));
  const visibility: Track = { frames: [], values: [], interpolation: 0 };
  for (const s of [...model.sequences].sort((a, b) => a.start - b.start)) {
    visibility.frames.push(s.start, s.end);
    visibility.values.push([s === death ? 1 : 0], [s === death ? 1 : 0]);
  }
  // the emission rate track of a burst of n at time at: n / window per second over the window, else 0
  const burst = (at: number, n: number): Track => {
    const t: Track = { frames: [], values: [], interpolation: 0 };
    const on = Math.max(death.start + 1, at), off = Math.min(death.end, on + FX_PARTICLE.burstMs);
    t.frames.push(death.start, on, off); t.values.push([0], [n / (FX_PARTICLE.burstMs / 1000)], [0]);
    return t;
  };
  model.emitters = model.emitters ?? [];
  let reach = 0;
  for (const e of fx.emitters) {
    const nodes = fx.attach.filter((a) => a.id === e.id).map((a) => a.node);
    const textureId = model.textures.length;
    model.textures.push({ path: atlasPath(e.texture) });
    const [columns, rows] = atlasGrid(e.frames);
    const life = Math.max(FX_PARTICLE.minLifeFrames, e.life);
    const at = Math.min(death.end - 1, death.start + e.delay * MS_PER_FRAME);
    const c0 = e.rgb.map(unit) as V3;
    const c2 = e.rgb.map((v, i) => unit(v + (e.delta[i] as number) * life)) as V3;
    const grow = e.grow > 0 ? e.grow : 1;
    const scale = (f: number): number => Math.max(0.05, Math.min(10, grow ** f));
    const half = Math.max(1, Math.ceil(e.frames / 2));
    const speed = e.speed * MODEL_SCALE / sec;
    const width = Math.max(1, e.size * FX_PARTICLE.sizeFactor);
    for (const node of nodes.length ? nodes : ['']) {
      const pivot = pivots.get(node) ?? [0, 0, 0];
      model.emitters.push({
        name: `${e.id}@${node}`, parentId: -1, flags: FX_PARTICLE.flags, speed, variation: Math.min(1, Math.abs(e.spread)),
        latitude: e.kind === 0 ? 0 : FX_PARTICLE.latitude, gravity: -e.vec[1] * MODEL_SCALE / sec, lifeSpan: life * sec,
        // width / length: the area particles start in; their size is the segment scaling (world units)
        emissionRate: Math.max(1, e.count), width: width * FX_PARTICLE.areaShare, length: width * FX_PARTICLE.areaShare, filterMode: FX_PARTICLE_FILTER(e.texture), rows, columns, headOrTail: 0, tailLength: 0, timeMiddle: 0.5,
        colors: [c0, c0.map((v, i) => (v + (c2[i] as number)) / 2) as V3, c2], alphas: [...FX_PARTICLE.alphas], // a sprite is at most FX_PARTICLE.maxSize: DeviateHit grows x2 a frame and reached 5120 (sixth audit)
        scaling: [Math.min(FX_PARTICLE.maxSize, width), Math.min(FX_PARTICLE.maxSize, width * scale(life / 2)), Math.min(FX_PARTICLE.maxSize, width * scale(life))],
        headIntervals: [[0, half - 1, 1], [Math.min(half, e.frames - 1), e.frames - 1, 1]], tailIntervals: [[0, 0, 1], [0, 0, 1]],
        // emitted at its rate over a short window from its delay (a squirt keyed once emitted nothing
        // in 1.31.1, hits probe 2026-10-08)
        textureId, squirt: 0, priorityPlane: 0, replaceableId: 0,
        visibility, emission: burst(at, Math.max(1, e.count)),
      });
      model.pivots.push(pivot);
      reach = Math.max(reach, Math.hypot(...pivot) + speed * life * sec + width * scale(life));
    }
  }
  return reach;
}

/** A particle frame: an alpha of its own (@) is kept, none (all 255 or all 0: !05gunstr) is opaque, the
 * frame drawn additive (FX_PARTICLE_FILTER) so its black adds nothing. */
function opaqueUnlessAlpha(rgba: Uint8Array, blended: boolean): void {
  let lo = 255, hi = 0;
  for (let i = 3; i < rgba.length; i += 4) { lo = Math.min(lo, rgba[i] as number); hi = Math.max(hi, rgba[i] as number); }
  if (lo !== hi) return;
  // a blended (@) frame without an alpha (!@sm smoke): its light is its alpha, else it is an opaque
  // square (combat probe 2026-10-08); an additive one is opaque, its black adds nothing
  if (blended) lightAlpha(rgba);
  else for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
}

/** The emitters' textures: frames prefix0 .. prefixN-1 (opaque unless they have an alpha)
 * in rows of FX_PARTICLE.atlasColumns, as BLP by archive path. */
function buildAtlases(archive: string, index: string[], atlases: Map<string, number>): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  const lower = new Map(index.map((x) => [x.toLowerCase(), x]));
  const frameOf = new Map<string, [string, number]>();
  for (const [prefix, frames] of atlases) for (let k = 0; k < frames; k++) { const name = lower.get(`textures/${prefix}${k}.tga`); if (name) frameOf.set(name, [prefix, k]); }
  const images = new Map<string, Map<number, Image>>();
  for (const f of readArchive(archive, (x) => frameOf.has(x))) {
    const [prefix, k] = frameOf.get(f.name) as [string, number];
    const img = readTga(f.data);
    opaqueUnlessAlpha(img.rgba, FX_PARTICLE_FILTER(prefix) === 0);
    const m = images.get(prefix) ?? new Map<number, Image>();
    m.set(k, img);
    images.set(prefix, m);
  }
  for (const [prefix, frames] of atlases) {
    const imgs = images.get(prefix);
    const first = imgs?.get(0) ?? (imgs ? [...imgs.values()][0] : undefined);
    if (!imgs || !first) continue;
    const [cols, rows] = atlasGrid(frames);
    const w = first.width, h = first.height;
    const rgba = new Uint8Array(cols * w * rows * h * 4);
    for (const [k, img] of imgs) {
      if (img.width !== w || img.height !== h) continue;
      const cx = (k % cols) * w, cy = Math.floor(k / cols) * h;
      for (let y = 0; y < h; y++) rgba.set(img.rgba.subarray(y * w * 4, (y + 1) * w * 4), ((cy + y) * cols * w + cx) * 4);
    }
    const side = (v: number): number => Math.min(MAX_TEXTURE_SIZE, pow2Ceil(v));
    files[MODEL_PATH.texture(`${prefix}${FX_ATLAS_SUFFIX}`)] = writeBlpImage(resize({ width: cols * w, height: rows * h, rgba }, side(cols * w), side(rows * h)), { alpha: true });
  }
  return files;
}

/** Which effect every object shows (Rules.txt). */
function effectUse(rules: Rules): EffectUse {
  const raw = (name: string): Record<string, string> => Object.fromEntries(rules.sections.get(name.toLowerCase())?.entries ?? []);
  const use: EffectUse = { death: new Map(), hit: new Map(), muzzle: new Map() };
  for (const o of rules.objects.values()) {
    const death = value(o.raw.ExplosionType);
    if (death) use.death.set(o.name, death);
    const t = o.turrets.find((x) => x.bullet && x.bullet.damage > 0) ?? o.turrets[0];
    if (!t) continue;
    const muzzle = value(raw(t.name).TurretMuzzleFlash);
    if (muzzle) use.muzzle.set(o.name, muzzle);
    const hit = t.bullet ? value(raw(t.bullet.name).ExplosionType) : '';
    if (hit) use.hit.set(o.name, hit);
  }
  return use;
}

/** Convert the effects named (those ArtIni.txt gives an Xaf whose XBF is in EFFECT_FOLDERS). */
function buildEffects(names: Iterable<string>, art: Map<string, ArtEntry>, archive = gameData('3DDATA0001')): EffectSet {
  const set: EffectSet = { model: new Map(), radius: new Map(), files: {}, failed: new Map() };
  const index = readIndex(archive + '.RFH').map((e) => e.name);
  const inFolders = new Map(index.filter((n) => EFFECT_FOLDERS.some((f) => n.toLowerCase().startsWith(f))).map((n) => [baseName(n).toLowerCase(), n]));
  const textureNames = index.filter((n) => /^textures\//i.test(n)).map((n) => baseName(n));
  // the frames of a texture sequence: "!%boom0.tga" -> !%boom0 .. !%boom10 in order
  const flipbook = (raw: string): string[] | null => {
    const m = EFFECT_FLIPBOOK.exec(raw);
    if (!m) return null;
    const prefix = (m[1] as string).toLowerCase();
    const frames = textureNames.map((t) => [t, EFFECT_FLIPBOOK.exec(t)] as const)
      .filter(([, x]) => x && (x[1] as string).toLowerCase() === prefix)
      .sort((a, b) => Number((a[1] as RegExpExecArray)[2]) - Number((b[1] as RegExpExecArray)[2])).map(([t]) => t);
    return frames.length > 1 ? frames : null;
  };
  const wanted = new Map<string, string>(); // effect -> archive file
  for (const n of new Set([...names].map((x) => x.toLowerCase()))) {
    const e = art.get(n);
    if (!e?.xaf) { set.failed.set(n, 'not in ArtIni.txt'); continue; }
    const file = inFolders.get(`${e.xaf.replace(/\.(xaf|xbf)$/i, '')}.xbf`.toLowerCase());
    if (file) wanted.set(n, file);
    else set.failed.set(n, `no model file for Xaf ${e.xaf}`);
  }
  const files = new Set(wanted.values());
  const xbf = new Map<string, Buffer>();
  for (const f of readArchive(archive, (n) => files.has(n))) xbf.set(f.name, f.data);
  const textureFiles = new Set<string>();
  const atlases = new Map<string, number>(); // emitter texture prefix (lower case) -> frames
  for (const [n, file] of wanted) {
    const key = `FX_${baseName(file).replace(/\.xbf$/i, '')}`;
    try {
      const data = xbf.get(file) as Buffer;
      const ref = (tex: string): TextureRef => { textureFiles.add(tex.toLowerCase()); return { path: MODEL_PATH.texture(tex), alpha: true, teamColour: false }; };
      const scene = readXbf(data);
      const lists = nodeTextures(scene.fx);
      const { model } = xbfToMdx(key, scene, readAnimations(data), ref, {
        sequences: EFFECT_SEQUENCES, scaling: true, flipbook, hiddenNode: EFFECT_HIDDEN_NODE, fade: EFFECT_FADE, oneSided: true,
        nodeTextures: (n) => lists.get(n) ?? null,
        blend: () => FILTER.blend,
      });
      // the FXData particles: hits are made of them only, explosions add sparks and smoke
      const particles = fxEmitters(scene.fx);
      if (!model.sequences.some((s) => s.name === EFFECT_SEQUENCES[0]?.[1]) && particles.emitters.length) {
        // particles only (no node is animated): Death lasts until the last particle is gone, after Stand
        const end = Math.max(...model.sequences.map((s) => s.end));
        const frames = Math.max(...particles.emitters.map((e) => e.delay + Math.max(FX_PARTICLE.minLifeFrames, e.life)));
        model.sequences.push({ name: EFFECT_SEQUENCES[0]?.[1] as string, start: end + 2 * MS_PER_FRAME, end: end + 2 * MS_PER_FRAME + frames * MS_PER_FRAME, nonLooping: true, extent: model.extent });
        for (const g of model.geosets) g.sequenceExtents.push(g.extent);
      }
      if (!model.sequences.some((s) => s.name === EFFECT_SEQUENCES[0]?.[1])) { set.failed.set(n, `${file}: no animation`); continue; }
      if (model.geosets.length > EFFECT_MAX_GEOSETS) { set.failed.set(n, `${file}: ${model.geosets.length} geosets (vertex animation frames) stalled the game`); continue; }
      for (const e of particles.emitters) atlases.set(e.texture.toLowerCase(), e.frames);
      const reach = addParticles(model, particles, nodePivots(scene), (prefix) => MODEL_PATH.texture(`${prefix}${FX_ATLAS_SUFFIX}`));
      if (!model.geosets.length && !model.emitters?.length) { set.failed.set(n, `${file}: nothing drawn`); continue; }
      set.files[MODEL_PATH.model(key)] = writeMdx(model);
      set.model.set(n, MODEL_PATH.modelField(key));
      const grow = Math.max(1, ...model.bones.flatMap((b) => (b.scaling?.values ?? []).flat()));
      // the meshes decide how large it is shown (EFFECT_MAX_RADIUS); particles flying off (reach) do not
      void reach;
      set.radius.set(MODEL_PATH.modelField(key), model.geosets.length ? model.extent.radius * grow : 1);
    } catch (e) {
      set.failed.set(n, `${file}: ${(e as Error).message}`);
    }
  }
  Object.assign(set.files, convertTextures(archive, textureFiles, EFFECT_ADDITIVE));
  Object.assign(set.files, buildAtlases(archive, index, atlases));
  return set;
}

export { effectUse, buildEffects };
