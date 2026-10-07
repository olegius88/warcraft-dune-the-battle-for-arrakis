import type { HouseCode } from './houses.ts';

// Emperor's movies (DATA/MOVIES/*.BIK, Bink 640x480 at 15 fps, 75 files, 83 min) as slide shows:
// PlayCinematic shows nothing from a map in 1.31.1 (TODO(fmv) note in src/jass/smoke/smoke2.j), so
// frames are JPEG BLP textures switched on a UI backdrop and the sound is an MP3 (ffmpeg converts).

/** Frames per second of a slide show (the movie has 15). */
export const MOVIE_FPS = 2;
/** Frame texture size (powers of two; stretched back to the 4:3 movie area on screen). */
export const MOVIE_FRAME_SIZE = { width: 512, height: 512 } as const;
/** ffmpeg JPEG quantiser of the frames (-q:v, 2 best .. 31): 512x512 at 5 is ~16 KB a frame for
 * A01_F00E (256x256: ~6 KB). At 2 frames a second a house's movies are ~45 MB of frames + ~17 MB
 * of sound in its hub map (HK: 22 movies, 24 minutes). */
export const MOVIE_JPEG_QSCALE = 5;
/** MP3 bit rate of the movie sound. */
export const MOVIE_AUDIO_BITRATE = '96k';

/** Archive folder of the converted movies (the hub's JASS builds the paths at run time from it). */
export const MOVIE_DIR = 'Emperor\\Movies\\';
/** Digits of a frame number in its file name. */
export const MOVIE_FRAME_DIGITS = 4;
/** Archive paths of a converted movie. */
export const MOVIE_PATH = {
  frame: (movie: string, i: number): string => `${MOVIE_DIR}${movie}\\${String(i).padStart(MOVIE_FRAME_DIGITS, '0')}.blp`,
  sound: (movie: string): string => `${MOVIE_DIR}${movie}.mp3`,
  /** black backdrop around the 4:3 movie area */
  black: 'Emperor\\Movies\\black.blp',
} as const;

/** Screen area of the movie in UI frame coordinates (the 4:3 area is 0.8 x 0.6) and of the black
 * backdrop around it (wider screens show more than 0.8). */
export const MOVIE_AREA = { left: 0, top: 0.6, right: 0.8, bottom: 0 } as const;
export const MOVIE_BLACK_AREA = { left: -0.4, top: 0.6, right: 1.2, bottom: 0 } as const;

/** Movies never shown: the credits end several chains (and would be the longest slide show). */
export const MOVIE_SKIP: ReadonlySet<string> = new Set(['Credits', 'Legals', 'Snekpeak']);

/** MOVIES.TXT context of an event: PhaseStart<house>, PhaseFailed<house>, Generic<house>. */
export type MovieEventKind = 'start' | 'failed' | 'house';
type Ref = readonly [MovieEventKind, string];

/**
 * Campaign events of the hub (src/jass/hub) -> MOVIES.TXT events, per house. Keys:
 *   start                new campaign (Phase0a: house introduction, then Phase1a: phase 1)
 *   phase2 / phase3      the phase begins (after the story mission of the previous one)
 *   heighliner, homeDefence, civilWar    the story mission is accepted
 *   homeAttack<H> / final<H>             the assault on house H's homeworld begins / H is defeated
 *   won                  the final battle is won;  warning / lost: the last war phase without gains
 *   failed<story>        the story mission is lost
 * The letters a / b of Phase12 / Phase13 name the enemy (MOVIES.TXT comments: "Atreides Attack
 * Harkonnen" = AT Phase12a). Harkonnen's second letter is the Baron after the civil war, which
 * Emperor lets the player choose (a / HouseWonb: Gunseng after Copec's defeat, Phase3a); our
 * campaign has one civil war mission, so that ending is assumed. HK Phase15a repeats Phase14a's
 * movie (H05_F00E), so the civil war attack has none of its own.
 */
export const MOVIE_EVENTS: Readonly<Record<HouseCode, Readonly<Record<string, readonly Ref[]>>>> = {
  AT: {
    start: [['start', 'Phase0a'], ['start', 'Phase1a']], phase2: [['start', 'Phase2a']], phase3: [['start', 'Phase3a']],
    heighliner: [['start', 'Phase10a']], homeDefence: [['start', 'Phase11a']],
    homeAttackHK: [['start', 'Phase12a']], homeAttackOR: [['start', 'Phase12b']],
    finalHK: [['start', 'Phase13a']], finalOR: [['start', 'Phase13b']],
    won: [['house', 'HouseWona']], warning: [['house', 'HouseWarning']], lost: [['house', 'HouseLost']],
    failedHeighliner: [['failed', 'Phase10a']], failedHomeDefence: [['failed', 'Phase11a']],
    failedHomeAttackHK: [['failed', 'Phase12a']], failedHomeAttackOR: [['failed', 'Phase12b']],
    failedFinalHK: [['failed', 'Phase13a']], failedFinalOR: [['failed', 'Phase13b']],
  },
  OR: {
    start: [['start', 'Phase0a'], ['start', 'Phase1a']], phase2: [['start', 'Phase2a']], phase3: [['start', 'Phase3a']],
    heighliner: [['start', 'Phase10a']], homeDefence: [['start', 'Phase11a']],
    homeAttackAT: [['start', 'Phase12a']], homeAttackHK: [['start', 'Phase12b']],
    finalAT: [['start', 'Phase13a']], finalHK: [['start', 'Phase13b']],
    won: [['house', 'HouseWona']], warning: [['house', 'HouseWarning']], lost: [['house', 'HouseLost']],
    failedHeighliner: [['failed', 'Phase10a']], failedHomeDefence: [['failed', 'Phase11a']],
    failedHomeAttackAT: [['failed', 'Phase12a']], failedHomeAttackHK: [['failed', 'Phase12b']],
    failedFinalAT: [['failed', 'Phase13a']], failedFinalHK: [['failed', 'Phase13b']],
  },
  HK: {
    start: [['start', 'Phase0a'], ['start', 'Phase1a']], phase2: [['start', 'Phase2a']], phase3: [['start', 'Phase3a']],
    heighliner: [['start', 'Phase10a']], homeDefence: [['start', 'Phase14a']],
    homeAttackOR: [['start', 'Phase12aa']], homeAttackAT: [['start', 'Phase12ba']],
    finalOR: [['start', 'Phase13aa']], finalAT: [['start', 'Phase13ba']],
    won: [['house', 'HouseWonb']], warning: [['house', 'HouseWarning']], lost: [['house', 'HouseLost']],
    failedHeighliner: [['failed', 'Phase10a']], failedHomeDefence: [['failed', 'Phase14a']], failedCivilWar: [['failed', 'Phase15b']],
    failedHomeAttackOR: [['failed', 'Phase12a']], failedHomeAttackAT: [['failed', 'Phase12b']],
    failedFinalOR: [['failed', 'Phase13a']], failedFinalAT: [['failed', 'Phase13b']],
  },
};

/** Volume of the movie sound (0..127). */
export const MOVIE_VOLUME = 127;
