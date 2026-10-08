// Assemble an Emperor mission map (.w3x): converted terrain, Emperor object data (w3u/w3a +
// combat table), the JASS runtime, one or more translated mission scripts (one per campaign
// phase, chosen at runtime) and the campaign glue (game cache in, result out, back to the hub).

import { buildMap } from '../wc3/map.ts';
import { str, real } from '../wc3/jass.ts';
import { moviePlayer } from './movie-player.ts';
import type { PlayerMovies } from './movie-player.ts';
import { buildRuntime } from './runtime.ts';
import { renderFile } from '../wc3/template.ts';
import { jassFile } from '../config/paths.ts';
import { translateScript } from './translate.ts';
import { buildTerrain } from './terrain.ts';
import { battleSetup, storyAiHouse } from './battle.ts';
import { defensivePoints } from './ai-points.ts';
import { AI_DEF_POINT, STORY_AI_OWNER, STORY_AI_BUILDING } from '../config/battle.ts';
import type { House } from '../config/houses.ts';
import type { ScriptPlayer } from '../wc3/jass.ts';
import type { MapMeta, GamePoint } from './mapxbf.ts';
import type { TokenTable } from './tok.ts';
import type { MissionContext } from './context.ts';
import type { UnitData } from './units.ts';
import type { Rules } from './rules.ts';
import { superweapons } from './superweapons.ts';
import { specialAbilities } from './specials.ts';
import type { Speech } from './speech.ts';
import type { AiRules } from './ai-rules.ts';
import { HOUSE_ID, HOUSES, HOUSE_COLOR, OTHER_ENEMY_COLOR, CODE_BY_HOUSE, HOUSE_BY_CODE } from '../config/houses.ts';
import { CACHE_FILE, CACHE_KEY, SUBHOUSE_TAGS, SUBHOUSE_BUILDINGS, ALLYGAIN_TAGS, ALLYGAIN_KEY, ALLYBREAK_KEY, DEFAULT_ENEMY, J_CACHE_CATEGORY as CAT, J_CACHE_KEY as K, KIND_ID, DEFAULT_PHASE, DEFAULT_TECH, START_MISSION_PHASE, START_MISSION_TECH } from '../config/campaign.ts';
import type { MissionKind } from '../config/campaign.ts';
import * as RT from '../config/runtime.ts';
import { TICK_SECONDS, TICKS_PER_SECOND, REPAIR_PERIOD_TICKS, EMPEROR_TILE, WC3_UNITS_PER_TILE, HP_DIVISOR, DAMAGE_DIVISOR, ARMOR_REDUCTION, moveSpeed } from '../config/scale.ts';
import { UNIT, DESTRUCTABLE, ITEM, EFFECT, ICON, ART_ABILITY, ABILITY } from '../config/wc3.ts';
import { EFFECT_MAX_RADIUS } from '../config/models.ts';
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
  /** a single map outside the campaign (src/emperor/build-contest.ts): a start mission that ends with
   * the game's own victory / defeat instead of going on in the campaign */
  standalone?: boolean;
  /** movies shown before the mission starts (movie/player.j; their files in extraImports) */
  intro?: { movies: string[]; player: PlayerMovies };
  /** more archive files (the movies and music of a standalone map) */
  extraImports?: Record<string, Buffer>;
  /** the map list description (default: the briefing) */
  mapDescription?: string;
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
  const intro = p.intro ? moviePlayer(p.intro.player, `${RT.DEBUG_REPORT_DIR}\\${p.debugName ?? 'Mission'}_Movies.pld`) : null;
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

  const battle = battleSetup({ meta: p.meta, terrain: t, units: p.units, playerHouse: p.playerHouse, territoryBattle: Boolean(p.territoryBattle), defend: p.kind === 'defend', worms: p.rules?.worms, rules: p.rules, storyAi: p.kind === 'story', ...(p.ai ? { ai: p.ai } : {}), ...(p.debugName ? { aiReport: `${RT.DEBUG_REPORT_DIR}\\${p.debugName}_AI.pld` } : {}) });
  // story maps with a base of side 1 (battle.ts storyAiHouse): that house is side 1's
  const storyHouse = p.kind === 'story' ? storyAiHouse(p.meta) : null;
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
  // the defensive assembly points of each base point (Game.exe "D AP", src/emperor/ai-points.ts),
  // the enemy taken at the map centre; the story AI's yard gets the index its own base point takes at
  // runtime (battle forces.j EmpStoryAiStart)
  if (p.meta.tiles && p.meta.mapSize) {
    const [W, H] = p.meta.mapSize;
    const sites: Array<[number, number]> = bases.map((b) => [Math.floor(b.x / EMPEROR_TILE), Math.floor(b.y / EMPEROR_TILE)]);
    const yard = (p.meta.buildings ?? []).find((o) => o.owner === STORY_AI_OWNER && o.name.endsWith(STORY_AI_BUILDING));
    if (yard) sites[Math.max(1, bases.length)] = [yard.x, yard.y];
    sites.forEach(([bx, by], b) => defensivePoints(p.meta.tiles as Buffer, W, H, bx, by, Math.floor(W / 2), Math.floor(H / 2)).forEach(([x, y], k) => {
      const [wx, wy] = t.toWorld(x * EMPEROR_TILE + EMPEROR_TILE / 2, y * EMPEROR_TILE + EMPEROR_TILE / 2);
      init.push(`    set EmpAiDefX[${b * AI_DEF_POINT.count + k}] = ${real(wx)}`, `    set EmpAiDefY[${b * AI_DEF_POINT.count + k}] = ${real(wy)}`);
    }));
  }
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
  // "<H>allygain<k>" messages: playing one marks the alliance with sub-house k (config ALLYGAIN_TAGS)
  // ... and "<H>allybreak<k>" ends it (negative: -k)
  for (const n of messages) {
    const k = Number(ALLYGAIN_KEY.exec(p.ctx.messageKey(n) ?? '')?.[1] ?? 0);
    if (k >= 1 && k <= ALLYGAIN_TAGS.length) init.push(`    set EmpMsgAlly[${n}] = ${k}`);
    const b = Number(ALLYBREAK_KEY.exec(p.ctx.messageKey(n) ?? '')?.[1] ?? 0);
    if (b >= 1 && b <= ALLYGAIN_TAGS.length) init.push(`    set EmpMsgAlly[${n}] = -${b}`);
  }
  // original speech of the messages this map uses (src/emperor/speech.js; test/emperor-mission.test.ts)
  const speechImports: Record<string, Buffer> = {};
  for (const n of messages) {
    const sp = p.speech && p.speech.forKey(p.ctx.messageKey(n));
    if (!sp) continue;
    speechImports[sp.path] = sp.data;
    init.push(`    set EmpMsgSound[${n}] = ${str(sp.path)}`, `    set EmpMsgSoundLen[${n}] = ${real(sp.seconds)}`);
  }
  // in-game announcements (config UI_EVENTS, helpers.j EmpUiSay): the player's house version of the
  // line (ATLowPower), else the plain one (BaseAttack); text and speech of IngameMessages
  const houseCode = CODE_BY_HOUSE[p.playerHouse];
  RT.UI_EVENTS.forEach(([, key, gap], i) => {
    const k = [`${houseCode}${key}`, key].find((x) => p.ctx.textByKey(x) || p.speech?.forKey(x));
    if (!k) return;
    init.push(`    set EmpUiText[${i + 1}] = ${str(p.ctx.textByKey(k) ?? '')}`, `    set EmpUiGap[${i + 1}] = ${real(gap)}`);
    const sp = p.speech?.forKey(k);
    if (sp) {
      speechImports[sp.path] = sp.data;
      init.push(`    set EmpUiSound[${i + 1}] = ${str(sp.path)}`, `    set EmpUiLen[${i + 1}] = ${real(sp.seconds)}`);
    }
  });
  // harvesters: their attack has its own announcement
  for (const o of p.rules ? p.rules.objects.values() : []) {
    const id = p.units.rawcode.get(o.name);
    if (id && o.harvester) init.push(`    call SaveBoolean(EmpUiTab, '${id}', 0, true)`);
    // a lost wall or factory frigate is not announced (Game.exe; config UI_SILENT_LOSS)
    if (id && (RT.UI_SILENT_LOSS as readonly string[]).includes(o.name.slice(RT.HOUSE_PREFIX_LENGTH))) init.push(`    call SaveBoolean(EmpUiTab, '${id}', 1, true)`);
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
  // ExtraRange: the veteran copy of the type and the morph ability into it (units.ts vetRange)
  for (const v of p.units.vetRange ?? []) vetLines.push(`    call EmpVetRangeType('${v.type}', ${v.percent}, '${v.veteran}', '${v.morph}')`);
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
  // armour classes (Rules.txt [ArmourTypes], and Earplugs which warheads name besides): index + 1 of a
  // type's armour at EmpSwTab child SW_ARMOUR_KEY; the warhead percentage of a strike at
  // SW_STRIKE_PCT_KEY + index + 1 and of its fallout at SW_FALLOUT_PCT_KEY + index + 1 (helpers.j)
  const armours = p.rules ? [...new Set([...p.rules.armourTypes, 'Earplugs'])] : [];
  const pctLines = (id: string, base: number, warhead: string): string[] => {
    const s = p.rules?.sections.get(warhead.toLowerCase());
    if (!s) return [];
    const pct = new Map(s.entries.map(([k, v]) => [k, parseFloat(v.split('//')[0] ?? '')]));
    return armours.map((a, i) => `    call SaveInteger(EmpSwTab, '${id}', ${base + i + 1}, ${Number.isFinite(pct.get(a)) ? pct.get(a) : RT.SW_DEFAULT_PCT})`);
  };
  const sws = p.rules ? superweapons(p.rules) : [];
  if (sws.length) {
    for (const o of p.rules ? p.rules.objects.values() : []) {
      const id = p.units.rawcode.get(o.name);
      const k = armours.indexOf(o.armour);
      if (id && k >= 0) swLines.push(`    call SaveInteger(EmpSwTab, '${id}', ${RT.SW_ARMOUR_KEY}, ${k + 1})`);
    }
  }
  for (const w of sws) {
    const id = p.units.rawcode.get(w.name);
    if (!id) continue;
    swLines.push(`    call EmpSwType('${id}', ${SW_KIND[w.kind]}, ${real(w.damage / DAMAGE_DIVISOR)}, ${real(w.radiusTiles * WC3_UNITS_PER_TILE)}, ${w.friendly}, ${real(w.effectTicks / TICKS_PER_SECOND)})`);
    swLines.push(...pctLines(id, RT.SW_STRIKE_PCT_KEY, w.warhead));
    // the fallout bullet hits every tick (superweapons.ts): damage per second, within its BlastRadius
    if (w.fallout) {
      swLines.push(`    call EmpSwFallout('${id}', ${real((w.fallout.damage * TICKS_PER_SECOND) / DAMAGE_DIVISOR)}, ${real(w.fallout.radiusTiles * WC3_UNITS_PER_TILE)}, ${real(w.fallout.lifespanTicks / TICKS_PER_SECOND)}, ${w.fallout.friendly})`);
      swLines.push(...pctLines(id, RT.SW_FALLOUT_PCT_KEY, w.fallout.warhead));
    }
    if (w.kind === 'deathHand') swLines.push(`    set EmpSwDeathHand = '${id}'`);
    swLimitLines.push(`        call SetPlayerTechMaxAllowed(Player(i), '${id}', 1)`);
  }

  // ---- starport prices ([General] StarportCost*; mission starport.j) ----
  const portLines: string[] = [];
  let portTypes = 0;
  for (const o of p.rules ? p.rules.objects.values() : []) {
    const id = p.units.rawcode.get(o.name);
    if (!id) continue;
    if (/^true$/i.test((o.raw.Starport ?? '').trim())) portLines.push(`    call SaveBoolean(EmpPortTab, '${id}', 2, true)`);
    // a starport sells orders (src/emperor/units.ts portOrders): price data on the order, and the unit
    // the frigate brings for it
    const order = [...(p.units.portOrders ?? [])].find(([, real]) => real === id)?.[0];
    if (order && o.category === 'Unit' && o.cost > 0) {
      // (the unit: 5 = its index, for the cart at delivery)
      portLines.push(`    call SaveInteger(EmpPortTab, '${order}', 0, ${portTypes})`, `    call SaveInteger(EmpPortTab, '${order}', 1, ${o.cost})`, `    call SaveInteger(EmpPortTab, '${order}', 3, '${id}')`, `    call SaveInteger(EmpPortTab, '${id}', 5, ${portTypes})`);
      portTypes++;
    }
  }
  const portVariation = Number(p.rules?.general.StarportCostVariationPercent ?? 0) || 0;
  const portScope = {
    portLines: portLines.join('\n'), portTypes, pctMin: 100 - portVariation, pctMax: 100 + portVariation,
    updateSeconds: (Number(p.rules?.general.StarportCostUpdateDelay ?? 0) || TICKS_PER_SECOND) / TICKS_PER_SECOND,
    // [General] FrigateCountdown ('time for frigate to arrive', ticks), StarportMaxDeliverySingle
    portFrigateSeconds: (Number(p.rules?.general.FrigateCountdown ?? 0) || TICKS_PER_SECOND) / TICKS_PER_SECOND,
    portMaxDelivery: Number(p.rules?.general.StarportMaxDeliverySingle ?? 0) || 1,
    // [General] StarportStockIncreaseProb (percent) / StarportStockIncreaseDelay (ticks): starport.j
    // EmpPortStockTick, the rest of the rule from Game.exe (test/emperor-mission.test.ts)
    portStockProb: Number(p.rules?.general.StarportStockIncreaseProb ?? 0) || 0,
    portStockSeconds: (Number(p.rules?.general.StarportStockIncreaseDelay ?? 0) || TICKS_PER_SECOND) / TICKS_PER_SECOND,
    // effects of every type (src/emperor/effects.ts; mission effects.j)
    fxLines: [...(p.units.effects ?? [])].flatMap(([id, fx]) => fx.flatMap((model, k) => {
      if (!model) return [];
      const scale = Math.min(1, (EFFECT_MAX_RADIUS[k] as number) / Math.max(1, p.units.effectRadius?.get(model) ?? 1));
      // a muzzle flash of a converted model without a weapon attachment: where it goes (key 21)
      const at = k === 1 ? p.units.muzzleAt?.get(id) : undefined;
      return [`    call SaveStr(EmpFxTab, '${id}', ${k}, ${str(model)})`, ...(scale < 1 ? [`    call SaveReal(EmpFxTab, '${id}', ${10 + k}, ${real(scale)})`] : []),
        ...(at ? [`    call SaveStr(EmpFxTab, '${id}', 21, ${str(at)})`] : [])];
    })).join('\n'),
    // the frigate ([Frigate]) shown flying in and out
    portFrigateUnit: p.units.rawcode.get('Frigate') ?? UNIT.fallback,
    ORDER_CANCEL: RT.ORDER_CANCEL, PORT_PRICE_TEXT: RT.PORT_PRICE_TEXT, PORT_NO_STOCK_TEXT: RT.PORT_NO_STOCK_TEXT, PORT_CART_FULL_TEXT: RT.PORT_CART_FULL_TEXT,
  };

  // ---- special abilities (src/emperor/specials.ts; runtime mission specials.j) ----
  const sp = p.rules ? specialAbilities(p.rules) : null;
  const spLines: string[] = [];
  if (sp && p.rules) {
    const idOf = (n: string): string | undefined => p.units.rawcode.get(n);
    const kind = (n: string, k: number): void => { const id = idOf(n); if (id) spLines.push(`    call SaveInteger(EmpSpTab, '${id}', 0, ${k})`); };
    const flag = (n: string, k: number): void => { const id = idOf(n); if (id) spLines.push(`    call SaveBoolean(EmpSpTab, '${id}', ${k}, true)`); };
    sp.deviators.forEach((n) => kind(n, 1));
    for (const l of sp.leeches) {
      kind(l.name, l.infantry ? 3 : 2);
      const id = idOf(l.name);
      // ShieldHealth per tick -> WC3 health per second
      if (id) spLines.push(`    call SaveReal(EmpSpTab, '${id}', 1, ${real((l.damagePerTick * TICKS_PER_SECOND) / HP_DIVISOR)})`);
    }
    sp.engineers.forEach((n) => kind(n, 4));
    for (const s of sp.saboteurs) {
      kind(s.name, 5);
      const id = idOf(s.name);
      if (id) spLines.push(`    call SaveReal(EmpSpTab, '${id}', 3, ${real(s.damage / DAMAGE_DIVISOR)})`, `    call SaveReal(EmpSpTab, '${id}', 4, ${real(s.radiusTiles * WC3_UNITS_PER_TILE)})`);
    }
    for (const n of sp.repair.units) {
      kind(n, 6);
      const id = idOf(n);
      // RepairRate per 10 ticks -> WC3 health per second; range in WC3 units
      if (id) spLines.push(`    call SaveReal(EmpSpTab, '${id}', 1, ${real((sp.repair.perTenTicks * TICKS_PER_SECOND) / 10 / HP_DIVISOR)})`, `    call SaveReal(EmpSpTab, '${id}', 2, ${real(sp.repair.rangeTiles * WC3_UNITS_PER_TILE)})`);
    }
    sp.notDeviatable.forEach((n) => flag(n, 7));
    // 12 wall (no saboteur blast), 13 not repairable, 14 story character (not leeched / contaminated)
    sp.walls.forEach((n) => flag(n, 12));
    sp.notRepairable.forEach((n) => flag(n, 13));
    sp.story.forEach((n) => flag(n, 14));
    sp.engineerable.forEach((n) => flag(n, 8));
    sp.crushers.forEach((n) => flag(n, 9));
    sp.crushable.forEach((n) => flag(n, 10));
    [...p.rules.objects.values()].filter((o) => o.infantry).forEach((o) => flag(o.name, 11));
  }

  // a Fail / Win variant (listed after its base script) replaces it by the attack's result
  const wonKey = (attack: string): string => str(CACHE_KEY.wonPrefix + attack);
  const wonCheck = (s: MissionScript): string => (s.whenWon ? ` and GetStoredInteger(EmpCache, ${CAT}, ${wonKey(s.whenWon.attack)}) ${s.whenWon.won ? '==' : '!='} 1` : '');
  // an attack records its win for the defence variants of its territory
  // ... and the alliance of the sub-house it is tagged with (config SUBHOUSE_TAGS)
  const allyKey = (tag: string): string => str(CACHE_KEY.allyPrefix + tag);
  const attackWon = p.kind === 'attack' ? scripts.map((s, i) => `        if EmpScriptIndex == ${i} then\n            call StoreInteger(EmpCache, ${CAT}, ${wonKey(s.name)}, 1)\n        endif`) : [];
  // ... and the alliances whose allygain message the mission played (runtime Message, EmpAllyGain)
  const allyWon = ALLYGAIN_TAGS.map((tag, k) => {
    const rival = SUBHOUSE_TAGS[tag]?.rival;
    return `        if EmpAllyGain[${k + 1}] then\n            call StoreInteger(EmpCache, ${CAT}, ${allyKey(tag)}, 1)${rival ? `\n            call StoreInteger(EmpCache, ${CAT}, ${allyKey(rival)}, 0)` : ''}\n        endif`;
  });
  const wonLines = [...attackWon, ...allyWon].join('\n');
  // the alliances whose allybreak message the mission played end, won or lost
  const breakLines = [...messages].some((n) => ALLYBREAK_KEY.test(p.ctx.messageKey(n) ?? '')) ? ALLYGAIN_TAGS.map((tag, k) => `    if EmpAllyBreak[${k + 1}] then\n        call StoreInteger(EmpCache, ${CAT}, ${allyKey(tag)}, 0)\n    endif`).join('\n') : '';
  // sub-house buildings: locked unless the player is allied with their sub-house (in the campaign)
  const subLines = SUBHOUSE_BUILDINGS.map((b) => {
    const id = p.units.rawcode.get(b);
    if (!id) return '';
    const tag = Object.entries(SUBHOUSE_TAGS).find(([, s]) => s.building === b)?.[0];
    const allowed = tag ? `i == 0 and EmpInCampaign and GetStoredInteger(EmpCache, ${CAT}, ${allyKey(tag)}) == 1` : 'false';
    return `        if not (${allowed}) then\n            call SetPlayerTechMaxAllowed(Player(i), '${id}', 0)\n        endif`;
  }).filter(Boolean).join('\n');
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
    // ?? not ||: phase 0 is the start missions' (bug fixed 2026-10-09, test "a standalone start mission")
    phase: p.defaultPhase ?? DEFAULT_PHASE, tech: p.defaultTech ?? DEFAULT_TECH, defaultEnemy, territory: p.territory || 0,
  });

  // values of the src/jass/mission files
  const scope = {
    CACHE_FILE, CAT, K, RT, UI: RT.UI, ITEM, EFFECT, ICON, ART_ABILITY, FACING, ARMOR_REDUCTION, TICK_SECONDS, HOUSE_ID, OTHER_ENEMY_COLOR,
    SHUFFLE_BATTLE_MUSIC, START_MISSION_PHASE, START_MISSION_TECH,
    isTutorial: p.kind === 'tutorial', isStart: p.kind === 'start' && !p.standalone, isDefend: p.kind === 'defend',
    hasDebrief: debriefBlocks.length > 0, hasBriefingSpeech: briefingBlocks.length > 0,
    storyEnemyKnown: storyHouse !== null, storyEnemy: storyHouse ? HOUSE_ID[HOUSE_BY_CODE[storyHouse]] : -1,
    hubMap: p.hubMap || '', kindId: KIND_ID[p.kind || 'attack'], ...portScope, spLines: spLines.join('\n'), deviateSeconds: (sp?.deviateTicks ?? 0) / TICKS_PER_SECOND, wonLines, breakLines, subLines, extraStart: p.extraStart ?? '', swLines: swLines.join('\n'), swLimitLines: swLimitLines.join('\n'), vetLines: vetLines.join('\n'),
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
    jass('subhouse'),
    jass('specials'),
    jass('starport'),
    jass('effects'),
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
    // a standalone map's movies before the mission (movie/player.j): EmpStart once they are over
    ...(intro && p.intro ? [intro.functions, `function EmpIntroMovies takes nothing returns nothing\n    call EmpMovieData()\n    call EmpMovieAdd(${str(p.intro.movies.join(';'))})\n    call EmpMoviePlay(function EmpStart)\nendfunction`] : []),
  ].join('\n\n');

  // players: 0 user + 1..11 computer (sides); all on their own team
  const [mapW, mapH] = p.meta.mapSize as [number, number]; // buildTerrain has checked it
  const b0 = bases[0] || { x: mapW * EMPEROR_TILE / 2, y: mapH * EMPEROR_TILE / 2 };
  const [sx, sy] = t.toWorld(b0.x, b0.y);
  const players: ScriptPlayer[] = [{ id: 0, control: 'user', race: 'human', team: 0, x: sx, y: sy, name: RT.PLAYER_NAME }];
  for (let i = 1; i <= RT.MAX_SIDE; i++) players.push({ id: i, control: 'computer', race: 'orc', team: i, x: sx, y: sy, name: `${RT.SIDE_NAME_PREFIX}${i}` });

  const imports: Record<string, Buffer> = { 'war3map.w3u': p.units.w3u, 'war3map.w3a': p.units.w3a, 'war3map.w3q': p.units.w3q, 'war3mapMisc.txt': Buffer.from(p.units.misc, 'utf8'), ...speechImports, ...(p.iconsInMap === false ? {} : { ...p.units.icons, ...p.units.models }), ...p.extraImports };
  const m = buildMap({
    name: p.name, description: p.mapDescription ?? (p.briefing || ''), width: t.width, height: t.height, boundary: t.boundary,
    tileset: t.tileset, ground: t.ground, cliffs: t.cliffs, corner: t.corner, pathing: t.pathing, minimapColor: t.minimapColor,
    players, globals: rt.globals + glueGlobals + '\n' + scripts.map((s) => s.tr.globals).join('\n') + (intro ? `\n${intro.globals}` : ''), functions,
    init: `    call TimerStart( CreateTimer(), 0.0, false, function ${intro ? 'EmpIntroMovies' : 'EmpStart'} )`,
    imports,
    loadingTitle: p.name, loadingText: p.briefing || '',
  });
  return { buffer: m.buffer, script: m.script, stubbed: rt.stubbed, used, imports };
}

export { buildMission };
