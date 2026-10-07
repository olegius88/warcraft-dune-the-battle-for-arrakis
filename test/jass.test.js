'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { real } = require('../src/wc3/jass');

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
