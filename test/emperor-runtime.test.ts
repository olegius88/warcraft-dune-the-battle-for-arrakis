// The Emperor API runtime: bodies of EF_<Name> live in src/jass/runtime/api/<Name>.j.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { apiBodies, buildRuntime } from '../src/emperor/runtime.ts';
import { loadTokenTable } from '../src/emperor/tok.ts';
import { GAME_EXE } from '../src/config/paths.ts';

const opts = { skip: fs.existsSync(GAME_EXE) ? false : 'Emperor Game.exe not available' };

test('every runtime API file renders (all placeholders resolve)', () => {
  const bodies = apiBodies();
  assert.ok(bodies.size > 100, `only ${bodies.size} API bodies`);
  for (const [name, body] of bodies) {
    assert.doesNotMatch(body, /\{\{|\}\}/, `${name}: unrendered placeholder`);
    assert.doesNotMatch(body, /^ /, `${name}: the first indent must be dropped`);
  }
});

// A file whose name is not a function of the token table is never used, and the function it was
// meant for silently stays a TODO stub: catch misspelled file names.
test('every runtime API file names a function of the Game.exe token table', opts, () => {
  const table = loadTokenTable(GAME_EXE);
  const names = new Set(table.filter((e) => e.kind === 0).map((e) => e.name));
  const unknown = [...apiBodies().keys()].filter((n) => !names.has(n));
  assert.deepStrictEqual(unknown, []);
  const rt = buildRuntime(table);
  for (const n of apiBodies().keys()) assert.ok(!rt.stubbed.includes(n), `${n} stubbed`);
});

// Every function of the Emperor API has a body (no stub left). Script syntax that the
// token table lists as functions (int/obj/pos/if) gets no EF_ function at all.
test('every API function has a body', opts, () => {
  const rt = buildRuntime(loadTokenTable(GAME_EXE));
  assert.deepStrictEqual(rt.stubbed, []);
  assert.doesNotMatch(rt.functions, /function EF_(int|obj|pos|if) /);
});

// CameraStartRotate(speed, direction): Game.exe 1.09 (script id 0x69 -> 0x533250) keeps speed and
// direction; every camera update (0x532564) adds speed * pi / 180 to the yaw, or takes it off when the
// direction byte is 0. The scripts spin at speed 2 for exactly 180 ticks before CameraRestore
// (ATStart 250..430, ATP1M3SA 170..350, ...): 2 degrees a tick, one full turn. Ours spun 20 degrees a
// second (speed x CAMERA_SPIN_DEGREES 10, a guess) and turned the other way for direction 2, which
// Game.exe spins the same way as 1.
test('CameraStartRotate spins speed degrees a game tick; only direction 0 turns the other way', () => {
  const body = apiBodies().get('CameraStartRotate') ?? '';
  assert.match(body, /set EmpCamSpin = I2R\(a1\) \* 25\.0/);
  assert.match(body, /if a2 == 0 then\n\s+set EmpCamSpin = -EmpCamSpin/);
  assert.doesNotMatch(body, /a2 == 2/);
});
