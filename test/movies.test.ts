// MOVIES.TXT (src/emperor/movies.ts): parsing, the chains of chained movies and the movie list of
// every hub event (src/config/movies.ts MOVIE_EVENTS) on the shipped file.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseMovies, movieChain, houseMovies, introMovies, loadMovies } from '../src/emperor/movies.ts';
import { RAW_DIR, BUILD_DIR, gameData } from '../src/config/paths.ts';
import { HOUSE_CODES } from '../src/config/houses.ts';

test('movies: defines, entries, chains', () => {
  const e = parseMovies([
    '#define PhaseStartAT 4', '#define TRUE 1', '#define FALSE 0', '#define CD_2 2',
    '  Movie ("Phase1a",  PhaseStartAT, "A01_F00E", TRUE,  CD_2);   // Atreides Phase 1',
    '  Movie ("Phase1e",  PhaseStartAT, "A01_F02E", FALSE, CD_2);',
    '  Movie ("Phase13a", PhaseStartAT, "A06_F01E", TRUE,  CD_2);',
    '  Movie ("Phase13ae", PhaseStartAT, "A08_F00E", TRUE, CD_2);',
    '  Movie ("Phase13aee", PhaseStartAT, "Credits", FALSE, CD_2);',
  ].join('\r\n'));
  assert.strictEqual(e.length, 5);
  assert.deepStrictEqual(e[0], { event: 'Phase1a', context: 'PhaseStartAT', file: 'A01_F00E', chained: true });
  assert.deepStrictEqual(movieChain(e, 'Phase1a', 'PhaseStartAT'), ['A01_F00E', 'A01_F02E']);
  assert.deepStrictEqual(movieChain(e, 'Phase13a', 'PhaseStartAT'), ['A06_F01E', 'A08_F00E', 'Credits'], 'the credits end the chain');
  assert.throws(() => movieChain(e, 'Phase2a', 'PhaseStartAT'), /no movie for Phase2a/);
  assert.throws(() => parseMovies('Movie ("x", Nowhere, "y", 0, 0);'), /unknown context/);
});

const file = path.join(RAW_DIR, 'MOVIES.TXT');
test('the shipped MOVIES.TXT: every hub event of every house has its movies', { skip: fs.existsSync(file) ? false : 'game data not extracted' }, () => {
  const entries = loadMovies(file);
  const at = houseMovies(entries, 'AT');
  assert.deepStrictEqual(introMovies(entries), ['LEGALS', 'I00_F00E', 'I00_F01E', 'I00_F02E'].map((m) => m === 'LEGALS' ? 'Legals' : m));
  assert.deepStrictEqual(at.houseIntro, ['I00_F03E', 'A00_F00E']);
  assert.deepStrictEqual(at.start, ['A01_F00E', 'A01_F02E']);
  assert.deepStrictEqual(at.phase3, ['A04_F01E', 'A05_F00E']);
  assert.deepStrictEqual(at.won, ['A08_F01E', 'A08_F02E', 'Credits']);
  const hk = houseMovies(entries, 'HK');
  assert.deepStrictEqual(hk.phase3, ['H05_F01E', 'H06_F00E', 'H06_F02E']);
  assert.deepStrictEqual(hk.finalOR, ['H10_F01E', 'H11_F00E', 'H11_F02E']);
  assert.deepStrictEqual(hk.won, ['H12_F00E', 'H12_F01E', 'H12_F03E', 'Credits']);
  for (const h of HOUSE_CODES) {
    const m = houseMovies(entries, h);
    for (const [key, files] of Object.entries(m)) {
      assert.ok(files.length > 0, `${h} ${key}`);
      for (const f of files) assert.ok(fs.existsSync(gameData('MOVIES', `${f.toUpperCase()}.BIK`)) || !fs.existsSync(gameData('MOVIES')), `${h} ${key}: ${f}.BIK`);
    }
  }
});

// The hub plays movies as slide shows (PlayCinematic shows nothing from a map, TODO(fmv) in
// src/jass/smoke/smoke2.j). Its JASS builds the frame paths at run time; they must be the archive
// paths the converter writes (src/config/movies.ts MOVIE_PATH).
test('hub movie JASS: event chains, foes order, frame counts, frame paths', async () => {
  const { movieJass } = await import('../src/emperor/hub.ts');
  const { MOVIE_PATH, MOVIE_DIR, MOVIE_FRAME_DIGITS } = await import('../src/config/movies.ts');
  const at = (frames: number): { frames: number; fps: number; width: number; height: number; sound: boolean } => ({ frames, fps: 15, width: 640, height: 480, sound: true });
  const info = new Map([['A01_F00E', at(254)], ['A01_F02E', at(30)], ['A06_F00E', at(10)], ['A07_F00E', at(12)], ['EMPTY', at(0)]]);
  const j = movieJass({ events: { start: ['A01_F00E', 'EMPTY', 'A01_F02E'], homeAttackHK: ['A06_F00E'], homeAttackOR: ['A07_F00E'] }, player: { info } }, ['OR', 'HK']);
  assert.strictEqual(j.mv.start, '"A01_F00E;A01_F02E"', 'a movie without frames is left out');
  assert.strictEqual(j.mv.homeAttack0, '"A07_F00E"', 'foes[0] = OR');
  assert.strictEqual(j.mv.homeAttack1, '"A06_F00E"');
  assert.strictEqual(j.mv.won, '""');
  assert.ok(j.movieFunctions.includes('call SaveInteger(EmpMovieTab, 0, StringHash("A01_F00E"), 254)'));
  assert.ok(j.movieFunctions.includes('call SaveReal(EmpMovieTab, 1, StringHash("A01_F00E"), 15.0)'));
  // the JASS frame path: MOVIE_DIR + name + "\" + SubString(I2S(10^digits + i), 1, digits + 1) + ".blp"
  const m = /SubString\(I2S\((\d+) \+ EmpMovieFrame\), 1, (\d+)\)/.exec(j.movieFunctions);
  assert.ok(m && m[1] && m[2], 'frame path expression');
  const jassPath = (name: string, i: number): string => `${MOVIE_DIR}${name}\\${String(Number(m[1]) + i).slice(1, Number(m[2]))}.blp`;
  for (const i of [0, 7, 254]) assert.strictEqual(jassPath('A01_F00E', i), MOVIE_PATH.frame('A01_F00E', i));
  assert.strictEqual(MOVIE_FRAME_DIGITS, 4);
});

