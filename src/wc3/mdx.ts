// MDX writer (Warcraft III model, version 800 = the format of the 1.31 classic client).
// Chunk layout: mdx-m3-viewer src/parsers/mdlx (MIT): model.ts saveMdx, sequence.ts, extent.ts,
// texture.ts, material.ts, layer.ts, geoset.ts, geosetanimation.ts, genericobject.ts, bone.ts,
// animations.ts. Only what converted Emperor models need: sequences, textures, materials with
// layers, geosets (one matrix group per geoset), geoset animations (alpha), bones with
// translation / rotation / scaling tracks, attachment points (attachment.ts), pivot points.

export const MDX_VERSION = 800;

export type V3 = [number, number, number];

export interface Extent { radius: number; min: V3; max: V3 }

export interface Sequence {
  name: string;
  start: number;
  end: number;
  moveSpeed?: number;
  nonLooping?: boolean;
  rarity?: number;
  extent: Extent;
}

export interface Texture {
  path: string;
  /** 1 = team colour, 2 = team glow; 0 = the path */
  replaceableId?: number;
  /** 1 wrap width, 2 wrap height, 3 both */
  wrap?: number;
}

/** Layer filter modes (layer.ts FilterMode). */
export const FILTER = { none: 0, transparent: 1, blend: 2, additive: 3, addAlpha: 4, modulate: 5, modulate2x: 6 } as const;
/** Layer flags (MDL: Unshaded 0x1, SphereEnvMap 0x2, TwoSided 0x10, Unfogged 0x20, NoDepthTest 0x40, NoDepthSet 0x80). */
export const LAYER_FLAG = { unshaded: 0x1, twoSided: 0x10, unfogged: 0x20, noDepthTest: 0x40, noDepthSet: 0x80 } as const;

export interface Layer { filterMode: number; flags: number; textureId: number; alpha?: number }
export interface Material { priorityPlane?: number; flags?: number; layers: Layer[] }

export interface Geoset {
  /** x,y,z per vertex */
  vertices: number[];
  normals: number[];
  /** u,v per vertex */
  uvs: number[];
  /** triangle vertex indices */
  faces: number[];
  /** bones this geoset follows (one matrix group for all its vertices) */
  bones: number[];
  materialId: number;
  extent: Extent;
  /** one extent per sequence */
  sequenceExtents: Extent[];
}

/** Keyframe track: frame -> value; interpolation 1 = linear (default), 0 = none (steps). */
/** Keys of an animated value; with globalSequenceId the track loops on its own (GLBS duration). */
export interface Track { frames: number[]; values: number[][]; interpolation?: 0 | 1; globalSequenceId?: number }

export interface GeosetAnimation { geosetId: number; alpha?: Track; staticAlpha?: number }

export interface Bone {
  name: string;
  parentId: number;
  translation?: Track;
  /** quaternions x, y, z, w */
  rotation?: Track;
  scaling?: Track;
}

/** Camera (glue screens and portraits view the model through its first camera). Field of view in
 * radians; position / target in model space. Layout: mdx-m3-viewer parsers/mdlx/camera (size, name
 * [80], position, field of view, far clip, near clip, target, then KCTR / KCRL / KTTR tracks). */
export interface Camera { name: string; position: V3; fieldOfView: number; farClip: number; nearClip: number; target: V3 }

/** Attachment point (effects attach to it by name: "origin", "overhead", "chest", "weapon"). */
export interface Attachment { name: string; parentId: number; attachmentId: number }

export interface MdxModel {
  name: string;
  extent: Extent;
  sequences: Sequence[];
  textures: Texture[];
  materials: Material[];
  geosets: Geoset[];
  geosetAnimations: GeosetAnimation[];
  bones: Bone[];
  /** attachment points; their object ids follow the bones' */
  attachments?: Attachment[];
  /** one pivot per object (bones first: object id = bone index, then the attachments) */
  pivots: V3[];
  /** durations (ms) of the global sequences tracks refer to */
  globalSequences?: number[];
  cameras?: Camera[];
}

