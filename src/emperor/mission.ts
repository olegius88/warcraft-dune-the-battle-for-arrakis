// Assemble an Emperor mission map (.w3x): converted terrain, Emperor object data (w3u/w3a +
// combat table), the JASS runtime, one or more translated mission scripts (one per campaign
// phase, chosen at runtime) and the campaign glue (game cache in, result out, back to the hub).

import { buildMap } from '../wc3/map.ts';
import { str, real } from '../wc3/jass.ts';
import { buildRuntime } from './runtime.ts';
import { renderFile } from '../wc3/template.ts';
import { jassFile } from '../config/paths.ts';
import { translateScript } from './translate.ts';
import { buildTerrain } from './terrain.ts';
import { battleSetup } from './battle.ts';
import type { House } from '../config/houses.ts';
import type { ScriptPlayer } from '../wc3/jass.ts';
import type { MapMeta, GamePoint } from './mapxbf.ts';
import type { TokenTable } from './tok.ts';
import type { MissionContext } from './context.ts';
import type { UnitData } from './units.ts';
import type { Rules } from './rules.ts';
import { superweapons } from './superweapons.ts';
import type { Speech } from './speech.ts';
import type { AiRules } from './ai-rules.ts';
import { HOUSE_ID, HOUSES, HOUSE_COLOR, OTHER_ENEMY_COLOR, CODE_BY_HOUSE, HOUSE_BY_CODE } from '../config/houses.ts';
import { CACHE_FILE, CACHE_KEY, DEFAULT_ENEMY, J_CACHE_CATEGORY as CAT, J_CACHE_KEY as K, KIND_ID, DEFAULT_PHASE, DEFAULT_TECH, START_MISSION_PHASE, START_MISSION_TECH } from '../config/campaign.ts';
import type { MissionKind } from '../config/campaign.ts';
import * as RT from '../config/runtime.ts';
import { TICK_SECONDS, TICKS_PER_SECOND, REPAIR_PERIOD_TICKS, EMPEROR_TILE, WC3_UNITS_PER_TILE, HP_DIVISOR, DAMAGE_DIVISOR, ARMOR_REDUCTION, moveSpeed } from '../config/scale.ts';
import { UNIT, DESTRUCTABLE, ITEM, EFFECT, ICON, ART_ABILITY, ABILITY } from '../config/wc3.ts';
import * as SC from '../config/scenery.ts';
import { SHUFFLE_BATTLE_MUSIC } from '../config/music.ts';

export type { MissionKind };
const FACING = real(RT.DEFAULT_FACING);

export interface MissionScript {
  tok: Buffer;
  /** campaign phase the script belongs to (chosen at run time) */
  phase: number;
  name: string;
  /** Fail / Win variant: chosen inside the campaign when the attack script was won (won) or not
   * (campaign-data.ts defendVariant) */
  whenWon?: { attack: string; won: boolean };
}

export interface MissionParams {
  /** mission scripts (may be empty: plain battle) */
  scripts?: MissionScript[];
  /** mapxbf.readMeta of the mission map */
  meta: MapMeta;
  /** token table (Game.exe) */
  table: TokenTable;
  ctx: MissionContext;
  units: UnitData;
  /** for the veterancy table; without it units get no veterancy */
  rules?: Rules;
  /** original speech of messages; null/absent = text only */
  speech?: Speech | null;
  /** ai.ini values of the territory battle AI */
  ai?: AiRules;
  /** map title */
  name: string;
  playerHouse: House;
  /** used when no campaign cache is present (standalone) */
  defaultEnemyHouse?: House;
  defaultTech?: number;
  defaultPhase?: number;
  territoryBattle?: boolean;
  /** campaign territory number (for entrances/results) */
  territory?: number;
  kind?: MissionKind;
  /** map to return to inside the campaign */
  hubMap?: string;
  /** loading screen text */
  briefing?: string;
  debugName?: string;
  /** extra JASS functions appended to the map script */
  extraFunctions?: string;
  /** probes: a function of extraFunctions run (ExecuteFunc) once the mission has started */
  extraStart?: string;
  /** automatic flow test: win the mission after this many seconds (config AUTOTEST_WIN_SECONDS) */
  autoWinSeconds?: number;
  /** music playlist: archive paths of tracks stored in the campaign (src/emperor/music.ts) */
  music?: string[];
  /** import the icons and Emperor models into this map (false: the campaign archive holds them once) */
  iconsInMap?: boolean;
}

