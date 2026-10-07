// Build the whole Emperor campaign as one Warcraft III campaign (.w3n):
//   - per house: start mission, attack/defence battle maps for the territories, story missions,
//     the Arrakis hub map;
//   - the tutorial;
//   - campaign screen buttons: Обучение, Атрейдесы, Харконнены, Ордосы (other maps are reached
//     with ChangeLevel from the hub).
// Usage: node src/emperor/build-campaign.ts [--houses AT,HK,OR] [--territories 1-33] [--out file.w3n] [--check]
//        [--autotest] [--name "campaign name"]   (--autotest: see config/campaign.ts AUTOTEST_*)
//        [--no-movies | --movies]   (movie slide shows in the hubs: on, off for --autotest)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readIndex } from './rfh.ts';
import { readMeta } from './mapxbf.ts';
import type { MapMeta } from './mapxbf.ts';
import { loadCampaign, defendVariant } from './campaign-data.ts';
import type { MissionKindKey } from './campaign-data.ts';
import type { StoryRef } from '../config/story.ts';
import { TUTORIAL_SCRIPT, TUTORIAL_MAP, territoryMapPrefix } from '../config/story.ts';
import { HOUSE_BY_CODE as HOUSE_NAME, HOUSE_RU, isHouseCode } from '../config/houses.ts';
import type { HouseCode } from '../config/houses.ts';
import * as CP from '../config/campaign.ts';
import { buildMission } from './mission.ts';
import type { MissionKind } from '../config/campaign.ts';
import type { MissionParams } from './mission.ts';
import { buildHub } from './hub.ts';
import type { StoryMaps } from './hub.ts';
import { ensureMap } from './preview-map.ts';
import { loadAll } from './build-mission.ts';
import { buildCampaign } from '../wc3/map.ts';
import { loadMusic } from './music.ts';

import { loadPhaseRules } from './phase-rules.ts';
import { loadMovies, houseMovies, introMovies } from './movies.ts';
import { convertMovies, installBlack } from './fmv.ts';
import type { MovieInfo } from './fmv.ts';
import type { HubMovies } from './hub.ts';
import { loadSubtitles, loadCaptions } from './subtitles.ts';
import type { TimedText } from './subtitles.ts';
import type { PlayerMovies } from './movie-player.ts';
import { buildIntro } from './intro.ts';
import { buildMenuScene } from './menu-scene.ts';
import { MENU_MODEL } from '../config/menu.ts';
import { MENU_TRACK } from '../config/music.ts';
import { RAW_DIR, CAMPAIGN_OUT, PJASS_OUT_DIR, PJASS_EXE, COMMON_J, BLIZZARD_J, gameData } from '../config/paths.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string): string => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] as string : d; };
const houses: HouseCode[] = opt('--houses', 'AT,HK,OR').split(',').map((h) => {
  if (!isHouseCode(h)) throw new Error(`--houses: unknown house ${h} (AT, HK, OR)`);
  return h;
});
const [tFrom = 1, tTo = CP.TERRITORY_COUNT] = opt('--territories', `1-${CP.TERRITORY_COUNT}`).split('-').map(Number);
const out = opt('--out', CAMPAIGN_OUT);

const all = loadAll({ models: true });
// music lives once in the campaign archive; maps get playlists of archive paths
const music = loadMusic();
// command card icons and the Emperor models live once in the campaign archive too (the object data
// of every map refers to them)
const campaignImports: Record<string, Buffer> = { ...all.units.icons, ...all.units.models };
const useMusic = (paths: string[]): string[] => {
  for (const p of paths) {
    const t = music && [...music.tracks.values()].find((x) => x.path === p);
    if (t) campaignImports[p] = t.data;
  }
  return paths;
};
const folders = [...new Set(['MAPS0001', 'MAPS0002'].flatMap((a) => readIndex(gameData(`${a}.RFH`)).map((e) => e.name.split('/')[0] as string)))];
const camp = loadCampaign(RAW_DIR, folders);
const phaseRules = loadPhaseRules(path.join(RAW_DIR, 'PhaseRules.txt'));
const tok = (name: string): Buffer => fs.readFileSync(path.join(RAW_DIR, `${name}.tok`));
const metaCache = new Map<string, MapMeta>();
const metaOf = (needle: string): MapMeta => {
  let meta = metaCache.get(needle);
  if (!meta) { meta = readMeta(path.join(ensureMap(needle)[0] as string, 'test.xbf')); metaCache.set(needle, meta); }
  return meta;
};
const briefing = (script: string): string => all.ctx.textByKey(script) || '';