class Out {
  parts: Buffer[] = [];
  length = 0;
  push(b: Buffer): void { this.parts.push(b); this.length += b.length; }
  tag(s: string): void { this.push(Buffer.from(s, 'ascii')); }
  u32(v: number): void { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); this.push(b); }
  i32(v: number): void { const b = Buffer.alloc(4); b.writeInt32LE(v); this.push(b); }
  f32(v: number): void { const b = Buffer.alloc(4); b.writeFloatLE(v); this.push(b); }
  f32s(vs: readonly number[]): void { const b = Buffer.alloc(vs.length * 4); vs.forEach((v, i) => b.writeFloatLE(v, i * 4)); this.push(b); }
  u16s(vs: readonly number[]): void { const b = Buffer.alloc(vs.length * 2); vs.forEach((v, i) => b.writeUInt16LE(v, i * 2)); this.push(b); }
  u8s(vs: readonly number[]): void { this.push(Buffer.from(vs)); }
  /** zero-padded fixed-size string */
  str(s: string, size: number): void { const b = Buffer.alloc(size); b.write(s.slice(0, size - 1), 'latin1'); this.push(b); }
  buffer(): Buffer { return Buffer.concat(this.parts); }
}

function extent(o: Out, e: Extent): void { o.f32(e.radius); o.f32s(e.min); o.f32s(e.max); }

/** Track bytes: tag, count, interpolation (0 none / 1 linear), global sequence (-1 none), frames with values. */
function trackBytes(tag: string, t: Track, size: number): Buffer {
  const o = new Out();
  o.tag(tag); o.u32(t.frames.length); o.u32(t.interpolation ?? 1); o.i32(t.globalSequenceId ?? -1);
  t.frames.forEach((f, i) => {
    const v = t.values[i] as number[];
    if (v.length !== size) throw new Error(`${tag}: value of ${v.length} numbers, expected ${size}`);
    o.i32(f); o.f32s(v);
  });
  return o.buffer();
}

function chunk(o: Out, tag: string, body: Buffer): void { o.tag(tag); o.u32(body.length); o.push(body); }

