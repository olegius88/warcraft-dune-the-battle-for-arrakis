'use strict';
// Decompile every mission script into data/emperor/scripts/<name>.txt with object types,
// message keys and tooltip keys resolved; message/tooltip text (Russian) is appended as comments.
//
// Usage: node src/emperor/decompile-all.js [--game G:\Games\Emperor]

const fs = require('fs');
const path = require('path');
const { loadTokenTable, decompile, splitLines, decodeLine } = require('./tok');
const { loadContext } = require('./context');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const game = opt('--game', process.env.EMPEROR_DIR || 'G:\\Games\\Emperor');
const root = path.join(__dirname, '..', '..');
const raw = path.join(root, 'data', 'emperor', 'raw');
const out = path.join(root, 'data', 'emperor', 'scripts');

const table = loadTokenTable(path.join(game, 'Game.exe'));
const ctx = loadContext(raw, path.join(raw, 'loose', 'strings'));
fs.mkdirSync(out, { recursive: true });

let count = 0;
const unresolved = { type: 0, msg: 0, tip: 0 };
for (const f of fs.readdirSync(raw).filter((x) => /\.tok$/i.test(x) && x !== 'header.tok')) {
  const tok = fs.readFileSync(path.join(raw, f));
  const notes = new Map();
  const code = decompile(tok, table, {
    objectType: (n) => ctx.objectType(n) || (unresolved.type++, undefined),
    message: (n) => { const k = ctx.messageKey(n); if (!k) { unresolved.msg++; return undefined; } notes.set(`MSG ${k}`, ctx.messageText(n)); return `MSG(${k})`; },
    tooltip: (n) => { const k = ctx.tooltipKey(n); if (!k) { unresolved.tip++; return undefined; } notes.set(`TIP ${k}`, ctx.tooltipText(n)); return `TIP(${k})`; },
  });
  const header = [`// ${f} — decompiled from MISSIONS0001 by src/emperor/decompile-all.js`, '//'];
  for (const [k, v] of notes) header.push(`// ${k}: ${String(v).replace(/\s*\n\s*/g, ' ')}`);
  fs.writeFileSync(path.join(out, f.replace(/\.tok$/i, '.txt')), header.join('\n') + '\n\n' + code + '\n');
  count++;
}
console.log(`decompiled ${count} scripts into ${out}; unresolved`, unresolved);
