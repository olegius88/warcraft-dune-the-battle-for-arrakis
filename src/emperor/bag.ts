// Emperor audio archives (DATA\DIALOG\DIALOG.BAG, DATA\SFX\AUDIO.BAG, DATA\MUSIC\MUSIC.BAG).
//
// No public spec was found (only the old "gabadec" tool exists). Layout and flags were derived from
// the files themselves and checked on every entry of all three archives (test/emperor-bag.test.js):
//   header : "GABA", u32 version (4), u32 count, u32 entry size (64)
//   entry  : name[32] (NUL-padded), u32 offset, u32 size, u32 sample rate, u32 flags,
//            u32 block align (IMA ADPCM block size; garbage for MP3), 12 bytes unused
//   flags  : 1 = stereo, 2 = 16-bit, 8 = IMA ADPCM (MS-style blocks: i16 sample, u8 index <= 88, u8 0),
//            32 = MP3 (every such entry starts with an MPEG frame sync), 4/16 = unknown (always set
//            together with ADPCM/MP3/PCM, ignored). No 8/32 bit -> raw PCM.
import fs from 'node:fs';

export type Codec = 'mp3' | 'ima' | 'pcm';

export interface BagEntry {
  name: string;
  offset: number;
  size: number;
  rate: number;
  flags: number;
  /** IMA ADPCM block size (garbage for MP3) */
  blockAlign: number;
  channels: 1 | 2;
  bits: 8 | 16;
  codec: Codec;
}

export interface Bag {
  file: string;
  entries: BagEntry[];
}

export interface PlayableFile {
  ext: 'mp3' | 'wav';
  data: Buffer;
}

interface WavFormat {
  /** 1 PCM, 0x11 IMA ADPCM */
  format: number;
  channels: number;
  rate: number;
  blockAlign: number;
  bits: number;
  extra?: Buffer;
  dataSize: number;
  factSamples?: number;
}

function readBag(file: string): Bag {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    if (head.toString('latin1', 0, 4) !== 'GABA') throw new Error(`${file}: not a GABA archive`);
    const count = head.readUInt32LE(8);
    const size = head.readUInt32LE(12);
    const table = Buffer.alloc(count * size);
    fs.readSync(fd, table, 0, table.length, 16);
    const entries: BagEntry[] = [];
    for (let i = 0; i < count; i++) {
      const o = i * size;
      const flags = table.readUInt32LE(o + 44);
      entries.push({
        name: table.toString('latin1', o, o + 32).replace(/\0.*$/s, ''),
        offset: table.readUInt32LE(o + 32),
        size: table.readUInt32LE(o + 36),
        rate: table.readUInt32LE(o + 40),
        flags,
        blockAlign: table.readUInt32LE(o + 48),
        channels: flags & 1 ? 2 : 1,
        bits: flags & 2 ? 16 : 8,
        codec: flags & 32 ? 'mp3' : flags & 8 ? 'ima' : 'pcm',
      });
    }
    return { file, entries };
  } finally {
    fs.closeSync(fd);
  }
}

function readData(bag: Bag, e: BagEntry): Buffer {
  const fd = fs.openSync(bag.file, 'r');
  try {
    const b = Buffer.alloc(e.size);
    fs.readSync(fd, b, 0, e.size, e.offset);
    return b;
  } finally {
    fs.closeSync(fd);
  }
}

