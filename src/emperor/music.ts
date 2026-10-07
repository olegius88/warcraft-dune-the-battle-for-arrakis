// Emperor music (DATA\MUSIC\MUSIC.BAG) for the campaign: the files to import once into the .w3n
// and the playlists of the maps. Selection rules: src/config/music.ts.

import fs from 'node:fs';
import { readBag, readData, duration } from './bag.ts';
import { gameData } from '../config/paths.ts';
import { MUSIC_IMPORT_DIR, isBattleTrack, hubTrack } from '../config/music.ts';
import type { HouseCode } from '../config/houses.ts';

export interface MusicTrack {
  name: string;
  /** archive path inside the campaign */
  path: string;
  data: Buffer;
  seconds: number;
}

export interface Music {
  tracks: Map<string, MusicTrack>;
  /** archive paths of a house's battle/story playlist */
  battle(h: HouseCode): string[];
  /** archive path of a house's hub track (empty when missing) */
  hub(h: HouseCode): string[];
}

/** null when the game has no MUSIC.BAG. */
function loadMusic(): Music | null {
  const file = gameData('MUSIC', 'MUSIC.BAG');
  if (!fs.existsSync(file)) return null;
  const bag = readBag(file);
  const tracks = new Map<string, MusicTrack>();
  for (const e of bag.entries) {
    if (e.codec !== 'mp3') continue;
    tracks.set(e.name, { name: e.name, path: `${MUSIC_IMPORT_DIR}${e.name}.mp3`, data: readData(bag, e), seconds: duration(bag, e) });
  }
  const pathsOf = (names: string[]): string[] => names.map((n) => (tracks.get(n) as MusicTrack).path);
  return {
    tracks,
    battle: (h) => pathsOf([...tracks.keys()].filter((n) => isBattleTrack(n, h))),
    hub: (h) => pathsOf([hubTrack(h)].filter((n) => tracks.has(n))),
  };
}

export { loadMusic };
