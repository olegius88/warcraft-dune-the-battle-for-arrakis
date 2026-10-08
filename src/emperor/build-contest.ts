// One single-player map for the "Beyond Warcraft III" contest (wc3-forge.quest): a house's first
// game of Emperor: Battle for Dune as Emperor shows it after the house is chosen - the house
// selection movie and the Mentat's Phase0a briefing (movie/player.j), then the start mission
// ("Прибытие на Арракис"), ending with the game's own victory / defeat. Everything is inside the map:
// models, icons, music, speech, the movie frames (converted again at --quality into build/contest so
// the map stays small) and their sound.
// Usage: node src/emperor/build-contest.ts [--house AT|HK|OR] [--quality 70] [--out file.w3x] [--check]
//        [--autowin seconds]   (tests: the mission is won that long after it starts)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readMeta } from './mapxbf.ts';
import { loadCampaign } from './campaign-data.ts';
import { HOUSE_BY_CODE as HOUSE_NAME, HOUSE_RU, isHouseCode } from '../config/houses.ts';
import type { HouseCode } from '../config/houses.ts';
import * as CP from '../config/campaign.ts';
import { CONTEST } from '../config/contest.ts';
import { buildMission } from './mission.ts';
import { ensureMap } from './preview-map.ts';
import { loadAll } from './build-mission.ts';
import { loadMusic } from './music.ts';
import { loadMovies, houseMovies } from './movies.ts';
import { convertMovies, blackTexture, localFile } from './fmv.ts';
import { loadSubtitles, loadCaptions } from './subtitles.ts';
import type { PlayerMovies } from './movie-player.ts';
import { MOVIE_PATH } from '../config/movies.ts';
import { readIndex, readArchive } from './rfh.ts';
import { readTga, writeTga } from '../wc3/tga.ts';
import { resize } from '../wc3/blp.ts';
import { loadingScreen } from './loading-screen.ts';
import { RAW_DIR, BUILD_DIR, PJASS_EXE, COMMON_J, BLIZZARD_J, gameData } from '../config/paths.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string): string => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] as string : d; };
const house = opt('--house', CONTEST.house);
if (!isHouseCode(house)) throw new Error(`--house: unknown house ${house} (AT, HK, OR)`);
const h: HouseCode = house;
const quality = Number(opt('--quality', String(CONTEST.movieQuality)));
const out = opt('--out', path.join(BUILD_DIR, 'contest', CONTEST.file(h)));
const movieRoot = path.join(BUILD_DIR, 'contest', 'movies');
const autoWin = Number(opt('--autowin', '0'));

const all = loadAll({ models: true });
const music = loadMusic();
const folders = [...new Set(['MAPS0001', 'MAPS0002'].flatMap((a) => readIndex(gameData(`${a}.RFH`)).map((e) => e.name.split('/')[0] as string)))];
const camp = loadCampaign(RAW_DIR, folders);
const story = camp.story[h];

