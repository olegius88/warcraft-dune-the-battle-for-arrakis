// One Emperor movie (DATA/MOVIES/<name>.BIK) -> slide-show files: JPEG BLP frames at MOVIE_FPS and
// the sound as MP3. ffmpeg (on PATH) decodes Bink to raw RGBA frames; each becomes a 4-plane
// (B, G, R, A) JPEG BLP, the only JPEG the game draws right (src/wc3/jpeg.ts). Paths: MOVIE_PATH.

import { execFileSync } from 'node:child_process';
import { gameData } from '../config/paths.ts';
import { writeBlpJpeg, writeBlpImage } from '../wc3/blp.ts';
import { MOVIE_FPS, MOVIE_FRAME_SIZE, MOVIE_JPEG_QUALITY, MOVIE_AUDIO_BITRATE, MOVIE_PATH } from '../config/movies.ts';

export interface MovieFiles {
  /** archive path -> data (frames and sound) */
  files: Record<string, Buffer>;
  frames: number;
}

const FFMPEG = ['-hide_banner', '-loglevel', 'error'];
const MAX_OUTPUT = 2 ** 31;

/** Convert a movie; `seconds` limits it to its start (probes, tests). */
function convertMovie(name: string, seconds?: number): MovieFiles {
  const src = gameData('MOVIES', `${name}.BIK`);
  const limit = seconds ? ['-t', String(seconds)] : [];
  const { width: w, height: h } = MOVIE_FRAME_SIZE;
  const raw = execFileSync('ffmpeg', [...FFMPEG, '-i', src, ...limit, '-an', '-vf', `fps=${MOVIE_FPS},scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: MAX_OUTPUT });
  const size = w * h * 4;
  const frames = Math.floor(raw.length / size);
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < frames; i++) files[MOVIE_PATH.frame(name, i)] = writeBlpJpeg({ width: w, height: h, rgba: raw.subarray(i * size, (i + 1) * size) }, MOVIE_JPEG_QUALITY);
  files[MOVIE_PATH.sound(name)] = execFileSync('ffmpeg', [...FFMPEG, '-i', src, ...limit, '-vn', '-c:a', 'libmp3lame', '-b:a', MOVIE_AUDIO_BITRATE, '-f', 'mp3', '-'], { maxBuffer: MAX_OUTPUT });
  return { files, frames };
}

/** The black backdrop around the movie area (MOVIE_PATH.black). */
function blackTexture(): Buffer {
  return writeBlpImage({ width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4) }, { mipmaps: false });
}

export { convertMovie, blackTexture };
