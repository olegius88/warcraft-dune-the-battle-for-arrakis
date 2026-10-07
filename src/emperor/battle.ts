// Territory-battle setup that Emperor does in code rather than in mission scripts:
// spice fields, starting forces, the enemy house's base, AI production/attack waves, the
// economy/construction glue and tech-level limits. Produces JASS (functions + init lines).
// The enemy house and tech level are runtime values (EmpEnemyHouse 0 AT / 1 HK / 2 OR,
// EmpTechLevel), set from the campaign cache by mission.ts before EmpBattleInit runs.
//
// From Rules.txt: starting armies (UnitValueAttacker / UnitValueDefender, sets of the house's units by
// ReinforcementValue), credits (CampaignAttackMoney / CampaignDefendMoney), reinforcement sets, unit
// costs the enemy pays for its production.
// Simplifications (TODO(ai)): the enemy base is a fixed template instead of Emperor's
// position-scored AI builder (ai.ini), the enemy does not rebuild or expand it, and its army
// attacks the player's base point every ENEMY_WAVE_PERIOD instead of Emperor's AI tactics.

import { real } from '../wc3/jass.ts';
import { renderFile } from '../wc3/template.ts';
import type { Scope } from '../wc3/template.ts';
import { jassFile } from '../config/paths.ts';
import { HOUSE_CODES, CODE_BY_HOUSE } from '../config/houses.ts';
import { EMPEROR_TILE, TICKS_PER_SECOND } from '../config/scale.ts';
import { TERRAIN } from '../config/wc3.ts';
import { TEX } from '../config/terrain.ts';
import type { WormRules, Rules } from './rules.ts';
import { MAX_SIDE, DEFAULT_FACING } from '../config/runtime.ts';
import * as C from '../config/battle.ts';
import type { MapMeta } from './mapxbf.ts';
import type { EmperorTerrain } from './terrain.ts';
import type { UnitData } from './units.ts';

import type { House } from '../config/houses.ts';
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
  const jass = (name: string, scope: Scope): string => renderFile(jassFile(`battle/${name}`), { C, MAX_SIDE, FACING, ...scope });

  // ---- tech limits by runtime tech level ----
  const byLevel: Record<number, string[]> = {};
  for (const x of o.units.objects) {
    if (!x.emperor || x.emperor.techLevel <= 1) continue;
    (byLevel[x.emperor.techLevel] = byLevel[x.emperor.techLevel] || []).push(x.id);
  }
  fns.push(jass('tech-limits', {
    limitLines: Object.entries(byLevel).map(([lvl, idsAt]) => `        if EmpTechLevel < ${lvl} then\n${idsAt.map((id) => `            call SetPlayerTechMaxAllowed(Player(i), '${id}', 0)`).join('\n')}\n        endif`).join('\n'),
  }));

  // ---- spice fields ----
  const clusters = spiceClusters(o.meta);
  fns.push(jass('spice-fields', {
    fieldLines: clusters.map((c) => { const [x, y] = o.terrain.toWorld(c.x, c.y); return `    set m = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '${o.units.ids.spiceField}', ${real(x)}, ${real(y)}, ${FACING})\n    call SetResourceAmount(m, ${Math.max(C.SPICE_FIELD_MIN, c.tiles * C.SPICE_PER_TILE)})`; }).join('\n'),
  }));

  // ---- economy & construction glue ----
  const conYards = PREFIXES.map((h) => rc(`${h}ConYard`));
  const refineries = PREFIXES.map((h) => rc(`${h}Refinery`));
  const harvester = rc('Harvester');
  const mcv = rc('MCV');
  fns.push(jass('economy', {
    spiceField: o.units.ids.spiceField, harvester, mcv,
    builderLines: PREFIXES.map((h, i) => `    if t == '${conYards[i]}' then\n        call CreateUnit(GetOwningPlayer(b), '${o.units.ids.builders[h]}', GetUnitX(b) - ${real(C.BUILDER_OFFSET)}, GetUnitY(b) - ${real(C.BUILDER_OFFSET)}, ${FACING})\n    endif`).join('\n'),
    isRefinery: refineries.map((r) => `t == '${r}'`).join(' or '),
    isConYard: conYards.map((c) => `GetUnitTypeId(b) == '${c}'`).join(' or '),
  }));

  // ---- power (Rules.txt; TODO(power) in src/jass/battle/power.j) ----
  fns.push(jass('power', {
    powerLines: [...o.units.objects]
      .filter((x) => x.emperor && (x.emperor.power !== 0 || x.emperor.disableWithLowPower))
      .map((x) => `    call EmpPowerType('${x.id}', ${x.emperor?.power}, ${x.emperor?.disableWithLowPower})`).join('\n'),
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
  const enemyBase = PREFIXES.map((h) => C.BASE_TEMPLATE.map(([sfx, dx, dy]) => (rc(h + sfx) ? `        call CreateUnit(Player(1), '${rc(h + sfx)}', EmpBaseX[b] + EmpTiles(${dx}), EmpBaseY[b] - EmpTiles(${dy}), ${FACING})` : '')).filter(Boolean).join('\n'));
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
  fns.push(jass('forces', {
    harvester, playerBase,
    vehMax: C.ENEMY_VEHICLES.length - 1, infMax: C.ENEMY_INFANTRY.length - 1,
    supportLines: support.map((id) => `    call CreateUnit(Player(0), '${id}', GetLocationX(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), GetLocationY(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), ${FACING})`).join('\n'),
    enemyBaseByHouse: byHouse(enemyBase),
    isBarracks: barracksOf.map((id) => `t == '${id}'`).join(' or '),
    isFactory: factoryOf.map((id) => `t == '${id}'`).join(' or '),
    costLines: produced.map((id) => `    call SaveInteger(EmpCostTab, '${id}', 0, ${costOf(id)})`).join('\n'),
    army: { attacker: o.rules?.reinforcements.attacker ?? C.FALLBACK_ARMY_VALUE, defender: o.rules?.reinforcements.defender ?? C.FALLBACK_ARMY_VALUE },
    money: o.rules?.campaignMoney ?? { attack: C.FALLBACK_CREDITS, defend: C.FALLBACK_CREDITS },
  }));

  fns.push(jass('init', { territoryBattle: o.territoryBattle, attackBattle: o.territoryBattle && !o.defend, defendBattle: o.territoryBattle && Boolean(o.defend) }));
  lines.push('    call EmpBattleInit()');
  return { functions: fns.join('\n\n'), init: lines.join('\n'), clusters: clusters.length };
}

export { battleSetup, spiceClusters };
