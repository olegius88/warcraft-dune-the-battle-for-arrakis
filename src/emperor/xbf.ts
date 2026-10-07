// XBF (Xanadu engine 3D scene) reader: units, buildings, effects of Emperor (3DDATA0001).
// Port of xanlib (https://github.com/Lunaji/xanlib, MIT, see THIRD_PARTY_NOTICES.md): scene.py,
// node.py, vertex.py, face.py, vertex_animation.py, key_animation.py, compressed_vertex.py and the
// animation table reader of examples/extract_anim_info.py.
//
// File: int32 version, int32 fxSize, fx[fxSize], int32 texSize, textureNames[texSize], nodes..., int32 -1.
// Node: int32 vertexCount, flags, faceCount, childCount; float64 transform[16] (column-major);
//   uint32 nameLength, name; children; vertices (6 float32: position, normal); faces (int32 v1..v3,
//   textureIndex, flags; float32 uv x3); then by flags: 1 prelight RGB (3 bytes per vertex),
//   2 smoothing groups (int32 per face), 4 vertex animation, 8 key animation.
// Not every file parses to the end (xanlib keeps the rest as "unparsed"); so does this reader.

export type Vec3 = [number, number, number];
export type Matrix = number[]; // 16 (column-major) or 12

export interface Vertex { position: Vec3; normal: Vec3 }

export interface Face {
  vertices: [number, number, number];
  texture: number;
  flags: number;
  uv: [[number, number], [number, number], [number, number]];
}

/** Morph animation: `keys` = frame -> stored frame index; frames of compressed vertices. */
export interface VertexAnimation {
  frameCount: number;
  count: number;
  keys: number[];
  scale: number | null;
  baseCount: number | null;
  realCount: number | null;
  /** frames[k][i]: position (int16 x3, multiply by scale), packed normal, flag */
  frames: Array<Array<{ position: Vec3; normalPacked: number }>>;
  interpolation: number[];
}

export interface KeyFrame {
  frame: number;
  flag: number;
  /** quaternion w, x, y, z */
  rotation: [number, number, number, number] | null;
  scale: Vec3 | null;
  translation: Vec3 | null;
}

/** Node transform animation: full matrices per frame (flags -1/-2/-3) or sparse key frames. */
export interface KeyAnimation {
  frameCount: number;
  flags: number;
  matrices: Matrix[];
  extra: number[];
  frames: KeyFrame[];
}

export interface XbfNode {
  name: string;
  transform: Matrix;
  children: XbfNode[];
  vertices: Vertex[];
  faces: Face[];
  rgb: Array<[number, number, number]> | null;
  smoothingGroups: number[] | null;
  vertexAnimation: VertexAnimation | null;
  keyAnimation: KeyAnimation | null;
}

export interface XbfScene {
  version: number;
  fx: Buffer;
  textures: string[];
  nodes: XbfNode[];
  /** the reason the rest of the file could not be read (xanlib: Scene.error) */
  error: string | null;
}

const FLAG = { prelight: 1, smoothing: 2, vertexAnimation: 4, keyAnimation: 8 } as const;

class Reader {
  readonly buf: Buffer;
  at: number;
  constructor(buf: Buffer, at = 0) { this.buf = buf; this.at = at; }
  i32(): number { const v = this.buf.readInt32LE(this.at); this.at += 4; return v; }
  u32(): number { const v = this.buf.readUInt32LE(this.at); this.at += 4; return v; }
  i16(): number { const v = this.buf.readInt16LE(this.at); this.at += 2; return v; }
  u16(): number { const v = this.buf.readUInt16LE(this.at); this.at += 2; return v; }
  f32(): number { const v = this.buf.readFloatLE(this.at); this.at += 4; return v; }
  f64(): number { const v = this.buf.readDoubleLE(this.at); this.at += 8; return v; }
  bytes(n: number): Buffer { const v = this.buf.subarray(this.at, this.at + n); if (v.length < n) throw new Error('unexpected end of data'); this.at += n; return v; }
}

