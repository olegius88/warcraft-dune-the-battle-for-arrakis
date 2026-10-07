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
// the other on the MDX timeline. TODO(models): vertex (morph) animation of infantry is not converted
// (the bind pose is drawn), and neither are attachment points or particle effects.

import type { XbfScene, XbfNode, AnimationRange } from './xbf.ts';
import type { MdxModel, Geoset, Bone, Track, Extent, Material, Texture, V3 } from '../wc3/mdx.ts';
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

/** Local matrix of a node at an Emperor frame (bind transform when the node is not key-animated). */
function localAt(n: XbfNode, frame: number): Mat {
  const k = n.keyAnimation;
  if (!k || (k.flags !== -3 && k.flags !== -2)) return n.transform;
  const f = Math.max(0, Math.min(k.frameCount, frame));
  const m = k.flags === -3 ? k.matrices[k.extra[f] as number] : k.matrices[f];
  if (!m) return n.transform;
  return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, m[9], m[10], m[11], 1] as number[];
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
function xbfToMdx(name: string, scene: XbfScene, anims: Map<string, AnimationRange[]>, texture: (file: string) => TextureRef | null): ConvertedModel {
  const flat = flatten(scene.nodes);
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
    textures.push({ path: t ? t.path : '', replaceableId: t ? 0 : 0 });
    if (t) usedFiles.push(file);
    id = materials.length;
    materials.push({ layers: [{ filterMode: t && t.alpha ? FILTER.transparent : FILTER.none, flags: M.TWO_SIDED ? LAYER_FLAG.twoSided : 0, textureId: texId }] });
    materialOf.set(file.toLowerCase(), id);
    return id;
  };

  const geosets: Geoset[] = [];
  const bones: Bone[] = [];
  const pivots: V3[] = [];
  const boneOfNode = new Map<number, number>();
  const all: V3[] = [];
  flat.forEach(({ node }, ni) => {
    if (M.HIDDEN_NODE(node.name) || !node.faces.length) return;
    const w = mul(K, bind[ni] as Mat);
    // faces by texture
    const byTex = new Map<number, typeof node.faces>();
    for (const f of node.faces) {
      const raw = scene.textures[f.texture] ?? '';
      if (M.EFFECT_TEXTURE(raw)) continue;
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
            const p = apply(w, vert.position);
            const nrm = applyDir(w, vert.normal);
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
      all.push(...pts);
      const e = extentOf(pts);
      geosets.push({ vertices, normals, uvs, faces: idx, bones: [bone], materialId: material(scene.textures[tex] ?? ''), extent: e, sequenceExtents: [] });
    }
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
  for (const { node } of flat) if (node.keyAnimation) maxFrame = Math.max(maxFrame, node.keyAnimation.frameCount);
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
  for (const [emperorName, wc3Name, looping] of M.SEQUENCE_MAP) {
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
  for (const g of geosets) g.sequenceExtents = sequences.map(() => g.extent);
  return {
    model: { name, extent, sequences, textures, materials, geosets, geosetAnimations: [], bones, pivots },
    textures: usedFiles,
  };
}

export { xbfToMdx };
