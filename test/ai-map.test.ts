// The enemy AI's map (src/emperor/ai-map.ts): the static layer and the building cell masks Game.exe
// 1.09 builds its defence plan on (AiMap 0x433e50, Occupy masks 0x526e76).
import test from 'node:test';
import assert from 'node:assert';
import { aiMapRuns, occupyCells } from '../src/emperor/ai-map.ts';
import { AI_MAP } from '../src/config/battle.ts';

// terrain indices: 0 sand, 1 rock, 7 ramp
test('AI map: rock runs per row, ramp tops marked (rock next to a ramp, 4-neighbours)', () => {
  const W = 6, H = 3;
  const tiles = new Uint8Array([
    0, 1, 1, 1, 0, 0,
    1, 1, 7, 1, 1, 0,
    0, 0, 0, 1, 1, 1,
  ]);
  const top = AI_MAP.rock | AI_MAP.rampTop | AI_MAP.reserved;
  assert.deepStrictEqual(aiMapRuns(tiles, W, H), [
    [0, 1, 1, AI_MAP.rock], [0, 2, 2, top], [0, 3, 3, AI_MAP.rock],
    [1, 0, 0, AI_MAP.rock], [1, 1, 1, top], [1, 3, 3, top], [1, 4, 4, AI_MAP.rock],
    [2, 3, 5, AI_MAP.rock],
  ]);
});

test('AI map: Occupy letters b d p are the body, n s reserved cells, round the footprint centre', () => {
  // ATConYard (Rules.txt): 5 x 10
  const rows = ['sssss', 'sssss', 'sssss', 'nbbbn', 'nbbbn', 'bbbbb', 'bbbbb', 'bbbbb', 'bbbbb', 'nbbbb'];
  const c = occupyCells(rows);
  assert.deepStrictEqual([c.w, c.h], [5, 10]);
  assert.strictEqual(c.body.length, 3 * 2 + 5 * 4 + 4);
  assert.strictEqual(c.reserved.length, 15 + 2 * 2 + 1);
  // centre (2, 5): the top-left 's' is (-2, -5), the first body cell of row 3 is (-1, -2)
  assert.deepStrictEqual(c.reserved[0], [-2, -5]);
  assert.deepStrictEqual(c.body[0], [-1, -2]);
  assert.deepStrictEqual(occupyCells(['pd', 'bx']).body, [[-1, -1], [0, -1], [-1, 0]], 'unknown letters: nothing');
});
