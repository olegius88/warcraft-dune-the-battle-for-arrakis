// Meta section of an Emperor map's test.xbf (before the terrain mesh).
// Layout: int32 version (1), int32 metaEnd, then TLV records until metaEnd:
//   uint32 tag (0xA00000xx), uint32 length, payload.
// Tag ids and the MapSize/Tiles/Spice/Buildings/SpiceMound layouts follow OpenEBfD
// converters/xbf/map_xbf.gd (https://github.com/Akiyamka/OpenEBfD, used as a format reference).
// GameElements (0x05) is decoded here (see parseGameElements).

import fs from 'node:fs';

const TAG = { ZONES: 0x01, MAP_SIZE: 0x02, TILES: 0x03, SPICE: 0x04, GAME_ELEMENTS: 0x05, BUILDINGS: 0x07, SPICE_MOUND: 0x09, UNKNOWN_0A: 0x0A, TIMESTAMP: 0x0B };

function readMeta(fileOrBuffer) {
  const b = Buffer.isBuffer(fileOrBuffer) ? fileOrBuffer : fs.readFileSync(fileOrBuffer);
  const version = b.readInt32LE(0);
  if (version !== 1) throw new Error(`unsupported map xbf version ${version}`);
  const metaEnd = b.readInt32LE(4);
  const records = [];
  for (let o = 8; o < metaEnd;) {
    const tag = b.readUInt32LE(o);
    const length = b.readUInt32LE(o + 4);
    if (((tag & 0xFFFFFF00) >>> 0) !== 0xA0000000) throw new Error(`bad TLV tag 0x${tag.toString(16)} at ${o}`);
    records.push({ id: tag & 0xFF, offset: o + 8, length, payload: b.subarray(o + 8, o + 8 + length) });
    o += 8 + length;
  }
  const get = (id) => records.find((r) => r.id === id);
  const out = { version, metaEnd, records };
  const size = get(TAG.MAP_SIZE);
  if (size) out.mapSize = [size.payload.readInt32LE(0), size.payload.readInt32LE(4)];
  const tiles = get(TAG.TILES);
  if (tiles) out.tiles = tiles.payload;
  const spice = get(TAG.SPICE);
  if (spice) out.spice = spice.payload;
  const mounds = get(TAG.SPICE_MOUND);
  if (mounds) {
    out.spiceMounds = [];
    for (let i = 0; i + 8 <= mounds.length; i += 8) out.spiceMounds.push([mounds.payload.readInt32LE(i), mounds.payload.readInt32LE(i + 4)]);
  }
  const bld = get(TAG.BUILDINGS);
  if (bld) out.buildings = parseBuildings(bld.payload);
  const ge = get(TAG.GAME_ELEMENTS);
  if (ge) out.gameElements = parseGameElements(ge.payload);
  return out;
}

/**
 * GameElements (0x05), decoded 2026-10-07: a two-level tree of named point lists — the points
 * scripts ask for with GetSideBasePoint / GetScriptPoint / GetEntrancePoint / ...
 *   int32 groupCount; group: char name[20], int32 subCount;
 *   sub: char name[20], int32 pointCount; point: int32 tag, float64 x, float64 y.
 * Name fields are NUL-terminated with uninitialised bytes after the NUL.
 * Returns { [group]: { [sub]: [{tag, x, y}] } } (x/y in map world units).
 */
function parseGameElements(p) {
  let c = 0;
  const name = () => { const raw = p.subarray(c, c + 20); c += 20; const z = raw.indexOf(0); return raw.subarray(0, z < 0 ? 20 : z).toString('latin1'); };
  const i32 = () => { const v = p.readInt32LE(c); c += 4; return v; };
  const f64 = () => { const v = p.readDoubleLE(c); c += 8; return v; };
  const groups = {};
  const groupCount = i32();
  for (let g = 0; g < groupCount; g++) {
    const gname = name();
    const subs = {};
    const subCount = i32();
    for (let s = 0; s < subCount; s++) {
      const sname = name();
      const pts = [];
      const n = i32();
      for (let k = 0; k < n; k++) pts.push({ tag: i32(), x: f64(), y: f64() });
      subs[sname] = pts;
    }
    groups[gname] = subs;
  }
  // A second, point-less tree follows (zone names such as Route/Storyline, AI_Zone/Cliff/Valley).
  // Parsed as nested "name[20], int32 childCount, children"; kept raw if that does not fit.
  // TODO(map-zones): meaning of this tree not established; scripts may reference these zones.
  const zonesStart = c;
  const node = () => ({ name: name(), children: list() });
  const list = () => { const n = i32(); if (n < 0 || n > 64) throw new Error('bad zone count'); const a = []; for (let k = 0; k < n; k++) a.push(node()); return a; };
  let zones = null;
  try { zones = []; while (c < p.length) zones.push(...list()); } catch (e) { zones = { raw: p.subarray(zonesStart) }; }
  Object.defineProperty(groups, '$zones', { value: zones, enumerable: false });
  return groups;
}

function parseBuildings(p) {
  const count = p.readUInt32LE(0);
  const list = [];
  let c = 4;
  for (let i = 0; i < count; i++) {
    const end = p.indexOf(0, c);
    const name = p.subarray(c, end).toString('latin1');
    c = end + 1;
    list.push({ name, x: p.readInt16LE(c), owner: p.readInt16LE(c + 2), y: p.readInt16LE(c + 4) });
    c += 12;
  }
  return list;
}

export { readMeta, TAG };
