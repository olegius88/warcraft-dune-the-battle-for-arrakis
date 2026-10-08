// Territory-battle setup that Emperor does in code rather than in mission scripts:
// spice fields, starting forces, the enemy house's base, AI production/attack waves, the
// economy/construction glue and tech-level limits. Produces JASS (functions + init lines).
// The enemy house and tech level are runtime values (EmpEnemyHouse 0 AT / 1 HK / 2 OR,
// EmpTechLevel), set from the campaign cache by mission.ts before EmpBattleInit runs.
//
// From Rules.txt: starting armies (UnitValueAttacker / UnitValueDefender, sets of the house's units by
// ReinforcementValue), credits (CampaignAttackMoney / CampaignDefendMoney), reinforcement sets, unit
// costs the enemy pays for its production. From ai.ini: the Foot / Tank mix of its production, the
// share of its units that stays at its base, the money it keeps before rebuilding destroyed template
// buildings, the chance that an attack wave falls back.
// The base builder (BuildingConstructionRatios, PositionAlgorithmRatios*, turret / refinery / wall
// rules) and the tactics (scouts, base defence, harvester escorts, construction yard defence, staged
// waves every GapBetweenNewScripts scaled by LargeAttackModifier; the pace by tech level from
// ai_difficulty.ini) are in src/jass/battle/ai.j.
// A building appears whole after its BuildTime, as in Emperor (built in the side bar, then placed:
// tools/vm/build.sh waits for "Готово" before it places one).
// The builder's phases follow Game.exe 1.09 (0x42ef30, ai.j EmpAiBuild): by ratio every BuildingDelay
// until NumBuildings buildings but walls, then maintenance every MaintenanceDelay (a coin flip, the
// category short of its share by over AI_MAINTAIN_SHORT). In its maintenance state Game.exe builds by
// ratio instead when rand % 70 < the AI skill with the credits (0x42f3d0, AI_MAINTAIN_RATIO). The
// skill is -1 for a side without a computer player record (0x4310aa); a territory battle's enemy has
// one, with the personality, strength and skill of its PhaseRules phase (CreateGame, AI_CAMPAIGN,
// AI_SKILL, forces.j EmpAiCampaignTune).
// Before them the ai.ini [StartScript] runs (builder states 0 / 1, a tenth of BuildingDelay) unless the
// base covers its steps (ai.j EmpAiStartStep).
// TODO(ai): still simplified against Game.exe: a territory battle's enemy starts from a fixed base
// template whose lost buildings are rebuilt first (BASE_TEMPLATE; Emperor's campaign start base is not
// traced); sites are tried on rings (Perpendicular / Rotation weights unused, WC3 buildings do not
// turn); maintenance does not try a sub-house building first (0x42fcb3: unless rand % 30 < the skill,
// a builder list entry of group 2 whose type is of a sub-house, 0x43c070: house +0x80 3..7 / 9,
// "Chosen sub house building"): the AI here has no sub-house buildings (AI_BUILDING_CATEGORY), and
// which sub-house buildings an enemy house may build in Emperor's campaign is not traced;
// builder state 3, Game.exe's defence plan (0x430c90 / 0x42e5d0: with AiBuildsDefences and a tech
// level over FirstCampaignGameTechLevel + 1, turrets and walls at a building cluster's defence points,
// walls given up after 10 minutes, "AI has been building walls for %d minutes so aborting"; entered
// (0x430c90) also with 22 units, no critical need, the plan not done (0x429210) and 600 credits over
// the reserve; the plan (cluster +0x20, 0x429230) is a list of (tile, turret 0x43c140 or wall 0x43c1c0
// by 0x436780) along the contour the AI map traces round the cluster box grown 5 tiles, gaps of 1..3
// closed (0x435d50: 0x435b70, 0x436410 -> 0x436570, 0x435dc0 steps; the tracing is not ported), taken
// in order where placeable (0x429380)), stands in as turrets by ratio with a wall row each (ai.j
// EmpAiWalls); of the 17 skill rolls (0x46c5d0) the
// maintenance one, the critical barracks (0x42db67, ai.j EmpAiCriticalBarracks, asked in every
// builder turn like 0x42f07d does), the harvester flight (0x45a91b, ai.j EmpAiHarvTick,
// AI_HARV_FLIGHT; probe --harvflee) and the special units (0x465500, forces.j EmpAiSpecialTurn,
// AI_SPECIAL_UNIT; probe --special) are reproduced, and the builder update's own critical check
// (0x430e30: rand % 1000 < skill every tick, ai.j EmpAiCriticalTick; probe --critical); not those that
// need what the port
// has not: 0x44e680 (a pro-active target is the best scored one, the score threshold +- rand 10 unless
// rand % 10 < skill; the waves here go for the player's base, no target scores), 0x4582a0 (a scout
// team re-picks one of 5 scout points on rand % 20 < skill; scouts roam here), 0x4304c0 (past tech
// FirstCampaignGameTechLevel + 1, credits over the reserve >= 10, 1 in 20 updates: each building with
// building vfunc +0x108 gets command 0x4c2a40 on rand % 10 < skill, group 5 also rand % 300 < skill;
// the command is not identified, possibly the upgrade the builder here buys at once, EmpAiUpgrade);
// 0x430786 (past 10 minutes a builder list entry of group 2 with +0x4 == 1 is refused on
// rand % 2000 < skill: at most 0.45 % of the checks; group 2 / +0x4 not identified), 0x45b030 (a
// tactic short of units takes them from another; on rand % 10 < skill also EXTRA units beyond its
// teams' needs: Game.exe's tactics (built in code, 15 types, 0x45aac0; no AI script file in the game
// data) are waves here), 0x468410 (an AI infiltrator next to a target deploys unless rand % 40 < skill;
// the AI here makes no infiltrators, ENEMY_INFANTRY); off in the campaign: 0x450575 (a crate grab,
// "Crate Get T", only where the setup's game type is 1: the campaign sets 2 / 3, 0x490435) and
// 0x440613 (pattern triggers, rand % 75000 < skill); the unit AIs 0x463980 (AiUnitADP, "Attacking %s":
// an ADP picks its target, rand % 20) and 0x469c60 (saboteur / scout units, rand % 200) need the
// per-unit AI the port has not; a story mission's AI record
// (SetupMissionData 0x4903b0 -> 0x534d80) is not traced for its personality / skill, so there the skill
// stays -1 (SideAIBehaviour*: EmpAiSkillBase 0 + 2); a windtrap goes first when short of power (not
// traced in Game.exe). Risk: the AI's base grows in another order than Emperor's.

