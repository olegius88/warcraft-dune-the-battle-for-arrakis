'use strict';
// Emperor string tables (DATA\strings\*.txt and STRINGS0001 archive): UTF-16 text,
// lines "KEY<TAB>{text}" grouped under bare section-name lines; ';' starts a comment.
// The user's copy is the Russian localisation, so values are Russian.

const fs = require('fs');

function decode(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xFE && buf[1] === 0xFF) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  return buf.toString('latin1');
}

/** @returns {{key:string, text:string, section:string|null}[]} in file order */
function parseStrings(fileOrBuffer) {
  const text = decode(Buffer.isBuffer(fileOrBuffer) ? fileOrBuffer : fs.readFileSync(fileOrBuffer));
  const out = [];
  let section = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t+$/, '');
    if (!line.trim() || line.trim().startsWith(';')) continue;
    // A value may span lines (E_Output_Pickup ORP1D5FRe): join until the closing brace.
    if (/^\s*[^\t{"]+?\s*\t+\s*"?\{/.test(line) && !line.includes('}')) {
      while (i + 1 < lines.length && !line.includes('}')) line += '\n' + lines[++i];
    }
    // value is {text}, sometimes wrapped in quotes: "{text}"
    const m = line.match(/^\s*([^\t{"]+?)\s*\t+\s*"?\{([\s\S]*?)\}/);
    if (m) out.push({ key: m[1].trim(), text: m[2].trim(), section });
    else section = line.split(/[\t;]/)[0].trim();
  }
  return out;
}

module.exports = { parseStrings, decode };
