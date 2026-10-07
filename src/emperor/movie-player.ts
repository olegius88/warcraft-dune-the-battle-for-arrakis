// JASS of the movie slide-show player (src/jass/movie/player.j) for one map: the data of the movies
// it may play (frame count and rate from the converter's manifests, subtitles, place captions)
// split into functions small enough for the JASS operation limit, each run in its own thread.

import { renderFile } from '../wc3/template.ts';
import { str, real } from '../wc3/jass.ts';
import { jassFile } from '../config/paths.ts';
import * as MV from '../config/movies.ts';
import type { MovieInfo } from './fmv.ts';
import type { TimedText } from './subtitles.ts';

export interface PlayerMovies {
  /** movie name -> what the converter wrote */
  info: Map<string, MovieInfo>;
  /** movie name -> subtitles of the spoken lines */
  subtitles?: Map<string, TimedText[]>;
  /** movie name -> place captions (SubTitle.ini) */
  captions?: Map<string, TimedText[]>;
}

/** Statements per data function (far below the JASS operation limit). */
const DATA_CHUNK = 300;

function moviePlayer(movies: PlayerMovies | undefined, report: string): { globals: string; functions: string } {
  const lines: string[] = [];
  let sub = 0, cap = 0;
  // place captions sit above the subtitle strip
  const capTop = (row: number): number => Math.max(MV.MOVIE_AREA.top * (1 - row / MV.MOVIE_CAPTION.rows), MV.MOVIE_SUBTITLE.area.top + MV.MOVIE_CAPTION.height * 2);
  for (const [name, info] of movies?.info ?? []) {
    const h = `StringHash(${str(name)})`;
    const subs = movies?.subtitles?.get(name) ?? [];
    const caps = movies?.captions?.get(name) ?? [];
    lines.push(
      `call SaveInteger(EmpMovieTab, 0, ${h}, ${info.frames})`, `call SaveReal(EmpMovieTab, 1, ${h}, ${real(info.fps)})`,
      `call SaveInteger(EmpMovieTab, 2, ${h}, ${sub})`, `call SaveInteger(EmpMovieTab, 3, ${h}, ${subs.length})`,
      `call SaveInteger(EmpMovieTab, 4, ${h}, ${cap})`, `call SaveInteger(EmpMovieTab, 5, ${h}, ${caps.length})`, `call SaveBoolean(EmpMovieTab, 6, ${h}, ${info.sound ? 'true' : 'false'})`,
    );
    for (const s of subs) {
      lines.push(`set EmpSubStart[${sub}] = ${Math.round(s.start)}`, `set EmpSubEnd[${sub}] = ${Math.round(s.end)}`, `set EmpSubText[${sub}] = ${str(s.text)}`);
      sub++;
    }
    for (const c of caps) {
      lines.push(`set EmpCapStart[${cap}] = ${Math.round(c.start)}`, `set EmpCapEnd[${cap}] = ${Math.round(c.end)}`, `set EmpCapText[${cap}] = ${str(c.text)}`, `set EmpCapY[${cap}] = ${real(capTop(c.row ?? MV.MOVIE_CAPTION.rows - 2))}`);
      cap++;
    }
  }
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += DATA_CHUNK) chunks.push(`function EmpMovieData${chunks.length} takes nothing returns nothing\n${lines.slice(i, i + DATA_CHUNK).map((l) => `    ${l}`).join('\n')}\nendfunction\n`);
  const functions = renderFile(jassFile('movie/player'), {
    ...MV, movieReport: report, soundExt: `.${MV.MOVIE_AUDIO.format}`,
    frameBase: 10 ** MV.MOVIE_FRAME_DIGITS, frameDigitsEnd: MV.MOVIE_FRAME_DIGITS + 1, capBox: MV.MOVIE_CAPTION.height * 2,
    dataFunctions: chunks.join('\n'),
    dataCalls: chunks.map((_, i) => `    call ExecuteFunc("EmpMovieData${i}")`).join('\n'),
  });
  return { globals: renderFile(jassFile('movie/globals'), {}), functions };
}

export { moviePlayer };
