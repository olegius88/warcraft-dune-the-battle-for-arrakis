'use strict';
// Emperor audio archives (.BAG) from the user's installed game. Skipped when the game is absent.
// Checks the reverse-engineered layout/flags on every entry (see src/emperor/bag.js).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { readBag, readData, toFile } = require('../src/emperor/bag');

const GAME = process.env.EMPEROR_DIR || 'G:\\Games\\Emperor';
const BAGS = ['DIALOG\\DIALOG.BAG', 'SFX\\AUDIO.BAG', 'MUSIC\\MUSIC.BAG'].map((f) => path.join(GAME, 'DATA', f));
const opts = { skip: BAGS.every((f) => fs.existsSync(f)) ? false : 'Emperor audio not available' };

test('BAG tables: entry counts, every entry inside the file', opts, () => {
  const counts = BAGS.map((f) => readBag(f).entries.length);
  assert.deepStrictEqual(counts, [3958, 945, 47]);
  for (const f of BAGS) {
    const len = fs.statSync(f).size;
    for (const e of readBag(f).entries) assert.ok(e.offset + e.size <= len, `${e.name} inside ${f}`);
  }
});

test('BAG flags: 32 = MP3 frames, 8 = IMA ADPCM blocks', opts, () => {
  for (const f of BAGS) {
    const bag = readBag(f);
    for (const e of bag.entries) {
      if (e.codec === 'pcm') continue;
      const d = readData(bag, e);
      if (e.codec === 'mp3') {
        assert.ok(d[0] === 0xff && (d[1] & 0xe0) === 0xe0, `${e.name}: MPEG sync`);
      } else {
        for (let b = 0; b + 4 <= d.length; b += e.blockAlign) {
          assert.ok(d[b + 2] <= 88 && d[b + 3] === 0, `${e.name}: IMA block header at ${b}`);
        }
      }
    }
  }
});

test('toFile: MP3 passes through, ADPCM/PCM get a WAV header', opts, () => {
  const bag = readBag(BAGS[0]);
  const ima = toFile(bag, bag.entries.find((e) => e.codec === 'ima'));
  assert.strictEqual(ima.ext, 'wav');
  assert.strictEqual(ima.data.toString('latin1', 0, 4), 'RIFF');
  assert.strictEqual(ima.data.readUInt16LE(20), 0x11);
  assert.strictEqual(ima.data.readUInt32LE(4), ima.data.length - 8);
  const mp3 = toFile(bag, bag.entries.find((e) => e.codec === 'mp3'));
  assert.strictEqual(mp3.ext, 'mp3');
  const sfx = readBag(BAGS[1]);
  const pcm = toFile(sfx, sfx.entries.find((e) => e.codec === 'pcm'));
  assert.strictEqual(pcm.data.readUInt16LE(20), 1);
  assert.strictEqual(pcm.data.readUInt32LE(4), pcm.data.length - 8);
});
