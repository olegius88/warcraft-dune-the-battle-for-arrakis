// Emperor mission script (*.tok) -> JASS. The script becomes one function that the runtime
// (src/emperor/runtime/emperor.j) calls once per Emperor tick; every Emperor API call becomes
// a call to EF_<Name> implemented by the runtime.
//
// Types: int -> integer (bools are 0/1 integers, as in Emperor), obj -> unit, pos -> location.
// Comparisons yield JASS booleans; && / || / if() coerce integers with "!= 0".

import { splitLines, decodeLine } from './tok.ts';

const RET = { 0: 'int', 1: 'pos', 2: 'obj', 8: 'void' };
// Signature overrides shared with runtime.js (original scripts use these results although the
// token table declares them void: "v0 = ObjectChange(...)").
const RETURN_OVERRIDE = { ObjectChange: 2, ObjectInfect: 2 };
const ARG = (code) => (code === 1 ? 'pos' : code === 2 ? 'obj' : 'int');
const JASS_TYPE = { int: 'integer', obj: 'unit', pos: 'location' };
const NULL = { int: '0', obj: 'null', pos: 'null' };

/** Split decoded line items into lexical tokens. */
function lex(items) {
  const out = [];
  for (const it of items) {
    if (it.t !== 'text') { out.push(it); continue; }
    for (const m of it.v.matchAll(/\s*(\d+|[(),]|[^\s\d(),]+)/g)) {
      const s = m[1];
      if (/^\d+$/.test(s)) out.push({ t: 'num', v: Number(s) });
      else out.push({ t: 'punct', v: s });
    }
  }
  return out;
}

class Translator {
  constructor(table, ctx) {
    this.table = table;
    this.ctx = ctx; // { rawcode(typeIndex) -> 'x006', msg(n) -> id, tip(n) -> id }
    this.vars = new Map(); // n -> type
    this.used = new Set(); // EF_ functions referenced
    this.messages = new Set();
    this.tooltips = new Set();
  }

  varName(n) { return `${this.ctx.varPrefix || "ev"}${n}`; }

  // ---- expression parser (precedence: || < && < comparison < + - < primary) ----
  parseExpr(ts) { return this.parseOr(ts); }

  parseOr(ts) {
    let l = this.parseAnd(ts);
    while (this.isOp(ts, '||')) { ts.i++; const r = this.parseAnd(ts); l = { code: `(${this.asBool(l)} or ${this.asBool(r)})`, type: 'bool' }; }
    return l;
  }

  parseAnd(ts) {
    let l = this.parseCmp(ts);
    while (this.isOp(ts, '&&')) { ts.i++; const r = this.parseCmp(ts); l = { code: `(${this.asBool(l)} and ${this.asBool(r)})`, type: 'bool' }; }
    return l;
  }

  parseCmp(ts) {
    let l = this.parseAdd(ts);
    for (;;) {
      let op = ['==', '!=', '>=', '<=', '>', '<', '='].find((o) => this.isOp(ts, o));
      if (!op) return l;
      ts.i++;
      // Original-script bug (ATP3D10FR): "(v3 = TRUE)" inside a condition means a comparison.
      if (op === '=') op = '==';
      const r = this.parseAdd(ts);
      // comparing a bool with TRUE/FALSE or an int: normalise both sides to int
      const a = l.type === 'bool' ? this.asInt(l) : l.code;
      const b = r.type === 'bool' ? this.asInt(r) : r.code;
      l = { code: `(${a} ${op} ${b})`, type: 'bool', left: l };
    }
  }

  parseAdd(ts) {
    let l = this.parsePrimary(ts);
    for (;;) {
      const op = ['+', '-'].find((o) => this.isOp(ts, o));
      if (!op) return l;
      ts.i++;
      const r = this.parsePrimary(ts);
      l = { code: `(${this.asInt(l)} ${op} ${this.asInt(r)})`, type: 'int' };
    }
  }

  parsePrimary(ts) {
    const tk = ts.list[ts.i++];
    if (!tk) throw new Error('unexpected end of expression');
    switch (tk.t) {
      case 'num': return { code: String(tk.v), type: 'int' };
      case 'var':
        // Original-script bug (ATENDMission): "v5()" — a variable written like a call.
        if (ts.list[ts.i] && ts.list[ts.i].v === '(' && ts.list[ts.i + 1] && ts.list[ts.i + 1].v === ')') ts.i += 2;
        return { code: this.varName(tk.n), type: this.vars.get(tk.n) || 'int' };
      case 'type': return { code: `'${this.ctx.rawcode(tk.n)}'`, type: 'int' };
      case 'msg': this.messages.add(tk.n); return { code: String(tk.n), type: 'int' };
      case 'tip': this.tooltips.add(tk.n); return { code: String(tk.n), type: 'int' };
      case 'snd': return { code: String(tk.n), type: 'int' };
      case 'punct':
        if (tk.v === '(') { const e = this.parseExpr(ts); this.expect(ts, ')'); return e; }
        throw new Error(`unexpected '${tk.v}'`);
      case 'tok': {
        const e = this.table[tk.id];
        if (e.name === 'TRUE') return { code: '1', type: 'int' };
        if (e.name === 'FALSE') return { code: '0', type: 'int' };
        if (e.kind !== 0) throw new Error(`unexpected ${e.name}`);
        return this.parseCall(e, ts);
      }
      default: throw new Error(`bad token ${tk.t}`);
    }
  }

