// Build the whole Emperor campaign as one Warcraft III campaign (.w3n):
//   - per house: start mission, attack/defence battle maps for the territories, story missions,
//     the Arrakis hub map;
//   - the tutorial;
//   - campaign screen buttons: Обучение, Атрейдесы, Харконнены, Ордосы (other maps are reached
//     with ChangeLevel from the hub).
// Usage: node src/emperor/build-campaign.js [--houses AT,HK,OR] [--territories 1-33] [--out build/campaign/EmperorDune.w3n]

import fs from 'node:fs';
import path from 'node:path';
import { readIndex } from './rfh.ts';
import { readMeta } from './mapxbf.ts';
import { loadCampaign } from './campaign-data.ts';
import { buildMission } from './mission.ts';
import { buildHub } from './hub.ts';
import { ensureMap } from './preview-map.ts';
import { loadAll } from './build-mission.ts';
import { buildCampaign } from '../wc3/map.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const RAW = path.join(ROOT, 'data', 'emperor', 'raw');
const GAME = process.env.EMPEROR_DIR || 'G:\\Games\\Emperor';
const HOUSE_NAME = { AT: 'Atreides', HK: 'Harkonnen', OR: 'Ordos' };
const HOUSE_RU = { AT: 'Атрейдесы', HK: 'Харконнены', OR: 'Ордосы' };

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const houses = opt('--houses', 'AT,HK,OR').split(',');
const [tFrom, tTo] = opt('--territories', '1-33').split('-').map(Number);
const out = opt('--out', path.join(ROOT, 'build', 'campaign', 'EmperorDune.w3n'));

const all = loadAll();
const folders = [...new Set(['MAPS0001', 'MAPS0002'].flatMap((a) => readIndex(path.join(GAME, 'DATA', `${a}.RFH`)).map((e) => e.name.split('/')[0])))];
const camp = loadCampaign(RAW, folders);
const tok = (name) => fs.readFileSync(path.join(RAW, `${name}.tok`));
const metaCache = new Map();
const metaOf = (needle) => {
  if (!metaCache.has(needle)) metaCache.set(needle, readMeta(path.join(ensureMap(needle)[0], 'test.xbf')));
  return metaCache.get(needle);
};
const briefing = (script) => all.ctx.textByKey(script) || '';

const maps = []; // { file, buffer, title, chapter, visible }
const check = args.includes('--check');
import { execFileSync } from 'node:child_process';
let pjassFailures = 0;
const add = (file, buffer, title, chapter = '', visible = false, script = null) => {
  maps.push({ file, buffer, title, chapter, visible });
  const single = path.join(path.dirname(out), 'maps', file); // individual copies for standalone tests
  fs.mkdirSync(path.dirname(single), { recursive: true });
  fs.writeFileSync(single, buffer);
  if (check && script) {
    const jf = path.join(ROOT, 'build', 'pjass', file.replace(/\.w3x$/, '.j'));
    fs.mkdirSync(path.dirname(jf), { recursive: true });
    fs.writeFileSync(jf, script);
    try {
      execFileSync(path.join(ROOT, 'tools', 'bin', 'pjass.exe'), [path.join(ROOT, 'data', 'wc3', 'common.j'), path.join(ROOT, 'data', 'wc3', 'blizzard.j'), jf], { stdio: 'pipe' });
    } catch (e) {
      pjassFailures++;
      const errs = String(e.stdout).split('\n').filter((l) => /\.j:\d+/.test(l)).slice(0, 5);
      console.log(`  PJASS FAILED ${file}:\n${errs.join('\n')}`);
    }
  }
  process.stdout.write(`  ${file} (${Math.round(buffer.length / 1024)} KB)\n`);
};
const pad = (n) => String(n).padStart(2, '0');

