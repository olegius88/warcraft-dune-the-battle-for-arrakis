// Emperor XBF model -> WC3 MDX model (src/wc3/mdx.ts).
//
// Geometry: every drawn node becomes geosets (one per texture) in model space of the bind pose
// (node transforms chained to the root), converted to WC3 axes and scale (config/models.ts).
// Animation: every drawn node gets a parentless bone; for each sampled Emperor frame its world
// matrix W_f (chain of the local matrices of that frame) gives the delta D = W_f * W_bind^-1, written
// as translation + rotation about the bone's pivot (MDX: T(pivot) T(t) R T(-pivot)).
// Key animation frames: -3 = frame -> index into unique 3x4 matrices, -2 = one 3x4 matrix per
// frame, both absolute local transforms (frame 0 equals the node transform for 73 % of the nodes of
// the shipped units and buildings; the rest start in an animated pose); -1 holds uninitialised
// memory (0xCDCDCDCD) and is ignored; sparse keys (none in the shipped units) are not used.
// Sequences: Emperor animation ranges (FX data) named per config SEQUENCE_MAP, laid out one after
// the other on the MDX timeline. Vertex (morph) animation (infantry): a geoset copy per sampled frame,
// shown by a step alpha track. Attachment points: origin, chest, overhead, weapon (first fire node).
// TODO(models): Emperor's particle effects (muzzle flashes, smoke) are not converted.

import type { XbfScene, XbfNode, AnimationRange } from './xbf.ts';
import type { MdxModel, Geoset, GeosetAnimation, Bone, Track, Extent, Material, Texture, V3, Attachment } from '../wc3/mdx.ts';
import { FILTER, LAYER_FLAG } from '../wc3/mdx.ts';
import * as M from '../config/models.ts';

type Mat = number[]; // column-major 4x4

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a: Mat, b: Mat): Mat {
  const o: number[] = Array.from({ length: 16 }, () => 0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += (a[k * 4 + r] as number) * (b[c * 4 + k] as number);
    o[c * 4 + r] = s;
  }
  return o;
}

function apply(m: Mat, p: V3): V3 {
  return [0, 1, 2].map((r) => (m[r] as number) * p[0] + (m[4 + r] as number) * p[1] + (m[8 + r] as number) * p[2] + (m[12 + r] as number)) as V3;
}

function applyDir(m: Mat, v: V3): V3 {
  const o = [0, 1, 2].map((r) => (m[r] as number) * v[0] + (m[4 + r] as number) * v[1] + (m[8 + r] as number) * v[2]) as V3;
  const l = Math.hypot(...o) || 1;
  return [o[0] / l, o[1] / l, o[2] / l];
}

/** Inverse of an affine matrix (general 3x3 part). */
function invert(m: Mat): Mat {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]] as number[] as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return IDENTITY.slice();
  const inv3 = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  // inv3 is row-major [r0c0 r0c1 r0c2 r1c0 ...]
  const o: Mat = [inv3[0], inv3[3], inv3[6], 0, inv3[1], inv3[4], inv3[7], 0, inv3[2], inv3[5], inv3[8], 0, 0, 0, 0, 1] as number[];
  const t = apply(o, [m[12] as number, m[13] as number, m[14] as number]);
  o[12] = -t[0]; o[13] = -t[1]; o[14] = -t[2];
  return o;
}

/** Emperor -> WC3 axes and scale (config MIRROR, MODEL_SCALE). */
const K: Mat = (() => {
  const s = M.MODEL_SCALE, y = M.MIRROR ? 1 : -1;
  const k: number[] = Array.from({ length: 16 }, () => 0);
  k[1] = y * s; // column 0 (emperor x) -> wc3 y
  k[6] = s; // column 1 (emperor y) -> wc3 z
  k[8] = -s; // column 2 (emperor z) -> wc3 -x
  k[15] = 1;
  return k;
})();
const K_INV = invert(K);

