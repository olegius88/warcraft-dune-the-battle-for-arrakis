// Emperor movies (DATA/MOVIES/<name>.BIK) -> slide-show files in the Warcraft III folder (loose
// files, read with "Allow Local Files" = 1; src/config/movies.ts): every frame at its own size as a
// 4-plane JPEG BLP (the only JPEG the game draws right, src/wc3/jpeg.ts), the sound as PCM WAV, and
// a manifest with the frame count and rate. ffmpeg (on PATH) decodes Bink; frames are encoded as
// they stream in, several movies at once in worker threads (fmv-worker.ts).

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { gameData, WC3_DIR } from '../config/paths.ts';
import { writeBlpJpeg, writeBlpImage } from '../wc3/blp.ts';
import { MOVIE_JPEG_QUALITY, MOVIE_AUDIO, MOVIE_PATH, MOVIE_FRAME_DIGITS, MOVIE_WORKERS } from '../config/movies.ts';

export interface MovieInfo {
  frames: number;
  /** frames per second */
  fps: number;
  width: number;
  height: number;
  /** false: the movie has no sound track (CREDITS.BIK) */
  sound: boolean;
}

interface Manifest extends Omit<MovieInfo, 'sound'> { settings: string; sound?: boolean }

const FFMPEG = ['-hide_banner', '-loglevel', 'error'];
/** Everything that changes the output: a manifest written with other settings is redone. */
const settings = (quality: number): string => JSON.stringify({ quality, audio: MOVIE_AUDIO, version: 2 });

/** Local file of an archive path under `root` (the Warcraft III folder). */
const localFile = (root: string, archivePath: string): string => path.join(root, ...archivePath.split('\\').filter(Boolean));

/** Size and frame rate of a movie, and whether it has sound (ffprobe). */
function probe(name: string): { width: number; height: number; fps: number; sound: boolean } {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-of', 'json', gameData('MOVIES', `${name}.BIK`)]).toString();
  const streams = (JSON.parse(out) as { streams: Array<{ codec_type: string; width: number; height: number; r_frame_rate: string }> }).streams;
  const s = streams.find((x) => x.codec_type === 'video');
  if (!s) throw new Error(`${name}: no video stream`);
  const [num, den] = s.r_frame_rate.split('/').map(Number) as [number, number];
  return { width: s.width, height: s.height, fps: num / (den || 1), sound: streams.some((x) => x.codec_type === 'audio') };
}

/** The manifest of a converted movie, if it was made with the current settings. */
function readManifest(name: string, root = WC3_DIR, quality = MOVIE_JPEG_QUALITY): MovieInfo | null {
  const file = localFile(root, MOVIE_PATH.manifest(name));
  if (!fs.existsSync(file)) return null;
  const m = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
  if (m.settings !== settings(quality)) return null;
  // manifests written before `sound` existed: every movie but the credits has sound (ffprobe)
  return { frames: m.frames, fps: m.fps, width: m.width, height: m.height, sound: m.sound ?? probe(name).sound };
}

/** Convert one movie into `root` (skipped when its manifest matches); `seconds` limits it (tests);
 * `quality`: JPEG quality of the frames (a smaller map, src/emperor/build-contest.ts). */
async function convertMovie(name: string, { root = WC3_DIR, seconds, quality = MOVIE_JPEG_QUALITY }: { root?: string; seconds?: number; quality?: number } = {}): Promise<MovieInfo> {
  if (!seconds) {
    const done = readManifest(name, root, quality);
    if (done) return done;
  }
  const src = gameData('MOVIES', `${name}.BIK`);
  const { width, height, fps, sound } = probe(name);
  const limit = seconds ? ['-t', String(seconds)] : [];
  fs.mkdirSync(path.dirname(localFile(root, MOVIE_PATH.frame(name, 0))), { recursive: true });
  // sound: decoded Bink audio, written by ffmpeg itself
  if (sound) execFileSync('ffmpeg', [...FFMPEG, '-y', '-i', src, ...limit, '-vn', '-c:a', MOVIE_AUDIO.codec, '-f', MOVIE_AUDIO.format, localFile(root, MOVIE_PATH.sound(name))]);
  // frames: raw RGBA streamed from ffmpeg, one JPEG BLP per frame
  const size = width * height * 4;
  let frames = 0;
  let pending: Buffer = Buffer.alloc(0);
  const ff = spawn('ffmpeg', [...FFMPEG, '-i', src, ...limit, '-an', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  ff.stderr.on('data', (d: Buffer) => { errors += d.toString(); });
  for await (const chunk of ff.stdout as AsyncIterable<Buffer>) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= size) {
      if (frames >= 10 ** MOVIE_FRAME_DIGITS) throw new Error(`${name}: more than ${10 ** MOVIE_FRAME_DIGITS} frames`);
      fs.writeFileSync(localFile(root, MOVIE_PATH.frame(name, frames)), writeBlpJpeg({ width, height, rgba: pending.subarray(0, size) }, quality));
      frames++;
      pending = pending.subarray(size);
    }
  }
  const code: number = await new Promise((resolve) => { if (ff.exitCode !== null) resolve(ff.exitCode); else ff.on('close', (c: number | null) => resolve(c ?? 1)); });
  if (code !== 0) throw new Error(`${name}: ffmpeg failed: ${errors}`);
  const info: MovieInfo = { frames, fps, width, height, sound };
  if (!seconds) fs.writeFileSync(localFile(root, MOVIE_PATH.manifest(name)), JSON.stringify({ ...info, settings: settings(quality) }, null, 1));
  return info;
}

/** Convert movies in parallel (MOVIE_WORKERS threads); already converted ones only read their manifest. */
async function convertMovies(names: Iterable<string>, root = WC3_DIR, quality = MOVIE_JPEG_QUALITY): Promise<Map<string, MovieInfo>> {
  const result = new Map<string, MovieInfo>();
  const todo: string[] = [];
  for (const n of new Set(names)) {
    const done = readManifest(n, root, quality);
    if (done) result.set(n, done);
    else todo.push(n);
  }
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < todo.length) {
      const name = todo[next++] as string;
      const info = await new Promise<MovieInfo>((resolve, reject) => {
        const w = new Worker(new URL('./fmv-worker.ts', import.meta.url), { workerData: { name, root, quality } });
        w.once('message', (m: MovieInfo) => resolve(m));
        w.once('error', reject);
        w.once('exit', (c) => { if (c !== 0) reject(new Error(`${name}: worker exited with ${c}`)); });
      });
      result.set(name, info);
      process.stdout.write(`  movie ${name}: ${info.frames} frames at ${info.fps} fps\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MOVIE_WORKERS, todo.length) }, run));
  return result;
}

/** The black backdrop around the movie area (MOVIE_PATH.black). */
function blackTexture(): Buffer {
  return writeBlpImage({ width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4) }, { mipmaps: false });
}

/** Write the black backdrop next to the movies. */
function installBlack(root = WC3_DIR): void {
  const file = localFile(root, MOVIE_PATH.black);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, blackTexture());
}

export { convertMovie, convertMovies, readManifest, blackTexture, installBlack, localFile };