interface BuiltEntry {
  file: string;
  buffer: Buffer;
  title: string;
  chapter: string;
  visible: boolean;
}

const maps: BuiltEntry[] = [];
const check = args.includes('--check');
const autoTest = args.includes('--autotest');
// movies: converted once (ffmpeg) into the Warcraft III folder (loose files, src/emperor/fmv.ts);
// each map that shows movies gets their frame counts, rates, subtitles and place captions
const withMovies = args.includes('--movies') || (!autoTest && !args.includes('--no-movies'));
const movieEntries = withMovies ? loadMovies(path.join(RAW_DIR, 'MOVIES.TXT')) : [];
const houseEvents = new Map(houses.map((h) => [h, withMovies ? houseMovies(movieEntries, h) : {}]));
const introList = withMovies ? introMovies(movieEntries) : [];
const movieInfo: Map<string, MovieInfo> = withMovies ? await convertMovies([...introList, ...[...houseEvents.values()].flatMap((e) => Object.values(e).flat())]) : new Map();
if (withMovies) installBlack();
const captions = withMovies ? loadCaptions() : new Map<string, TimedText[]>();
const untranslated: string[] = [];
const playerFor = (names: Iterable<string>): PlayerMovies => {
  const info = new Map<string, MovieInfo>();
  const subtitles = new Map<string, TimedText[]>();
  for (const n of names) {
    const i = movieInfo.get(n);
    if (!i) continue;
    info.set(n, i);
    const sub = loadSubtitles(n.toUpperCase());
    if (sub.language === 'en' && !untranslated.includes(n)) untranslated.push(n);
    subtitles.set(n, sub.lines);
  }
  const caps = new Map([...info.keys()].map((n) => [n, captions.get(n.toUpperCase()) ?? []]));
  return { info, subtitles, captions: caps };
};
const hubMovies = (h: HouseCode): HubMovies | undefined => {
  if (!withMovies) return undefined;
  const { houseIntro: _intro, ...events } = houseEvents.get(h) ?? {};
  return { events, player: playerFor(Object.values(events).flat()) };
};
const campaignName = opt('--name', (autoTest ? CP.AUTOTEST_NAME_PREFIX : '') + CP.CAMPAIGN_NAME);
let pjassFailures = 0;
const add = (file: string, buffer: Buffer, title: string, chapter = '', visible = false, script: string | null = null): void => {
  maps.push({ file, buffer, title, chapter, visible });
  // individual copies for standalone tests; without the campaign imports (models, icons, menu), so
  // there units show only as their shadows: check looks in a campaign session
  const single = path.join(path.dirname(out), 'maps', file);
  fs.mkdirSync(path.dirname(single), { recursive: true });
  fs.writeFileSync(single, buffer);
  if (check && script) {
    const jf = path.join(PJASS_OUT_DIR, file.replace(/\.w3x$/, '.j'));
    fs.mkdirSync(path.dirname(jf), { recursive: true });
    fs.writeFileSync(jf, script);
    try {
      execFileSync(PJASS_EXE, [COMMON_J, BLIZZARD_J, jf], { stdio: 'pipe' });
    } catch (e) {
      pjassFailures++;
      const errs = String((e as { stdout?: Buffer }).stdout).split('\n').filter((l) => /\.j:\d+/.test(l)).slice(0, 5);
      console.log(`  PJASS FAILED ${file}:\n${errs.join('\n')}`);
    }
  }
  process.stdout.write(`  ${file} (${Math.round(buffer.length / 1024)} KB)\n`);
};

interface ScriptRef {
  name: string;
  phase: number;
  whenWon?: { attack: string; won: boolean };
}

