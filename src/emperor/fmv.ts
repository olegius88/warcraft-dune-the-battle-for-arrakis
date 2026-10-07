// One Emperor movie (DATA/MOVIES/<name>.BIK) -> slide-show files: JPEG BLP frames at MOVIE_FPS and
// the sound as MP3. ffmpeg (on PATH) decodes Bink and writes the frames as baseline JPEGs (YCbCr
// 4:2:0), which the game shows right (src/smoke/build-fmv-probe.ts). Archive paths: MOVIE_PATH.

import { execFileSync } from 'node:child_process';
import { gameData } from '../config/paths.ts';
import { blpFromJpeg, writeBlpImage } from '../wc3/blp.ts';
import { splitJpegs } from '../wc3/jpeg.ts';
import { MOVIE_FPS, MOVIE_FRAME_SIZE, MOVIE_JPEG_QSCALE, MOVIE_AUDIO_BITRATE, MOVIE_PATH } from '../config/movies.ts';

export interface MovieFiles {
  /** archive path -> data (frames and sound) */
  files: Record<string, Buffer>;
  frames: number;
}

const FFMPEG = ['-hide_banner', '-loglevel', 'error'];
const MAX_OUTPUT = 2 ** 31;

/** The frames of a movie as JPEGs; `seconds` limits it to its start (probes). */
function movieJpegs(name: string, seconds?: number): Buffer[] {
  const limit = seconds ? ['-t', String(seconds)] : [];
  const { width: w, height: h } = MOVIE_FRAME_SIZE;
  return splitJpegs(execFileSync('ffmpeg', [...FFMPEG, '-i', gameData('MOVIES', `${name}.BIK`), ...limit, '-an', '-vf', `fps=${MOVIE_FPS},scale=${w}:${h}`,
    '-c:v', 'mjpeg', '-q:v', String(MOVIE_JPEG_QSCALE), '-f', 'image2pipe', '-'], { maxBuffer: MAX_OUTPUT }));
}

/** Convert a movie; `seconds` limits it to its start (probes). */
function convertMovie(name: string, seconds?: number): MovieFiles {
  const limit = seconds ? ['-t', String(seconds)] : [];
  const { width: w, height: h } = MOVIE_FRAME_SIZE;
  const files: Record<string, Buffer> = {};
  const jpegs = movieJpegs(name, seconds);
  jpegs.forEach((j, i) => { files[MOVIE_PATH.frame(name, i)] = blpFromJpeg(j, w, h); });
  files[MOVIE_PATH.sound(name)] = execFileSync('ffmpeg', [...FFMPEG, '-i', gameData('MOVIES', `${name}.BIK`), ...limit, '-vn', '-c:a', 'libmp3lame', '-b:a', MOVIE_AUDIO_BITRATE, '-f', 'mp3', '-'], { maxBuffer: MAX_OUTPUT });
  return { files, frames: jpegs.length };
}

/** The black backdrop around the movie area (MOVIE_PATH.black). */
function blackTexture(): Buffer {
  return writeBlpImage({ width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4) }, { mipmaps: false });
}

export { convertMovie, blackTexture };
