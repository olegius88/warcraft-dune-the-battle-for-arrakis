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

// Every function of the Emperor API has a body except the listed ones. Script syntax that the
// token table lists as functions (int/obj/pos/if) gets no EF_ function at all.
test('only the known API functions are still stubs', opts, () => {
  const rt = buildRuntime(loadTokenTable(GAME_EXE));
  // TODO(reinforcements): SetReinforcements needs the Rules.txt reinforcement system
  assert.deepStrictEqual(rt.stubbed, ['SetReinforcements']);
  assert.doesNotMatch(rt.functions, /function EF_(int|obj|pos|if) /);
});
