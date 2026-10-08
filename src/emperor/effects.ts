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
import { MODEL_PATH, EFFECT_SEQUENCES, EFFECT_ADDITIVE, EFFECT_FLIPBOOK, EFFECT_FOLDERS, EFFECT_HIDDEN_NODE, EFFECT_SHOWN, FX_EVENT, FX_EVENT_FIELDS, FX_MASTER_TRACK, EFFECT_MAX_GEOSETS, FX_PARTICLE, FX_PARTICLE_FILTER, FX_ATLAS_SUFFIX, MS_PER_FRAME, MODEL_SCALE, MAX_TEXTURE_SIZE } from '../config/models.ts';

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

/** An event of an FXData track: its frame, type and the strings its flags carry (FX_EVENT_FIELDS). */
export interface FxEvent { frame: number; type: number; id: string; node: string; name: string; pair?: [number, number] }

/**
 * A track of an XBF's FXData (default FX_MASTER_TRACK) as Game.exe 1.09 reads it (0x46edf0): u32
 * frames N, u32 name length L, u32 events of each of the N frames, the name (L bytes with its zero),
 * then the events frame by frame; Game.exe runs a frame's events on that frame (0x46efe0). An event
 * (0x46e360): u32 type, u32 (100 in every file), u32 flags, then the data its flags name
 * (FX_EVENT_FIELDS). The track is found by its name, its header just before the counts. Null: none.
 */
function fxTrack(fx: Buffer, track = FX_MASTER_TRACK): { frames: number; events: FxEvent[] } | null {
  for (let at = fx.indexOf(track); at >= 0; at = fx.indexOf(track, at + 1)) {
    for (let n = 1; at - 8 - 4 * n >= 0; n++) {
      if (fx.readUInt32LE(at - 8 - 4 * n) !== n || fx.readUInt32LE(at - 4 - 4 * n) !== track.length + 1) continue;
      const events: FxEvent[] = [];
      let p = at + track.length + 1;
      try {
        for (let frame = 0; frame < n; frame++) {
          const count = fx.readUInt32LE(at - 4 * n + 4 * frame);
          for (let k = 0; k < count; k++) {
            const type = fx.readUInt32LE(p), flags = fx.readUInt32LE(p + 8);
            p += 12;
            const e: FxEvent = { frame, type, id: '', node: '', name: '' };
            for (const [flag, kind, bytes] of FX_EVENT_FIELDS) {
              if (!(flags & flag)) continue;
              if (kind === 'skip') { p += bytes; continue; }
              if (kind === 'pair') { e.pair = [fx.readFloatLE(p), fx.readFloatLE(p + 4)]; p += bytes; continue; }
              const end = fx.indexOf(0, p);
              if (end < 0) throw new Error('unterminated string');
              e[kind] = fx.subarray(p, end).toString('latin1');
              p = end + 1;
            }
            events.push(e);
          }
        }
      } catch {
        continue;
      }
      return { frames: n, events };
    }
  }
  return null;
}

/** What the MASTER track does to a node besides its textures: hidden / shown from a frame on, and its
 * texture scrolled by (du, dv) a tick from a frame to another (to the track's end without a stop). */
export interface NodeEvents {
  visible: Array<{ frame: number; on: boolean }>;
  scroll: Array<{ from: number; to: number; du: number; dv: number }>;
}

/** The node events of an XBF's FXData (FX_EVENT hide / show / scroll / scrollStop), by node. */
function nodeEvents(fx: Buffer): Map<string, NodeEvents> {
  const out = new Map<string, NodeEvents>();
  const track = fxTrack(fx);
  const of = (node: string): NodeEvents => { let n = out.get(node); if (!n) { n = { visible: [], scroll: [] }; out.set(node, n); } return n; };
  for (const e of track?.events ?? []) {
    if (!e.node) continue;
    if (e.type === FX_EVENT.hide || e.type === FX_EVENT.show) of(e.node).visible.push({ frame: e.frame, on: e.type === FX_EVENT.show });
    if (e.type === FX_EVENT.scroll && e.pair) {
      const stop = track?.events.find((s) => s.type === FX_EVENT.scrollStop && s.node === e.node && s.frame > e.frame);
      of(e.node).scroll.push({ from: e.frame, to: stop ? stop.frame : (track?.frames ?? e.frame), du: e.pair[0], dv: e.pair[1] });
    }
  }
  return out;
}

/**
 * The textures each node shows and from which frame of the effect (FX_EVENT.texture events of the
 * MASTER track; Explosion/explosion.xbf: ?innerfire !%boom0 at 0, !%boom1 at 6 .. !%boom10 at 15).
 */