for (const h of houses) {
  const player = HOUSE_NAME[h];
  const hub = CP.MAP_FILE.hub(h);
  const story = camp.story[h];
  console.log(`== ${player}`);
  const mission = (fileName: string, title: string, scripts: ScriptRef[], mapNeedle: string, kind: MissionKind, extra: Partial<MissionParams> = {}): string => {
    const m = buildMission({
      scripts: scripts.map((s) => ({ tok: tok(s.name), phase: s.phase, name: s.name, ...(s.whenWon ? { whenWon: s.whenWon } : {}) })),
      meta: metaOf(mapNeedle), ...all, name: title, playerHouse: player, kind, hubMap: hub,
      territoryBattle: kind === 'attack' || kind === 'defend', briefing: scripts[0] ? briefing(scripts[0].name) : '',
      debugName: fileName.replace(/\.w3x$/, ''), ...(autoTest ? { autoWinSeconds: CP.AUTOTEST_WIN_SECONDS } : {}),
      music: useMusic(music ? music.battle(h) : []), iconsInMap: false, ...extra,
    });
    add(fileName, m.buffer, title, '', false, m.script);
    return fileName;
  };

  // start mission (opened from the campaign screen)
  mission(CP.MAP_FILE.start(h), `${HOUSE_RU[h]}: Прибытие на Арракис`, [{ name: story.start[0], phase: 0 }], story.start[1], 'start');

  // territory battles
  const battleFile: Record<string, string> = {};
  for (let n = tFrom; n <= tTo; n++) {
    const t = camp.territories[n - 1];
    if (!t) continue;
    const owner = t.owner;
    for (const kind of ['attack', 'defend'] as MissionKindKey[]) {
      if (kind === 'attack' && n === camp.jumpPoint[h]) continue; // never attack our own capital
      if (kind === 'defend' && owner !== h && owner !== null && n === camp.jumpPoint[owner]) continue; // enemy capitals are never defended
      const scripts: ScriptRef[] = Object.values(camp.missions[h][kind])
        .filter((s) => s.territory === n && s.script).map((s) => ({ name: s.script as string, phase: s.phase }));
      if (kind === 'defend') {
        // Fail / Win variants after their base script: picked by the attack of that phase (campaign-data.ts)
        for (const ph of new Set(scripts.map((s) => s.phase))) {
          const v = defendVariant(camp, h, ph, n);
          if (v) scripts.push({ name: v.name, phase: ph, whenWon: { attack: v.attack, won: v.won } });
        }
      }
      if (kind === 'attack') {
        // forced jump-point missions (Forced Missions.txt) replace everything on enemy capitals
        for (const [defender, script] of Object.entries(camp.jumpScript[h] || {})) {
          if (isHouseCode(defender) && script && camp.jumpPoint[defender] === n) { scripts.length = 0; for (const ph of [1, 2, 3]) scripts.push({ name: script, phase: ph }); }
        }
      }
      const file = CP.MAP_FILE.battle(h, kind, n);
      const enemy = owner === h ? CP.DEFAULT_ENEMY[h] : owner;
      mission(file, `${kind === 'attack' ? 'Атака' : 'Оборона'}: ${t.name}`, scripts, territoryMapPrefix(n), kind, {
        territory: n, defaultEnemyHouse: enemy ? HOUSE_NAME[enemy] : undefined,
      });
      battleFile[`${kind}:${n}`] = file;
    }
  }

  // story missions
  const storyFile: Omit<StoryMaps, 'homeAttack'> & { homeAttack: Record<string, string> } = { homeAttack: {} };
  const storyMission = (key: 'heighliner' | 'homeDefence' | 'civilWar' | 'end', fileKey: string, def: StoryRef | undefined, title: string): void => {
    if (!def) return;
    storyFile[key] = mission(CP.MAP_FILE.story(h, fileKey), title, [{ name: def[0], phase: 0 }], def[1], 'story');
  };
  storyMission('heighliner', 'Heighliner', story.heighliner, `${HOUSE_RU[h]}: Хайлайнер`);
  storyMission('homeDefence', 'HomeDefence', story.homeDefence, `${HOUSE_RU[h]}: Оборона родного мира`);
  storyMission('civilWar', 'CivilWar', story.civilWar, `${HOUSE_RU[h]}: Гражданская война`);
  for (const [foe, def] of Object.entries(story.homeAttack)) {
    if (!def || !isHouseCode(foe)) continue;
    storyFile.homeAttack[foe] = mission(CP.MAP_FILE.homeAttack(h, foe), `${HOUSE_RU[h]}: Вторжение (${HOUSE_RU[foe]})`, [{ name: def[0], phase: 0 }], def[1], 'story');
  }
  storyMission('end', 'End', story.end, `${HOUSE_RU[h]}: Последняя битва`);

  const hubMap = buildHub({
    house: h, campaign: camp, units: all.units, autoTest, music: useMusic(music ? music.hub(h) : []), phaseRules, movies: hubMovies(h),
    battleMap: (kind, n) => battleFile[`${kind}:${n}`] || null,
    storyMap: { heighliner: storyFile.heighliner, homeDefence: storyFile.homeDefence, civilWar: storyFile.civilWar, homeAttack: storyFile.homeAttack, end: storyFile.end },
  });
  add(hub, hubMap.buffer, `Арракис — ${HOUSE_RU[h]}`, '', false, hubMap.script);
}