  parseCall(e, ts) {
    const args = [];
    if (ts.list[ts.i] && ts.list[ts.i].t === 'punct' && ts.list[ts.i].v === '(') {
      ts.i++;
      if (!(ts.list[ts.i] && ts.list[ts.i].t === 'punct' && ts.list[ts.i].v === ')')) {
        for (;;) {
          args.push(this.parseExpr(ts));
          if (ts.list[ts.i] && ts.list[ts.i].t === 'punct' && ts.list[ts.i].v === ',') { ts.i++; continue; }
          break;
        }
      }
      this.expect(ts, ')');
    }
    this.used.add(e.name);
    // Variadic functions (Delivery, AirStrike: argCount 10 with trailing objtype list) get
    // their arguments padded with -1 so the runtime has one fixed signature.
    const want = Math.min(e.argCount, 10);
    const coded = args.map((a, i) => this.coerce(a, ARG(e.argTypes[i] != null ? e.argTypes[i] : 0)));
    while (coded.length < want) coded.push(ARG(e.argTypes[coded.length] || 0) === 'int' ? '-1' : 'null');
    if (coded.length > want) throw new Error(`${e.name}: ${coded.length} args, expected ${want}`);
    const rt = RETURN_OVERRIDE[e.name] != null ? RETURN_OVERRIDE[e.name] : e.returnType;
    return { code: `EF_${e.name}(${coded.join(', ')})`, type: RET[rt] || 'int' };
  }

  coerce(x, want) {
    if (want === 'int') return x.type === 'bool' ? this.asInt(x) : x.code;
    // Original-script bug (ORP1D5FR): "SideNearToPoint(v1, GetEntrancePoint(..) == TRUE)" —
    // a comparison where a pos/obj argument belongs; the left operand is the intended value.
    if (x.type === 'bool' && x.left && x.left.type === want) return x.left.code;
    return x.code;
  }

  asBool(x) { return x.type === 'bool' ? x.code : `(${x.code} != 0)`; }

  asInt(x) { return x.type === 'bool' ? `EF_B2I(${x.code})` : x.code; }

  isOp(ts, op) {
    const tk = ts.list[ts.i];
    return tk && tk.t === 'tok' && this.table[tk.id].name === op;
  }

  expect(ts, p) {
    const tk = ts.list[ts.i++];
    if (!tk || tk.t !== 'punct' || tk.v !== p) throw new Error(`expected '${p}'`);
  }

  // ---- statements ----
  translateLine(tokens) {
    if (!tokens.length) return null;
    const first = tokens[0];
    const name = first.t === 'tok' ? this.table[first.id].name : null;
    const ts = { list: tokens, i: 0 };
    if (name === 'int' || name === 'obj' || name === 'pos') {
      // declaration: type ( var )
      const v = tokens.find((x) => x.t === 'var');
      this.vars.set(v.n, name);
      return null;
    }
    if (name === 'if') {
      ts.i = 1;
      const c = this.parseExpr(ts);
      return { kind: 'if', code: `if ${this.asBool(c)} then` };
    }
    if (name === 'else') return { kind: 'else', code: 'else' };
    if (name === 'endif') return { kind: 'endif', code: 'endif' };
    if (first.t === 'var' && tokens[1] && tokens[1].t === 'tok' && this.table[tokens[1].id].name === '=') {
      ts.i = 2;
      const t = this.vars.get(first.n) || 'int';
      const e = this.parseExpr(ts);
      if (ts.i !== tokens.length) throw new Error('trailing tokens after assignment');
      return { kind: 'stmt', code: `set ${this.varName(first.n)} = ${t === 'int' ? this.asInt(e) : e.code}` };
    }
    if (first.t === 'var') {
      // Original-script bug (ATP3M5TL, ORP1M1FR): a bare comparison like "v17 == TRUE" as a
      // statement. It has no effect in the original either; keep it visible as a comment.
      const e = this.parseExpr(ts);
      return { kind: 'stmt', code: `// no-op in original script: ${e.code}` };
    }
    if (name && this.table[first.id].kind === 0) {
      const e = this.parseExpr(ts);
      if (ts.i !== tokens.length) throw new Error('trailing tokens after call');
      // JASS needs "call" for statements; non-void results are discarded the same way.
      return { kind: 'stmt', code: `call ${e.code}` };
    }
    throw new Error(`cannot translate line starting with ${first.t}:${name || first.v}`);
  }
}

/**
 * @returns {{ globals: string, body: string, used: Set<string>, messages: Set<number>, tooltips: Set<number> }}
 */
function translateScript(tok, table, ctx, fnName = "EmpMissionTick") {
  const tr = new Translator(table, ctx);
  const lines = splitLines(tok).map((l) => lex(decodeLine(l)));
  // declarations first (they are at the top, but collect all to be safe)
  const out = [];
  let depth = 1;
  lines.forEach((tokens, idx) => {
    let res;
    try { res = tr.translateLine(tokens); } catch (e) { throw new Error(`line ${idx + 1}: ${e.message}`); }
    if (!res) return;
    if (res.kind === 'endif' || res.kind === 'else') depth--;
    out.push('    '.repeat(depth) + res.code);
    if (res.kind === 'if' || res.kind === 'else') depth++;
  });
  if (depth !== 1) throw new Error(`unbalanced if/endif (depth ${depth})`);
  const globals = [...tr.vars.entries()].sort((a, b) => a[0] - b[0])
    .map(([n, t]) => `    ${JASS_TYPE[t]} ${tr.varName(n)} = ${NULL[t]}`).join('\n');
  const body = `function ${fnName} takes nothing returns nothing\n${out.join('\n')}\nendfunction`;
  return { globals, body, used: tr.used, messages: tr.messages, tooltips: tr.tooltips };
}

export { translateScript, lex, RETURN_OVERRIDE };
