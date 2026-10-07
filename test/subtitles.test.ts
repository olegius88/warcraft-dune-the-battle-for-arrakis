// Movie text (src/emperor/subtitles.ts): SubTitle.ini place captions and whisper.cpp transcripts.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseSubTitleIni, parseWhisperJson, iniTime } from '../src/emperor/subtitles.ts';

test('SubTitle.ini: movies, times in hundredths, rows, text', () => {
  assert.strictEqual(iniTime('00:00:03:30'), 3300);
  const c = parseSubTitleIni([
    '﻿; Kaitan Text.', 'BeginMovie I00_F02E',
    '<Time=00:00:01:00, Duration=00:00:03:30, Position=13:Center, Color=255:255:255, Text="КАЙТАН">',
    '<Time=00:00:03:00, Duration=00:00:03:30, Position=14:Center, Color=255:255:255, Text="ПАЛАТА СОВЕТА ЛАНДСРААДА">',
    'EndMovie',
  ].join('\r\n'));
  assert.deepStrictEqual(c.get('I00_F02E'), [
    { start: 1000, end: 4300, row: 13, text: 'КАЙТАН' },
    { start: 3000, end: 6300, row: 14, text: 'ПАЛАТА СОВЕТА ЛАНДСРААДА' },
  ]);
  assert.throws(() => parseSubTitleIni('BeginMovie X\n<Time=1>'), /cannot read/);
});

// Bug (2026-10-08): ffmpeg's whisper filter writes its "json" lines without escaping quotes in the
// text ({"start":45000,...,"text":"... called "contaminators.""}), so JSON.parse failed on them; the
// first transcripts tried had no quotes. Lines are now read by their fixed shape.
test('whisper.cpp json lines: fixed shape, quotes inside the text kept', () => {
  const lines = parseWhisperJson([
    '{"start":0,"end":4260,"text":"Bravo! You did surprisingly well on Arrakis."}',
    '{"start":45000,"end":51000,"text":"They have developed human mutations called "contaminators.""}',
    '{"start":51000,"end":52000,"text":" "}',
    '{"start":52000,"end":53000,"text":"♪ ♪"}',
    '',
  ].join('\n'));
  assert.deepStrictEqual(lines, [
    { start: 0, end: 4260, text: 'Bravo! You did surprisingly well on Arrakis.' },
    { start: 45000, end: 51000, text: 'They have developed human mutations called "contaminators."' },
  ]);
});

// The Russian subtitles were translated in parts from the transcripts: each must keep its
// transcript's lines and times, read back, and use the agreed terms (config/movies.ts SUBTITLE_TERMS).
const SUBS = (await import('../src/config/paths.ts')).SUBTITLES_DIR;
test('the Russian subtitles match their transcripts line by line', { skip: fs.existsSync(path.join(SUBS, 'ru')) ? false : 'no subtitles yet' }, async () => {
  const { unifyTerms } = await import('../src/emperor/subtitle-terms.ts');
  const { longestRun } = await import('../src/emperor/transcribe.ts');
  const read = (lang: string, f: string): string[] => fs.readFileSync(path.join(SUBS, lang, f), 'utf8').split('\n').filter(Boolean);
  const files = fs.readdirSync(path.join(SUBS, 'en'));
  assert.ok(files.length >= 70);
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(SUBS, 'ru', f)), `${f}: no translation`);
    const en = read('en', f), ru = read('ru', f);
    assert.strictEqual(ru.length, en.length, `${f}: lines`);
    ru.forEach((l, i) => {
      assert.match(l, /^\{"start":\d+,"end":\d+,"text":"[^"\\]*"\}$/, `${f}:${i + 1}`);
      const times = (s: string): string => (/"start":\d+,"end":\d+/.exec(s) as RegExpExecArray)[0];
      assert.strictEqual(times(l), times(en[i] as string), `${f}:${i + 1} times`);
      const text = (/"text":"(.*)"\}$/.exec(l) as RegExpExecArray)[1] as string;
      assert.strictEqual(unifyTerms(text), text, `${f}:${i + 1} terms`);
    });
    assert.ok(longestRun(parseWhisperJson(en.join('\n'))) < 3, `${f}: transcript loops`);
  }
});