function nodeTextures(fx: Buffer): Map<string, Array<{ texture: string; frame: number }>> {
  const out = new Map<string, Array<{ texture: string; frame: number }>>();
  for (const e of fxTrack(fx)?.events ?? []) {
    if (e.type !== FX_EVENT.texture || !e.node || !/\.tga$/i.test(e.name)) continue;
    const list = out.get(e.node) ?? [];
    list.push({ texture: e.name, frame: e.frame });
    out.set(e.node, list);
  }
  // a list that comes back to its first frame (?innerfire ... !%boom10, !%boom0 at 16) ends on the
  // frame before: the bright first frame flashed again before the end (sixth audit)
  for (const list of out.values()) if (list.length > 2 && list[list.length - 1]?.texture.toLowerCase() === list[0]?.texture.toLowerCase()) list.pop();
  return out;
}

/** An FXData particle emitter record (config FX_PARTICLE: how it is shown). */
export interface FxEmitter {
  id: string; kind: number; count: number; life: number; lifeRandom: number;
  speed: number; spread: number; size: number; rgb: V3; vec: V3;
  frames: number; texture: string; delta: V3; grow: number;
}

/** Where and when an emitter emits: its node, from its start event's frame to its stop event's. */
export interface FxWindow { id: string; node: string; start: number; stop: number }

/**
 * The particle emitters of an XBF's FXData and when they emit. FXData: "FXDataHeader\0", 0xcc padding,
 * u32 version, u32, u8, u32 count; then count records as Game.exe 1.09 reads one (0x4b1330):
 * u32-prefixed id ("3BCA1B10#49"), i32 kind (+0x00), count (+0x04, made a tick), life (+0x08, ticks),
 * lifeRandom (+0x0c, rand % (it + 1) more, 0x4b03ba), f32 speed (+0x10), spread (+0x14), size (+0x18),
 * i32 r, g, b (+0x1c..+0x24), i32 (+0x34), f32 x3 (+0x38..+0x40; +0x3c picks the direction, 0x4b04e1),
 * f32 (+0x14 again: this value is kept), i32 texture frames, u32-prefixed texture prefix ("!cexp":
 * Textures/!cexp0 .. !cexp15), and from FXData version 4: i32 alpha (+0x28), dr, dg, db (+0x54..+0x5c),
 * i32 +0x60, +0x50, +0x68, f32 +0x64 (growth). An emitter emits from its MASTER start event to its stop
 * event (FX_EVENT), or to the end of the track without one; one never started emits nothing.
 */
function fxEmitters(fx: Buffer): { emitters: FxEmitter[]; windows: FxWindow[] } {
  const emitters: FxEmitter[] = [];
  const windows: FxWindow[] = [];
  if (fx.length < 40 || fx.subarray(0, 12).toString('latin1') !== 'FXDataHeader') return { emitters, windows };
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
      const kind = I(), n = I(), life = I(), lifeRandom = I();
      const speed = F();
      F(); // +0x14, read again below (Game.exe keeps the second)
      const size = F();
      const rgb: V3 = [I(), I(), I()];
      I();
      const vec: V3 = [F(), F(), F()];
      const spread = F();
      const frames = I();
      const texture = S();
      I();
      const delta: V3 = [I(), I(), I()];
      I(); I(); I();
      const grow = F();
      if (!/^[ -~]+$/.test(texture) || frames < 1 || frames > 64) break;
      emitters.push({ id, kind, count: n, life, lifeRandom: Math.max(0, lifeRandom), speed, spread, size, rgb, vec, frames, texture, delta, grow });
    }
  } catch {
    // a record of another layout ends the list (the files with another header variant)
  }
  const track = fxTrack(fx);
  for (const e of track?.events ?? []) {
    if (e.type !== FX_EVENT.emitStart || !e.node || !emitters.some((x) => x.id === e.id)) continue;
    const stop = track?.events.find((s) => s.type === FX_EVENT.emitStop && s.id === e.id && s.node === e.node && s.frame >= e.frame);
    windows.push({ id: e.id, node: e.node, start: e.frame, stop: stop ? stop.frame : (track?.frames ?? e.frame) });
  }
  return { emitters, windows };
}

/** The size of the texture atlas of an emitter's frames: columns, rows. */
function atlasGrid(frames: number): [number, number] {
  const cols = Math.min(frames, FX_PARTICLE.atlasColumns);
  return [cols, Math.ceil(frames / cols)];
}