for (const h of houses) {
  const player = HOUSE_NAME[h];
  const hub = `${h}_Hub.w3x`;
  const story = camp.story[h];
  console.log(`== ${player}`);
  const mission = (fileName, title, scripts, mapNeedle, kind, extra = {}) => {
    const m = buildMission({
      scripts: scripts.map((s) => ({ tok: tok(s.name), phase: s.phase, name: s.name })),
      meta: metaOf(mapNeedle), ...all, name: title, playerHouse: player, kind, hubMap: hub,
      territoryBattle: kind === 'attack' || kind === 'defend', briefing: scripts[0] ? briefing(scripts[0].name) : '',
      debugName: fileName.replace(/\.w3x$/, ''), ...extra,
    });
    add(fileName, m.buffer, title, '', false, m.script);
    return fileName;
  };

  // start mission (opened from the campaign screen)
  mission(`${h}_Start.w3x`, `${HOUSE_RU[h]}: Прибытие на Арракис`, [{ name: story.start[0], phase: 0 }], story.start[1], 'start');

  // territory battles
  const battleFile = {};
  for (let n = tFrom; n <= tTo; n++) {
    const t = camp.territories[n - 1];
    const owner = t.owner;
    for (const kind of ['attack', 'defend']) {
      if (kind === 'attack' && n === camp.jumpPoint[h]) continue; // never attack our own capital
      if (kind === 'defend' && owner !== h && n === camp.jumpPoint[owner]) continue; // enemy capitals are never defended
      const scripts = Object.values(camp.missions[h][kind]).filter((s) => s.territory === n && s.script).map((s) => ({ name: s.script, phase: s.phase }));
      if (kind === 'attack') {
        // forced jump-point missions (Forced Missions.txt) replace everything on enemy capitals
        for (const [defender, script] of Object.entries(camp.jumpScript[h] || {})) {
          if (camp.jumpPoint[defender] === n) { scripts.length = 0; for (const ph of [1, 2, 3]) scripts.push({ name: script, phase: ph }); }
        }
      }
      const file = `${h}_${kind === 'attack' ? 'A' : 'D'}${pad(n)}.w3x`;
      mission(file, `${kind === 'attack' ? 'Атака' : 'Оборона'}: ${t.name}`, scripts, `#T${n} `, kind, {
        territory: n, defaultEnemyHouse: HOUSE_NAME[owner === h ? (h === 'HK' ? 'AT' : 'HK') : owner],
      });
      battleFile[`${kind}:${n}`] = file;
    }
  }

  // story missions
  const storyFile = {};
  const storyMission = (key, def, title) => { if (!def) return; storyFile[key] = mission(`${h}_S_${key}.w3x`, title, [{ name: def[0], phase: 0 }], def[1], 'story'); };
  storyMission('Heighliner', story.heighliner, `${HOUSE_RU[h]}: Хайлайнер`);
  storyMission('HomeDefence', story.homeDefence, `${HOUSE_RU[h]}: Оборона родного мира`);
  storyFile.homeAttack = {};
  for (const [foe, def] of Object.entries(story.homeAttack)) {
    storyFile.homeAttack[foe] = mission(`${h}_S_Home${foe}.w3x`, `${HOUSE_RU[h]}: Вторжение (${HOUSE_RU[foe]})`, [{ name: def[0], phase: 0 }], def[1], 'story');
  }
  storyMission('End', story.end, `${HOUSE_RU[h]}: Последняя битва`);

  const hubMap = buildHub({
    house: h, campaign: camp, units: all.units,
    battleMap: (kind, n) => battleFile[`${kind}:${n}`] || null,
    storyMap: { heighliner: storyFile.Heighliner, homeDefence: storyFile.HomeDefence, homeAttack: storyFile.homeAttack, end: storyFile.End },
  });
  add(hub, hubMap.buffer, `Арракис — ${HOUSE_RU[h]}`, '', false, hubMap.script);
}

// tutorial (standalone: ends with the normal victory dialog)
{
  const m = buildMission({ scripts: [{ tok: tok('ATTutorial'), phase: 0, name: 'ATTutorial' }], meta: metaOf('#X1 '), ...all,
    name: 'Обучение', playerHouse: 'Atreides', kind: 'tutorial', territoryBattle: false, briefing: briefing('ATTutorial'), debugName: 'Tutorial' });
  add('Tutorial.w3x', m.buffer, 'Обучение', '', false, m.script);
}

// campaign screen: four visible buttons, the rest hidden
const visible = [['Tutorial.w3x', 'Обучение'], ...houses.map((h) => [`${h}_Start.w3x`, HOUSE_RU[h]])];
const order = [...visible.map(([file, title]) => ({ ...maps.find((m) => m.file === file), title, chapter: 'Emperor: Битва за Дюну', visible: true })),
  ...maps.filter((m) => !visible.some(([f]) => f === m.file))];
const w3n = buildCampaign({
  name: 'Emperor: Битва за Дюну', author: 'warcraft-dune (данные — ваша копия Emperor)', difficulty: 'Нормальная',
  description: 'Кампании трёх Великих Домов за Арракис. Собрано из вашей копии Emperor: Battle for Dune.',
  maps: order.map((m) => ({ file: m.file, buffer: m.buffer, title: m.title, chapter: m.chapter, visible: m.visible, button: m.visible })),
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, w3n);
if (check) console.log(`pjass failures: ${pjassFailures}`);
console.log(`campaign: ${maps.length} maps, ${Math.round(w3n.length / 1024 / 1024)} MB -> ${out}`);
