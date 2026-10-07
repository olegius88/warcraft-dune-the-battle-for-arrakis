// Music (DATA\MUSIC\MUSIC.BAG, MP3): which tracks play where. Stored once in the campaign archive
// (shared by all its maps) under MUSIC_IMPORT_DIR.

import type { HouseCode } from './houses.ts';

/** Folder of the tracks inside the campaign archive. */
export const MUSIC_IMPORT_DIR = 'war3campaignImported\\music\\';
/** Battle and story missions: the house's numbered tracks, e.g. "(HK04)Harkonnen_Force". */
export const isBattleTrack = (name: string, h: HouseCode): boolean => name.startsWith(`(${h}`);
/** The Arrakis hub map of a house. */
export const hubTrack = (h: HouseCode): string => `${h}_Map1`;
/** Battle music plays shuffled. */
export const SHUFFLE_BATTLE_MUSIC = true;