/**
 * The FXData emitters of an effect as particle emitters 2 of its model (config FX_PARTICLE): one per
 * emitter and MASTER start event, at that node, emitting `count` a tick (MS_PER_FRAME) from its start
 * frame to its stop frame within the Death sequence and shown only there. Returns how far the
 * particles reach.
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
  // the emission rate track: n a tick (n / sec a second) from frame `from` to frame `to`, else 0
  const window = (from: number, to: number, n: number): Track => {
    const t: Track = { frames: [], values: [], interpolation: 0 };
    const on = Math.min(death.end - 1, death.start + from * MS_PER_FRAME);
    const off = Math.min(death.end, Math.max(on + MS_PER_FRAME, death.start + to * MS_PER_FRAME));
    if (on > death.start) { t.frames.push(death.start); t.values.push([0]); }
    t.frames.push(on, off); t.values.push([n / sec], [0]);
    return t;
  };
  model.emitters = model.emitters ?? [];
  let reach = 0;
  for (const e of fx.emitters) {
    const windows = fx.windows.filter((w) => w.id === e.id);
    if (!windows.length) continue;
    const textureId = model.textures.length;
    model.textures.push({ path: atlasPath(e.texture) });
    const [columns, rows] = atlasGrid(e.frames);
    const life = Math.max(FX_PARTICLE.minLifeFrames, e.life + e.lifeRandom / 2);
    const c0 = e.rgb.map(unit) as V3;
    const c2 = e.rgb.map((v, i) => unit(v + (e.delta[i] as number) * life)) as V3;
    const grow = e.grow > 0 ? e.grow : 1;
    const scale = (f: number): number => Math.max(0.05, Math.min(10, grow ** f));
    const half = Math.max(1, Math.ceil(e.frames / 2));
    const speed = e.speed * MODEL_SCALE / sec;
    const width = Math.max(1, e.size * FX_PARTICLE.sizeFactor);
    for (const w of windows) {
      const pivot = pivots.get(w.node) ?? [0, 0, 0];
      model.emitters.push({
        name: `${e.id}@${w.node}@${w.start}`, parentId: -1, flags: FX_PARTICLE.flags, speed, variation: Math.min(1, Math.abs(e.spread)),
        latitude: e.kind === 0 ? 0 : FX_PARTICLE.latitude, gravity: -e.vec[1] * MODEL_SCALE / sec, lifeSpan: life * sec,
        // width / length: the area particles start in; their size is the segment scaling (world units)
        emissionRate: Math.max(1, e.count), width: width * FX_PARTICLE.areaShare, length: width * FX_PARTICLE.areaShare, filterMode: FX_PARTICLE_FILTER(e.texture), rows, columns, headOrTail: 0, tailLength: 0, timeMiddle: 0.5,
        colors: [c0, c0.map((v, i) => (v + (c2[i] as number)) / 2) as V3, c2], alphas: [...FX_PARTICLE.alphas], // a sprite is at most FX_PARTICLE.maxSize: DeviateHit grows x2 a frame and reached 5120 (sixth audit)
        scaling: [Math.min(FX_PARTICLE.maxSize, width), Math.min(FX_PARTICLE.maxSize, width * scale(life / 2)), Math.min(FX_PARTICLE.maxSize, width * scale(life))],
        headIntervals: [[0, half - 1, 1], [Math.min(half, e.frames - 1), e.frames - 1, 1]], tailIntervals: [[0, 0, 1], [0, 0, 1]],
        // emitted at its rate over its window (a squirt keyed once emitted nothing in 1.31.1, hits
        // probe 2026-10-08)
        textureId, squirt: 0, priorityPlane: 0, replaceableId: 0,
        visibility, emission: window(w.start, w.stop, Math.max(1, e.count)),
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
      const events = nodeEvents(scene.fx);
      const { model } = xbfToMdx(key, scene, readAnimations(data), ref, {
        sequences: EFFECT_SEQUENCES, scaling: true, flipbook, hiddenNode: EFFECT_HIDDEN_NODE, deathOnly: EFFECT_SHOWN, oneSided: true,
        nodeTextures: (n) => lists.get(n) ?? null, nodeEvents: (n) => events.get(n) ?? null,
        blend: () => FILTER.blend,
      });
      // the FXData particles: hits are made of them only, explosions add sparks and smoke
      const particles = fxEmitters(scene.fx);
      if (!model.sequences.some((s) => s.name === EFFECT_SEQUENCES[0]?.[1]) && particles.windows.length) {
        // particles only (no node is animated): Death lasts until the last particle is gone, after Stand
        const end = Math.max(...model.sequences.map((s) => s.end));
        const frames = Math.max(...particles.windows.map((w) => { const e = particles.emitters.find((x) => x.id === w.id); return w.stop + Math.max(FX_PARTICLE.minLifeFrames, (e?.life ?? 0) + (e?.lifeRandom ?? 0)); }));
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

export { effectUse, buildEffects, fxTrack, nodeEvents };
