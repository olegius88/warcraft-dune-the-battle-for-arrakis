// Minimal MPQ v0 (format 0) archive writer, enough for .w3x maps and .w3n campaigns.
//
// Layout and algorithms follow StormLib (https://github.com/ladislav-zezula/StormLib,
// src/SBaseCommon.cpp: PrepareStormBuffer / HashString / EncryptMpqBlock) and were
// cross-checked against the reader in mdx-m3-viewer (src/parsers/mpq/crypto.ts).
// Tests in test/mpq.test.js read our output back with that independent reader.

import zlib from 'node:zlib';

const FILE_EXISTS = 0x80000000;
const FILE_COMPRESS = 0x00000200;
const COMPRESSION_ZLIB = 0x02;
const SECTOR_SIZE_SHIFT = 3; // sector = 512 << 3 = 4096 bytes (what the WE writes)
const SECTOR_SIZE = 512 << SECTOR_SIZE_SHIFT;

const cryptTable = (() => {
  const t = new Uint32Array(0x500);
  let seed = 0x00100001;
  for (let i1 = 0; i1 < 0x100; i1++) {
    for (let i2 = i1, i = 0; i < 5; i++, i2 += 0x100) {
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const hi = (seed & 0xFFFF) << 16;
      seed = (seed * 125 + 3) % 0x2AAAAB;
      t[i2] = (hi | (seed & 0xFFFF)) >>> 0;
    }
  }
  return t;
})();

/** MPQ string hash. type: 0 = table index, 1 = name A, 2 = name B, 3 = file key. */
function hashString(name, type) {
  let seed1 = 0x7FED7FED;
  let seed2 = 0xEEEEEEEE;
  // StormLib upper-cases ASCII and maps '/' to '\' before hashing.
  const s = name.replace(/\//g, '\\').toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i) & 0xFF;
    seed1 = (cryptTable[(type << 8) + ch] ^ ((seed1 + seed2) >>> 0)) >>> 0;
    seed2 = (ch + seed1 + seed2 + ((seed2 << 5) >>> 0) + 3) >>> 0;
  }
  return seed1 >>> 0;
}

function encryptBlock(buf, key) {
  let seed1 = key >>> 0;
  let seed2 = 0xEEEEEEEE;
  for (let i = 0; i + 4 <= buf.length; i += 4) {
    seed2 = (seed2 + cryptTable[0x400 + (seed1 & 0xFF)]) >>> 0;
    const plain = buf.readUInt32LE(i);
    buf.writeUInt32LE((plain ^ ((seed1 + seed2) >>> 0)) >>> 0, i);
    seed1 = ((((~seed1) << 0x15) + 0x11111111) | (seed1 >>> 0x0B)) >>> 0;
    seed2 = (plain + seed2 + ((seed2 << 5) >>> 0) + 3) >>> 0;
  }
  return buf;
}

function compressSectors(data) {
  const count = Math.ceil(data.length / SECTOR_SIZE);
  const parts = [];
  const offsets = new Uint32Array(count + 1);
  let pos = (count + 1) * 4;
  for (let i = 0; i < count; i++) {
    const raw = data.subarray(i * SECTOR_SIZE, Math.min(data.length, (i + 1) * SECTOR_SIZE));
    const z = zlib.deflateSync(raw, { level: 9 });
    // A sector that does not shrink is stored raw, without the compression byte.
    const sector = z.length + 1 < raw.length ? Buffer.concat([Buffer.from([COMPRESSION_ZLIB]), z]) : Buffer.from(raw);
    offsets[i] = pos;
    parts.push(sector);
    pos += sector.length;
  }
  offsets[count] = pos;
  const table = Buffer.alloc((count + 1) * 4);
  for (let i = 0; i <= count; i++) table.writeUInt32LE(offsets[i], i * 4);
  return Buffer.concat([table, ...parts]);
}

class MpqWriter {
  constructor() {
    this.files = new Map(); // name -> { data, compress }
  }

  /**
   * @param {string} name archive path, backslash separated (e.g. "war3map.j")
   * @param {Buffer|string} data
   * @param {{compress?: boolean}} opts compress=false stores the file plainly (flags 0x80000000),
   *   which is how campaigns embed their .w3x maps.
   */
  add(name, data, opts = {}) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    this.files.set(name.replace(/\//g, '\\'), { data: buf, compress: opts.compress !== false });
    return this;
  }

  /** Build the archive. preHeader (e.g. a 512-byte HM3W block) is written before the MPQ. */
  toBuffer({ listfile = true, preHeader = null } = {}) {
    const entries = [...this.files.entries()].map(([name, f]) => ({ name, ...f }));
    if (listfile) {
      const names = entries.map((e) => e.name).concat(['(listfile)']);
      entries.push({ name: '(listfile)', data: Buffer.from(names.join('\r\n') + '\r\n', 'latin1'), compress: true });
    }

    let hashSize = 16;
    while (hashSize < entries.length * 2) hashSize *= 2;

    const bodies = [];
    const blocks = [];
    let offset = 32;
    for (const e of entries) {
      let stored = e.data;
      let flags = FILE_EXISTS;
      if (e.compress && e.data.length > 0) {
        stored = compressSectors(e.data);
        flags |= FILE_COMPRESS;
      }
      blocks.push({ offset, csize: stored.length, size: e.data.length, flags });
      bodies.push(stored);
      offset += stored.length;
    }

    const hashTable = Buffer.alloc(hashSize * 16, 0xFF);
    entries.forEach((e, blockIndex) => {
      let i = hashString(e.name, 0) & (hashSize - 1);
      while (hashTable.readUInt32LE(i * 16 + 12) !== 0xFFFFFFFF) i = (i + 1) & (hashSize - 1);
      hashTable.writeUInt32LE(hashString(e.name, 1), i * 16);
      hashTable.writeUInt32LE(hashString(e.name, 2), i * 16 + 4);
      hashTable.writeUInt16LE(0, i * 16 + 8); // locale neutral
      hashTable.writeUInt16LE(0, i * 16 + 10); // platform
      hashTable.writeUInt32LE(blockIndex, i * 16 + 12);
    });

    const blockTable = Buffer.alloc(blocks.length * 16);
    blocks.forEach((b, i) => {
      blockTable.writeUInt32LE(b.offset, i * 16);
      blockTable.writeUInt32LE(b.csize, i * 16 + 4);
      blockTable.writeUInt32LE(b.size, i * 16 + 8);
      blockTable.writeUInt32LE(b.flags >>> 0, i * 16 + 12);
    });
    encryptBlock(hashTable, hashString('(hash table)', 3));
    encryptBlock(blockTable, hashString('(block table)', 3));

    const hashPos = offset;
    const blockPos = hashPos + hashTable.length;
    const archiveSize = blockPos + blockTable.length;

    const header = Buffer.alloc(32);
    header.write('MPQ\x1a', 0, 'latin1');
    header.writeUInt32LE(32, 4);
    header.writeUInt32LE(archiveSize, 8);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(SECTOR_SIZE_SHIFT, 14);
    header.writeUInt32LE(hashPos, 16);
    header.writeUInt32LE(blockPos, 20);
    header.writeUInt32LE(hashSize, 24);
    header.writeUInt32LE(blocks.length, 28);

    const parts = [header, ...bodies, hashTable, blockTable];
    if (preHeader) parts.unshift(preHeader);
    return Buffer.concat(parts);
  }
}

export { MpqWriter, hashString, encryptBlock, FILE_EXISTS, FILE_COMPRESS };