export interface BuiltMission {
  buffer: Buffer;
  script: string;
  /** API functions that only got a stub */
  stubbed: string[];
  /** API functions the scripts use */
  used: Set<string>;
  /** archive files besides the generated ones (object data, speech) */
  imports: Record<string, Buffer>;
}

function buildMission(p: MissionParams): BuiltMission {
  const t = buildTerrain(p.meta);
  const typeNames = p.ctx.objectTypes.map((o) => o.name);
  const rawcodeOfIndex = (n: number): string => {
    const name = typeNames[n];
    const id = name && p.units.rawcode.get(name);
    return id || UNIT.fallback; // non-unit object types (explosions, bullets) fall back to a harmless unit
  };
  const scripts = (p.scripts || []).map((s, i) => ({
    ...s, tr: translateScript(s.tok, p.table, { rawcode: rawcodeOfIndex, varPrefix: `e${i}v` }, `EmpScript${i}`),
  }));
  const used = new Set<string>();
  const messages = new Set<number>();
  const tooltips = new Set<number>();
  for (const s of scripts) { s.tr.used.forEach((x) => used.add(x)); s.tr.messages.forEach((x) => messages.add(x)); s.tr.tooltips.forEach((x) => tooltips.add(x)); }

  const battle = battleSetup({ meta: p.meta, terrain: t, units: p.units, playerHouse: p.playerHouse, territoryBattle: Boolean(p.territoryBattle), defend: p.kind === 'defend', worms: p.rules?.worms, rules: p.rules, ...(p.ai ? { ai: p.ai } : {}), ...(p.debugName ? { aiReport: `${RT.DEBUG_REPORT_DIR}\\${p.debugName}_AI.pld` } : {}) });
  const deployMap: Record<string, string> = { [String(p.units.rawcode.get('MCV'))]: String(p.units.rawcode.get(`${CODE_BY_HOUSE[p.playerHouse]}ConYard`)) };
  const rt = buildRuntime(p.table, { deployMap });

  // ---- generated data init (points, strings) ----
  const ge = p.meta.gameElements || {};
  const init: string[] = [];
  const toW = (pt: GamePoint): [number, number] => t.toWorld(pt.x, pt.y);
  for (const subs of Object.values(ge)) {
    for (const [sname, pts] of Object.entries(subs)) {
      const m = sname.match(/^Script(\d+)$/);
      if (m && pts[0]) { const [x, y] = toW(pts[0]); init.push(`    set EmpScriptX[${m[1]}] = ${real(x)}`, `    set EmpScriptY[${m[1]}] = ${real(y)}`); }
    }
  }
  const bases = [...((ge.Base || {}).Primary || []), ...((ge.Base || {}).Default || []), ...((ge.Base || {}).Secondary || [])];
  bases.forEach((b, i) => { const [x, y] = toW(b); init.push(`    set EmpBaseX[${i}] = ${real(x)}`, `    set EmpBaseY[${i}] = ${real(y)}`, `    set EmpBaseOwner[${i}] = -1`); });
  init.push(`    set EmpBaseCount = ${Math.max(1, bases.length)}`);
  if (!bases.length) init.push('    set EmpBaseX[0] = 0.0', '    set EmpBaseY[0] = 0.0', '    set EmpBaseOwner[0] = -1');
  for (let s = 0; s <= RT.NEUTRAL_SIDE; s++) init.push(`    set EmpSideBase[${s}] = -1`);
  init.push('    set EmpSideBase[0] = 0', '    set EmpBaseOwner[0] = 0');
  const entrances = ((ge.Entrance || {}).Connected_Entrance) || [];
  entrances.forEach((e, i) => { const [x, y] = toW(e); init.push(`    set EmpEntrX[${i}] = ${real(x)}`, `    set EmpEntrY[${i}] = ${real(y)}`, `    set EmpEntrTag[${i}] = ${e.tag}`); });
  init.push(`    set EmpEntrCount = ${entrances.length}`);
  if (!entrances.length) init.push('    set EmpEntrX[0] = 0.0', '    set EmpEntrY[0] = 0.0', `    set EmpEntrTag[0] = ${RT.NEUTRAL_TAG}`, '    set EmpEntrCount = 1');
  // Scripts that end the game themselves (story/start missions) do not use the normal
  // "destroy the enemy house" rule; territory battles do.
  init.push(`    set EmpNormalConditions = ${used.has('EndGameWin') || used.has('EndGameLose') ? 'false' : 'true'}`);
  for (const n of messages) { const text = p.ctx.messageText(n); if (text) init.push(`    set EmpMsgText[${n}] = ${str(text)}`); }
  // original speech of the messages this map uses (src/emperor/speech.js; test/emperor-mission.test.ts)
  const speechImports: Record<string, Buffer> = {};
  for (const n of messages) {
    const sp = p.speech && p.speech.forKey(p.ctx.messageKey(n));
    if (!sp) continue;
    speechImports[sp.path] = sp.data;
    init.push(`    set EmpMsgSound[${n}] = ${str(sp.path)}`, `    set EmpMsgSoundLen[${n}] = ${real(sp.seconds)}`);
  }
  for (const n of tooltips) { const text = p.ctx.tooltipText(n); if (text) init.push(`    set EmpTipText[${n}] = ${str(text)}`); }
  // spoken briefing of each script (sounds.txt section Briefing), queued at start for the script
  // chosen by the campaign phase (regression/feature test: test/emperor-mission.test.ts)
  const briefingBlocks = scripts.map((s, i) => {
    const lines = p.speech ? p.speech.briefing(s.name.replace(/\.tok$/i, '')) : [];
    for (const l of lines) speechImports[l.path] = l.data;
    return lines.length
      ? `    if EmpScriptIndex == ${i} then\n${lines.map((l) => `        call EmpSpeak(${str(l.path)}, ${real(l.seconds)})`).join('\n')}\n    endif`
      : '';
  }).filter(Boolean);
  // spoken debriefing (section Debriefing) of the chosen script, by result; returns its length so
  // the return to the hub waits for it
  const debriefBlocks = scripts.map((s, i) => {
    const name = s.name.replace(/\.tok$/i, '');
    const speak = (win: boolean): string => {
      const lines = p.speech ? p.speech.debrief(name, win) : [];
      for (const l of lines) speechImports[l.path] = l.data;
      return lines.map((l) => `            call EmpSpeak(${str(l.path)}, ${real(l.seconds)})\n            set t = t + ${real(l.seconds + RT.SPEECH_GAP)}`).join('\n');
    };
    const win = speak(true), lose = speak(false);
    return win || lose ? `    if EmpScriptIndex == ${i} then\n        if win then\n${win}\n        else\n${lose}\n        endif\n    endif` : '';
  }).filter(Boolean);
  // ---- objects placed in the map itself (test.xbf tag 0x07) ----
  // owner 1 = the side defending the map (-> Player(1), e.g. the whole Atreides base of the
  // Caladan capital map), owner 0 = the player's side (-> Player(0)), owners 2/3 = scenery
  // (trees, houses, barrels, wrecks, crates).
  const placed = [];
  for (const b of p.meta.buildings || []) {
    const [x, y] = t.toWorld(b.x * EMPEROR_TILE + EMPEROR_TILE / 2, b.y * EMPEROR_TILE + EMPEROR_TILE / 2);
    const at = `${real(x)}, ${real(y)}`;
    const n = b.name;
    // Factory frigates are real objects: heighliner scripts win when the enemy has none left
    // (regression test: test/emperor-mission.test.ts).
    if (SC.SKIPPED_OBJECTS.test(n)) continue;
    if (SC.BARREL.test(n)) placed.push(`    call CreateDestructable('${DESTRUCTABLE.barrel}', ${at}, ${real((b.x * SC.BARREL_FACING_HASH) % 360)}, 1.0, 0)`);
    else if (SC.TREE.test(n)) placed.push(`    call CreateDestructable('${DESTRUCTABLE.tree}', ${at}, ${real((b.x * SC.TREE_FACING_HASH) % 360)}, 1.0, 0)`);
    else if (SC.WRECK.test(n)) placed.push(`    call CreateDestructable('${DESTRUCTABLE.wreck}', ${at}, 0.0, ${real(SC.WRECK_SCALE)}, 0)`);
    else if (SC.CRATE.test(n)) {
      // Rules.txt CrateGiftObject: a unit type or CASH<n>; unknown gifts (GUNiabTank) -> 500 credits
      const gift = (p.rules && p.rules.crates && p.rules.crates.get(n)) || '';
      // was /^CASH(d+)/ (a heredoc ate the backslash): money crates gave 500 instead of n
      // (regression test: test/emperor-mission.test.ts)
      const cash = /^CASH(\d+)/i.exec(gift);
      const id = cash ? null : p.units.rawcode.get(gift);
      placed.push(`    call EmpAddCrate(${at}, ${id ? `'${id}'` : 0}, ${id ? 0 : cash ? cash[1] : RT.CRATE_DEFAULT_CASH})`);
    }
    else if (SC.CIVILIAN_PREFIX.test(n) && SC.CIVILIAN_KIND.test(n)) {
      placed.push(`    call CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '${UNIT.civilianHouse}', ${at}, ${FACING})`);
    } else if (p.units.rawcode.has(n)) {
      // owner 0 = the player's side (own frigate on #H2/#H3, the HK base of #V1 Homeworld Defence)
      // Owners 2 and 3 are categories of neutral objects, not scripted sides (all 48 maps checked
      // 2026-10-07): 2 = crates, trees, town buildings, the docked frigates of #H1 (its script makes its
      // own frigate with NewObjectOffsetOrientation); 3 = wrecks, barrels, civilian houses, Ix/Tleilaxu
      // transports, smuggler starports, Ix/Guild cannons. No map places an army for them.
      const who = b.owner === 1 ? 'Player(1)' : b.owner === 0 ? 'Player(0)' : 'Player(PLAYER_NEUTRAL_PASSIVE)';
      placed.push(`    call CreateUnit(${who}, '${p.units.rawcode.get(n)}', ${at}, ${FACING})`);
    }
  }
  // ---- veterancy table (Rules.txt Score + VeterancyLevel blocks), same scaling as units.ts ----
  const vetLines = [];
  for (const o of (p.rules ? p.rules.objects.values() : [])) {
    const id = p.units.rawcode.get(o.name);
    if (!id) continue;
    if (o.score !== 1) vetLines.push(`    call SaveInteger(EmpVet, '${id}', 0, ${o.score})`);
    if (o.stealthedWhenStill) vetLines.push(`    call SaveBoolean(EmpVet, '${id}', 2, true)`);
    // UnstealthRange: this type reveals stealthed enemies within it (WC3 units)
    if (o.unstealthRange > 0) vetLines.push(`    call SaveReal(EmpVet, '${id}', 3, ${real(o.unstealthRange * WC3_UNITS_PER_TILE)})`);
    if (o.aiThreat > 0) vetLines.push(`    call SaveInteger(EmpThreat, '${id}', 0, ${o.aiThreat})`);
    // ExcludeFromCampaignLose: not counted by the normal win/lose rule (EmpLoseCount)
    if (o.excludeFromLose) vetLines.push(`    call SaveBoolean(EmpVet, '${id}', 4, true)`);
    // CanSelfRepair n = n health per repair period -> WC3 health per second
    const regen = (n: number): string => real((n * TICKS_PER_SECOND) / REPAIR_PERIOD_TICKS / HP_DIVISOR);
    o.veterancy.forEach((l, i) => vetLines.push(`    call EmpVetLevel('${id}', ${i + 1}, ${l.score}, ${Math.round(l.health / HP_DIVISOR)}, ${l.extraDamage}, ${l.extraArmour}, ${l.extraRange}, ${l.speed ? Math.round(moveSpeed(l.speed)) : 0}, ${regen(l.selfRepair)}, ${l.elite}, ${l.stealthedWhenStill})`));
  }
  // every Rules.txt type has an AIThreat: the AI's threat targeting is always on
  if (p.rules && [...p.rules.objects.values()].some((o) => o.aiThreat > 0)) vetLines.push('    set EmpThreatAny = true');
  const half = (n: number): number => (n * WC3_UNITS_PER_TILE) / 2;
  const [bl, br, bb, btop] = t.boundary;
  init.push(`    set EmpMapMinX = ${real(-half(t.width) + bl * WC3_UNITS_PER_TILE)}`, `    set EmpMapMaxX = ${real(half(t.width) - br * WC3_UNITS_PER_TILE)}`);
  init.push(`    set EmpMapMinY = ${real(-half(t.height) + bb * WC3_UNITS_PER_TILE)}`, `    set EmpMapMaxY = ${real(half(t.height) - btop * WC3_UNITS_PER_TILE)}`);

  const playerHouseId = HOUSE_ID[p.playerHouse];
  const defaultEnemy = HOUSE_ID[p.defaultEnemyHouse || HOUSE_BY_CODE[DEFAULT_ENEMY[CODE_BY_HOUSE[p.playerHouse]]]];
  const dispatch = scripts.length
    ? scripts.map((s, i) => `    ${i === 0 ? 'if' : 'elseif'} EmpScriptIndex == ${i} then\n        call EmpScript${i}()`).join('\n') + '\n    endif'
    : '';
  // ---- palace super weapons (src/emperor/superweapons.ts; strike in runtime helpers.j) ----
  const SW_KIND = { deathHand: 1, hawk: 2, beam: 3 } as const;
  const swLines: string[] = [];
  const swLimitLines: string[] = [];
  for (const w of p.rules ? superweapons(p.rules) : []) {
    const id = p.units.rawcode.get(w.name);
    if (!id) continue;
    swLines.push(`    call EmpSwType('${id}', ${SW_KIND[w.kind]}, ${real(w.damage / DAMAGE_DIVISOR)}, ${real(w.radiusTiles * WC3_UNITS_PER_TILE)}, ${w.friendly}, ${real(w.effectTicks / TICKS_PER_SECOND)})`);
    // DeathHandSplat Size is the side of the square splat in tiles: radius half of it
    if (w.fallout) swLines.push(`    call EmpSwFallout('${id}', ${real(w.fallout.damage / DAMAGE_DIVISOR)}, ${real((w.fallout.sizeTiles / 2) * WC3_UNITS_PER_TILE)}, ${real(w.fallout.lifespanTicks / TICKS_PER_SECOND)}, ${w.fallout.friendly})`);
    if (w.kind === 'deathHand') swLines.push(`    set EmpSwDeathHand = '${id}'`);
    swLimitLines.push(`        call SetPlayerTechMaxAllowed(Player(i), '${id}', 1)`);
  }

  // a Fail / Win variant (listed after its base script) replaces it by the attack's result
  const wonKey = (attack: string): string => str(CACHE_KEY.wonPrefix + attack);
  const wonCheck = (s: MissionScript): string => (s.whenWon ? ` and GetStoredInteger(EmpCache, ${CAT}, ${wonKey(s.whenWon.attack)}) ${s.whenWon.won ? '==' : '!='} 1` : '');
  // an attack records its win for the defence variants of its territory
  const wonLines = p.kind === 'attack' ? scripts.map((s, i) => `        if EmpScriptIndex == ${i} then\n            call StoreInteger(EmpCache, ${CAT}, ${wonKey(s.name)}, 1)\n        endif`).join('\n') : '';
  const pickScript = scripts.length
    ? `    // pick the script of the current campaign phase (fallback: the first one)\n    set EmpScriptIndex = 0\n${scripts.map((s, i) => `    if ${s.whenWon ? 'EmpInCampaign and ' : ''}EmpPhase == ${s.phase}${wonCheck(s)} then\n        set EmpScriptIndex = ${i}\n    endif`).join('\n')}`
    : '';

  // reinforcement pick table: units with a ReinforcementValue, by house (index = house id)
  const reinfLines: string[] = [];
  HOUSES.forEach((house, h) => {
    const list = [...(p.rules ? p.rules.objects.values() : [])]
      .filter((o) => o.house === house && o.reinforcementValue > 0 && p.units.rawcode.has(o.name));
    if (list.length > RT.REINF_SLOT_STRIDE) throw new Error(`${house}: ${list.length} reinforcement units > REINF_SLOT_STRIDE`);
    list.forEach((o, k) => {
      const i = h * RT.REINF_SLOT_STRIDE + k;
      reinfLines.push(`    set EmpReinfType[${i}] = '${p.units.rawcode.get(o.name)}'`, `    set EmpReinfCost[${i}] = ${o.reinforcementValue}`, `    set EmpReinfTech[${i}] = ${o.techLevel}`);
    });
    reinfLines.push(`    set EmpReinfCount[${h}] = ${list.length}`);
  });
  const reinf = p.rules?.reinforcements ?? { delay: 0, variation: 0, messageBefore: 0, initial: 0, subsequent: 0 };

  // music: a JASS string literal of the ";"-separated playlist, or '' for none
  const musicList = p.music && p.music.length ? str(p.music.join(';')) : '';

  const glueGlobals = renderFile(jassFile('mission/globals'), {
    phase: p.defaultPhase || DEFAULT_PHASE, tech: p.defaultTech || DEFAULT_TECH, defaultEnemy, territory: p.territory || 0,
  });

  // values of the src/jass/mission files
  const scope = {
    CACHE_FILE, CAT, K, RT, ITEM, EFFECT, ICON, ART_ABILITY, FACING, ARMOR_REDUCTION, TICK_SECONDS, HOUSE_ID, OTHER_ENEMY_COLOR,
    SHUFFLE_BATTLE_MUSIC, START_MISSION_PHASE, START_MISSION_TECH,
    isTutorial: p.kind === 'tutorial', isStart: p.kind === 'start', isDefend: p.kind === 'defend',
    hasDebrief: debriefBlocks.length > 0, hasBriefingSpeech: briefingBlocks.length > 0,
    hubMap: p.hubMap || '', kindId: KIND_ID[p.kind || 'attack'], wonLines, extraStart: p.extraStart ?? '', swLines: swLines.join('\n'), swLimitLines: swLimitLines.join('\n'), vetLines: vetLines.join('\n'),
    musicList, jFirstTrack: str(p.music?.[0] ?? ''),
    jReportFile: str(`${RT.DEBUG_REPORT_DIR}\\${p.debugName || 'mission'}.pld`),
    name: p.name, briefing: p.briefing || '', pickScript, battleInit: battle.init, autoWinSeconds: p.autoWinSeconds || 0,
    playerHouse: playerHouseId, reinf, reinfLines: reinfLines.join('\n'), ABILITY,
    stealth: p.rules?.stealth ?? { delay: 0, afterFiring: 0 },
    // the largest UnstealthRange: how far to look for a detector
    detectRadius: real(Math.max(0, ...[...(p.rules ? p.rules.objects.values() : [])].map((o) => o.unstealthRange)) * WC3_UNITS_PER_TILE),
    colorPlayer: HOUSE_COLOR[playerHouseId], colorAtreides: HOUSE_COLOR[HOUSE_ID.Atreides], colorHarkonnen: HOUSE_COLOR[HOUSE_ID.Harkonnen],
  };
  const jass = (name: string): string => renderFile(jassFile(`mission/${name}`), scope);

  const functions = [
    rt.helpers, rt.functions, battle.functions, ...scripts.map((s) => s.tr.body),
    `function EmpData takes nothing returns nothing\n${init.join('\n')}\nendfunction`,
    jass('crates'),
    jass('veterancy'),
    jass('reinforcements'),
    jass('stealth'),
    jass('superweapon'),
    `function EmpPlaced takes nothing returns nothing\n${placed.join('\n')}\nendfunction`,
    `function EmpMissionTick takes nothing returns nothing\n${dispatch}\nendfunction`,
    ...(debriefBlocks.length ? [`function EmpDebriefSpeech takes boolean win returns real\n    local real t = 0.0\n${debriefBlocks.join('\n')}\n    return t\nendfunction`] : []),
    jass('campaign'),
    p.extraFunctions || '',
    jass('tick'),
    jass('debug-report'),
    jass('camera'),
    ...(briefingBlocks.length ? [`function EmpBriefingSpeech takes nothing returns nothing\n${briefingBlocks.join('\n')}\nendfunction`] : []),
    ...(p.autoWinSeconds ? [jass('autowin')] : []),
    jass('start'),
  ].join('\n\n');

  // players: 0 user + 1..11 computer (sides); all on their own team
  const [mapW, mapH] = p.meta.mapSize as [number, number]; // buildTerrain has checked it
  const b0 = bases[0] || { x: mapW * EMPEROR_TILE / 2, y: mapH * EMPEROR_TILE / 2 };
  const [sx, sy] = t.toWorld(b0.x, b0.y);
  const players: ScriptPlayer[] = [{ id: 0, control: 'user', race: 'human', team: 0, x: sx, y: sy, name: RT.PLAYER_NAME }];
  for (let i = 1; i <= RT.MAX_SIDE; i++) players.push({ id: i, control: 'computer', race: 'orc', team: i, x: sx, y: sy, name: `${RT.SIDE_NAME_PREFIX}${i}` });

  const imports: Record<string, Buffer> = { 'war3map.w3u': p.units.w3u, 'war3map.w3a': p.units.w3a, 'war3map.w3q': p.units.w3q, 'war3mapMisc.txt': Buffer.from(p.units.misc, 'utf8'), ...speechImports, ...(p.iconsInMap === false ? {} : { ...p.units.icons, ...p.units.models }) };
  const m = buildMap({
    name: p.name, description: p.briefing || '', width: t.width, height: t.height, boundary: t.boundary,
    tileset: t.tileset, ground: t.ground, cliffs: t.cliffs, corner: t.corner, pathing: t.pathing, minimapColor: t.minimapColor,
    players, globals: rt.globals + glueGlobals + '\n' + scripts.map((s) => s.tr.globals).join('\n'), functions,
    init: '    call TimerStart( CreateTimer(), 0.0, false, function EmpStart )',
    imports,
    loadingTitle: p.name, loadingText: p.briefing || '',
  });
  return { buffer: m.buffer, script: m.script, stubbed: rt.stubbed, used, imports };
}

export { buildMission };