function readVertexAnimation(r: Reader): VertexAnimation {
  const frameCount = r.i32(), count = r.i32(), actual = r.i32();
  const keys = Array.from({ length: actual }, () => r.u32());
  const va: VertexAnimation = { frameCount, count, keys, scale: null, baseCount: null, realCount: null, frames: [], interpolation: [] };
  if (count < 0) {
    const scale = r.u32(), baseCount = r.u32();
    if (count !== -baseCount) throw new Error('vertex animation count mismatch');
    const realCount = Math.floor(baseCount / actual);
    va.scale = scale; va.baseCount = baseCount; va.realCount = realCount;
    for (let j = 0; j < actual; j++) {
      va.frames.push(Array.from({ length: realCount }, () => ({ position: [r.i16(), r.i16(), r.i16()] as Vec3, normalPacked: r.u16() })));
    }
    if (scale & 0x80000000) va.interpolation = Array.from({ length: frameCount }, () => r.u32());
  }
  return va;
}

function readKeyAnimation(r: Reader): KeyAnimation {
  const frameCount = r.i32(), flags = r.i32();
  const ka: KeyAnimation = { frameCount, flags, matrices: [], extra: [], frames: [] };
  if (flags === -1 || flags === -2 || flags === -3) {
    let count = frameCount + 1;
    if (flags === -3) {
      count = r.i32();
      ka.extra = Array.from({ length: frameCount + 1 }, () => r.i16());
    }
    const n = flags === -1 ? 16 : 12;
    for (let i = 0; i < count; i++) ka.matrices.push(Array.from({ length: n }, () => r.f32()));
  } else {
    for (let i = 0; i < flags; i++) {
      const frame = r.i16(), flag = r.i16();
      if (flag & 0b1000111111111111) throw new Error(`key frame flag ${flag}`);
      const has = (bit: number): boolean => ((flag >> 12) & bit) !== 0;
      const rotation = has(1) ? [r.f32(), r.f32(), r.f32(), r.f32()] as [number, number, number, number] : null;
      const scale = has(2) ? [r.f32(), r.f32(), r.f32()] as Vec3 : null;
      const translation = has(4) ? [r.f32(), r.f32(), r.f32()] as Vec3 : null;
      ka.frames.push({ frame, flag, rotation, scale, translation });
    }
  }
  return ka;
}

function readNode(r: Reader): XbfNode {
  const vertexCount = r.i32(), flags = r.i32(), faceCount = r.i32(), childCount = r.i32();
  const transform = Array.from({ length: 16 }, () => r.f64());
  const name = r.bytes(r.u32()).toString('latin1');
  const node: XbfNode = { name, transform, children: [], vertices: [], faces: [], rgb: null, smoothingGroups: null, vertexAnimation: null, keyAnimation: null };
  for (let i = 0; i < childCount; i++) node.children.push(readNode(r));
  for (let i = 0; i < vertexCount; i++) node.vertices.push({ position: [r.f32(), r.f32(), r.f32()], normal: [r.f32(), r.f32(), r.f32()] });
  for (let i = 0; i < faceCount; i++) {
    const vertices: [number, number, number] = [r.i32(), r.i32(), r.i32()];
    const texture = r.i32(), fflags = r.i32();
    const uv: Face['uv'] = [[r.f32(), r.f32()], [r.f32(), r.f32()], [r.f32(), r.f32()]];
    node.faces.push({ vertices, texture, flags: fflags, uv });
  }
  if (flags & FLAG.prelight) node.rgb = Array.from({ length: vertexCount }, () => [...r.bytes(3)] as [number, number, number]);
  if (flags & FLAG.smoothing) node.smoothingGroups = Array.from({ length: faceCount }, () => r.i32());
  if (flags & FLAG.vertexAnimation) node.vertexAnimation = readVertexAnimation(r);
  if (flags & FLAG.keyAnimation) node.keyAnimation = readKeyAnimation(r);
  return node;
}