/** Unit quaternion (x, y, z, w) of the rotation part of an affine matrix (scale removed). */
function quat(m: Mat): number[] {
  const col = (c: number): V3 => { const v = [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]] as V3; const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const [x, y, z] = [col(0), col(1), col(2)];
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q: number[];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
}

/** Spherical interpolation of unit quaternions (the shorter way). */
function slerp(a: number[], b: number[], t: number): number[] {
  let d = a.reduce((s, v, i) => s + v * (b[i] as number), 0);
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) { const q = a.map((v, i) => v + ((bb[i] as number) - v) * t); const l = Math.hypot(...q); return q.map((v) => v / l); }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + (bb[i] as number) * Math.sin(t * th)) / s);
}

/** Column-major T * R * S of a key frame (quaternion x, y, z, w). */
function trs(t: V3, q: number[], s: V3): Mat {
  const [x, y, z, w] = q as [number, number, number, number];
  const r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  return [r[0] as number * s[0], r[1] as number * s[0], r[2] as number * s[0], 0, r[3] as number * s[1], r[4] as number * s[1], r[5] as number * s[1], 0, r[6] as number * s[2], r[7] as number * s[2], r[8] as number * s[2], 0, t[0], t[1], t[2], 1];
}

/** Local matrix of sparse key frames (the menu scene's planet, stars: rotation / scale / translation
 * keys at some frames, interpolated between them; a missing part is the node's own). */
function sparseAt(n: XbfNode, frame: number): Mat {
  const keys = (n.keyAnimation as NonNullable<XbfNode['keyAnimation']>).frames;
  let i = 0;
  while (i + 1 < keys.length && (keys[i + 1] as { frame: number }).frame <= frame) i++;
  const a = keys[i] as NonNullable<typeof keys[number]>, b = keys[Math.min(i + 1, keys.length - 1)] as NonNullable<typeof keys[number]>;
  const t = b.frame > a.frame ? Math.max(0, Math.min(1, (frame - a.frame) / (b.frame - a.frame))) : 0;
  const lerp = (p: V3 | null, q: V3 | null, own: V3): V3 => { const x = p ?? own, y = q ?? x; return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]; };
  const m = n.transform;
  const ownT: V3 = [m[12] as number, m[13] as number, m[14] as number];
  const ownS: V3 = [Math.hypot(m[0] as number, m[1] as number, m[2] as number), Math.hypot(m[4] as number, m[5] as number, m[6] as number), Math.hypot(m[8] as number, m[9] as number, m[10] as number)];
  const ownR = quat(m);
  const ra = a.rotation ?? ownR, rb = b.rotation ?? ra;
  return trs(lerp(a.translation, b.translation, ownT), slerp(ra, rb, t), lerp(a.scale, b.scale, ownS));
}

/** Local matrix of a node at an Emperor frame (bind transform when the node is not key-animated). */
function localAt(n: XbfNode, frame: number): Mat {
  const k = n.keyAnimation;
  if (k && k.flags > 0 && k.frames.length) return sparseAt(n, Math.max(0, Math.min(k.frameCount, frame)));
  if (!k || (k.flags !== -3 && k.flags !== -2)) return n.transform;
  const f = Math.max(0, Math.min(k.frameCount, frame));
  const m = k.flags === -3 ? k.matrices[k.extra[f] as number] : k.matrices[f];
  if (!m) return n.transform;
  return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, m[9], m[10], m[11], 1] as number[];
}

/**
 * Vertex (morph) animation of a node: frame -> pose. Interpolation data has one value per frame:
 * bit 0 set = the frame shows a stored pose, (value >> 2) / vertex count = its index (frames 0, 2,
 * 4.. of AT_inf_H0 -> poses 0, 1, 2..; a few frames repeat a pose), 0 = blend the neighbouring
 * stored frames. Without interpolation data frame
 * f is pose f. Positions are int16 / 2^(scale & 0xff) (AT_inf: 1782 / 2^9 = 3.48 = the bind vertex),
 * normals 5-bit signed per axis (xanlib compressed_vertex.py).
 */