// tutorial (standalone: ends with the normal victory dialog)
{
  const m = buildMission({ scripts: [{ tok: tok(TUTORIAL_SCRIPT), phase: 0, name: TUTORIAL_SCRIPT }], meta: metaOf(TUTORIAL_MAP), ...all,
    name: CP.TUTORIAL_TITLE, playerHouse: 'Atreides', kind: 'tutorial', territoryBattle: false, briefing: briefing(TUTORIAL_SCRIPT), debugName: 'Tutorial',
    music: useMusic(music ? music.battle('AT') : []), iconsInMap: false });
  add(CP.MAP_FILE.tutorial, m.buffer, CP.TUTORIAL_TITLE, '', false, m.script);
}

// intro maps: the generic intro (its own button) and, per house, the house selection movie and
// Phase0a before the start mission (the house buttons open these)
{
  const m = buildIntro({ name: 'Intro', movies: introList, player: playerFor(introList), report: autoTest ? 'Intro.pld' : undefined });
  add(CP.MAP_FILE.intro, m.buffer, CP.INTRO_TITLE, '', false, m.script);
  for (const h of houses) {
    const list = (houseEvents.get(h) ?? {}).houseIntro ?? [];
    const hi = buildIntro({ name: `${h}_Intro`, movies: list, player: playerFor(list), next: CP.MAP_FILE.start(h), report: autoTest ? `${h}_Intro.pld` : undefined });
    add(CP.MAP_FILE.houseIntro(h), hi.buffer, HOUSE_RU[h], '', false, hi.script);
  }
}
if (untranslated.length) console.log(`subtitles in English (no Russian translation yet): ${untranslated.join(', ')}`);

// campaign screen: the intro, the tutorial and the houses (their intro maps lead to the start
// missions); the rest hidden. Autotest: the house buttons only, so the first button starts the chain.
const visible: Array<[string, string]> = [...(autoTest ? [] : [[CP.MAP_FILE.intro, CP.INTRO_TITLE], [CP.MAP_FILE.tutorial, CP.TUTORIAL_TITLE]] as Array<[string, string]>), ...houses.map((h): [string, string] => [CP.MAP_FILE.houseIntro(h), HOUSE_RU[h]])];
const order: BuiltEntry[] = [...visible.map(([file, title]) => ({ ...(maps.find((m) => m.file === file) as BuiltEntry), title, chapter: CP.CAMPAIGN_CHAPTER, visible: true })),
  ...maps.filter((m) => !visible.some(([f]) => f === m.file))];
// campaign screen: Emperor's main menu scene and theme (war3campaign.w3f: -1 = imported model /
// sound, mdx-m3-viewer parsers/w3x/w3f)
Object.assign(campaignImports, buildMenuScene());
const menuTrack = music?.tracks.get(MENU_TRACK);
if (menuTrack) campaignImports[menuTrack.path] = menuTrack.data;
const w3n = buildCampaign({
  name: campaignName, author: CP.CAMPAIGN_AUTHOR, difficulty: CP.CAMPAIGN_DIFFICULTY,
  backgroundScreen: -1, backgroundPath: MENU_MODEL.field,
  ...(menuTrack ? { ambientSound: -1, ambientPath: menuTrack.path } : {}),
  description: CP.CAMPAIGN_DESCRIPTION,
  maps: order.map((m) => ({ file: m.file, buffer: m.buffer, title: m.title, chapter: m.chapter, visible: m.visible, button: m.visible })),
  imports: campaignImports,
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, w3n);
if (check) console.log(`pjass failures: ${pjassFailures}`);
console.log(`campaign: ${maps.length} maps, ${Math.round(w3n.length / 1024 / 1024)} MB -> ${out}`);