function readXbf(buf: Buffer): XbfScene {
  if (buf.readInt32LE(buf.length - 4) !== -1) throw new Error('XBF does not end with -1');
  const r = new Reader(buf.subarray(0, buf.length - 4));
  const version = r.i32();
  const fx = Buffer.from(r.bytes(r.i32()));
  const texData = r.bytes(r.i32());
  // names separated by "\0\0" or "\0\x02" (xanlib Scene.textures): runs of printable characters
  const textures: string[] = [];
  let name = '';
  for (const b of texData) {
    if (b >= 0x20) name += String.fromCharCode(b);
    else if (name) { textures.push(name); name = ''; }
  }
  if (name) textures.push(name);
  const scene: XbfScene = { version, fx, textures, nodes: [], error: null };
  while (r.at < r.buf.length) {
    const start = r.at;
    try {
      scene.nodes.push(readNode(r));
    } catch (e) {
      scene.error = `node at ${start}: ${(e as Error).message}`;
      break;
    }
  }
  return scene;
}

/** Every node of the scene, depth first. */
function* allNodes(nodes: XbfNode[]): Generator<XbfNode> {
  for (const n of nodes) { yield n; yield* allNodes(n.children); }
}

/** Names of the animation tables in the FX data (extract_anim_info.py). */
export const ANIMATION_NAMES = [
  'Stationary', 'Idle 0', 'Idle 1', 'Move Start', 'Move Stop', 'Move', 'Turn Left', 'Turn Right',
  'Fire 0', 'Fire 1', 'Fire 2', 'Fire 3', 'Fire 4', 'Explode', 'Blow Up 1', 'Blow Up 2', 'Shot 1', 'Shot 2',
  'Burnt 1', 'Run Over 1', 'Gassed 1', 'Deployed Death 1', 'Deployed Death 2', 'Deploy Gun', 'Deploy Gun Hold',
  'Undeploy Gun', 'Deployed Idle 0', 'Deployed Fire', 'DeployedDeath0', 'Harv Unload Start', 'Harv Unload Hold',
  'Harv Unload End', 'Harv Eat Start', 'Harv Eat Hold', 'Harv Eat End', 'Repair Arms Out', 'Repair Arms Hold',
  'Repair Arms In', 'Sink', 'SinkHold', 'Surface', 'SinkMove', 'Move Special', 'StandToLayDown', 'LayDownToStand',
  'Lay Down', 'Crawl', 'Lay Down Fire', 'Crouch', 'CrouchFire', 'Construct', 'Deconstruct', 'Takeoff', 'Land',
  'Hover', 'Fly', 'FlyToHover', 'HoverToFly', 'StartPickup', 'Pickup', 'EndPickup', 'Enter Portal', 'Exit Portal',
  'Win', 'Leeched', 'Leech Death', 'Born', 'Refinery Pad 1', 'Refinery Pad 2', 'Sell',
] as const;

export interface AnimationRange { start: number; end: number; repeat: number; bodyPart: number }

/**
 * Animation name -> frame ranges, read from the whole file like extract_anim_info.py: the last
 * occurrence of "<name>\0" starts a record char[32] name, int32; then ranges of
 * int32 unknown, int32 repeat, int32 bodyPart, bool isLast, char[3], int32 start, int32 end.
 */
function readAnimations(file: Buffer): Map<string, AnimationRange[]> {
  const out = new Map<string, AnimationRange[]>();
  for (const name of ANIMATION_NAMES) {
    const at = file.lastIndexOf(Buffer.from(`${name}\0`, 'latin1'));
    if (at < 0) continue;
    let p = at + 36;
    const ranges: AnimationRange[] = [];
    for (let guard = 0; guard < 64 && p + 24 <= file.length; guard++) {
      const repeat = file.readInt32LE(p + 4), bodyPart = file.readInt32LE(p + 8), isLast = file[p + 12] !== 0;
      ranges.push({ start: file.readInt32LE(p + 16), end: file.readInt32LE(p + 20), repeat, bodyPart });
      p += 24;
      if (isLast) break;
    }
    out.set(name, ranges);
  }
  return out;
}

export { readXbf, allNodes, readAnimations };