import { real, str } from '../wc3/jass.ts';
import { CACHE_KEY, J_CACHE_CATEGORY, SUBHOUSE_TAGS } from '../config/campaign.ts';
import { renderFile } from '../wc3/template.ts';
import type { Scope } from '../wc3/template.ts';
import { jassFile } from '../config/paths.ts';
import { HOUSE_CODES, CODE_BY_HOUSE } from '../config/houses.ts';
import { EMPEROR_TILE, TICKS_PER_SECOND, TICK_SECONDS, WC3_UNITS_PER_TILE, HP_DIVISOR, moveSpeed } from '../config/scale.ts';
import { TERRAIN, UNIT_FIELD, ART_ABILITY, EFFECT, ABILITY } from '../config/wc3.ts';
import { TEX } from '../config/terrain.ts';
import type { WormRules, Rules } from './rules.ts';
import type { AiRules } from './ai-rules.ts';
import { parseAiRules } from './ai-rules.ts';
import { superweapons } from './superweapons.ts';
import { MAX_SIDE, DEFAULT_FACING, UI } from '../config/runtime.ts';
import * as C from '../config/battle.ts';
import type { MapMeta } from './mapxbf.ts';
import type { EmperorTerrain } from './terrain.ts';
import type { UnitData } from './units.ts';

import type { House, HouseCode } from '../config/houses.ts';
export type { House };

export interface SpiceCluster {
  /** centre in Emperor world units (32 per tile) */
  x: number;
  y: number;
  tiles: number;
}

export interface BattleOptions {
  meta: MapMeta;
  terrain: EmperorTerrain;
  units: UnitData;
  playerHouse: House;
  /** create starting forces / enemy base (false for story missions) */
  territoryBattle: boolean;
  /** defence battle: the player holds a base, the enemy attacks in waves */
  defend?: boolean;
  /** sandworm rules (Rules.txt); territory battles get worms when given */
  worms?: WormRules;
  /** Rules.txt: armies (UnitValue*), credits (Campaign*Money), unit costs */
  rules?: Rules;
  /** ai.ini: unit mix, defence share, rebuild money, retreat chance, base builder, tactics (src/emperor/ai-rules.ts) */
  ai?: AiRules;
  /** CustomMapData path of the AI report (src/jass/battle/ai.j); none: no report */
  aiReport?: string;
  /** story mission: the AI runs the base of side 1 placed on the map, if it has one (storyAiHouse) */
  storyAi?: boolean;
}

/** House of the base of side 1 placed on a story map (owner STORY_AI_OWNER with a construction yard:
 * #A1 AT, #A2 OR, #A3 HK, #C1 HK); null where the map has none (the scripts' squads only) */
function storyAiHouse(meta: MapMeta): HouseCode | null {
  return HOUSE_CODES.find((h) => (meta.buildings ?? []).some((b) => b.owner === C.STORY_AI_OWNER && b.name === `${h}${C.STORY_AI_BUILDING}`)) ?? null;
}

