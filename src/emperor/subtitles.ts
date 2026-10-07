// Movie text: the place captions Emperor itself shows (DATA/strings/subtitles/SubTitle.ini, UTF-16,
// already in the user's language) and the subtitles of the spoken lines: English segments
// transcribed from the movie sound by whisper.cpp (ffmpeg's whisper filter, src/emperor/transcribe.ts)
// in data/emperor/subtitles/en/<movie>.json, translated to Russian in data/emperor/subtitles/ru/.
//   SubTitle.ini:  BeginMovie <name>
//                  <Time=hh:mm:ss:cc, Duration=hh:mm:ss:cc, Position=<row>:Center, Color=r:g:b, Text="...">
//                  EndMovie
//   whisper json:  one {"start": ms, "end": ms, "text": "..."} object per line

import fs from 'node:fs';
import path from 'node:path';
import { SUBTITLES_DIR, LOCAL_STRINGS_DIR } from '../config/paths.ts';

/** A segment of music marks only. */
const MUSIC_ONLY = /^[\s♪♫*]*$/;

export interface TimedText {
  /** milliseconds from the start of the movie */
  start: number;
  end: number;
  text: string;
  /** SubTitle.ini screen row (captions only) */
  row?: number;
}

/** hh:mm:ss:cc (cc = hundredths) -> milliseconds */
function iniTime(s: string): number {
  const p = s.split(':').map(Number);
  if (p.length !== 4 || p.some((x) => Number.isNaN(x))) throw new Error(`SubTitle.ini: bad time ${s}`);
  const [h, m, sec, cs] = p as [number, number, number, number];
  return ((h * 60 + m) * 60 + sec) * 1000 + cs * 10;
}

/** Place captions per movie. */
function parseSubTitleIni(text: string): Map<string, TimedText[]> {
  const out = new Map<string, TimedText[]>();
  let movie: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '').trim();
    if (!line || line.startsWith(';')) continue;
    let m = /^BeginMovie\s+(\S+)$/i.exec(line);
    if (m) { movie = (m[1] as string).toUpperCase(); out.set(movie, out.get(movie) ?? []); continue; }
    if (/^EndMovie$/i.test(line)) { movie = null; continue; }
    m = /^<Time=([\d:]+),\s*Duration=([\d:]+),\s*Position=(\d+):\w+,\s*Color=[\d:]+,\s*Text="(.*)">$/.exec(line);
    if (!m || !movie) throw new Error(`SubTitle.ini: cannot read "${line}"`);
    const start = iniTime(m[1] as string);
    (out.get(movie) as TimedText[]).push({ start, end: start + iniTime(m[2] as string), row: Number(m[3]), text: m[4] as string });
  }
  return out;
}

function loadCaptions(file = path.join(LOCAL_STRINGS_DIR, 'subtitles', 'SubTitle.ini')): Map<string, TimedText[]> {
  if (!fs.existsSync(file)) return new Map();
  return parseSubTitleIni(fs.readFileSync(file).toString('utf16le'));
}

/** whisper.cpp json lines -> segments (empty text dropped). ffmpeg's whisper filter does not escape
 * quotes in the text, so a line is not JSON: it is read by its fixed shape (was JSON.parse, which
 * failed on "... called "contaminators.""; test/subtitles.test.ts). */
function parseWhisperJson(text: string): TimedText[] {
  const out: TimedText[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^\{"start":(\d+),"end":(\d+),"text":"(.*)"\}\s*$/.exec(line);
    if (!m) throw new Error(`whisper transcript: cannot read ${line}`);
    const t = (m[3] as string).trim();
    // whisper marks music with notes (LEGALS: "♪ ♪"); that is no line to show
    if (t && !MUSIC_ONLY.test(t)) out.push({ start: Number(m[1]), end: Number(m[2]), text: t });
  }
  return out;
}

/** Subtitles of a movie: the Russian translation, or the English transcript when there is none yet. */
function loadSubtitles(movie: string, dir = SUBTITLES_DIR): { lines: TimedText[]; language: 'ru' | 'en' | null } {
  for (const language of ['ru', 'en'] as const) {
    const file = path.join(dir, language, `${movie}.json`);
    if (fs.existsSync(file)) return { lines: parseWhisperJson(fs.readFileSync(file, 'utf8')), language };
  }
  return { lines: [], language: null };
}

export { parseSubTitleIni, loadCaptions, parseWhisperJson, loadSubtitles, iniTime };
