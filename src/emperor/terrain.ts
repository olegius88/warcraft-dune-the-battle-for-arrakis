// Emperor map (test.xbf meta) -> Warcraft III terrain description for src/wc3/map.ts.
//
// Scale: 1 Emperor tile (32 world units) = 1 WC3 cell (128 units). Emperor row 0 is the top
// edge; WC3 y grows upwards, so rows are flipped. The Emperor map is placed inside a WC3 map
// padded to a multiple of 32 cells with the required boundary around it.
//
// Height is derived from tile types (Rules.txt [TerrainTypes]: Sand, Rock, Cliff, NBRock,
// InfRock, DustBowl, MapEdge, Ramp): rock plateaus are raised, cliff tiles become steep
// unwalkable slopes, ramps are half way. No WC3 cliff levels are used (they need exact ramp
// shapes); pathing comes from our wpm.
// TODO(terrain-height): test.CPF (u16 per tile, 256 stride) looks like height with noise but is
// unverified; plateau heights are uniform for now.

import { PATH } from '../wc3/formats.ts';
import type { Boundary, Corner } from '../wc3/formats.ts';
import type { Rgb } from '../wc3/blp.ts';
import type { MapMeta } from './mapxbf.ts';

const T = { SAND: 0, ROCK: 1, CLIFF: 2, NBROCK: 3, INFROCK: 4, DUSTBOWL: 5, MAPEDGE: 6, RAMP: 7 } as const;

// Barrens tiles (TerrainArt/Terrain.slk ids); index = w3e ground texture slot.
const GROUND = ['Bdsr', 'Bdrh', 'Bflr', 'Bdrr', 'Bdsd', 'Bdrt'];
const TEX = { SAND: 0, ROCK: 1, CLIFF: 2, NBROCK: 3, DUST: 4, SPICE: 5 } as const;
const MINIMAP: Rgb[] = [[214, 170, 104], [120, 98, 80], [80, 66, 56], [140, 118, 96], [186, 140, 86], [205, 110, 40]];

const PLATEAU = 1.2; // in w3e "layers" (×128 world units)

/** WC3 terrain built from an Emperor map; also maps Emperor coordinates to WC3 ones. */
export interface EmperorTerrain {
  /** WC3 cells */
  width: number;
  height: number;
  boundary: Boundary;
  /** WC3 cell of Emperor tile x=0 / of the Emperor bottom row */
  offset: [number, number];
  tileset: string;
  ground: string[];
  cliffs: string[];
  corner: (x: number, y: number) => Corner;
  pathing: (px: number, py: number) => number;
  minimapColor: (cx: number, cy: number) => Rgb;
  /** Emperor world units (32 per tile, y down) -> WC3 world coordinates (centre origin) */
  toWorld: (ex: number, ey: number) => [number, number];
}

function tileHeight(t: number): number {
  switch (t) {
    case T.ROCK: case T.NBROCK: case T.INFROCK: return PLATEAU;
    case T.CLIFF: return PLATEAU * 0.6;
    case T.RAMP: return PLATEAU * 0.5;
    default: return 0;
  }
}

/** meta: result of mapxbf.readMeta (needs mapSize and tiles). */
function buildTerrain(meta: MapMeta): EmperorTerrain {
  if (!meta.mapSize || !meta.tiles) throw new Error('map meta without MapSize/Tiles');
  const [W, H] = meta.mapSize;
  const tiles = meta.tiles;
  const spice = meta.spice;
  const B = 4; // boundary cells on each side
  const pad = (n: number): number => Math.ceil((n + 2 * B) / 32) * 32;
  const width = pad(W);
  const height = pad(H);
  const ox = Math.floor((width - W) / 2); // WC3 cell of Emperor tile x=0
  const oy = Math.floor((height - H) / 2); // WC3 cell row of Emperor bottom row
  const boundary: Boundary = [ox, width - ox - W, oy, height - oy - H];

  const tileAt = (cx: number, cy: number): number => { // WC3 cell -> Emperor tile type (or -1 outside)
    const tx = cx - ox;
    const ty = H - 1 - (cy - oy);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return -1;
    return tiles[ty * W + tx] as number;
  };
  const spiceAt = (cx: number, cy: number): number => {
    const tx = cx - ox;
    const ty = H - 1 - (cy - oy);
    if (!spice || tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
    return spice[ty * W + tx] as number;
  };
  const texOf = (t: number, cx: number, cy: number): number => {
    if (t < 0 || t === T.MAPEDGE) return TEX.SAND;
    if (spiceAt(cx, cy) > 0 && (t === T.SAND || t === T.DUSTBOWL)) return TEX.SPICE;
    switch (t) {
      case T.ROCK: case T.INFROCK: return TEX.ROCK;
      case T.CLIFF: return TEX.CLIFF;
      case T.NBROCK: case T.RAMP: return TEX.NBROCK;
      case T.DUSTBOWL: return TEX.DUST;
      default: return TEX.SAND;
    }
  };

  // Corner (x, y) is shared by cells (x-1..x, y-1..y).
  const NEIGHBOURS: Array<[number, number]> = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
  const RANK = [0, 3, 4, 2, 1, 5];
  const corner = (x: number, y: number): Corner => {
    let h = 0, n = 0, tex: number = TEX.SAND, best = -1;
    for (const [dx, dy] of NEIGHBOURS) {
      const t = tileAt(x + dx, y + dy);
      if (t < 0) continue;
      h += tileHeight(t); n++;
      const tx = texOf(t, x + dx, y + dy);
      // prefer the "strongest" texture so cliffs/rock edges stay visible
      const rank = RANK[tx] as number;
      if (rank > best) { best = rank; tex = tx; }
    }
    const outside = x < boundary[0] || x > width - boundary[1] || y < boundary[2] || y > height - boundary[3];
    return { texture: tex, height: n ? h / n : 0, layer: 2, cliff: 15, boundary: outside };
  };

  const pathing = (px: number, py: number): number => {
    const cx = Math.floor(px / 4);
    const cy = Math.floor(py / 4);
    const t = tileAt(cx, cy);
    if (t < 0 || t === T.MAPEDGE) return PATH.UNKNOWN | PATH.NO_WATER | PATH.NO_BUILD | PATH.NO_FLY | PATH.NO_WALK;
    if (t === T.CLIFF) return PATH.NO_WATER | PATH.NO_WALK | PATH.NO_BUILD;
    // Emperor: only rock is buildable (sand needs concrete in Dune II; not in Emperor).
    if (t === T.ROCK) return PATH.NO_WATER;
    return PATH.NO_WATER | PATH.NO_BUILD;
  };

  const minimapColor = (cx: number, cy: number): Rgb => MINIMAP[texOf(tileAt(cx, cy), cx, cy)] as Rgb;

  /** Emperor world units (32 per tile, y down) -> WC3 world coordinates (centre origin). */
  const toWorld = (ex: number, ey: number): [number, number] => {
    const cx = ox + ex / 32;
    const cy = oy + (H - ey / 32);
    return [(cx - width / 2) * 128, (cy - height / 2) * 128];
  };

  return { width, height, boundary, offset: [ox, oy], tileset: 'B', ground: GROUND, cliffs: ['CBde'], corner, pathing, minimapColor, toWorld };
}

export { buildTerrain, T };
