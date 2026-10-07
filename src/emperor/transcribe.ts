// Transcribe the spoken lines of Emperor's movies with whisper.cpp (ffmpeg's whisper filter, the
// model at WHISPER_MODEL; runs on the GPU when ffmpeg can) into data/emperor/subtitles/en/<MOVIE>.json,
// one {"start","end","text"} line per segment (read by src/emperor/subtitles.ts). A whole movie is
// one audio queue (WHISPER_QUEUE): with 20-second queues sentences were cut at the queue ends. On
// music or silence the long context makes whisper loop (O11_F00E: "The Emperor Worm will live on!"
// 51 times); a transcript with WHISPER_LOOP equal lines in a row is redone with short queues
// (WHISPER_QUEUE_LOOP), which had no loop in the seven movies concerned (2026-10-08).
// Movies without sound (CREDITS) are skipped; existing transcripts are kept.
// Usage: node src/emperor/transcribe.ts [MOVIE ...]   (default: every movie of DATA/MOVIES)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gameData, PROJECT_ROOT, SUBTITLES_DIR, WHISPER_MODEL } from '../config/paths.ts';
import { WHISPER_QUEUE, WHISPER_QUEUE_LOOP, WHISPER_LOOP, WHISPER_LANGUAGE } from '../config/movies.ts';
import { parseWhisperJson } from './subtitles.ts';
import type { TimedText } from './subtitles.ts';

/** A path inside a filter argument: relative to the project (ffmpeg runs there) with forward
 * slashes; the drive colon of an absolute Windows path breaks the filter's option parsing. */
const filterPath = (p: string): string => path.relative(PROJECT_ROOT, p).replace(/\\/g, '/');

/** Equal spoken lines in a row (sound marks like *Grunts* or music notes do not count). */
function longestRun(lines: TimedText[]): number {
  let best = 0, run = 0, prev = '';
  for (const l of lines) {
    if (/^\*.*\*$/.test(l.text)) { run = 0; prev = ''; continue; }
    run = l.text === prev ? run + 1 : 1;
    prev = l.text;
    best = Math.max(best, run);
  }
  return best;
}

function run(src: string, out: string, queue: number): void {
  const filter = `whisper=model=${filterPath(WHISPER_MODEL)}:language=${WHISPER_LANGUAGE}:queue=${queue}:format=json:destination=${filterPath(out)}`;
  if (fs.existsSync(out)) fs.unlinkSync(out);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-af', filter, '-f', 'null', '-'], { cwd: PROJECT_ROOT });
}

function transcribe(movie: string, { redo = false }: { redo?: boolean } = {}): string | null {
  const src = gameData('MOVIES', `${movie}.BIK`);
  const out = path.join(SUBTITLES_DIR, 'en', `${movie}.json`);
  if (!redo && fs.existsSync(out) && fs.statSync(out).size > 0 && longestRun(parseWhisperJson(fs.readFileSync(out, 'utf8'))) < WHISPER_LOOP) return out;
  const streams = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', src]).toString().trim();
  if (!streams) return null;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run(src, out, WHISPER_QUEUE);
  if (longestRun(parseWhisperJson(fs.readFileSync(out, 'utf8'))) >= WHISPER_LOOP) run(src, out, WHISPER_QUEUE_LOOP);
  return out;
}

if (import.meta.main) {
  if (!fs.existsSync(WHISPER_MODEL)) throw new Error(`no whisper model at ${WHISPER_MODEL}`);
  const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(gameData('MOVIES')).filter((f) => /\.bik$/i.test(f)).map((f) => f.replace(/\.bik$/i, ''));
  for (const n of names) {
    const out = transcribe(n);
    console.log(n, out ? `${fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).length} lines` : 'no sound');
  }
}

export { transcribe, longestRun };