function morphOf(node: XbfNode): { stored: number[]; poseAt: (frame: number) => { positions: V3[]; normals: V3[] } } | null {
  const va = node.vertexAnimation;
  if (!va || !va.frames.length || va.scale === null || va.realCount !== node.vertices.length) return null;
  const div = 2 ** (va.scale & 0xff);
  const stored: number[] = [];
  if (va.interpolation.length) {
    // (value >> 2) = pose index * vertex count (AT_inf: 241 >> 2 = 60 = pose 1 of 60 vertices);
    // several frames may show the same pose
    for (const v of va.interpolation) {
      const k = v & 1 ? Math.round((v >> 2) / va.realCount) : -1;
      stored.push(k < va.frames.length ? k : -1);
    }
  } else {
    for (let f = 0; f <= va.frameCount; f++) stored.push(Math.min(f, va.frames.length - 1));
  }
  const s5 = (v: number): number => ((v % 32) > 15 ? -1 : 1) * (v % 16);
  const decode = (j: number): { positions: V3[]; normals: V3[] } => {
    const frame = va.frames[j] as NonNullable<typeof va.frames[number]>;
    return {
      positions: frame.map((c) => [c.position[0] / div, c.position[1] / div, c.position[2] / div] as V3),
      normals: frame.map((c) => {
        const n = [s5(c.normalPacked & 31), s5((c.normalPacked >> 5) & 31), s5((c.normalPacked >> 10) & 31)];
        const l = Math.hypot(...n) || 1;
        return [n[0] / l, n[1] / l, n[2] / l] as V3;
      }),
    };
  };
  const poseAt = (frame: number): { positions: V3[]; normals: V3[] } => {
    const f = Math.max(0, Math.min(stored.length - 1, frame));
    if ((stored[f] as number) >= 0) return decode(stored[f] as number);
    let a = f, b = f;
    while (a > 0 && (stored[a] as number) < 0) a--;
    while (b < stored.length - 1 && (stored[b] as number) < 0) b++;
    const pa = decode(Math.max(0, stored[a] as number)), pb = decode(Math.max(0, stored[b] as number));
    const t = b === a ? 0 : (f - a) / (b - a);
    const mix = (x: V3, y: V3): V3 => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
    return { positions: pa.positions.map((p, i) => mix(p, pb.positions[i] as V3)), normals: pa.normals.map((p, i) => mix(p, pb.normals[i] as V3)) };
  };
  return { stored, poseAt };
}

interface Flat { node: XbfNode; parent: number }

function flatten(nodes: XbfNode[]): Flat[] {
  const out: Flat[] = [];
  const walk = (n: XbfNode, parent: number): void => { const i = out.length; out.push({ node: n, parent }); n.children.forEach((c) => walk(c, i)); };
  nodes.forEach((n) => walk(n, -1));
  return out;
}

/** World matrices of all flattened nodes at a frame (null = bind pose). */
function worldAt(flat: Flat[], frame: number | null): Mat[] {
  const w: Mat[] = [];
  flat.forEach(({ node, parent }, i) => {
    const local = frame === null ? node.transform : localAt(node, frame);
    w[i] = parent < 0 ? local : mul(w[parent] as Mat, local);
  });
  return w;
}

export interface TextureRef {
  /** archive path of the converted texture */
  path: string;
  alpha: boolean;
  /** house colour: drawn over a team colour layer (its house-colour panels are transparent) */
  teamColour?: boolean;
}

export interface ConvertedModel {
  model: MdxModel;
  /** Emperor texture files the model uses (to convert and import) */
  textures: string[];
}

function extentOf(points: V3[]): Extent {
  if (!points.length) return { radius: 0, min: [0, 0, 0], max: [0, 0, 0] };
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i] as number, p[i] as number); max[i] = Math.max(max[i] as number, p[i] as number); }
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { radius, min, max };
}

