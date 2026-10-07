'use strict';
// Checks the reverse-engineered Emperor script format against the user's installed game.
// Skipped when the game or the extracted data (node src/emperor/extract.js) is absent.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadTokenTable, splitLines, decodeLine } = require('../src/emperor/tok');
const { loadContext } = require('../src/emperor/context');

const GAME = process.env.EMPEROR_DIR || 'G:\\Games\\Emperor';
const RAW = path.join(__dirname, '..', 'data', 'emperor', 'raw');
const have = fs.existsSync(path.join(GAME, 'Game.exe')) && fs.existsSync(path.join(RAW, 'Rules.txt'));
const opts = { skip: have ? false : 'Emperor game/data not available' };

const scripts = () => fs.readdirSync(RAW).filter((f) => /\.tok$/i.test(f) && f !== 'header.tok');

test('token table from Game.exe: 181 entries with the expected keywords', opts, () => {
  const t = loadTokenTable(path.join(GAME, 'Game.exe'));
  assert.strictEqual(t.length, 181);
  assert.strictEqual(t[0].name, 'ModelTick');
  assert.strictEqual(t[0xa5].name, 'if');
  assert.strictEqual(t[0xa7].name, 'endif');
  assert.strictEqual(t[0xb4].name, '=');
  assert.strictEqual(t[0x15].name, 'NewObject');
  assert.strictEqual(t[0x15].argCount, 3);
});

test('every script decodes; line count equals header field; parentheses balance', opts, () => {
  let n = 0;
  for (const f of scripts()) {
    const tok = fs.readFileSync(path.join(RAW, f));
    const lines = splitLines(tok);
    assert.strictEqual(lines.length, tok.readUInt32LE(4), `${f}: line count`);
    for (const l of lines) {
      let depth = 0;
      for (const it of decodeLine(l)) if (it.t === 'text') for (const ch of it.v) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
      assert.strictEqual(depth, 0, `${f}: unbalanced line`);
    }
    n++;
  }
  assert.ok(n >= 228, `expected all mission scripts, got ${n}`);
});

test('object type ids resolve to the right categories in context', opts, () => {
  const t = loadTokenTable(path.join(GAME, 'Game.exe'));
  const ctx = loadContext(RAW);
  const seen = { BuildObject: new Set(), Delivery: new Set(), ObjectDetonate: new Set() };
  for (const f of scripts()) {
    for (const l of splitLines(fs.readFileSync(path.join(RAW, f)))) {
      let fn = null;
      for (const it of decodeLine(l)) {
        if (it.t === 'tok' && t[it.id].kind === 0) fn = t[it.id].name;
        if (it.t === 'type' && seen[fn]) seen[fn].add(ctx.objectTypes[it.n].category);
      }
    }
  }
  assert.deepStrictEqual([...seen.BuildObject], ['Unit']);
  assert.deepStrictEqual([...seen.Delivery], ['Unit']);
  assert.ok([...seen.ObjectDetonate].includes('Bullet'));
});

test('message table: house blocks start at 0 / 1391 / 1847 and every id resolves', opts, () => {
  const ctx = loadContext(RAW);
  assert.strictEqual(ctx.messages[0].key, 'Test1'); // the Atreides file starts with test keys
  assert.match(ctx.messages[501].key, /^AT/i); // last Atreides entry
  assert.match(ctx.messages[502].key, /^AT/i); // first E_Output_Pickup entry
  assert.match(ctx.messages[1391].key, /^HK/i);
  assert.match(ctx.messages[1847].key, /^OR/i);
  for (const f of scripts()) {
    for (const l of splitLines(fs.readFileSync(path.join(RAW, f)))) {
      for (const it of decodeLine(l)) {
        if (it.t === 'msg') assert.ok(ctx.messageKey(it.n), `${f}: message ${it.n}`);
        if (it.t === 'tip') assert.ok(ctx.tooltipKey(it.n), `${f}: tooltip ${it.n}`);
      }
    }
  }
});
