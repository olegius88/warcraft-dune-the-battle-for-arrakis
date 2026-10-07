// Decompiler for Emperor mission scripts (*.tok in MISSIONS0001.RFD).
//
// Reverse-engineered 2026-10-07 from the user's copy (no public description found):
// - Game.exe holds the script token table: records of 0x5C bytes starting with "ModelTick":
//   char name[0x24]; int32 id; int32 kind (0 function, 1 operator, 2 keyword/constant);
//   int32 returnType (0 int/bool, 1 pos, 2 obj, 8 void); int32 argCount; int32 argTypes[...].
// - A .tok file: uint32 bodyLength, uint32 lineCount, then bodyLength bytes of source lines,
//   each terminated by 0x00 (blank source lines are just 0x00; comments are stripped). Inside a line, ASCII is literal text (parentheses,
//   commas, decimal numbers) and bytes >= 0x80 start tokens; every number in a token is two
//   base-128 digits with the high bit set, low digit first: value = (d0 & 0x7F) | (d1 & 0x7F) << 7.
//     0x80 d0 d1  -> token table entry (function, keyword, operator, TRUE/FALSE)
//     0x81 d0     -> variable #(d0 & 0x7F)
//     0x82 d0 d1  -> object type index      (resolved by ctx.objectType)
//     0x83 d0 d1  -> message string index   (resolved by ctx.message)
//     0x84 d0 d1  -> tooltip string index   (resolved by ctx.tooltip)
//     0x85 d0 d1  -> sound index            (resolved by ctx.sound)  [inferred from arg type 7]
// The decoding was checked by the decoded text being well-formed (balanced parentheses, argument
// counts matching the table) for every shipped script; see test/emperor-tok.test.js.

import fs from 'node:fs';

const RECORD = 0x5C;

/** Read the token table out of Game.exe. Returns array indexed by token id. */
function loadTokenTable(gameExe) {
  const exe = Buffer.isBuffer(gameExe) ? gameExe : fs.readFileSync(gameExe);
  const start = exe.indexOf(Buffer.from('ModelTick\0', 'latin1'));
  if (start < 0) throw new Error('script token table not found in Game.exe');
  const table = [];
  for (let p = start; p + RECORD <= exe.length; p += RECORD) {
    const nameBytes = exe.subarray(p, p + 0x24);
    const nul = nameBytes.indexOf(0);
    const name = nameBytes.subarray(0, nul < 0 ? 0x24 : nul).toString('latin1');
    const id = exe.readInt32LE(p + 0x24);
    if (!name || id !== table.length || !/^[\x21-\x7e]+$/.test(name)) break;
    const kind = exe.readInt32LE(p + 0x28);
    const returnType = exe.readInt32LE(p + 0x2C);
    const argCount = exe.readInt32LE(p + 0x30);
    const argTypes = [];
    for (let a = 0; a < Math.min(argCount, 10); a++) argTypes.push(exe.readInt32LE(p + 0x34 + a * 4));
    table.push({ id, name, kind, returnType, argCount, argTypes });
  }
  return table;
}

function splitLines(tok) {
  const length = tok.readUInt32LE(0);
  const body = tok.subarray(8, 8 + length);
  const lines = [];
  let s = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === 0) {
      lines.push(body.subarray(s, i));
      s = i + 1;
    }
  }
  if (s < body.length) lines.push(body.subarray(s));
  return lines;
}

/**
 * Decode one line into a list of items: {t:'text',v}, {t:'tok',id}, {t:'var',n},
 * {t:'type'|'msg'|'tip'|'snd', n}.
 */
function decodeLine(bytes) {
  const items = [];
  let text = '';
  const flush = () => { if (text) { items.push({ t: 'text', v: text }); text = ''; } };
  const two = (i) => {
    if (i + 2 >= bytes.length + 0 && i + 2 > bytes.length) throw new Error('truncated token');
    return (bytes[i + 1] & 0x7F) | ((bytes[i + 2] & 0x7F) << 7);
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) { text += String.fromCharCode(b); continue; }
    flush();
    switch (b) {
      case 0x80: items.push({ t: 'tok', id: two(i) }); i += 2; break;
      case 0x81: items.push({ t: 'var', n: bytes[i + 1] & 0x7F }); i += 1; break;
      case 0x82: items.push({ t: 'type', n: two(i) }); i += 2; break;
      case 0x83: items.push({ t: 'msg', n: two(i) }); i += 2; break;
      case 0x84: items.push({ t: 'tip', n: two(i) }); i += 2; break;
      case 0x85: items.push({ t: 'snd', n: two(i) }); i += 2; break;
      default: throw new Error(`unknown token prefix 0x${b.toString(16)} at ${i}`);
    }
  }
  flush();
  return items;
}

/** Decompile a .tok buffer to readable script text. */
function decompile(tok, table, ctx = {}) {
  const out = [];
  let indent = 0;
  for (const line of splitLines(tok)) {
    const items = decodeLine(line);
    const first = items[0];
    const firstName = first && first.t === 'tok' ? (table[first.id] || {}).name : null;
    if (firstName === 'endif' || firstName === 'else') indent = Math.max(0, indent - 1);
    const s = items.map((it) => {
      switch (it.t) {
        case 'text': return it.v;
        case 'tok': {
          const e = table[it.id];
          const name = e ? e.name : `TOKEN_${it.id}`;
          return e && e.kind === 1 ? ` ${name} ` : name;
        }
        case 'var': return (ctx.varName && ctx.varName(it.n)) || `v${it.n}`;
        case 'type': return (ctx.objectType && ctx.objectType(it.n)) || `TYPE_${it.n}`;
        case 'msg': return (ctx.message && ctx.message(it.n)) || `MSG_${it.n}`;
        case 'tip': return (ctx.tooltip && ctx.tooltip(it.n)) || `TIP_${it.n}`;
        case 'snd': return (ctx.sound && ctx.sound(it.n)) || `SND_${it.n}`;
        default: return '?';
      }
    }).join('');
    out.push('    '.repeat(indent) + s);
    if (firstName === 'if' || firstName === 'else') indent++;
  }
  return out.join('\n');
}

export { loadTokenTable, splitLines, decodeLine, decompile };
