// One single-player map for the "Beyond Warcraft III" contest (wc3-forge.quest): a house's first
// game of Emperor: Battle for Dune as Emperor shows it after the house is chosen - the house
// selection movie and the Mentat's Phase0a briefing (movie/player.j), then the start mission
// ("Прибытие на Арракис"), ending with the game's own victory / defeat. Everything is inside the map:
// models, icons, music, speech, the movie frames (converted again at --quality into build/contest so
// the map stays small) and their sound.
// Usage: node src/emperor/build-contest.ts [--house AT|HK|OR] [--quality 70] [--out file.w3x] [--check]

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
import { readIndex } from './rfh.ts';
import { RAW_DIR, BUILD_DIR, PJASS_EXE, COMMON_J, BLIZZARD_J, gameData } from '../config/paths.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string): string => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] as string : d; };
const house = opt('--house', CONTEST.house);
if (!isHouseCode(house)) throw new Error(`--house: unknown house ${house} (AT, HK, OR)`);
const h: HouseCode = house;
const quality = Number(opt('--quality', String(CONTEST.movieQuality)));
const out = opt('--out', path.join(BUILD_DIR, 'contest', CONTEST.file(h)));
const movieRoot = path.join(BUILD_DIR, 'contest', 'movies');

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
  music: tracks, intro: { movies, player }, extraImports,
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
