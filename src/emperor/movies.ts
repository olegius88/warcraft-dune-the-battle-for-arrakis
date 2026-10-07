// MOVIES.TXT (data/emperor/raw): which movie Emperor plays at which campaign event.
//   #define <name> <number>                      contexts (Generic, PhaseStartAT, ...) and flags
//   Movie ("<event>", <context>, "<file>", <chained>, <cd>);
// A chained movie is followed by the next Movie line of the same context (Phase1a -> Phase1e,
// Phase13a -> Phase13ae, IntroPrologue -> IntroAnimation -> LandsraadCounsel). The CD flag only says
// which disc held the file.

import fs from 'node:fs';
import type { HouseCode } from '../config/houses.ts';
import { MOVIE_EVENTS, MOVIE_SKIP, MOVIE_INTRO } from '../config/movies.ts';
import type { MovieEventKind } from '../config/movies.ts';

export interface MovieEntry {
  event: string;
  context: string;
  file: string;
  chained: boolean;
}

function parseMovies(text: string): MovieEntry[] {
  const defines = new Map<string, number>();
  const entries: MovieEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    let m = /^#define\s+(\w+)\s+(-?\d+)$/.exec(line);
    if (m) {
      defines.set(m[1] as string, Number(m[2]));
      continue;
    }
    m = /^Movie\s*\(\s*"([^"]+)"\s*,\s*(\w+)\s*,\s*"([^"]+)"\s*,\s*(\w+)\s*,\s*(\w+)\s*\)\s*;$/.exec(line);
    if (!m) throw new Error(`MOVIES.TXT: cannot read "${line}"`);
    const context = m[2] as string;
    if (!defines.has(context)) throw new Error(`MOVIES.TXT: unknown context ${context}`);
    const chained = defines.get(m[4] as string);
    if (chained === undefined) throw new Error(`MOVIES.TXT: unknown flag ${m[4]}`);
    entries.push({ event: m[1] as string, context, file: m[3] as string, chained: chained !== 0 });
  }
  return entries;
}

/** Movie files of an event and the events chained after it. */
function movieChain(entries: MovieEntry[], event: string, context: string): string[] {
  // Was: the event named <event> + "e" or <event> with its last letter replaced by "e"; that is
  // IntroPrologue itself, an endless chain (regression test in test/movies.test.ts).
  let i = entries.findIndex((e) => e.event === event && e.context === context);
  if (i < 0) throw new Error(`MOVIES.TXT: no movie for ${event} in ${context}`);
  const files: string[] = [];
  for (;;) {
    const e = entries[i] as MovieEntry;
    files.push(e.file);
    if (!e.chained) break;
    i = entries.findIndex((n, k) => k > i && n.context === context);
    if (i < 0) throw new Error(`MOVIES.TXT: chained ${e.event} in ${context} has no next movie`);
  }
  return files.filter((f) => !MOVIE_SKIP.has(f));
}

const CONTEXT: Readonly<Record<MovieEventKind, (h: HouseCode) => string>> = {
  start: (h) => `PhaseStart${h}`,
  failed: (h) => `PhaseFailed${h}`,
  house: (h) => `Generic${h}`,
  generic: () => 'Generic',
};

/** Every campaign event of a house -> its movie files (the keys of MOVIE_EVENTS). */
function houseMovies(entries: MovieEntry[], house: HouseCode): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, refs] of Object.entries(MOVIE_EVENTS[house])) out[key] = refs.flatMap(([kind, ev]) => movieChain(entries, ev, CONTEXT[kind](house)));
  return out;
}

/** Movie files of the generic intro (MOVIE_INTRO events in the Generic context). */
function introMovies(entries: MovieEntry[]): string[] {
  return MOVIE_INTRO.flatMap((ev) => movieChain(entries, ev, CONTEXT.generic('AT')));
}

function loadMovies(file: string): MovieEntry[] {
  return parseMovies(fs.readFileSync(file, 'latin1'));
}

export { parseMovies, movieChain, houseMovies, introMovies, loadMovies };
