import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { real, str } from '../src/wc3/jass.ts';
import { jassFile } from '../src/config/paths.ts';

// Regression: line breaks were written as "|n", which only object data texts (tooltips) turn into a
// new line; DisplayTimedTextToPlayer showed it as is ("Атака: Shield Wall|nВерховный Командор…",
// HK_A02 capture 2026-10-08). JASS string literals take the escape \n.
test('line breaks in JASS strings are the \\n escape, never |n', () => {
  assert.strictEqual(str('a\nb\r\nc'), '"a\\nb\\nc"');
  for (const f of ['mission/start', 'movie/player']) assert.ok(!fs.readFileSync(jassFile(f), 'utf8').includes('|n'), f);
});

// Regression: real() rounded to one decimal, so the 1/25 s Emperor tick timer was emitted as
// TimerStart(..., 0.0, true, ...) and mission scripts ran thousands of times per second
// (debug report: 402809 ticks after ~70 s). Found 2026-10-07 by the in-game tick counter.
test('real() keeps sub-0.1 precision and always yields a JASS real literal', () => {
  assert.strictEqual(real(0.04), '0.04');
  assert.strictEqual(real(1 / 25), '0.04');
  assert.strictEqual(real(3), '3.0');
  assert.strictEqual(real(-1024), '-1024.0');
  assert.strictEqual(real(-0), '0.0');
  assert.strictEqual(real(12.3456789), '12.3457');
  assert.match(real(0.00001), /^\d+\.\d+$/); // never exponent notation
});