function wavHeader({ format, channels, rate, blockAlign, bits, extra, dataSize, factSamples }: WavFormat): Buffer {
  const ext = extra ? extra.length : 0;
  const fmtSize = 16 + (extra ? 2 + ext : 0);
  const fact = factSamples != null ? 12 : 0;
  const h = Buffer.alloc(12 + 8 + fmtSize + fact + 8);
  let o = 0;
  h.write('RIFF', o); o += 4;
  h.writeUInt32LE(h.length - 8 + dataSize, o); o += 4;
  h.write('WAVE', o); o += 4;
  h.write('fmt ', o); o += 4;
  h.writeUInt32LE(fmtSize, o); o += 4;
  h.writeUInt16LE(format, o); o += 2;
  h.writeUInt16LE(channels, o); o += 2;
  h.writeUInt32LE(rate, o); o += 4;
  const byteRate = format === 1 ? rate * channels * bits / 8 : Math.round(rate * blockAlign / ((blockAlign - 4 * channels) * 2 / channels + 1));
  h.writeUInt32LE(byteRate, o); o += 4;
  h.writeUInt16LE(blockAlign, o); o += 2;
  h.writeUInt16LE(bits, o); o += 2;
  if (extra) { h.writeUInt16LE(ext, o); o += 2; extra.copy(h, o); o += ext; }
  if (factSamples != null) { h.write('fact', o); o += 4; h.writeUInt32LE(4, o); o += 4; h.writeUInt32LE(factSamples, o); o += 4; }
  h.write('data', o); o += 4;
  h.writeUInt32LE(dataSize, o);
  return h;
}

/** Entry -> playable file: { ext: 'mp3' | 'wav', data }. IMA ADPCM stays compressed (WAV format 0x11). */
function toFile(bag: Bag, e: BagEntry): PlayableFile {
  const raw = readData(bag, e);
  if (e.codec === 'mp3') return { ext: 'mp3', data: raw };
  if (e.codec === 'ima') {
    const samplesPerBlock = ((e.blockAlign - 4 * e.channels) * 2) / e.channels + 1;
    const extra = Buffer.alloc(2);
    extra.writeUInt16LE(samplesPerBlock, 0);
    const blocks = Math.ceil(raw.length / e.blockAlign);
    const head = wavHeader({ format: 0x11, channels: e.channels, rate: e.rate, blockAlign: e.blockAlign, bits: 4, extra,
      dataSize: raw.length, factSamples: blocks * samplesPerBlock });
    return { ext: 'wav', data: Buffer.concat([head, raw]) };
  }
  const head = wavHeader({ format: 1, channels: e.channels, rate: e.rate, blockAlign: e.channels * e.bits / 8, bits: e.bits, dataSize: raw.length });
  return { ext: 'wav', data: Buffer.concat([head, raw]) };
}

// MPEG audio frame header -> [frame bytes, samples per frame] (ISO 11172-3 / 13818-3 tables).
const MP3_BITRATES: Record<1 | 2, number[]> = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // MPEG-1 layer III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG-2/2.5 layer III
};
const MP3_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
/** [frame bytes, samples per frame, sample rate] or null when no frame starts at o */
function mp3Frame(b: Buffer, o: number): [number, number, number] | null {
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[o + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (b[o + 1] >> 1) & 3; // 1 = layer III
  if (ver === 1 || layer !== 1) return null;
  const kbps = MP3_BITRATES[ver === 3 ? 1 : 2][(b[o + 2] >> 4) & 15];
  const rate = (MP3_RATES[ver] || [])[(b[o + 2] >> 2) & 3];
  if (!kbps || !rate) return null;
  const pad = (b[o + 2] >> 1) & 1;
  const samples = ver === 3 ? 1152 : 576;
  return [Math.floor((samples / 8) * kbps * 1000 / rate) + pad, samples, rate];
}

/** Playing time in seconds (MP3: summed frames; IMA ADPCM: blocks; PCM: bytes). */
function duration(bag: Bag, e: BagEntry): number {
  if (e.codec === 'ima') {
    const samplesPerBlock = ((e.blockAlign - 4 * e.channels) * 2) / e.channels + 1;
    return (Math.ceil(e.size / e.blockAlign) * samplesPerBlock) / e.rate;
  }
  if (e.codec === 'pcm') return e.size / (e.rate * e.channels * (e.bits / 8));
  const d = readData(bag, e);
  let t = 0;
  for (let o = 0; o + 4 <= d.length;) {
    const f = mp3Frame(d, o);
    if (!f) { o++; continue; }
    t += f[1] / f[2];
    o += f[0];
  }
  return t;
}

export { readBag, readData, toFile, duration };
