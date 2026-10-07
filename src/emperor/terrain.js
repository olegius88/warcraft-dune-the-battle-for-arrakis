'use strict';
// Emperor map (test.xbf meta) -> Warcraft III terrain description for src/wc3/map.js.
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

const { PATH } = require('../wc3/formats');

const T = { SAND: 0, ROCK: 1, CLIFF: 2, NBROCK: 3, INFROCK: 4, DUSTBOWL: 5, MAPEDGE: 6, RAMP: 7 };

// Barrens tiles (TerrainArt/Terrain.slk ids); index = w3e ground texture slot.
const GROUND = ['Bdsr', 'Bdrh', 'Bflr', 'Bdrr', 'Bdsd', 'Bdrt'];
const TEX = { SAND: 0, ROCK: 1, CLIFF: 2, NBROCK: 3, DUST: 4, SPICE: 5 };
const MINIMAP = [[214, 170, 104], [120, 98, 80], [80, 66, 56], [140, 118, 96], [186, 140, 86], [205, 110, 40]];

const PLATEAU = 1.2; // in w3e "layers" (×128 world units)

function tileHeight(t) {
  switch (t) {
    case T.ROCK: case T.NBROCK: case T.INFROCK: return PLATEAU;
    case T.CLIFF: return PLATEAU * 0.6;
    case T.RAMP: return PLATEAU * 0.5;
    default: return 0;
  }
}

/**
 * @param {object} meta  result of mapxbf.readMeta
 * @returns {{width,height,boundary,offset:[number,number],tileset,ground,cliffs,corner,pathing,minimapColor,toWorld}}
 */
function buildTerrain(meta) {
  const [W, H] = meta.mapSize;
  const tiles = meta.tiles;
  const spice = meta.spice;
  const B = 4; // boundary cells on each side
  const pad = (n) => Math.ceil((n + 2 * B) / 32) * 32;
  const width = pad(W);
  const height = pad(H);
  const ox = Math.floor((width - W) / 2); // WC3 cell of Emperor tile x=0
  const oy = Math.floor((height - H) / 2); // WC3 cell row of Emperor bottom row
  const boundary = [ox, width - ox - W, oy, height - oy - H];

  const tileAt = (cx, cy) => { // WC3 cell -> Emperor tile type (or -1 outside)
    const tx = cx - ox;
    const ty = H - 1 - (cy - oy);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return -1;
    return tiles[ty * W + tx];
  };
  const spiceAt = (cx, cy) => {
    const tx = cx - ox;
    const ty = H - 1 - (cy - oy);
    if (!spice || tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
    return spice[ty * W + tx];
  };
  const texOf = (t, cx, cy) => {
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
  const corner = (x, y) => {
    let h = 0, n = 0, tex = TEX.SAND, best = -1;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const t = tileAt(x + dx, y + dy);
      if (t < 0) continue;
      h += tileHeight(t); n++;
      const tx = texOf(t, x + dx, y + dy);
      // prefer the "strongest" texture so cliffs/rock edges stay visible
      const rank = [0, 3, 4, 2, 1, 5][tx];
      if (rank > best) { best = rank; tex = tx; }
    }
    const outside = x < boundary[0] || x > width - boundary[1] || y < boundary[2] || y > height - boundary[3];
    return { texture: tex, height: n ? h / n : 0, layer: 2, cliff: 15, boundary: outside };
  };

  const pathing = (px, py) => {
    const cx = Math.floor(px / 4);
    const cy = Math.floor(py / 4);
    const t = tileAt(cx, cy);
    if (t < 0 || t === T.MAPEDGE) return PATH.UNKNOWN | PATH.NO_WATER | PATH.NO_BUILD | PATH.NO_FLY | PATH.NO_WALK;
    if (t === T.CLIFF) return PATH.NO_WATER | PATH.NO_WALK | PATH.NO_BUILD;
    // Emperor: only rock is buildable (sand needs concrete in Dune II; not in Emperor).
    if (t === T.ROCK) return PATH.NO_WATER;
    return PATH.NO_WATER | PATH.NO_BUILD;
  };

  const minimapColor = (cx, cy) => MINIMAP[texOf(tileAt(cx, cy), cx, cy)];

  /** Emperor world units (32 per tile, y down) -> WC3 world coordinates (centre origin). */
  const toWorld = (ex, ey) => {
    const cx = ox + ex / 32;
    const cy = oy + (H - ey / 32);
    return [(cx - width / 2) * 128, (cy - height / 2) * 128];
  };

  return { width, height, boundary, offset: [ox, oy], tileset: 'B', ground: GROUND, cliffs: ['CBde'], corner, pathing, minimapColor, toWorld };
}

module.exports = { buildTerrain, T };