/**
 * Convert one XBF scene. `texture(file)` says where the converted texture of an Emperor texture file
 * is (null: missing; the faces are still drawn with an untextured layer).
 */
/** Options for whole scenes (the main menu backdrop, src/emperor/menu-scene.ts) rather than units. */
export interface SceneOptions {
  /** top-level nodes kept (with their subtrees); default all */
  keepRoot?: (name: string) => boolean;
  /** layer filter mode of a texture; null leaves its faces out (default: effect textures left out,
   * the rest opaque or, with alpha, transparent) */
  blend?: (file: string) => number | null;
  /** each animated node loops on its own (global sequences over its key frames) and one looping
   * Stand sequence of this many ms holds the model; the SEQUENCE_MAP ranges are not used */
  ownLoops?: number;
  /** every layer unshaded and unfogged (a backdrop with no light of its own) */
  unshaded?: boolean;
}

function xbfToMdx(name: string, scene: XbfScene, anims: Map<string, AnimationRange[]>, texture: (file: string) => TextureRef | null, opts: SceneOptions = {}): ConvertedModel {
  const all0 = flatten(scene.nodes);
  // nodes outside the kept top-level subtrees are dropped (their indices stay for the parent chain)
  const rootOf = (i: number): number => { let r = i; while ((all0[r] as Flat).parent >= 0) r = (all0[r] as Flat).parent; return r; };
  const kept = (i: number): boolean => !opts.keepRoot || opts.keepRoot((all0[rootOf(i)] as Flat).node.name);
  const flat = all0;
  const bind = worldAt(flat, null);
  const textures: Texture[] = [];
  const materials: Material[] = [];
  const materialOf = new Map<string, number>();
  const usedFiles: string[] = [];
  const material = (raw: string): number => {
    const file = M.TEXTURE_FILE(raw);
    let id = materialOf.get(file.toLowerCase());
    if (id !== undefined) return id;
    const t = texture(file);
    const texId = textures.length;
    textures.push({ path: t ? t.path : '' });
    if (t) usedFiles.push(file);
    id = materials.length;
    const flags = M.TWO_SIDED ? LAYER_FLAG.twoSided : 0;
    const sceneBlend = opts.blend ? opts.blend(raw) : null;
    if (sceneBlend !== null && sceneBlend !== undefined) {
      // scene layers: glows and sky are self-lit
      // a backdrop scene: unshaded (no light of its own) and unfogged (the campaign screen fogs the
      // far planet black otherwise, capture 2026-10-08)
      const lit = sceneBlend === FILTER.none && !opts.unshaded ? flags : flags | LAYER_FLAG.unshaded;
      materials.push({ layers: [{ filterMode: sceneBlend, flags: opts.unshaded ? lit | LAYER_FLAG.unfogged : lit, textureId: texId }] });
    } else if (t?.teamColour) {
      // WC3 team colour under the texture (replaceable id 1), the texture blended over it
      let team = textures.findIndex((x) => x.replaceableId === 1);
      if (team < 0) { team = textures.length; textures.push({ path: '', replaceableId: 1 }); }
      materials.push({ layers: [{ filterMode: FILTER.none, flags, textureId: team }, { filterMode: FILTER.blend, flags, textureId: texId }] });
    } else {
      materials.push({ layers: [{ filterMode: t && t.alpha ? FILTER.transparent : FILTER.none, flags, textureId: texId }] });
    }
    materialOf.set(file.toLowerCase(), id);
    return id;
  };

  const geosets: Geoset[] = [];
  // faces whose texture index is outside the list (AT_inf_H0) use the first texture that is not an effect's
  const fallbackTexture = scene.textures.find((t) => !M.EFFECT_TEXTURE(t)) ?? '';
  const textureOf = (i: number): string => scene.textures[i] ?? fallbackTexture;
  const bones: Bone[] = [];
  const pivots: V3[] = [];
  const boneOfNode = new Map<number, number>();
  const all: V3[] = [];
  type Faces = XbfNode['faces'];
  /**
   * Geosets (one per texture) of a node with its world matrix w; `pose` replaces the node's own
   * vertex positions / normals (a frame of its vertex animation). Returns the geoset indices.
   */
  const addGeosets = (node: XbfNode, byTex: Map<number, Faces>, w: Mat, bone: number, pose: { positions: V3[]; normals: V3[] } | null): number[] => {
    const ids: number[] = [];
    for (const [tex, faces] of byTex) {
      const vertices: number[] = [], normals: number[] = [], uvs: number[] = [], idx: number[] = [];
      const seen = new Map<string, number>();
      const pts: V3[] = [];
      for (const f of faces) {
        const corner = (k: number): number => {
          const vi = f.vertices[k] as number;
          const [u, v] = f.uv[k] as [number, number];
          const key = `${vi}:${u}:${v}`;
          let i = seen.get(key);
          if (i === undefined) {
            const vert = node.vertices[vi];
            if (!vert) throw new Error(`${name}: ${node.name} face vertex ${vi} out of range`);
            const p = apply(w, pose ? (pose.positions[vi] as V3) : vert.position);
            const nrm = applyDir(w, pose ? (pose.normals[vi] as V3) : vert.normal);
            i = vertices.length / 3;
            vertices.push(...p); normals.push(...nrm); uvs.push(u, v); pts.push(p);
            seen.set(key, i);
          }
          return i;
        };
        const a = corner(0), b = corner(1), c = corner(2);
        // the axis map mirrors: reverse the winding so faces keep pointing outwards
        idx.push(...(M.MIRROR ? [a, c, b] : [a, b, c]));
      }
      if (!pose) all.push(...pts);
      ids.push(geosets.length);
      geosets.push({ vertices, normals, uvs, faces: idx, bones: [bone], materialId: material(textureOf(tex)), extent: extentOf(pts), sequenceExtents: [] });
    }
    return ids;
  };
  interface Morph { node: XbfNode; byTex: Map<number, Faces>; w: Mat; bone: number; staticGeosets: number[]; stored: number[]; poseAt: (frame: number) => { positions: V3[]; normals: V3[] } }
  const morphs: Morph[] = [];
  flat.forEach(({ node }, ni) => {
    if (M.HIDDEN_NODE(node.name) || !node.faces.length || !kept(ni)) return;
    const w = mul(K, bind[ni] as Mat);
    // faces by texture
    const byTex = new Map<number, typeof node.faces>();
    for (const f of node.faces) {
      const raw = textureOf(f.texture);
      if (opts.blend ? opts.blend(raw) === null : M.EFFECT_TEXTURE(raw)) continue;
      const list = byTex.get(f.texture) ?? [];
      list.push(f);
      byTex.set(f.texture, list);
    }
    if (!byTex.size) return;
    const bone = bones.length;
    boneOfNode.set(ni, bone);
    const pivot = apply(w, [0, 0, 0]);
    pivots.push(pivot);
    bones.push({ name: node.name.slice(0, 79) || `node${ni}`, parentId: -1 });
    const ids = addGeosets(node, byTex, w, bone, null);
    const morph = morphOf(node);
    if (morph) morphs.push({ node, byTex, w, bone, staticGeosets: ids, ...morph });
  });

  // sequences: Emperor ranges laid out one after the other
  const extent = extentOf(all);
  const sequences: MdxModel['sequences'] = [];
  const tracks = new Map<number, { t: Track; r: Track; moved: boolean }>();
  for (const b of boneOfNode.values()) tracks.set(b, { t: { frames: [], values: [] }, r: { frames: [], values: [] }, moved: false });
  const used = new Set<string>();
  // the animation table is found by name in the file: ranges beyond the frames the nodes have are
  // not this model's (or not animations at all)
  let maxFrame = 0;
  for (const { node } of flat) {
    if (node.keyAnimation) maxFrame = Math.max(maxFrame, node.keyAnimation.frameCount);
    if (node.vertexAnimation) maxFrame = Math.max(maxFrame, node.vertexAnimation.frameCount);
  }
  const geosetAnimations: GeosetAnimation[] = [];
  let morphGeosets = 0;
  const frameGeosets: Array<{ id: number; at: number; until: number; end: number }> = [];
  const bindInv = new Map<number, Mat>();
  for (const ni of boneOfNode.keys()) bindInv.set(ni, invert(bind[ni] as Mat));
  /** append a key unless it repeats the previous value (linear interpolation keeps the shape) */
  const key = (t: Track, at: number, v: number[]): void => {
    const prev = t.values[t.values.length - 1];
    const prev2 = t.values[t.values.length - 2];
    const same = (a: number[] | undefined): boolean => Boolean(a && a.every((x, i) => Math.abs(x - (v[i] as number)) < 1e-4));
    if (same(prev) && same(prev2)) { t.frames[t.frames.length - 1] = at; return; }
    t.frames.push(at); t.values.push(v);
  };
  let time = 0;
  const globalSequences: number[] = [];
  if (opts.ownLoops) {
    // every animated node: its key frames as a track looping on its own
    for (const [ni, b] of boneOfNode) {
      const frames = (flat[ni] as Flat).node.keyAnimation?.frameCount ?? 0;
      let anyParent = false;
      for (let p = (flat[ni] as Flat).parent; p >= 0; p = (flat[p] as Flat).parent) if ((flat[p] as Flat).node.keyAnimation) anyParent = true;
      if (frames < 1 && !anyParent) continue;
      const span = Math.max(frames, 1);
      const gs = globalSequences.length;
      const rec = tracks.get(b) as { t: Track; r: Track; moved: boolean };
      rec.t.globalSequenceId = gs; rec.r.globalSequenceId = gs;
      for (let f = 0; f <= span; f++) {
        const world = worldAt(flat, f);
        const d = mul(mul(K, mul(world[ni] as Mat, bindInv.get(ni) as Mat)), K_INV);
        const p = pivots[b] as V3;
        const moved = apply(d, p);
        const tr = [moved[0] - p[0], moved[1] - p[1], moved[2] - p[2]];
        const q = quat(d);
        const at = f * M.MS_PER_FRAME;
        if (f === 0 || f === span) { rec.t.frames.push(at); rec.t.values.push(tr); rec.r.frames.push(at); rec.r.values.push(q); }
        else { key(rec.t, at, tr); key(rec.r, at, q); }
        if (Math.hypot(...tr) > 0.01 || Math.abs(Math.abs(q[3] as number) - 1) > 1e-5) rec.moved = true;
      }
      globalSequences.push(span * M.MS_PER_FRAME);
    }
    sequences.push({ name: 'Stand', start: 0, end: opts.ownLoops, extent });
  }
  for (const [emperorName, wc3Name, looping] of opts.ownLoops ? [] : M.SEQUENCE_MAP) {
    const range = anims.get(emperorName)?.[0];
    if (!range || used.has(wc3Name)) continue;
    const first = Math.min(range.start, range.end), last = Math.max(range.start, range.end);
    if (first < 0 || last > maxFrame) continue;
    used.add(wc3Name);
    const start = time;
    for (let f = first; f <= last; f++) {
      const world = worldAt(flat, f);
      const at = start + (f - first) * M.MS_PER_FRAME;
      for (const [ni, b] of boneOfNode) {
        const d = mul(mul(K, mul(world[ni] as Mat, bindInv.get(ni) as Mat)), K_INV);
        const p = pivots[b] as V3;
        const moved = apply(d, p);
        const tr = [moved[0] - p[0], moved[1] - p[1], moved[2] - p[2]];
        const q = quat(d);
        const rec = tracks.get(b) as { t: Track; r: Track; moved: boolean };
        // the first and last key of a sequence are always kept
        if (f === first || f === last) { rec.t.frames.push(at); rec.t.values.push(tr); rec.r.frames.push(at); rec.r.values.push(q); }
        else { key(rec.t, at, tr); key(rec.r, at, q); }
        if (Math.hypot(...tr) > 0.01 || Math.abs(Math.abs(q[3] as number) - 1) > 1e-5) rec.moved = true;
      }
      // vertex animation: a copy of the node's geosets in this frame's pose, visible for its frames only
      if ((f - first) % M.MORPH_FRAME_STEP === 0) {
        for (const m of morphs) {
          for (const id of addGeosets(m.node, m.byTex, m.w, m.bone, m.poseAt(f))) {
            frameGeosets.push({ id, at, until: at + M.MORPH_FRAME_STEP * M.MS_PER_FRAME, end: start + (last - first) * M.MS_PER_FRAME });
            morphGeosets++;
          }
        }
      }
    }
    const end = start + (last - first) * M.MS_PER_FRAME;
    sequences.push({ name: wc3Name, start, end: Math.max(end, start + 1), nonLooping: !looping, extent });
    time = end + 2 * M.MS_PER_FRAME;
  }
  if (!sequences.some((s) => s.name === 'Stand')) {
    // no stationary animation: the bind pose
    sequences.unshift({ name: 'Stand', start: time, end: time + 1000, extent });
  }
  for (const [b, rec] of tracks) {
    if (!rec.moved) continue;
    const bone = bones[b] as Bone;
    bone.translation = rec.t;
    bone.rotation = rec.r;
  }
  // Frame copies are visible from their frame to the next sampled one (or the end of their sequence).
  // The game evaluates a track inside the interval of the playing sequence only and draws a geoset
  // with no key there, so every copy is hidden by a key at the start and end of every sequence
  // (bug: all poses of the infantryman at once, regression test test/mdx.test.ts).
  for (const g of frameGeosets) {
    const keys = new Map<number, number>();
    for (const s of sequences) { keys.set(s.start, 0); keys.set(s.end, 0); }
    keys.set(g.at, 1);
    if (g.until < g.end) keys.set(g.until, 0);
    else keys.set(g.end, 1);
    const frames = [...keys.keys()].sort((a, b) => a - b);
    geosetAnimations.push({ geosetId: g.id, alpha: { interpolation: 0, frames, values: frames.map((t) => [keys.get(t) as number]) } });
  }
  // with frame copies, the bind-pose geosets of morphing nodes are never shown
  if (morphGeosets) for (const m of morphs) for (const id of m.staticGeosets) geosetAnimations.push({ geosetId: id, staticAlpha: 0 });
  for (const g of geosets) g.sequenceExtents = sequences.map(() => g.extent);
  // attachment points the game puts effects on: origin at the ground, chest half way up, overhead
  // above the top, weapon at the first fire point of the model ("#fire" / ">>0#fire" nodes)
  const top = extent.max[2];
  const fire = flat.findIndex(({ node }) => /#fire/i.test(node.name));
  const attachments: Attachment[] = [];
  const attach = (attachName: string, at: V3): void => { attachments.push({ name: attachName, parentId: -1, attachmentId: attachments.length }); pivots.push(at); };
  attach('Origin Ref', [0, 0, 0]);
  attach('Chest Ref', [0, 0, top / 2]);
  attach('Overhead Ref', [0, 0, top + M.OVERHEAD_GAP]);
  if (fire >= 0) attach('Weapon Ref', apply(mul(K, bind[fire] as Mat), [0, 0, 0]));
  return {
    model: { name, extent, sequences, textures, materials, geosets, geosetAnimations, bones, attachments, pivots, ...(globalSequences.length ? { globalSequences } : {}) },
    textures: usedFiles,
  };
}

export { xbfToMdx, K as AXES };
