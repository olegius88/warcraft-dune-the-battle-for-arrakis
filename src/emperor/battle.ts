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
// No sub-house buildings, as in the campaign of Game.exe 1.09: its maintenance would take one first
// (0x42fca0: unless rand % 30 < the skill, a group 2 entry of a sub-house type, 0x43c070, "Chosen sub
// house building"), but a building of a sub-house is available to a side only with that sub-house's
// byte [side + 8 + k] (0x53d3d0), which the side copies from its player record +0x40 (CSide 0x53b8f0
// <- 0x47f08b); CreateGame (0x48e990) and SetupMission (0x48f660) set it for the human players from the
// campaign alliances and clear it for the computer (0x48ef86..0x48ef93, 0x48fa33..0x48fa60): only
// skirmish lobbies give an AI sub-houses (0x47c1a0 "Changed AI side %d to subhouses %d, %d").
// The defending enemy starts from Game.exe's minimal base (MIN_BASE, 0x42ea80), placed by the site code
// (ai-map.j EmpAiPlace, 0x42a1e0 / 0x42a680), unless the territory kept its base from the last battle
// there (forces.j EmpBaseSave / EmpBaseRestore, C.SAVED_BASE); its spice is kept too (spice-fields.j).
// The player's reserves come from the hub's stacks (forces.j EmpReserveArrive; Game.exe 0x4809b0, stacks
// in hub functions.j; their TODO there). The player's explored map is kept (explored.j); TODO(campaign):
// the AI's explored map and the battle scorch (0x534420 -> 0x495f60, ground marks) are not kept. Risk:
// a second battle on a territory shows no scorch marks. In a defence battle the attacking AI starts with Game.exe's MCV (0x47f255),
// UnitValueAttacker units and CampaignAttackMoney (forces.j EmpDefendAttacker) and builds its base.
// Builder state 3 is Game.exe's defence plan (ai-map.j, AI_PLAN / AI_MAP): walls along the contour of
// a building cluster on the AI's map of tiles, turrets where the walls end at its roads. Of the 17
// skill rolls (0x46c5d0) the
// maintenance one, the critical barracks (0x42db67, ai.j EmpAiCriticalBarracks, asked in every
// builder turn like 0x42f07d does), the harvester flight (0x45a91b, ai.j EmpAiHarvTick,
// AI_HARV_FLIGHT; probe --harvflee) and the special units (0x465500, forces.j EmpAiSpecialTurn,
// AI_SPECIAL_UNIT; probe --special) are reproduced, and the builder update's own critical check
// (0x430e30: rand % 1000 < skill every tick, ai.j EmpAiCriticalTick; probe --critical); not those that
// need what the port
// has not: 0x44e680 (a pro-active target is the best scored one, the score threshold +- rand 10 unless
// rand % 10 < skill; the waves here go for the player's base, no target scores), 0x4582a0 (a scout
// team without units re-picks one of its 5 points on rand % 20 < skill; the route itself is ported,
// ai.j EmpAiScoutNext, and a scout here is one unit), 0x4304c0 (past tech
// FirstCampaignGameTechLevel + 1, credits over the reserve >= 10, 1 in 20 updates: each building with
// building vfunc +0x108 gets command 0x4c2a40 on rand % 10 < skill, group 5 also rand % 300 < skill;
// the command is not identified, possibly the upgrade the builder here buys at once, EmpAiUpgrade);
// 0x430786 (past 10 minutes a builder list entry of group 2 with +0x4 == 1 is refused on
// rand % 2000 < skill: at most 0.45 % of the checks; group 2 / +0x4 not identified), 0x45b030 (a
// tactic short of units takes them from another; on rand % 10 < skill also EXTRA units beyond its
// teams' needs: Game.exe's tactics (15 types, 0x45aac0) are waves here), 0x468410 (an AI infiltrator next to a target deploys unless rand % 40 < skill;
// the AI here makes no infiltrators, ENEMY_INFANTRY); off in the campaign: 0x450575 (a crate grab,
// "Crate Get T", only where the setup's game type is 1: the campaign sets 2 / 3, 0x490435) and
// 0x440613 (pattern triggers, rand % 75000 < skill); the unit AIs 0x463980 (AiUnitADP, "Attacking %s":
// an ADP picks its target, rand % 20) and 0x469c60 (saboteur / scout units, rand % 200) need the
// per-unit AI the port has not; a story mission's AI record
// (SetupMissionData 0x4903b0 -> 0x534d80) is not traced for its personality / skill, so there the skill
// stays -1 (SideAIBehaviour*: EmpAiSkillBase 0 + 2); a windtrap goes first when short of power (not
// traced in Game.exe). Risk: the AI's base grows in another order than Emperor's.

