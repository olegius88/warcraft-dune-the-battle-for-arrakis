// The enemy AI's map of tiles (Game.exe 1.09 AiMap, config AI_MAP): its static layer from the map's
// terrain, and the cells of a building from its Rules.txt Occupy rows. The defence plan and the roads
// on it run at mission time (src/jass/battle/ai-map.j).

import { AI_MAP as M } from '../config/battle.ts';
import { T } from './terrain.ts';

/** Runs [y, x0, x1, value] of rock tiles (class 0, AI_MAP.rock) with the same value, row by row: a
 * rock tile next to a ramp (4-neighbours, 0x4369a0) is a ramp top, reserved too. Other tiles are class 2. */
function aiMapRuns(tiles: Uint8Array, W: number, H: number): Array<[number, number, number, number]> {
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? -1 : tiles[y * W + x] as number);
  const runs: Array<[number, number, number, number]> = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (at(x, y) !== T.ROCK) { x++; continue; }
      const value = (xx: number): number => ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(xx + (dx as number), y + (dy as number)) === T.RAMP) ? M.rock | M.rampTop | M.reserved : M.rock);
      const v = value(x);
      let x1 = x;
      while (x1 + 1 < W && at(x1 + 1, y) === T.ROCK && value(x1 + 1) === v) x1++;
      runs.push([y, x, x1, v]);
      x = x1 + 1;
    }
  }
  return runs;
}

/** Cells of a building by its Occupy rows (0x526e76): b d p its body (mask A: class 1), n s reserved
 * (masks B / C: 0x8); [dx, dy] from the footprint centre (floor(w / 2), floor(h / 2)), y down. Other
 * letters are nothing (Game.exe rejects the line). WC3 buildings do not turn: the rows as written. */
function occupyCells(rows: string[]): { w: number; h: number; body: Array<[number, number]>; reserved: Array<[number, number]> } {
  const w = Math.max(0, ...rows.map((r) => r.length)), h = rows.length;
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const body: Array<[number, number]> = [], reserved: Array<[number, number]> = [];
  rows.forEach((r, y) => [...r.toLowerCase()].forEach((c, x) => {
    if ('bdp'.includes(c)) body.push([x - cx, y - cy]);
    else if ('ns'.includes(c)) reserved.push([x - cx, y - cy]);
  }));
  return { w, h, body, reserved };
}

export { aiMapRuns, occupyCells };