function writeMdx(m: MdxModel): Buffer {
  const o = new Out();
  o.tag('MDLX');
  chunk(o, 'VERS', (() => { const b = Buffer.alloc(4); b.writeUInt32LE(MDX_VERSION); return b; })());
  { const c = new Out(); c.str(m.name, 80); c.str('', 260); extent(c, m.extent); c.u32(150); chunk(o, 'MODL', c.buffer()); }
  if (m.sequences.length) {
    const c = new Out();
    for (const s of m.sequences) {
      c.str(s.name, 80); c.u32(s.start); c.u32(s.end); c.f32(s.moveSpeed ?? 0); c.u32(s.nonLooping ? 1 : 0); c.f32(s.rarity ?? 0); c.u32(0); extent(c, s.extent);
    }
    chunk(o, 'SEQS', c.buffer());
  }
  if (m.globalSequences?.length) { const c = new Out(); m.globalSequences.forEach((d) => c.u32(d)); chunk(o, 'GLBS', c.buffer()); }
  if (m.materials.length) {
    const c = new Out();
    for (const mat of m.materials) {
      c.u32(20 + mat.layers.length * 28); c.i32(mat.priorityPlane ?? 0); c.u32(mat.flags ?? 0);
      c.tag('LAYS'); c.u32(mat.layers.length);
      for (const l of mat.layers) { c.u32(28); c.u32(l.filterMode); c.u32(l.flags); c.i32(l.textureId); c.i32(-1); c.u32(0); c.f32(l.alpha ?? 1); }
    }
    chunk(o, 'MTLS', c.buffer());
  }
  if (m.textures.length) {
    const c = new Out();
    for (const t of m.textures) { c.u32(t.replaceableId ?? 0); c.str(t.path, 260); c.u32(t.wrap ?? 0); }
    chunk(o, 'TEXS', c.buffer());
  }
  if (m.geosets.length) {
    const c = new Out();
    for (const g of m.geosets) {
      const n = g.vertices.length / 3;
      if (n > 0xffff) throw new Error(`geoset of ${n} vertices`);
      const body = new Out();
      body.tag('VRTX'); body.u32(n); body.f32s(g.vertices);
      body.tag('NRMS'); body.u32(n); body.f32s(g.normals);
      body.tag('PTYP'); body.u32(1); body.u32(4); // triangles
      body.tag('PCNT'); body.u32(1); body.u32(g.faces.length);
      body.tag('PVTX'); body.u32(g.faces.length); body.u16s(g.faces);
      body.tag('GNDX'); body.u32(n); body.u8s(Array.from({ length: n }, () => 0));
      body.tag('MTGC'); body.u32(1); body.u32(g.bones.length);
      body.tag('MATS'); body.u32(g.bones.length); g.bones.forEach((b) => body.u32(b));
      body.u32(g.materialId); body.u32(0); body.u32(0);
      extent(body, g.extent);
      body.u32(g.sequenceExtents.length); g.sequenceExtents.forEach((e) => extent(body, e));
      body.tag('UVAS'); body.u32(1); body.tag('UVBS'); body.u32(n); body.f32s(g.uvs);
      c.u32(body.length + 4); c.push(body.buffer());
    }
    chunk(o, 'GEOS', c.buffer());
  }
  if (m.geosetAnimations.length) {
    const c = new Out();
    for (const a of m.geosetAnimations) {
      const alpha = a.alpha ? trackBytes('KGAO', a.alpha, 1) : Buffer.alloc(0);
      c.u32(28 + alpha.length); c.f32(a.staticAlpha ?? 1); c.u32(0); c.f32s([1, 1, 1]); c.u32(a.geosetId); c.push(alpha);
    }
    chunk(o, 'GEOA', c.buffer());
  }
  if (m.bones.length) {
    const c = new Out();
    m.bones.forEach((b, id) => {
      const anims = Buffer.concat([
        b.translation ? trackBytes('KGTR', b.translation, 3) : Buffer.alloc(0),
        b.rotation ? trackBytes('KGRT', b.rotation, 4) : Buffer.alloc(0),
        b.scaling ? trackBytes('KGSC', b.scaling, 3) : Buffer.alloc(0),
      ]);
      c.u32(96 + anims.length); c.str(b.name, 80); c.i32(id); c.i32(b.parentId); c.u32(0x100); c.push(anims);
      c.i32(-1); c.i32(-1); // geoset id, geoset animation id
    });
    chunk(o, 'BONE', c.buffer());
  }
  if (m.attachments?.length) {
    const c = new Out();
    m.attachments.forEach((a, i) => {
      // size, generic object (size, name, object id, parent, flags 0x800), path[260], attachment id
      c.u32(268 + 96); c.u32(96); c.str(a.name, 80); c.i32(m.bones.length + i); c.i32(a.parentId); c.u32(0x800);
      c.str('', 260); c.i32(a.attachmentId);
    });
    chunk(o, 'ATCH', c.buffer());
  }
  if (m.pivots.length) { const c = new Out(); m.pivots.forEach((p) => c.f32s(p)); chunk(o, 'PIVT', c.buffer()); }
  if (m.cameras?.length) {
    const c = new Out();
    for (const cam of m.cameras) { c.u32(120); c.str(cam.name, 80); c.f32s(cam.position); c.f32(cam.fieldOfView); c.f32(cam.farClip); c.f32(cam.nearClip); c.f32s(cam.target); }
    chunk(o, 'CAMS', c.buffer());
  }
  return o.buffer();
}

/** Chunk list of an MDX file (tests): tag -> body. */
function readMdxChunks(buf: Buffer): Map<string, Buffer> {
  if (buf.toString('ascii', 0, 4) !== 'MDLX') throw new Error('not an MDX file');
  const out = new Map<string, Buffer>();
  let p = 4;
  while (p + 8 <= buf.length) {
    const tag = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    out.set(tag, buf.subarray(p + 8, p + 8 + size));
    p += 8 + size;
  }
  if (p !== buf.length) throw new Error('chunk sizes do not add up to the file size');
  return out;
}

export { writeMdx, readMdxChunks };
