// Little-endian growable byte writer used by every WC3 file-format writer.

class BinaryWriter {
  buf: Buffer;
  pos: number;

  constructor(initial = 1024) {
    this.buf = Buffer.alloc(initial);
    this.pos = 0;
  }

  ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = Buffer.alloc(size);
    this.buf.copy(next, 0, 0, this.pos);
    this.buf = next;
  }

  int32(v: number): this { this.ensure(4); this.buf.writeInt32LE(v | 0, this.pos); this.pos += 4; return this; }
  uint32(v: number): this { this.ensure(4); this.buf.writeUInt32LE(v >>> 0, this.pos); this.pos += 4; return this; }
  int16(v: number): this { this.ensure(2); this.buf.writeInt16LE(v, this.pos); this.pos += 2; return this; }
  uint16(v: number): this { this.ensure(2); this.buf.writeUInt16LE(v, this.pos); this.pos += 2; return this; }
  uint8(v: number): this { this.ensure(1); this.buf[this.pos++] = v & 0xff; return this; }
  float32(v: number): this { this.ensure(4); this.buf.writeFloatLE(v, this.pos); this.pos += 4; return this; }

  /** Raw ASCII characters without terminator (FourCC ids, magic tags, tileset char). */
  chars(s: string): this {
    const b = Buffer.from(s, 'latin1');
    this.bytes(b);
    return this;
  }

  /** Null-terminated UTF-8 string, the WC3 "string" type. */
  cstring(s: string | number): this {
    this.bytes(Buffer.from(String(s), 'utf8'));
    this.uint8(0);
    return this;
  }

  bytes(b: Uint8Array | readonly number[]): this { this.ensure(b.length); Buffer.from(b).copy(this.buf, this.pos); this.pos += b.length; return this; }

  toBuffer(): Buffer { return Buffer.from(this.buf.subarray(0, this.pos)); }
}

export { BinaryWriter };
