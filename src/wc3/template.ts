// Tiny strict template engine for the JASS files in src/jass (and any other text template).
//
//   {{path}}            value at a dotted path of the scope (a.b.0 indexes arrays), as text
//   {{real path}}       number -> JASS real literal (src/wc3/jass.ts real())
//   {{str path}}        text -> JASS string literal (str())
//   {{#if path}}…{{/if}}, {{#if path}}…{{else}}…{{/if}}, {{#unless path}}…{{/unless}}  (nestable;
//                       a key that exists with the value undefined counts as false)
//
// Strict: an unknown path, an undefined value or an unbalanced block is an error, so a template and
// the code that fills it cannot drift apart silently.

import fs from 'node:fs';
import path from 'node:path';
import { real, str } from './jass.ts';

export type Scope = Readonly<Record<string, unknown>>;

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'value'; fmt: 'raw' | 'real' | 'str'; path: string }
  | { kind: 'if'; path: string; negate: boolean; yes: Node[]; no: Node[] };

const TAG = /\{\{([^{}]+)\}\}/g;

function parse(src: string, name: string): Node[] {
  const root: Node[] = [];
  const stack: Array<{ node: Extract<Node, { kind: 'if' }>; inElse: boolean; closer: string }> = [];
  const out = (): Node[] => {
    const top = stack[stack.length - 1];
    if (!top) return root;
    return top.inElse ? top.node.no : top.node.yes;
  };
  let last = 0;
  for (const m of src.matchAll(TAG)) {
    const at = m.index as number;
    if (at > last) out().push({ kind: 'text', text: src.slice(last, at) });
    last = at + m[0].length;
    const tag = (m[1] as string).trim();
    const words = tag.split(/\s+/);
    if (words[0] === '#if' || words[0] === '#unless') {
      if (words.length !== 2) throw new Error(`${name}: bad tag {{${tag}}}`);
      const node: Extract<Node, { kind: 'if' }> = { kind: 'if', path: words[1] as string, negate: words[0] === '#unless', yes: [], no: [] };
      out().push(node);
      stack.push({ node, inElse: false, closer: words[0] === '#if' ? '/if' : '/unless' });
    } else if (tag === 'else') {
      const top = stack[stack.length - 1];
      if (!top || top.inElse) throw new Error(`${name}: {{else}} without {{#if}}`);
      top.inElse = true;
    } else if (tag === '/if' || tag === '/unless') {
      const top = stack.pop();
      if (!top || top.closer !== tag) throw new Error(`${name}: unbalanced {{${tag}}}`);
    } else if (words.length === 2 && (words[0] === 'real' || words[0] === 'str')) {
      out().push({ kind: 'value', fmt: words[0], path: words[1] as string });
    } else if (words.length === 1) {
      out().push({ kind: 'value', fmt: 'raw', path: tag });
    } else {
      throw new Error(`${name}: bad tag {{${tag}}}`);
    }
  }
  if (stack.length) throw new Error(`${name}: unclosed {{#${stack[stack.length - 1]?.node.negate ? 'unless' : 'if'}}}`);
  if (last < src.length) out().push({ kind: 'text', text: src.slice(last) });
  return root;
}

function lookup(scope: Scope, p: string, name: string, allowUndefined = false): unknown {
  let v: unknown = scope;
  for (const part of p.split('.')) {
    if (v === null || typeof v !== 'object' || !(part in (v as object))) throw new Error(`${name}: unknown {{${p}}}`);
    v = (v as Record<string, unknown>)[part];
  }
  if (v === undefined && !allowUndefined) throw new Error(`${name}: {{${p}}} is undefined`);
  return v;
}

function emit(nodes: Node[], scope: Scope, name: string): string {
  let s = '';
  for (const n of nodes) {
    if (n.kind === 'text') s += n.text;
    else if (n.kind === 'value') {
      const v = lookup(scope, n.path, name);
      if (n.fmt === 'real') {
        if (typeof v !== 'number') throw new Error(`${name}: {{real ${n.path}}} is not a number`);
        s += real(v);
      } else if (n.fmt === 'str') {
        if (typeof v !== 'string') throw new Error(`${name}: {{str ${n.path}}} is not a string`);
        s += str(v);
      } else {
        if (typeof v === 'object' || typeof v === 'function') throw new Error(`${name}: {{${n.path}}} is not a plain value`);
        s += String(v);
      }
    } else {
      const v = lookup(scope, n.path, name, true); // a declared but undefined key is false
      s += emit(Boolean(v) !== n.negate ? n.yes : n.no, scope, name);
    }
  }
  return s;
}

/** Render a template text with a scope (name is used in error messages). */
function render(template: string, scope: Scope, name = 'template'): string {
  return emit(parse(template, name), scope, name);
}

const cache = new Map<string, string>();
/** Load a template file (CRLF -> LF; the one final newline of the file is not part of the template). */
function loadTemplate(file: string): string {
  let t = cache.get(file);
  if (t === undefined) {
    t = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
    cache.set(file, t);
  }
  return t;
}

/** Render a template file. */
function renderFile(file: string, scope: Scope): string {
  return render(loadTemplate(file), scope, path.basename(file));
}

export { render, renderFile, loadTemplate };
