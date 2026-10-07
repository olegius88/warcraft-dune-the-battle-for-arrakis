import type { HouseCode } from './houses.ts';

// Emperor's movies (DATA/MOVIES/*.BIK: Bink 640x480 at 15 fps, CREDITS at 1 fps; 75 files, 83 min) as
// slide shows: PlayCinematic shows nothing from a map in 1.31.1 (note in src/jass/smoke/smoke2.j),
// so every frame is a JPEG BLP texture switched on a UI backdrop, and the sound plays beside it.
// At full quality they are ~13 GB, more than a campaign archive holds (MPQ offsets are 32-bit), so
// they are loose files in the Warcraft III folder: with the registry value "Allow Local Files" = 1
// the client reads them by their archive path (src/smoke/build-local-probe.ts, 2026-10-07).

/** Folder of the converted movies, relative to the Warcraft III folder (WC3_DIR) and as archive path. */
export const MOVIE_DIR = 'Emperor\\Movies\\';
/** Digits of a frame number in its file name (the longest movie, A08_F00E, has 3642 frames). */
export const MOVIE_FRAME_DIGITS = 4;
/** Archive paths of a converted movie. */
export const MOVIE_PATH = {
  frame: (movie: string, i: number): string => `${MOVIE_DIR}${movie}\\${String(i).padStart(MOVIE_FRAME_DIGITS, '0')}.blp`,
  sound: (movie: string): string => `${MOVIE_DIR}${movie}.wav`,
  /** what the converter wrote (frame count, rate, settings); skipped when the settings are unchanged */
  manifest: (movie: string): string => `${MOVIE_DIR}${movie}\\manifest.json`,
  /** black backdrop around the 4:3 movie area */
  black: 'Emperor\\Movies\\black.blp',
} as const;

/** Frames: every frame of the movie at its own size and rate (no scaling, no frames dropped). JPEG
 * quality 95 (the game only draws 4-plane B, G, R, A JPEGs right, src/wc3/jpeg.ts): ~200 KB a
 * 640x480 frame, ~3 MB a second (2026-10-07, H01_F00E: 90 = 138 KB, 98 = 279 KB). */
export const MOVIE_JPEG_QUALITY = 95;
/** Sound: the decoded Bink audio as it is, 16-bit PCM WAV (no second lossy step). */
export const MOVIE_AUDIO = { codec: 'pcm_s16le', format: 'wav' } as const;
/** Parallel conversions (worker threads). */
export const MOVIE_WORKERS = 16;

/** Screen area of the movie in UI frame coordinates (the 4:3 area is 0.8 x 0.6) and of the black
 * backdrop around it (wider screens show more than 0.8). */
export const MOVIE_AREA = { left: 0, top: 0.6, right: 0.8, bottom: 0 } as const;
export const MOVIE_BLACK_AREA = { left: -0.4, top: 0.6, right: 1.2, bottom: 0 } as const;

/** Movies never shown: SneakPeek is a trailer for other Westwood games (main menu item). */
export const MOVIE_SKIP: ReadonlySet<string> = new Set(['Snekpeak']);

/** MOVIES.TXT context of an event: PhaseStart<house>, PhaseFailed<house>, Generic<house>, Generic. */
export type MovieEventKind = 'start' | 'failed' | 'house' | 'generic';
type Ref = readonly [MovieEventKind, string];