// Bug (2026-10-07, found in game): the hub never called EmpMovieData, so the frame table was empty
// and the player skipped every queued movie: the HK hub showed none. Unit tests checked the movie
// JASS on its own, not that the hub calls it. Now: the frame table is filled before the hub loads.
test('the hub fills the movie frame table before it queues movies', { skip: fs.existsSync(file) ? false : 'game data not extracted' }, async () => {
  const { buildHub } = await import('../src/emperor/hub.ts');
  const { loadCampaign } = await import('../src/emperor/campaign-data.ts');
  const { readIndex } = await import('../src/emperor/rfh.ts');
  const folders = [...new Set(['MAPS0001', 'MAPS0002'].flatMap((a) => readIndex(gameData(`${a}.RFH`)).map((e) => e.name.split('/')[0] as string)))];
  const hub = buildHub({
    house: 'HK', autoTest: false, campaign: loadCampaign(RAW_DIR, folders), battleMap: () => null, storyMap: { heighliner: 'H.w3x', homeDefence: 'D.w3x', civilWar: 'C.w3x', homeAttack: { AT: 'A.w3x', OR: 'O.w3x' }, end: 'E.w3x' },
    units: { w3u: Buffer.alloc(0), w3a: Buffer.alloc(0) } as never,
    movies: { events: { start: ['H01_F00E'] }, player: { info: new Map([['H01_F00E', { frames: 3, fps: 15, width: 640, height: 480, sound: true }]]) } },
  });
  const start = hub.script.slice(hub.script.indexOf('function EmpHubStart'));
  const body = start.slice(0, start.indexOf('endfunction'));
  assert.ok(body.includes('call EmpMovieData()'), 'EmpHubStart calls EmpMovieData');
  assert.ok(body.indexOf('call EmpMovieData()') < body.indexOf('call EmpLoad()'), 'before EmpLoad (it queues the start movies)');
  assert.ok(hub.script.includes('call EmpMovieAdd("H01_F00E")'));
});

// Bug (2026-10-07, BLP probe src/smoke/build-blp-probe.ts): movie frames were ffmpeg's YCbCr JPEGs;
// the game reads the JPEG of a BLP as B, G, R, A planes, so every YCbCr frame (4:2:0 or 4:4:4,
// 256 or 512) was drawn grey with vertical stripes at 3/4 of its width. A first probe seemed to
// show them right, but its capture had caught the next (4-plane) frames. Now: 4-plane frames.
test('movie frames are 4-plane (B, G, R, A) JPEG BLPs', { skip: fs.existsSync(gameData('MOVIES', 'A01_F00E.BIK')) ? false : 'game data not found' }, async () => {
  const { convertMovie } = await import('../src/emperor/fmv.ts');
  const { MOVIE_PATH } = await import('../src/config/movies.ts');
  const root = path.join(BUILD_DIR, 'test', 'movies-root');
  const { frames } = await convertMovie('A01_F00E', { root, seconds: 1 });
  assert.ok(frames >= 1);
  const blp = fs.readFileSync(path.join(root, ...MOVIE_PATH.frame('A01_F00E', 0).split('\\')));
  const head = blp.subarray(160, 160 + blp.readInt32LE(156));
  const sof = head.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(sof > 0, 'baseline SOF');
  assert.strictEqual(head[sof + 9], 4, 'components');
  for (let c = 0; c < 4; c++) assert.strictEqual(head[sof + 11 + c * 3], 0x11, `component ${c} not subsampled`);
});

// Bug (2026-10-08): a chained movie was followed by the event named <event> + "e" or <event> with its
// last letter replaced by "e"; for IntroPrologue (ending in "e") that is IntroPrologue itself, and the
// chain never ended (RangeError: Invalid array length). It did not show before because the hub used
// no generic movies. In MOVIES.TXT the movie after a chained one is the next Movie line of the context.
test('a chained movie is followed by the next Movie line of its context (IntroPrologue -> IntroAnimation)', () => {
  const e = parseMovies([
    '#define Generic 0', '#define PhaseStartAT 4', '#define TRUE 1', '#define FALSE 0', '#define HD 0',
    'Movie ("IntroPrologue", Generic, "I00_F00E", TRUE, HD);',
    'Movie ("IntroAnimation", Generic, "I00_F01E", TRUE, HD);',
    'Movie ("LandsraadCounsel", Generic, "I00_F02E", FALSE, HD);',
  ].join('\n'));
  assert.deepStrictEqual(movieChain(e, 'IntroPrologue', 'Generic'), ['I00_F00E', 'I00_F01E', 'I00_F02E']);
});