export interface BattleSetup {
  /** JASS functions */
  functions: string;
  /** lines for the init function */
  init: string;
  clusters: number;
}

const PREFIXES = HOUSE_CODES; // index = EmpEnemyHouse / house id
const FACING = real(DEFAULT_FACING);

/** Group spice tiles into clusters (flood fill with a SPICE_CLUSTER_REACH-tile reach). */
function spiceClusters(meta: MapMeta): SpiceCluster[] {
  if (!meta.mapSize || !meta.spice) return [];
  const [W, H] = meta.mapSize;
  const s = meta.spice;
  const seen = new Uint8Array(W * H);
  const out: SpiceCluster[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!s[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let n = 0, sx = 0, sy = 0;
    for (let j = stack.pop(); j !== undefined; j = stack.pop()) {
      const x = j % W, y = (j / W) | 0;
      n++; sx += x; sy += y;
      for (let dy = -C.SPICE_CLUSTER_REACH; dy <= C.SPICE_CLUSTER_REACH; dy++) for (let dx = -C.SPICE_CLUSTER_REACH; dx <= C.SPICE_CLUSTER_REACH; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (s[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push({ x: (sx / n + 0.5) * EMPEROR_TILE, y: (sy / n + 0.5) * EMPEROR_TILE, tiles: n });
  }
  return out;
}

/** filter(Boolean) for rawcode lookups, typed */
const isId = (v: string | undefined | null): v is string => Boolean(v);

/** JASS "if/elseif" chain choosing a value by EmpEnemyHouse. */
function byHouse(lines: string[]): string {
  return lines.map((body, h) => `    ${h === 0 ? 'if' : 'elseif'} EmpEnemyHouse == ${h} then\n${body}`).join('\n') + '\n    endif';
}

function battleSetup(o: BattleOptions): BattleSetup {
  const rc = (name: string): string | undefined => o.units.rawcode.get(name);
  const P = CODE_BY_HOUSE[o.playerHouse] || 'AT';
  const lines: string[] = [];
  const fns: string[] = [];
  const jass = (name: string, scope: Scope): string => renderFile(jassFile(`battle/${name}`), { C, MAX_SIDE, FACING, UI, ...scope });

  // ---- tech limits by runtime tech level ----
  const byLevel: Record<number, string[]> = {};
  for (const x of o.units.objects) {
    if (!x.emperor || x.emperor.techLevel <= 1) continue;
    (byLevel[x.emperor.techLevel] = byLevel[x.emperor.techLevel] || []).push(x.id);
  }
  // starport orders wait for the tech level of their unit
  for (const [order, real] of o.units.portOrders ?? []) {
    const lvl = o.units.objects.find((x) => x.id === real)?.emperor?.techLevel ?? 1;
    if (lvl > 1) (byLevel[lvl] = byLevel[lvl] || []).push(order);
  }
  // building upgrades wait for their UpgradeTechLevel
  for (const u of o.units.upgrades) if (u.techLevel > 1) (byLevel[u.techLevel] = byLevel[u.techLevel] || []).push(u.id);
  fns.push(jass('tech-limits', {
    limitLines: Object.entries(byLevel).map(([lvl, idsAt]) => `        if EmpTechLevel < ${lvl} then\n${idsAt.map((id) => `            call SetPlayerTechMaxAllowed(Player(i), '${id}', 0)`).join('\n')}\n        endif`).join('\n'),
  }));

  // ---- spice fields ----
  const clusters = spiceClusters(o.meta);
  // Game.exe 1.09 (harvester 0x56c2c4..0x56c329, unload 0x53ebc0): a harvested cell loses its spice
  // and adds [General] SpiceValue to the load, which becomes credits 1:1 (test/emperor-mission.test.ts)
  const spiceValue = Number(o.rules?.general.SpiceValue ?? 0) || C.FALLBACK_SPICE_VALUE;
  // spice mounds of the map (Rules.txt [SpiceMound]; ticks -> seconds)
  const mound = o.rules?.spiceMound ?? { health: 0, minTicks: 0, randomTicks: 0, radiusTiles: 0, capacity: 0, delayTicks: 0, regrowMin: 0, regrowMax: 0 };
  fns.push(jass('spice-fields', {
    fieldLines: clusters.map((c) => { const [x, y] = o.terrain.toWorld(c.x, c.y); return `    set m = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '${o.units.ids.spiceField}', ${real(x)}, ${real(y)}, ${FACING})\n    call SetResourceAmount(m, ${c.tiles * spiceValue})`; }).join('\n'),
    moundLines: (o.rules ? o.meta.spiceMounds ?? [] : []).map(([tx, ty]) => { const [x, y] = o.terrain.toWorld(tx, ty); return `    call EmpMoundAdd(${real(x)}, ${real(y)})`; }).join('\n'),
    mound, spiceValue, spiceField: o.units.ids.spiceField, spiceMound: o.units.ids.spiceMound, ART_ABILITY,
    WC3_UNITS_PER_TILE, tiles: { sand: TERRAIN.ground[TEX.SAND], dust: TERRAIN.ground[TEX.DUST], spice: TERRAIN.ground[TEX.SPICE] },
    burstMin: mound.minTicks / TICKS_PER_SECOND, burstMax: (mound.minTicks + mound.randomTicks) / TICKS_PER_SECOND,
    regrowMin: mound.regrowMin / TICKS_PER_SECOND, regrowMax: mound.regrowMax / TICKS_PER_SECOND,
  }));

  // ---- economy & construction glue ----
  const conYards = PREFIXES.map((h) => rc(`${h}ConYard`));
  const refineries = PREFIXES.map((h) => rc(`${h}Refinery`));
  const harvester = rc('Harvester');
  const mcv = rc('MCV');
  fns.push(jass('economy', {
    spiceField: o.units.ids.spiceField, harvester, mcv,
    // [General] HarvReplacementDelay, CashDeliveryWhenNoSpice* (ticks, credits)
    harvReplaceTicks: Number(o.rules?.general.HarvReplacementDelay ?? 0) || 0,
    harvCheckTicks: C.HARV_REPLACE_PERIOD * TICKS_PER_SECOND,
    // Game.exe draws Min + rand % (Max - Min): the last value is Max - 1 (Max == Min: Min)
    cash: ((): Record<string, number> => {
      const g = o.rules?.general;
      const min = Number(g?.CashDeliveryWhenNoSpiceAmountMin ?? 0) || 0, max = Number(g?.CashDeliveryWhenNoSpiceAmountMax ?? 0) || 0;
      const freqMin = Number(g?.CashDeliveryWhenNoSpiceFrequencyMin ?? 0) || 0, freqMax = Number(g?.CashDeliveryWhenNoSpiceFrequencyMax ?? 0) || 0;
      return { min, last: Math.max(min, max - 1), freqMin, freqLast: Math.max(freqMin, freqMax - 1) };
    })(),
    // the builders of the house (units.ts: walls and turrets have their own); the sub-house builder
    // only for the player allied with a sub-house (mission subhouse.j)
    builderLines: PREFIXES.map((h, i) => `    if t == '${conYards[i]}' then\n${[o.units.ids.builders[h], o.units.ids.defenceBuilders[h]].map((id, k) => `        call CreateUnit(GetOwningPlayer(b), '${id}', GetUnitX(b) - ${real(C.BUILDER_OFFSET * (k + 1))}, GetUnitY(b) - ${real(C.BUILDER_OFFSET)}, ${FACING})`).join('\n')}
        if GetOwningPlayer(b) == Player(0) and EmpInCampaign and (${Object.keys(SUBHOUSE_TAGS).map((tag) => `GetStoredInteger(EmpCache, ${J_CACHE_CATEGORY}, ${str(CACHE_KEY.allyPrefix + tag)}) == 1`).join(' or ')}) then
            call CreateUnit(GetOwningPlayer(b), '${o.units.ids.allyBuilders[h]}', GetUnitX(b) - ${real(C.BUILDER_OFFSET * 3)}, GetUnitY(b) - ${real(C.BUILDER_OFFSET)}, ${FACING})
        endif\n    endif`).join('\n'),
    isRefinery: refineries.map((r) => `t == '${r}'`).join(' or '),
    isConYard: conYards.map((c) => `EmpType(b) == '${c}'`).join(' or '),
    // the builders a yard gives (a sub-house builder alone builds no base: fourth audit)
    isBuilder: PREFIXES.flatMap((h) => [o.units.ids.builders[h], o.units.ids.defenceBuilders[h]]).map((id) => `EmpType(b) == '${id}'`).join(' or '),
  }));

  // ---- power (Rules.txt and Game.exe 1.09; src/jass/battle/power.j) ----
  fns.push(jass('power', {
    powerLines: [...o.units.objects]
      .filter((x) => x.emperor && (x.emperor.powerGenerated !== 0 || x.emperor.powerUsed !== 0 || x.emperor.disableWithLowPower))
      .map((x) => `    call EmpPowerType('${x.id}', ${x.emperor?.powerGenerated}, ${x.emperor?.powerUsed}, ${x.emperor?.disableWithLowPower})`).join('\n'),
  }));

  // ---- sandworms (territory battles; src/jass/battle/worms.j) ----
  const wormId = rc(C.SURFACE_WORM);
  const w = o.worms;
  if (o.territoryBattle && w && wormId) {
    fns.push(jass('worms', {
      w, wormId,
      isSand: [TEX.SAND, TEX.DUST, TEX.SPICE].map((slot) => `t == '${TERRAIN.ground[slot]}'`).join(' or '),
      perCheck: C.WORM_CHECK_PERIOD * TICKS_PER_SECOND, // chances are per tick
      // types whose weight is not the default 1
      wormLines: [...(o.rules ? o.rules.objects.values() : [])]
        .filter((x) => rc(x.name) && (!x.tastyToWorms || x.wormAttraction !== 1))
        .map((x) => `    call SaveInteger(EmpWormTab, '${rc(x.name)}', 0, ${x.tastyToWorms ? x.wormAttraction : 0})`).join('\n'),
    }));
    lines.push('    call EmpWormData()', `    call TimerStart(CreateTimer(), ${real(C.WORM_CHECK_PERIOD)}, true, function EmpWormTick)`);
    // ---- sandstorms (Rules.txt Storm*, [StormUnit]; src/jass/battle/storm.j, on the worms' sand) ----
    const storm = o.rules?.storm;
    if (storm && storm.minWait > 0) {
      // Game.exe applies a storm every tick (storm.j); the runtime checks every STORM_TICK s
      const ticks = C.STORM_TICK * TICKS_PER_SECOND;
      const classes = [1, 2, 3];
      fns.push(jass('storm', {
        storm, EFFECT, HP_DIVISOR, ticks,
        step: moveSpeed(storm.speed) * C.STORM_TICK,
        ground: (C.STORM_GROUND_CELLS + 0.5) * WC3_UNITS_PER_TILE,
        air: C.STORM_AIR_CELLS * WC3_UNITS_PER_TILE,
        // (rand & StormKillChance) < class each tick -> the chance over one check
        pickLines: classes.map((c) => `    set EmpStormPick[${c}] = ${(1 - (1 - c / (storm.killChance + 1)) ** ticks).toFixed(4)}`).join('\n'),
        damageLines: [...(o.rules ? o.rules.objects.values() : [])]
          .filter((x) => rc(x.name) && x.stormDamage > 0)
          // StormDamage packs (class * STORM_CLASS_STEP) + damage; class 0 'only damages, is never
          // picked up' (Rules.txt [StormUnit] comments): key 0 damage, key 1 class, key 2 the whole
          // value (what a flying unit takes)
          .flatMap((x) => [
            `    call SaveInteger(EmpStormTab, '${rc(x.name)}', 0, ${x.stormDamage % C.STORM_CLASS_STEP})`,
            ...(x.stormDamage >= C.STORM_CLASS_STEP ? [`    call SaveInteger(EmpStormTab, '${rc(x.name)}', 1, ${Math.floor(x.stormDamage / C.STORM_CLASS_STEP)})`] : []),
            `    call SaveInteger(EmpStormTab, '${rc(x.name)}', 2, ${x.stormDamage})`,
          ]).join('\n'),
      }));
      lines.push('    call EmpStormData()', `    call TimerStart(CreateTimer(), ${real(C.STORM_TICK)}, true, function EmpStormTick)`);
    }
  }

  // ---- starting forces / enemy base (territory battles) ----
  // the attacking player brings an MCV and a harvester besides the army (Rules.txt UnitValueAttacker)
  const support = [mcv, harvester].filter(isId);
  const pickFn = (name: string, perHouse: string[][]): string => `function ${name} takes integer i returns integer
${byHouse(perHouse.map((list) => list.map((id, k) => `        if i == ${k} then\n            return '${id}'\n        endif`).join('\n') || '        return 0'))}
    return 0
endfunction`;
  const infBy = PREFIXES.map((h) => C.ENEMY_INFANTRY.map((s) => rc(h + s)).filter(isId));
  const vehBy = PREFIXES.map((h) => C.ENEMY_VEHICLES.map((s) => rc(h + s)).filter(isId));
  fns.push(pickFn('EmpEnemyInf', infBy));
  fns.push(pickFn('EmpEnemyVeh', vehBy));
  // enemy base template per house (index = house id) as data, so destroyed buildings can be rebuilt
  const templateLines: string[] = [];
  PREFIXES.forEach((h, hi) => {
    const entries = C.BASE_TEMPLATE.filter(([sfx]) => rc(h + sfx));
    if (entries.length > C.TEMPLATE_SLOTS) throw new Error(`base template of ${entries.length} > TEMPLATE_SLOTS`);
    entries.forEach(([sfx, dx, dy], k) => {
      const i = hi * C.TEMPLATE_SLOTS + k;
      templateLines.push(`    set EmpTplType[${i}] = '${rc(h + sfx)}'`, `    set EmpTplDx[${i}] = ${dx}`, `    set EmpTplDy[${i}] = ${dy}`);
    });
    templateLines.push(`    set EmpTplCount[${hi}] = ${entries.length}`);
  });
  // the player's own base for defence battles (own house template at the player's base point)
  const playerBase = C.BASE_TEMPLATE.map(([sfx, dx, dy]) => (rc(P + sfx) ? `    call CreateUnit(Player(0), '${rc(P + sfx)}', EmpBaseX[b] + EmpTiles(${dx}), EmpBaseY[b] - EmpTiles(${dy}), ${FACING})` : '')).filter(Boolean).join('\n');
  const barracksOf = PREFIXES.map((h) => rc(`${h}Barracks`));
  const factoryOf = PREFIXES.map((h) => rc(`${h}Factory`));
  // Rules.txt Cost of every unit the enemy may produce (it pays for them)
  const costOf = (id: string): number => {
    const name = [...o.units.rawcode].find(([, v]) => v === id)?.[0];
    return (name && o.rules?.objects.get(name)?.cost) || 0;
  };
  const produced = [...new Set([...infBy.flat(), ...vehBy.flat()])];
  // ---- base builder and tactics (ai.ini; src/jass/battle/ai.j) ----
  const ai = o.ai ?? parseAiRules('');
  const category = { core: 0, defence: 1, manufacturing: 2, resource: 3 } as const;
  const aiLines: string[] = ['    set EmpAiTab = InitHashtable()'];
  const buildingCost: string[] = [];
  PREFIXES.forEach((h, hi) => {
    const entries = C.AI_BUILDING_CATEGORY.filter(([sfx]) => rc(h + sfx));
    if (entries.length > C.TEMPLATE_SLOTS) throw new Error(`AI buildings of ${entries.length} > TEMPLATE_SLOTS`);
    entries.forEach(([sfx, cat], k) => {
      const id = rc(h + sfx) as string;
      const r = o.rules?.objects.get(h + sfx);
      aiLines.push(`    set EmpAiBType[${hi * C.TEMPLATE_SLOTS + k}] = '${id}'`,
        `    call SaveInteger(EmpAiTab, '${id}', 0, ${category[cat]})`,
        `    call SaveBoolean(EmpAiTab, '${id}', 1, ${C.AI_TURRETS.includes(sfx)})`,
        `    call SaveBoolean(EmpAiTab, '${id}', 2, ${C.AI_EXIT_BUILDINGS.includes(sfx)})`,
        `    call SaveBoolean(EmpAiTab, '${id}', 3, ${sfx === 'Refinery'})`,
        // Rules.txt BuildTime is in game ticks
        `    call SaveReal(EmpAiTab, '${id}', 4, ${real((r?.buildTime ?? 0) / TICKS_PER_SECOND)})`);
    });
    const wall = rc(h + C.AI_WALL), windtrap = rc(`${h}SmWindtrap`);
    aiLines.push(`    set EmpAiBCount[${hi}] = ${entries.length}`, `    set EmpAiWall[${hi}] = ${wall ? `'${wall}'` : 0}`, `    set EmpAiPower[${hi}] = ${windtrap ? `'${windtrap}'` : 0}`);
    // the buildings the AI builds or rebuilds pay their Rules.txt Cost too
    for (const sfx of new Set([...C.AI_BUILDING_CATEGORY.map(([x]) => x), ...C.BASE_TEMPLATE.map(([x]) => x), C.AI_WALL])) {
      const id = rc(h + sfx);
      if (id) buildingCost.push(`    call SaveInteger(EmpCostTab, '${id}', 0, ${o.rules?.objects.get(h + sfx)?.cost ?? 0})`);
    }
  });
  (['core', 'defence', 'manufacturing', 'resource'] as const).forEach((c) => aiLines.push(`    set EmpAiRatio[${category[c]}] = ${ai.buildRatios[c]}`));
  // building upgrades per house (units.ts) the AI buys, and the upgrade each produced type requires
  // (EmpAiTab child 5; taken from the type's requirements so it matches what the player needs)
  const upgradeIds = new Set(o.units.upgrades.map((u) => u.id));
  PREFIXES.forEach((h, hi) => {
    const list = o.units.upgrades.filter((u) => u.building.startsWith(h) && rc(u.building));
    if (list.length > C.TEMPLATE_SLOTS) throw new Error(`${h}: ${list.length} upgrades > TEMPLATE_SLOTS`);
    list.forEach((u, k) => {
      const i = hi * C.TEMPLATE_SLOTS + k;
      aiLines.push(`    set EmpAiUpg[${i}] = '${u.id}'`, `    set EmpAiUpgB[${i}] = '${rc(u.building)}'`, `    set EmpAiUpgCost[${i}] = ${u.cost}`, `    set EmpAiUpgTime[${i}] = ${real(u.seconds)}`);
    });
    aiLines.push(`    set EmpAiUpgCount[${hi}] = ${list.length}`);
  });
  // ai_difficulty.ini by tech level (index 1..8): delays in seconds, counts, ticks of the first attack
  ai.tech.forEach((t, lvl) => {
    if (lvl < 1) return;
    aiLines.push(`    set EmpAiTMax[${lvl}] = ${t.maxUnits}`, `    set EmpAiTBuildings[${lvl}] = ${t.numBuildings}`,
      `    set EmpAiTBuildDelay[${lvl}] = ${real(Math.max(1, t.buildingDelay) / TICKS_PER_SECOND)}`, `    set EmpAiTUnitDelay[${lvl}] = ${real(Math.max(1, t.unitDelay) / TICKS_PER_SECOND)}`,
      `    set EmpAiTGap[${lvl}] = ${real((Math.max(1, t.gapBetweenScripts) / TICKS_PER_SECOND) * (100 / Math.max(1, ai.largeAttackModifier)))}`,
      `    set EmpAiTFirst[${lvl}] = ${t.firstAttackDelay}`, `    set EmpAiTMinDef[${lvl}] = ${t.minDefence}`, `    set EmpAiTMaxDef[${lvl}] = ${t.maxDefence}`, `    set EmpAiTTurrets[${lvl}] = ${t.maxTurrets}`,
      `    set EmpAiTBuildTicks[${lvl}] = ${t.buildingDelay}`, `    set EmpAiTGapTicks[${lvl}] = ${t.gapBetweenScripts}`,
      `    set EmpAiTMaintTicks[${lvl}] = ${t.maintenanceDelay}`, `    set EmpAiTMaintDelay[${lvl}] = ${real(Math.max(1, t.maintenanceDelay) / TICKS_PER_SECOND)}`);
  });
  // ai.ini [StartScript]: the categories built first (ai.j EmpAiStartStep)
  const steps = ai.startScript.filter((g): g is keyof typeof category => g in category);
  steps.forEach((g, i) => aiLines.push(`    set EmpAiStartCat[${i}] = ${category[g]}`));
  aiLines.push(`    set EmpAiStartCount = ${steps.length}`);
  // the losing test (ai.j EmpAiLosingCase): Rules.txt AiManufacturing types and the MCV's price
  for (const r of o.rules?.objects.values() ?? []) {
    const id = rc(r.name);
    if (id && /^true$/i.test((r.raw.AiManufacturing ?? '').trim())) aiLines.push(`    call SaveBoolean(EmpAiTab, '${id}', ${C.AI_TAB_MANUFACTURING}, true)`);
    if (id && r.conYard) aiLines.push(`    call SaveBoolean(EmpAiTab, '${id}', ${C.AI_TAB_YARD}, true)`);
  }
  aiLines.push(`    set EmpAiMcv = ${mcv ? `'${mcv}'` : 0}`, `    set EmpAiMcvCost = ${o.rules?.objects.get('MCV')?.cost ?? 0}`);
  // the ai.ini values SideAIBehaviour* re-tunes (forces.j EmpAiBehave)
  aiLines.push(`    set EmpAiDefPct = ${ai.defencePercent}`, `    set EmpAiWander = ${ai.defenceWanderTiles}`,
    `    set EmpAiBuildsDef = ${ai.buildsDefences}`, `    set EmpAiScoutTeams = ${ai.scoutTeams}`);
  // the house's palace super weapon (src/emperor/superweapons.ts): charge type, palace, charge ticks
  const sw = o.rules ? superweapons(o.rules) : [];
  PREFIXES.forEach((h, hi) => {
    const w = sw.find((x) => x.palace.startsWith(h) && rc(x.name) && rc(x.palace));
    if (w) aiLines.push(`    set EmpAiSw[${hi}] = '${rc(w.name)}'`, `    set EmpAiSwPalace[${hi}] = '${rc(w.palace)}'`, `    set EmpAiSwTicks[${hi}] = ${w.chargeTicks}`);
  });
  for (const id of produced) {
    const req = o.units.objects.find((x) => x.id === id)?.mods.filter((m) => m.field === UNIT_FIELD.requires).map((m) => String(m.value)).at(-1) ?? '';
    const up = req.split(',').find((r) => upgradeIds.has(r));
    if (up) aiLines.push(`    call SaveInteger(EmpAiTab, '${id}', 5, '${up}')`);
    // Rules.txt AiSpecial: only as a special unit (AI_SPECIAL_UNIT, forces.j EmpAiSpecialTurn)
    const name = [...o.units.rawcode].find(([, v]) => v === id)?.[0];
    if (name && o.rules?.objects.get(name)?.aiSpecial) aiLines.push(`    call SaveBoolean(EmpAiTab, '${id}', ${C.AI_TAB_SPECIAL}, true)`);
  }
  const aiFunctions = renderFile(jassFile('battle/ai'), {
    C, UI, FACING, ai, harvester, WC3_UNITS_PER_TILE, TPS: TICKS_PER_SECOND, TICK_SECONDS, ABILITY,
    // AI_HARV_FLIGHT: the tech level the harvester flight waits past (FirstCampaignGameTechLevel + 1)
    harvFlightTech: ai.firstCampaignTech + 1,
    // the enemy house's barracks type (Game.exe 0x43b920: by the side's house)
    barracksPick: barracksOf.map((id, h) => `    if EmpEnemyHouse == ${h} then\n        set t = '${id}'\n    endif`).join('\n'),
    aiReport: o.aiReport ?? '',
    dataFunction: `function EmpAiData takes nothing returns nothing\n${aiLines.join('\n')}\nendfunction\n`,
  });
  // story mission: index of the house whose base of side 1 the AI runs, -1 none
  const storyCode = !o.territoryBattle && o.storyAi ? storyAiHouse(o.meta) : null;
  const storyHouse = storyCode ? PREFIXES.indexOf(storyCode) : -1;
  // SideAIBehaviour*: per tech level (arrays, index l) and single values, AI_BEHAVIOUR_PCT
  const tuneLines = (list: ReadonlyArray<readonly [C.AiTuned, number]>, perLevel: boolean, indent: string): string =>
    list.filter(([v]) => v.startsWith('EmpAiT') === perLevel)
      .map(([v, pct]) => { const x = perLevel ? `${v}[l]` : v; return `${indent}set ${x} = EmpAiPct(${x}, ${pct})`; }).join('\n');
  const setLines = (s: Readonly<Record<string, boolean | number>>): string[] => [
    ...('buildsDefences' in s ? [`        set EmpAiBuildsDef = ${s.buildsDefences}`] : []),
    ...('scoutTeams' in s ? [`        set EmpAiScoutTeams = ${s.scoutTeams}`] : []),
  ];
  const BP = C.AI_BEHAVIOUR_PCT;
  // AI_CAMPAIGN by phase: a strength / personality of AI_CAMPAIGN.random is rand % 3; low: AI_SKILL.lowPhases
  const roll = (v: number): string => (v === C.AI_CAMPAIGN.random ? 'GetRandomInt(0, 2)' : String(v));
  const campaignPhases = C.AI_CAMPAIGN.phases.map(([phase, strength, personality]) => [
    `    if EmpPhase == ${phase} then`,
    `        set strength = ${roll(strength)}`,
    `        set mode = ${roll(personality)}`,
    ...(C.AI_SKILL.lowPhases.includes(phase) ? ['        set low = 1'] : []),
    '    endif',
  ].join('\n')).join('\n');
  fns.push(jass('forces', {
    strongTech: tuneLines(BP.strong, true, '            '), campaignPhases,
    aggressiveTech: tuneLines(BP.aggressive, true, '            '), defensiveTech: tuneLines(BP.defensive, true, '            '),
    aggressiveSide: [tuneLines(BP.aggressive, false, '        '), ...setLines(C.AI_BEHAVIOUR_SET.aggressive)].join('\n'),
    defensiveSide: [tuneLines(BP.defensive, false, '        '), ...setLines(C.AI_BEHAVIOUR_SET.defensive)].join('\n'),
    gapFactor: 100 / Math.max(1, ai.largeAttackModifier), TPS: TICKS_PER_SECOND,
    aiFunctions, storyAi: storyHouse >= 0, storyHouse,
    harvester, playerBase,
    vehMax: C.ENEMY_VEHICLES.length - 1, infMax: C.ENEMY_INFANTRY.length - 1,
    supportLines: support.map((id) => `    call CreateUnit(Player(0), '${id}', GetLocationX(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), GetLocationY(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), ${FACING})`).join('\n'),
    templateLines: templateLines.join('\n'),
    ai,
    isBarracks: barracksOf.map((id) => `t == '${id}'`).join(' or '),
    isFactory: factoryOf.map((id) => `t == '${id}'`).join(' or '),
    costLines: [...produced.map((id) => `    call SaveInteger(EmpCostTab, '${id}', 0, ${costOf(id)})`), ...buildingCost].join('\n'),
    army: { attacker: o.rules?.reinforcements.attacker ?? C.FALLBACK_ARMY_VALUE, defender: o.rules?.reinforcements.defender ?? C.FALLBACK_ARMY_VALUE },
    money: o.rules?.campaignMoney ?? { attack: C.FALLBACK_CREDITS, defend: C.FALLBACK_CREDITS },
  }));

  fns.push(jass('init', { harvReplaceTicks: Number(o.rules?.general.HarvReplacementDelay ?? 0) || 0, storyAi: storyHouse >= 0, territoryBattle: o.territoryBattle, attackBattle: o.territoryBattle && !o.defend, defendBattle: o.territoryBattle && Boolean(o.defend) }));
  lines.push('    call EmpBattleInit()');
  return { functions: fns.join('\n\n'), init: lines.join('\n'), clusters: clusters.length };
}

export { battleSetup, spiceClusters, storyAiHouse };