/**
 * Campaign events of the hub (src/jass/hub) -> MOVIES.TXT events, per house. Keys:
 *   houseIntro           the house button of the campaign screen (map <H>_Intro before the start
 *                        mission): the house selection movie, then Phase0a
 *   start                the first hub visit (Phase1a: phase 1)
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
    houseIntro: [['house', 'HouseIntro'], ['start', 'Phase0a']], start: [['start', 'Phase1a']], phase2: [['start', 'Phase2a']], phase3: [['start', 'Phase3a']],
    heighliner: [['start', 'Phase10a']], homeDefence: [['start', 'Phase11a']],
    homeAttackHK: [['start', 'Phase12a']], homeAttackOR: [['start', 'Phase12b']],
    finalHK: [['start', 'Phase13a']], finalOR: [['start', 'Phase13b']],
    won: [['house', 'HouseWona']], warning: [['house', 'HouseWarning']], lost: [['house', 'HouseLost']],
    failedHeighliner: [['failed', 'Phase10a']], failedHomeDefence: [['failed', 'Phase11a']],
    failedHomeAttackHK: [['failed', 'Phase12a']], failedHomeAttackOR: [['failed', 'Phase12b']],
    failedFinalHK: [['failed', 'Phase13a']], failedFinalOR: [['failed', 'Phase13b']],
  },
  OR: {
    houseIntro: [['house', 'HouseIntro'], ['start', 'Phase0a']], start: [['start', 'Phase1a']], phase2: [['start', 'Phase2a']], phase3: [['start', 'Phase3a']],
    heighliner: [['start', 'Phase10a']], homeDefence: [['start', 'Phase11a']],
    homeAttackAT: [['start', 'Phase12a']], homeAttackHK: [['start', 'Phase12b']],
    finalAT: [['start', 'Phase13a']], finalHK: [['start', 'Phase13b']],
    won: [['house', 'HouseWona']], warning: [['house', 'HouseWarning']], lost: [['house', 'HouseLost']],
    failedHeighliner: [['failed', 'Phase10a']], failedHomeDefence: [['failed', 'Phase11a']],
    failedHomeAttackAT: [['failed', 'Phase12a']], failedHomeAttackHK: [['failed', 'Phase12b']],
    failedFinalAT: [['failed', 'Phase13a']], failedFinalHK: [['failed', 'Phase13b']],
  },
  HK: {
    houseIntro: [['house', 'HouseIntro'], ['start', 'Phase0a']], start: [['start', 'Phase1a']], phase2: [['start', 'Phase2a']], phase3: [['start', 'Phase3a']],
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

/** Span of the game clock of the movie report (src/jass/hub/movie.j), seconds. */
export const MOVIE_CLOCK_SPAN = 100000;

/** Subtitles of the spoken lines: a text frame over the bottom of the movie with a dark strip under
 * it (TEXT frames show Cyrillic over a backdrop; src/smoke/build-text-probe.ts, 2026-10-08). */
export const MOVIE_SUBTITLE = {
  area: { left: 0.04, top: 0.105, right: 0.76, bottom: 0.015 },
  font: 'Fonts\\FRIZQT__.TTF',
  fontHeight: 0.024,
  /** alpha of the black strip (0..255) */
  stripAlpha: 150,
} as const;
/** Place captions of SubTitle.ini: Position=<row> counts rows of the 600-pixel screen in this many
 * rows (assumed; the shipped captions use rows 13 and 14, the lowest lines). */
export const MOVIE_CAPTION = { rows: 16, height: 0.035, left: 0.04, right: 0.76, fontHeight: 0.022 } as const;
/** Lines kept in the movie report (Preload truncates a long line, so one line per entry). */
export const MOVIE_REPORT_LINES = 60;

/** The "Вступление" button of the campaign screen (map Intro): what Emperor plays when it starts
 * (IntroPrologue is chained to IntroAnimation and the Landsraad council). */
export const MOVIE_INTRO: readonly string[] = ['Legals', 'IntroPrologue'];

/** Transcription (src/emperor/transcribe.ts): audio queue of the whisper filter in seconds (longer than
 * any movie, so a movie is one piece) and the spoken language. */
export const WHISPER_QUEUE = 600;
/** A transcript with this many equal lines in a row loops; it is redone with queues of WHISPER_QUEUE_LOOP s. */
export const WHISPER_LOOP = 3;
export const WHISPER_QUEUE_LOOP = 30;
export const WHISPER_LANGUAGE = 'en';

/** The agreed Russian terminology of the movie subtitles (src/emperor/subtitle-terms.ts): the parts
 * were translated separately and some names came out in two forms. The game's own localization
 * settles Сардукары (Text strings.txt "Sardaukar {Сардукар}"); the others follow the English names
 * of the game (Duke Achillus, the Executrix) and the Russian Dune books (гхола, дистикомб). */
export const SUBTITLE_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Ахиллес(?![а-яё])/g, 'Ахиллус'],
  [/Ахиллес(?=[а-яё])/g, 'Ахиллус'],
  [/Исполнительниц[а-яё]*/g, 'Экзекутрикс'],
  [/Экзекутрис(?=[а-яё])[а-яё]*/g, 'Экзекутрикс'],
  [/Сардаукар/g, 'Сардукар'],
  [/технологию создания Гола/g, 'технологию создания гхол'],
  [/^Гола(?![а-яё])/g, 'Гхола'],
  [/(?<![а-яёА-ЯЁ])Гола(?![а-яё])/g, 'гхола'],
  [/дистикостюм/g, 'дистикомб'],
  [/Силикс/g, 'Селикс'],
  [/Просветляющ([а-яё]*) яд/g, 'Озаряющ$1 яд'],
  [/Червь Императора/g, 'Червь-Император'],
  // O02_F00E: whisper heard "A ghola" as "Agola" and the Sardaukar rank Burseg as "Bersig"
  [/^Агола, это правда\?/g, 'Гхола? Это правда?'],
  [/Берсиг/g, 'бурсег'],
];