// the movies Emperor shows once the house is chosen (MOVIES.TXT), converted at the contest quality
const movies = houseMovies(loadMovies(path.join(RAW_DIR, 'MOVIES.TXT')), h).houseIntro ?? [];
const info = await convertMovies(movies, movieRoot, quality);
const captions = loadCaptions();
const player: PlayerMovies = {
  info,
  subtitles: new Map(movies.map((n) => [n, loadSubtitles(n.toUpperCase()).lines])),
  captions: new Map(movies.map((n) => [n, captions.get(n.toUpperCase()) ?? []])),
};
const extraImports: Record<string, Buffer> = { [MOVIE_PATH.black]: blackTexture() };
for (const [name, mi] of info) {
  for (let i = 0; i < mi.frames; i++) extraImports[MOVIE_PATH.frame(name, i)] = fs.readFileSync(localFile(movieRoot, MOVIE_PATH.frame(name, i)));
  if (mi.sound) extraImports[MOVIE_PATH.sound(name)] = fs.readFileSync(localFile(movieRoot, MOVIE_PATH.sound(name)));
}
// the map list preview: a frame of the house movie with the house logo (CONTEST.preview)
{
  const P = CONTEST.preview;
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(P.at), '-i', gameData('MOVIES', `${P.movie}.BIK`), '-frames:v', '1', '-vf', `crop=ih:ih,scale=${P.size}:${P.size}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 24 });
  const img = { width: P.size, height: P.size, rgba: new Uint8Array(raw) };
  const logoFile = [...readArchive(gameData('3DDATA0001'), (n) => n.toLowerCase() === `textures/${h.toLowerCase()}logo.tga`)][0];
  if (logoFile) {
    const logo = resize(readTga(logoFile.data), P.logo, P.logo);
    const x0 = P.size - P.logo - P.margin, y0 = P.size - P.logo - P.margin;
    for (let y = 0; y < P.logo; y++) for (let x = 0; x < P.logo; x++) {
      const s = (y * P.logo + x) * 4, d = ((y0 + y) * P.size + x0 + x) * 4, al = (logo.rgba[s + 3] as number) / 255;
      for (let k = 0; k < 3; k++) img.rgba[d + k] = Math.round((logo.rgba[s + k] as number) * al + (img.rgba[d + k] as number) * (1 - al));
    }
  }
  extraImports['war3mapPreview.tga'] = writeTga(img);
  // also next to the map: a cover for the contest entry
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out.replace(/\.w3x$/i, '_preview.tga'), extraImports['war3mapPreview.tga']);
}
// the loading screen: a frame of the house movie on the loading screen model (CONTEST.loading)
{
  const L = CONTEST.loading;
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(L.at), '-i', gameData('MOVIES', `${L.movie}.BIK`), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 24 });
  const mi = info.get(L.movie);
  Object.assign(extraImports, loadingScreen({ width: mi?.width ?? 640, height: mi?.height ?? 480, rgba: new Uint8Array(raw) }));
}
// the battle music of the house, inside the map
const tracks = music ? music.battle(h) : [];
for (const p of tracks) {
  const t = music && [...music.tracks.values()].find((x) => x.path === p);
  if (t) extraImports[p] = t.data;
}

const [script, mapNeedle] = story.start;
const meta = readMeta(path.join(ensureMap(mapNeedle)[0] as string, 'test.xbf'));
const title = `${CONTEST.title}: ${HOUSE_RU[h]}`;
const m = buildMission({
  scripts: [{ tok: fs.readFileSync(path.join(RAW_DIR, `${script}.tok`)), phase: CP.START_MISSION_PHASE, name: script }],
  meta, ...all, name: title, playerHouse: HOUSE_NAME[h], kind: 'start', standalone: true,
  defaultPhase: CP.START_MISSION_PHASE, defaultTech: CP.START_MISSION_TECH,
  briefing: all.ctx.textByKey(script) || '', debugName: `Contest_${h}`,
  music: tracks, intro: { movies, player }, extraImports, mapDescription: CONTEST.description(CONTEST.houseFor[h]), loadingScreen: CONTEST.loading.model, ...(autoWin ? { autoWinSeconds: autoWin } : {}),
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
const mb = (b: number): number => Math.round(b / 1024 / 1024);
const movieBytes = Object.entries(extraImports).filter(([k]) => k.startsWith('Emperor\\Movies')).reduce((s, [, b]) => s + b.length, 0);
console.log(`contest map -> ${out}: ${mb(m.buffer.length)} MB (movies ${mb(movieBytes)} MB at quality ${quality}: ${movies.join(', ')})`);
if (args.includes('--check')) {
  const jf = out.replace(/\.w3x$/i, '.j');
  fs.writeFileSync(jf, m.script);
  execFileSync(PJASS_EXE, [COMMON_J, BLIZZARD_J, jf], { stdio: 'inherit' });
}
