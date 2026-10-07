'use strict';
// Emperor: Battle for Dune archives: NAME.RFH (index) + NAME.RFD (data).
// Index entry: uint32 nameLength, uint32 filetime, uint32 flags (2 = deflate),
// uint32 compressedSize, uint32 size, uint32 offset, char name[nameLength] (NUL-terminated).
// Compressed data is raw deflate starting 6 bytes after the offset.
// Format per https://github.com/IceReaper/ebfd-re (LibEmperor/Rfh.cs, RfhEntry.cs, MIT);
// verified on the user's copy: every entry of CAMPAIGN/MISSIONS/STRINGS inflates to its size.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readIndex(rfhPath) {
  const h = fs.readFileSync(rfhPath);
  const entries = [];
  let i = 0;
  while (i + 24 <= h.length) {
    const nameLength = h.readUInt32LE(i);
    const flags = h.readUInt32LE(i + 8);
    const csize = h.readUInt32LE(i + 12);
    const size = h.readUInt32LE(i + 16);
    const offset = h.readUInt32LE(i + 20);
    i += 24;
    const raw = h.subarray(i, i + nameLength);
    const nul = raw.indexOf(0);
    const name = raw.subarray(0, nul < 0 ? raw.length : nul).toString('latin1').replace(/\\/g, '/');
    i += nameLength;
    entries.push({ name, flags, csize, size, offset });
  }
  return entries;
}

/** Yields {name, data} for every entry (optionally filtered by a name predicate). */
function* readArchive(basePath, filter = () => true) {
  const entries = readIndex(basePath + '.RFH');
  const fd = fs.openSync(basePath + '.RFD', 'r');
  try {
    for (const e of entries) {
      if (!filter(e.name)) continue;
      const len = e.flags & 2 ? e.csize + 6 : e.size;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, e.offset);
      const data = e.flags & 2 ? zlib.inflateRawSync(buf.subarray(6, 6 + e.csize)) : buf;
      if (data.length !== e.size) throw new Error(`${e.name}: inflated ${data.length} != ${e.size}`);
      yield { name: e.name, data };
    }
  } finally {
    fs.closeSync(fd);
  }
}

function extractArchive(basePath, outDir, filter) {
  let n = 0;
  for (const { name, data } of readArchive(basePath, filter)) {
    const p = path.join(outDir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
    n++;
  }
  return n;
}

module.exports = { readIndex, readArchive, extractArchive };
