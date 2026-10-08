// Defensive assembly points ("D AP") of an AI base, as Game.exe 1.09 places them (config AI_DEF_POINT):
// the ramps of the rock the base stands on, found by direction, then a stretch further out.
//
// Traced: the AI grid class 2 is a tile no building may use (0x433e50: the first building type's
// terrain mask, HKSmWindtrap "Terrain = Rock", tile flags 1 << Rules.txt [TerrainTypes] index); the
// ramp search (0x437750) floods the rest from the base tile and keeps tiles marked next to a ramp tile
// (0x4369a0, flag 0x80 = 1 << Ramp); the direction sectors (0x46c8d0), the steps (0x42cba0), the edge
// clamp (0x46ca50). Approximations (TODO(ai) in src/jass/battle/forces.j): the flood order (Game.exe
// scans lines, 0x437810; here breadth first), the first part of 0x4369a0, "made reachable" (0x46b2f0;
// here the nearest tile that is no cliff or map edge), the cluster box (the base +- boxTiles) and the
// enemy direction (0x439cf0's zone; here the given point).

import { AI_DEF_POINT as P } from '../config/battle.ts';

/** Rules.txt [TerrainTypes] order (format). */
const T = { ROCK: 1, CLIFF: 2, MAPEDGE: 6, RAMP: 7 } as const;

/** Direction sector of (dx, dy) tiles, y down: 0 north, clockwise (0x46c8d0). */
function sector(dx: number, dy: number): number {
  let a = Math.atan2(dx, -dy) * 180 / Math.PI;
  if (a < 0) a += 360;
  const s = P.sectors;
  for (let i = 0; i < s.length - 1; i++) if (a > (s[i] as number) && a <= (s[i + 1] as number)) return i + 1;
  return 0;
}

/** d tiles in direction dir (0x42cba0: diagonals d / 2 on each axis). */
function step(dir: number, d: number, [x, y]: [number, number]): [number, number] {
  const h = Math.trunc(d / 2);
  const dx = [0, h, d, h, 0, -h, -d, -h][dir] as number;
  const dy = [-d, -h, 0, h, d, h, 0, -h][dir] as number;
  return [x + dx, y + dy];
}

/**
 * Up to AI_DEF_POINT.count defensive points (tile x, y) of a base at tile (bx, by) on a W x H map of
 * Rules.txt terrain types, the enemy at tile (ex, ey).
 */
function defensivePoints(tiles: Uint8Array, W: number, H: number, bx: number, by: number, ex: number, ey: number): Array<[number, number]> {
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? T.MAPEDGE : tiles[y * W + x] as number);
  // the base's rock (0x437750), the tiles next to a ramp tile kept in flood order
  const seen = new Uint8Array(W * H);
  const ramps: Array<[number, number]> = [];
  const queue: Array<[number, number]> = [];
  if (at(bx, by) === T.ROCK) { queue.push([bx, by]); seen[by * W + bx] = 1; }
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q] as [number, number];
    const near: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    if (near.some(([nx, ny]) => at(nx, ny) === T.RAMP)) ramps.push([x, y]);
    for (const [nx, ny] of near) {
      if (at(nx, ny) !== T.ROCK || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  // the first ramp of each direction
  const byDir: Array<[number, number] | null> = Array.from({ length: 8 }, () => null);
  for (const r of ramps) { const d = sector(r[0] - bx, r[1] - by); if (!byDir[d]) byDir[d] = r; }
  const dirs = byDir.map((r, d) => (r ? d : -1)).filter((d) => d >= 0);
  const clamp = ([x, y]: [number, number]): [number, number] => [Math.min(Math.max(x, P.edge), W - 1 - P.edge), Math.min(Math.max(y, P.edge), H - 1 - P.edge)];
  // made reachable (0x46b2f0, not traced): the nearest tile that is no cliff or map edge
  const reachable = ([x, y]: [number, number]): [number, number] => {
    for (let r = 0; r < Math.max(W, H); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = at(x + dx, y + dy);
        if (t !== T.CLIFF && t !== T.MAPEDGE) return [x + dx, y + dy];
      }
    }
    return [x, y];
  };
  const inside = ([x, y]: [number, number]): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const toEnemy = sector(ex - bx, ey - by);
  const out: Array<[number, number]> = [];
  for (let k = 0; k < P.count; k++) {
    const d = dirs[k];
    let p: [number, number];
    if (d === undefined) {
      // no k-th ramp: the cluster box side towards the enemy, then out (0x42bb20, 0x42cba0)
      p = step(toEnemy, P.out, clamp(step(toEnemy, P.boxTiles + P.boxOut, [bx, by])));
    } else {
      // the ramp, out that way; a step off the map turns clockwise (0x42b8b2)
      const ramp = byDir[d] as [number, number];
      let dir = d;
      p = step(dir, P.out, ramp);
      for (let i = 0; i < 8 && !inside(p); i++) { dir = (dir + 1) % 8; p = step(dir, P.out, ramp); }
    }
    out.push(reachable(clamp(p)));
  }
  return out;
}

export { defensivePoints, sector, step };
