// Defensive assembly points of an AI base (src/emperor/ai-points.ts, Game.exe 1.09 0x42b770) on small
// synthetic maps: Rules.txt terrain types 0 sand, 1 rock, 7 ramp.

import test from 'node:test';
import assert from 'node:assert';
import { defensivePoints, sector, step } from '../src/emperor/ai-points.ts';

test('direction sectors: 0 north, clockwise, cardinals 60 degrees, diagonals 30 (0x46c8d0)', () => {
  assert.deepStrictEqual([sector(0, -5), sector(5, -5), sector(5, 0), sector(5, 5), sector(0, 5), sector(-5, 5), sector(-5, 0), sector(-5, -5)], [0, 1, 2, 3, 4, 5, 6, 7]);
  // 20 degrees off north is still north; 50 is the diagonal
  assert.strictEqual(sector(Math.tan(20 * Math.PI / 180), -1), 0);
  assert.strictEqual(sector(Math.tan(50 * Math.PI / 180), -1), 1);
  // steps (0x42cba0): diagonals half the distance on each axis
  assert.deepStrictEqual(step(1, 12, [10, 10]), [16, 4]);
  assert.deepStrictEqual(step(6, 12, [10, 10]), [-2, 10]);
});

test('a plateau with one ramp east: point 1 is 12 tiles past it, the rest towards the enemy', () => {
  const W = 40, H = 40;
  const tiles = new Uint8Array(W * H);
  for (let y = 10; y <= 20; y++) for (let x = 10; x <= 20; x++) tiles[y * W + x] = 1;
  tiles[15 * W + 21] = 7;
  const pts = defensivePoints(tiles, W, H, 15, 15, 35, 35);
  assert.strictEqual(pts.length, 3);
  // the rock tile next to the ramp is (20, 15), east: 12 further is (32, 15)
  assert.deepStrictEqual(pts[0], [32, 15]);
  // no second ramp: the box side towards the enemy (south east), then 12 further, 6 from the edge
  assert.deepStrictEqual(pts[1], [27, 27]);
  assert.deepStrictEqual(pts[2], [27, 27]);
});

test('a base on sand has no ramps: every point is towards the enemy', () => {
  const W = 40, H = 40;
  const pts = defensivePoints(new Uint8Array(W * H), W, H, 20, 20, 20, 2);
  // north: 8 + 4 then 12 out from y 20 -> 20 - 12 = 8 clamped to 6 .. -> -4 clamped to 6
  assert.ok(pts.every(([x, y]) => x === 20 && y === 6), JSON.stringify(pts));
});