import { real, str } from '../wc3/jass.ts';
import { CACHE_KEY, J_CACHE_CATEGORY, SUBHOUSE_TAGS, RESERVE, RESERVE_ARRIVED } from '../config/campaign.ts';
import { renderFile } from '../wc3/template.ts';
import type { Scope } from '../wc3/template.ts';
import { jassFile, RAW_DIR } from '../config/paths.ts';
import { HOUSE_CODES, CODE_BY_HOUSE } from '../config/houses.ts';
import { EMPEROR_TILE, TICKS_PER_SECOND, TICK_SECONDS, WC3_UNITS_PER_TILE, HP_DIVISOR, moveSpeed } from '../config/scale.ts';
import { aiMapRuns, occupyCells } from './ai-map.ts';
import { loadAiScripts, encodeStrategy } from './ai-scripts.ts';
import { REFINERY_PAD } from '../config/units.ts';
import { TERRAIN, UNIT_FIELD, ART_ABILITY, EFFECT, ABILITY } from '../config/wc3.ts';
import { TEX } from '../config/terrain.ts';
import type { WormRules, Rules, RulesObject } from './rules.ts';
import type { AiRules } from './ai-rules.ts';
import { parseAiRules } from './ai-rules.ts';
import { superweapons } from './superweapons.ts';
import { MAX_SIDE, DEFAULT_FACING, UI } from '../config/runtime.ts';
import * as C from '../config/battle.ts';
import type { MapMeta } from './mapxbf.ts';
import type { EmperorTerrain } from './terrain.ts';
import type { UnitData } from './units.ts';
import { weaponOf } from './units.ts';

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
  // refinery pad orders wait for the dock's UpgradeTechLevel
  for (const p of o.units.padOrders ?? []) if (p.techLevel > 1) (byLevel[p.techLevel] = byLevel[p.techLevel] || []).push(p.id);
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
  // refinery pads (pads.j): the order's refinery type, the hit points a pad adds, its unit, its cost
  fns.push(jass('pads', {
    REFINERY_PAD,
    padLines: (o.units.padOrders ?? []).map((p) => [`    call SaveInteger(EmpPadTab, '${p.id}', 0, '${p.refinery}')`, `    call SaveInteger(EmpPadTab, '${p.id}', 1, ${p.health})`,
      `    call SaveInteger(EmpPadTab, '${p.id}', 2, ${p.unit ? `'${p.unit}'` : 0})`, `    call SaveInteger(EmpPadTab, '${p.id}', 3, ${p.cost})`].join('\n')).join('\n'),
  }));
  fns.push(jass('explored', { CAT: J_CACHE_CATEGORY, KE: str(CACHE_KEY.explorePrefix), WC3_UNITS_PER_TILE }));
  fns.push(jass('spice-fields', {
    CAT: J_CACHE_CATEGORY, KS: str(CACHE_KEY.spicePrefix),
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

  // ---- carryalls carry harvesters (Rules.txt Carryall, [General] MinCarryTileDist; carryall.j) ----
  const carryalls = [...(o.rules?.objects.values() ?? [])].filter((x) => /^true$/i.test((x.raw.Carryall ?? '').trim())).map((x) => rc(x.name)).filter(isId);
  // ADV carryalls (carryall.j EmpAdv*): their buttons, the carriable types, the delay over an enemy
  const advLines = [
    ...(o.units.advCarryalls ?? []).flatMap((a) => [`    call SaveInteger(EmpCarryTab, '${a.pick}', 31, 1)`, `    call SaveInteger(EmpCarryTab, '${a.drop}', 31, 2)`]),
    ...(o.units.carriable ?? []).map((id) => `    call SaveBoolean(EmpCarryTab, '${id}', 32, true)`),
  ];
  fns.push(jass('carryall', {
    advLines: advLines.join('\n'), advEnemyDelay: (Number(o.rules?.general.AdvCarryallPickupEnemyDelay ?? 0) || C.FALLBACK_ADV_ENEMY_DELAY) / TICKS_PER_SECOND,
    harvester, WC3_UNITS_PER_TILE, spiceField: o.units.ids.spiceField,
    isRefinery: refineries.filter(isId).map((r) => `t == '${r}'`).join(' or ') || 'false',
    isCarryall: carryalls.map((c) => `t == '${c}'`).join(' or ') || 'false',
    minCarryTiles: Number(o.rules?.general.MinCarryTileDist ?? 0) || C.FALLBACK_MIN_CARRY_TILES,
  }));

  // ---- ornithopters: rounds (TurretBulletCount) and rearming at helipads (orni.j) ----
  const orniTypes = [...(o.rules?.objects.values() ?? [])].filter((x) => /^true$/i.test((x.raw.Ornithoptor ?? '').trim()));
  const pads = [...(o.rules?.objects.values() ?? [])].filter((x) => x.category === 'Building' && /^true$/i.test((x.raw.Helipad ?? '').trim()));
  fns.push(jass('orni', {
    orniLines: [
      ...orniTypes.map((x) => [rc(x.name), weaponOf(x)?.ammo ?? 0] as const).filter(([id, n]) => isId(id) && n > 0).map(([id, n]) => `    call EmpOrniType('${id}', ${n})`),
      ...pads.map((x) => rc(x.name)).filter(isId).map((id) => `    call SaveBoolean(EmpOrniTab, '${id}', 1, true)`),
    ].join('\n'),
    rearmSeconds: (Number(o.rules?.general.RearmRate ?? 0) || C.FALLBACK_REARM_TICKS) / TICKS_PER_SECOND,
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
  // the defending side's minimal base (MIN_BASE, Game.exe 0x42ea80): with spice on the map or not; the
  // types in Game.exe's order, down the type list
  const hasSpice = spiceClusters(o.meta).length > 0;
  const typeIndex = new Map([...(o.rules?.objects.keys() ?? [])].map((n, i): [string, number] => [n, i]));
  const minBase = (h: string): Array<[string, number]> => C.MIN_BASE.types
    .map(([sfx, spice, none]): [string, number] => [h + sfx, hasSpice ? spice : none])
    .filter(([n, k]) => k > 0 && Boolean(rc(n)))
    .sort(([x], [y]) => (typeIndex.get(y) ?? 0) - (typeIndex.get(x) ?? 0));
  const minBaseLines = PREFIXES.map((h, hi) => [`    ${hi === 0 ? 'if' : 'elseif'} EmpEnemyHouse == ${hi} then`,
    ...minBase(h).flatMap(([n, k]) => [`        set t = '${rc(n)}'`, `        set n = ${k}`, '        call EmpAiMinPlace(t, n)'])].join('\n')).join('\n') + '\n    endif';
  // the player's minimal base in a defence battle (PLAYER_MIN_BASE): its yard at the base point
  const playerSet: Array<readonly [string, number, number]> = [[`${P}ConYard`, 0, 0], ...minBase(P).flatMap(([n, k]) => (C.PLAYER_MIN_BASE[n.slice(P.length)] ?? []).slice(0, k).map(([dx, dy]) => [n, dx, dy] as const))];
  const playerBase = playerSet.map(([n, dx, dy]) => (rc(n) ? `    call CreateUnit(Player(0), '${rc(n)}', EmpBaseX[b] + EmpTiles(${dx}), EmpBaseY[b] - EmpTiles(${dy}), ${FACING})` : '')).filter(Boolean).join('\n');
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
  const flag = (r: RulesObject, key: string): boolean => /^true$/i.test((r.raw[key] ?? '').trim());
  // Game.exe 0x42e9b0: the builder group of a building (C.AI_GROUP_FLAGS)
  const groupOf = (r: RulesObject): string => C.AI_GROUP_FLAGS.find(([key]) => flag(r, key))?.[1] ?? (flag(r, C.AI_WALL) ? 'critical' : 'none');
  PREFIXES.forEach((h, hi) => {
    const own = [...(o.rules?.objects.values() ?? [])].filter((r) => r.category === 'Building' && r.name.startsWith(h) && rc(r.name));
    const entries = own.filter((r) => !flag(r, 'Dockable') && groupOf(r) in category);
    if (entries.length > C.TEMPLATE_SLOTS) throw new Error(`AI buildings of ${entries.length} > TEMPLATE_SLOTS`);
    entries.forEach((r, k) => {
      const id = rc(r.name) as string;
      const g = groupOf(r) as keyof typeof category;
      aiLines.push(`    set EmpAiBType[${hi * C.TEMPLATE_SLOTS + k}] = '${id}'`,
        `    call SaveInteger(EmpAiTab, '${id}', 0, ${category[g]})`,
        `    call SaveBoolean(EmpAiTab, '${id}', 1, ${g === 'defence'})`,
        `    call SaveBoolean(EmpAiTab, '${id}', 2, ${flag(r, C.AI_EXIT_FLAG)})`,
        `    call SaveBoolean(EmpAiTab, '${id}', 3, ${r.name === `${h}Refinery`})`);
    });
    // every building it may build takes its Rules.txt BuildTime (game ticks), the critical ones too
    for (const r of own) aiLines.push(`    call SaveReal(EmpAiTab, '${rc(r.name)}', 4, ${real((r.buildTime ?? 0) / TICKS_PER_SECOND)})`);
    const wall = rc(h + C.AI_WALL), windtrap = rc(`${h}SmWindtrap`);
    aiLines.push(`    set EmpAiBCount[${hi}] = ${entries.length}`, `    set EmpAiWall[${hi}] = ${wall ? `'${wall}'` : 0}`, `    set EmpAiPower[${hi}] = ${windtrap ? `'${windtrap}'` : 0}`);
    // the critical needs (ai.j EmpAiCritical): the house's refinery, its helipad (Rules.txt Helipad)
    const refinery = rc(`${h}Refinery`);
    const helipad = [...(o.rules?.objects.values() ?? [])].find((r) => r.name.startsWith(h) && /^true$/i.test((r.raw.Helipad ?? '').trim()));
    const pad = helipad ? rc(helipad.name) : undefined;
    aiLines.push(`    set EmpAiRefinery[${hi}] = ${refinery ? `'${refinery}'` : 0}`, `    set EmpAiHelipad[${hi}] = ${pad ? `'${pad}'` : 0}`);
    // its construction yard (the minimal base, the story AI's yard)
    const yardOf = rc(`${h}ConYard`);
    buildingCost.push(`    set EmpAiYardType[${hi}] = ${yardOf ? `'${yardOf}'` : 0}`);
    // its refinery pad order (pads.j)
    const padOrder = (o.units.padOrders ?? []).find((p) => p.refinery === refinery);
    if (padOrder) aiLines.push(`    set EmpAiPadType[${hi}] = '${padOrder.id}'`, `    set EmpAiPadCost[${hi}] = ${padOrder.cost}`, `    set EmpAiPadTime[${hi}] = ${real(padOrder.seconds)}`);
    // the buildings the AI builds or rebuilds pay their Rules.txt Cost too
    for (const r of own) buildingCost.push(`    call SaveInteger(EmpCostTab, '${rc(r.name)}', 0, ${r.cost})`);
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
  // TODO(ai): Game.exe's attacks are script tactics (type 1): 217 STRATEGY files in the AI_DATA folders
  // 1..7, SubHouse, CrossTech (all in RAW_DIR) with objectsets.txt, loaded by 0x43c420, parsed by
  // 0x445900 (DESCRIPTION / TEAM / TARGET / STAGING / STEP SEND WAIT GOTO RUN TAUNT MONITOR), picked
  // proactively by frequency (1: 51 %, 2: 30 %, 3: 15 %, 4: 4 %; 0x45b5f0) every GapBetweenNewScripts
  // under MaxScriptsToRunAtOnce, or reactively against threats (0x44e100); teams by objectset from the
  // reserves; LargeAttackModifier only sets the 1-in-5250 LARGE attack roll (0x44d1b5 -> 0x450f30).
  // Here a wave of home units on GapBetweenNewScripts scaled by LargeAttackModifier stands for them.
  // Risk: the enemy attacks with any units, in one shape, more or less often than Emperor's.
  ai.tech.forEach((t, lvl) => {
    if (lvl < 1) return;
    aiLines.push(`    set EmpAiTMax[${lvl}] = ${t.maxUnits}`, `    set EmpAiTBuildings[${lvl}] = ${t.numBuildings}`,
      `    set EmpAiTBuildDelay[${lvl}] = ${real(Math.max(1, t.buildingDelay) / TICKS_PER_SECOND)}`, `    set EmpAiTUnitDelay[${lvl}] = ${real(Math.max(1, t.unitDelay) / TICKS_PER_SECOND)}`,
      // GapBetweenNewScripts (LargeAttackModifier sets only the LARGE attack's roll in Game.exe, not ported)
      `    set EmpAiTGap[${lvl}] = ${real(Math.max(1, t.gapBetweenScripts) / TICKS_PER_SECOND)}`, `    set EmpAiTScripts[${lvl}] = ${t.maxScripts}`,
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
    if (id && /^true$/i.test((r.raw.Ornithoptor ?? '').trim())) aiLines.push(`    call SaveBoolean(EmpAiTab, '${id}', ${C.AI_TAB_ORNI}, true)`);
  }
  aiLines.push(`    set EmpAiMcv = ${mcv ? `'${mcv}'` : 0}`, `    set EmpAiMcvCost = ${o.rules?.objects.get('MCV')?.cost ?? 0}`);
  // the ai.ini values SideAIBehaviour* re-tunes (forces.j EmpAiBehave)
  // TODO(ai): DefenceTacticWanderDistance has no reader in Game.exe 1.09 (every caller of 0x431d80 /
  // 0x431b60 checked): the home guard's chase radius EmpAiWander built on it is the port's own; Game.exe's
  // defence teams fight intruders inside the base's megatiles (0x455220). Risk: the guard chases
  // farther or nearer than Emperor's.
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
  // the AI's map (ai-map.j): its static layer, the cells of the buildings of the AI houses, the plan
  // turrets; data functions of AI_MAP.linesPerChunk calls each (a thread each: the op limit)
  const mapCalls: string[] = [];
  const mapInit: string[] = [];
  if (o.meta.tiles && o.meta.mapSize) {
    const [W, H] = o.meta.mapSize;
    const [ax, ay] = o.terrain.toWorld(0, 0).map((v) => v / WC3_UNITS_PER_TILE) as [number, number];
    mapInit.push(`    set EmpAiMapW = ${W}`, `    set EmpAiMapH = ${H}`, `    set EmpAiMapAx = ${real(ax)}`, `    set EmpAiMapAy = ${real(ay)}`);
    for (const [y, x0, x1, v] of aiMapRuns(o.meta.tiles, W, H)) mapCalls.push(`    call EmpAiMapRun(${y}, ${x0}, ${x1}, ${v})`);
  }
  PREFIXES.forEach((h, hi) => {
    for (const r of [...(o.rules?.objects.values() ?? [])].filter((x) => x.category === 'Building' && x.name.startsWith(h) && rc(x.name))) {
      const cells = occupyCells(r.occupy);
      for (const [dx, dy] of cells.body) mapCalls.push(`    call EmpAiOcc('${rc(r.name)}', ${dx}, ${dy}, true)`);
      for (const [dx, dy] of cells.reserved) mapCalls.push(`    call EmpAiOcc('${rc(r.name)}', ${dx}, ${dy}, false)`);
      if (cells.body.length) {
        const xs = cells.body.map(([x]) => x), ys = cells.body.map(([, y]) => y);
        mapCalls.push(`    call EmpAiOccBox('${rc(r.name)}', ${Math.min(...xs)}, ${Math.min(...ys)}, ${Math.max(...xs) - Math.min(...xs) + 1}, ${Math.max(...ys) - Math.min(...ys) + 1})`);
      }
    }
    const turret = rc(h + (C.AI_PLAN.turret[h] ?? ''));
    mapInit.push(`    set EmpAiPlanTurret[${hi}] = ${turret ? `'${turret}'` : 0}`);
  });
  const chunks: string[] = [];
  for (let i = 0; i < mapCalls.length; i += C.AI_MAP.linesPerChunk) chunks.push(`function EmpAiMapData${chunks.length} takes nothing returns nothing\n${mapCalls.slice(i, i + C.AI_MAP.linesPerChunk).join('\n')}\nendfunction\n`);
  chunks.forEach((_, i) => mapInit.push(`    call ExecuteFunc("EmpAiMapData${i}")`));
  const aiMapFunctions = renderFile(jassFile('battle/ai-map'), {
    M: C.AI_MAP, P: C.AI_PLAN, S: C.AI_SITE, C, ai, WC3_UNITS_PER_TILE, planTech: ai.firstCampaignTech + 1, mapData: chunks.join('\n'), mapInit: mapInit.join('\n'),
  });
  // the AI script tactics (ai-scripts.j): the object sets the strategies name, each pro-active strategy's
  // numbers (reactive ones are not ported: TODO there)
  const { sets: objSets, strategies } = o.rules ? loadAiScripts(RAW_DIR) : { sets: [], strategies: [] };
  const setIdx = new Map(objSets.map((s2, i) => [s2.name.toLowerCase(), i]));
  const proactive = strategies.filter((s2) => !s2.reactive);
  const scriptSetLines = objSets.flatMap((s2, i) => s2.objects.map((n) => rc(n)).filter(isId).map((id) => `    call SaveBoolean(EmpScrSetTab, ${i}, '${id}', true)`));
  const scriptLines = proactive.flatMap((s2, i) => [`    call SaveStr(EmpScrSetTab, -1, ${i}, ${str(s2.name)})`,
    `    call EmpScrAdd("${encodeStrategy(s2, (n) => setIdx.get(n) ?? -1, { houseId: (h) => ({ atreides: 0, harkonnen: 1, ordos: 2 } as Record<string, number>)[h] ?? -1, builtinTeam: C.AI_SCRIPT.builtinTeam,
      target: { base: C.AI_SCRIPT.targetBase, threat: C.AI_SCRIPT.targetThreat, any: C.AI_SCRIPT.targetAny, harvester: C.AI_SCRIPT.targetHarvester, set: C.AI_SCRIPT.targetSet },
      sides: C.AI_SCRIPT.sides, tiles: C.AI_SCRIPT.tiles }).join(',')}")`]);
  const aiScriptFunctions = renderFile(jassFile('battle/ai-scripts'), { C, ai, harvester, WC3_UNITS_PER_TILE, scriptSetLines: scriptSetLines.join('\n'), scriptLines: scriptLines.join('\n') });
  const aiFunctions = renderFile(jassFile('battle/ai'), {
    aiMapFunctions, aiScriptFunctions, minBaseLines, attackBattle: o.territoryBattle && !o.defend,
    C, UI, FACING, ai, harvester, WC3_UNITS_PER_TILE, TPS: TICKS_PER_SECOND, TICK_SECONDS, ABILITY,
    // AI_HARV_FLIGHT: the tech level the harvester flight waits past (FirstCampaignGameTechLevel + 1)
    harvFlightTech: ai.firstCampaignTech + 1,
    // the enemy house's barracks type (Game.exe 0x43b920: by the side's house)
    barracksPick: barracksOf.map((id, h) => `    if EmpEnemyHouse == ${h} then\n        set t = '${id}'\n    endif`).join('\n'),
    // the shares of the credits by builder state (AI_MONEY)
    moneyShares: C.AI_MONEY.shares.map(([u, bl], s) => `    ${s === 0 ? 'if' : 'elseif'} s == ${s} then\n        set EmpAiUnitPct = ${u}\n        set EmpAiBuildPct = ${bl}`).join('\n') + '\n    endif',
    // the refineries wanted by time and skill (AI_CRITICAL_REFINERY, first match from the top)
    refineryLevels: C.AI_CRITICAL_REFINERY.levels.map((l, i) => `    ${i === 0 ? 'if' : 'elseif'} EmpTick > (late + ${l.minutes}) * ${C.AI_CRITICAL_BARRACKS.ticksPerMinute}${l.skillOver >= 0 ? ` and EmpAiSkill > ${l.skillOver}` : ''} then\n        set want = ${l.level}`).join('\n') + '\n    endif',
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
  // the base a territory keeps (SAVED_BASE): the types of each house, its construction yard
  const keptOf = PREFIXES.map((h) => C.SAVED_BASE.types.map((s) => rc(h + s)).filter(isId));
  const branch = (hi: number, ret: string): string => `    ${hi === 0 ? 'if' : 'elseif'} h == ${hi} then\n        return ${ret}`;
  const baseKeep = keptOf.map((ids, hi) => branch(hi, ids.map((id) => `t == '${id}'`).join(' or ') || 'false')).join('\n') + '\n    endif';
  const baseYard = PREFIXES.map((h, hi) => branch(hi, rc(`${h}ConYard`) ? `'${rc(`${h}ConYard`)}'` : '0')).join('\n') + '\n    endif';
  fns.push(jass('forces', {
    baseKeep, baseYard, CAT: J_CACHE_CATEGORY, KB: str(CACHE_KEY.basePrefix),
    RESERVE, RESERVE_ARRIVED, reserveValue: o.rules?.reinforcements.reserves ?? 0,
    strongTech: tuneLines(BP.strong, true, '            '), campaignPhases,
    aggressiveTech: tuneLines(BP.aggressive, true, '            '), defensiveTech: tuneLines(BP.defensive, true, '            '),
    aggressiveSide: [tuneLines(BP.aggressive, false, '        '), ...setLines(C.AI_BEHAVIOUR_SET.aggressive)].join('\n'),
    defensiveSide: [tuneLines(BP.defensive, false, '        '), ...setLines(C.AI_BEHAVIOUR_SET.defensive)].join('\n'),
    TPS: TICKS_PER_SECOND,
    aiFunctions, storyAi: storyHouse >= 0, storyHouse,
    harvester, playerBase, mcv: mcv ?? '', territoryBattle: o.territoryBattle,
    // the yard of the minimal base: MIN_BASE.yardShift tiles (left, up)
    yardLeft: -C.MIN_BASE.yardShift[0] * WC3_UNITS_PER_TILE, yardUp: C.MIN_BASE.yardShift[1] * WC3_UNITS_PER_TILE,
    vehMax: C.ENEMY_VEHICLES.length - 1, infMax: C.ENEMY_INFANTRY.length - 1,
    supportLines: support.map((id) => `    call CreateUnit(Player(0), '${id}', GetLocationX(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), GetLocationY(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), ${FACING})`).join('\n'),
    ai,
    isBarracks: barracksOf.map((id) => `t == '${id}'`).join(' or '),
    isFactory: factoryOf.map((id) => `t == '${id}'`).join(' or '),
    // the AI's carryalls (AI_CARRYALL): the type, its Cost, the hangars that build it
    carryall: rc('Carryall') ?? '', carryallCost: o.rules?.objects.get('Carryall')?.cost ?? 0,
    isHangar: PREFIXES.map((h) => rc(`${h}Hanger`)).filter(isId).map((id) => `t == '${id}'`).join(' or ') || 'false',
    costLines: [...produced.map((id) => `    call SaveInteger(EmpCostTab, '${id}', 0, ${costOf(id)})`), ...buildingCost].join('\n'),
    army: { attacker: o.rules?.reinforcements.attacker ?? C.FALLBACK_ARMY_VALUE, defender: o.rules?.reinforcements.defender ?? C.FALLBACK_ARMY_VALUE },
    money: o.rules?.campaignMoney ?? { attack: C.FALLBACK_CREDITS, defend: C.FALLBACK_CREDITS },
  }));

  fns.push(jass('init', { harvReplaceTicks: Number(o.rules?.general.HarvReplacementDelay ?? 0) || 0, storyAi: storyHouse >= 0, territoryBattle: o.territoryBattle, attackBattle: o.territoryBattle && !o.defend, defendBattle: o.territoryBattle && Boolean(o.defend) }));
  lines.push('    call EmpBattleInit()');
  return { functions: fns.join('\n\n'), init: lines.join('\n'), clusters: clusters.length };
}

export { battleSetup, spiceClusters, storyAiHouse };
