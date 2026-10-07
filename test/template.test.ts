// The strict text template engine used for the JASS files (src/wc3/template.ts).

import test from 'node:test';
import assert from 'node:assert';
import { render } from '../src/wc3/template.ts';

test('values, formats and dotted/indexed paths', () => {
  const scope = { n: 3, RT: { TICK: 0.25, NAME: 'a\\b' }, list: [7, 8] };
  assert.strictEqual(render('x={{n}} t={{real RT.TICK}} s={{str RT.NAME}} i={{list.1}}', scope), 'x=3 t=0.25 s="a\\\\b" i=8');
  assert.strictEqual(render('{{real n}}', scope), '3.0');
});

test('if / else / unless, nested', () => {
  const t = 'a{{#if f}}T{{#unless g}}u{{/unless}}{{else}}E{{/if}}b';
  assert.strictEqual(render(t, { f: true, g: false }), 'aTub');
  assert.strictEqual(render(t, { f: true, g: true }), 'aTb');
  assert.strictEqual(render(t, { f: '', g: true }), 'aEb');
});

test('strict: unknown paths, undefined values, wrong types and unbalanced blocks are errors', () => {
  assert.throws(() => render('{{missing}}', {}), /unknown \{\{missing\}\}/);
  assert.throws(() => render('{{a.b}}', { a: {} }), /unknown/);
  assert.throws(() => render('{{a}}', { a: undefined }), /undefined/);
  assert.throws(() => render('{{real a}}', { a: 'x' }), /not a number/);
  assert.throws(() => render('{{a}}', { a: { b: 1 } }), /not a plain value/);
  assert.throws(() => render('{{#if a}}x', { a: true }), /unclosed/);
  assert.throws(() => render('x{{/if}}', {}), /unbalanced/);
  assert.throws(() => render('{{#if a}}x{{/unless}}', { a: 1 }), /unbalanced/);
});

test('conditions: a declared undefined key is false, an absent key is an error', () => {
  assert.strictEqual(render('{{#if a.b}}x{{else}}y{{/if}}', { a: { b: undefined } }), 'y');
  assert.throws(() => render('{{#if a.c}}x{{/if}}', { a: {} }), /unknown/);
});
