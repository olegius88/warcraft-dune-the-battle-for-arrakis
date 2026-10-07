// Territory-battle setup that Emperor does in code rather than in mission scripts:
// spice fields, starting forces, the enemy house's base, AI production/attack waves, the
// economy/construction glue and tech-level limits. Produces JASS (functions + init lines).
// The enemy house and tech level are runtime values (EmpEnemyHouse 0 AT / 1 HK / 2 OR,
// EmpTechLevel), set from the campaign cache by mission.ts before EmpBattleInit runs.
//
// Simplifications (TODO(ai)): the enemy base is a fixed template instead of Emperor's
// position-scored AI builder (ai.ini); AI units are produced without paying; waves attack the
// player's base point every 150 s.

import { real, str } from '../wc3/jass.ts';
import { HOUSE_CODES, CODE_BY_HOUSE } from '../config/houses.ts';
import { EMPEROR_TILE } from '../config/scale.ts';
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

  // ---- tech limits by runtime tech level ----
  const byLevel: Record<number, string[]> = {};
  for (const x of o.units.objects) {
    if (!x.emperor || x.emperor.techLevel <= 1) continue;
    (byLevel[x.emperor.techLevel] = byLevel[x.emperor.techLevel] || []).push(x.id);
  }
  fns.push(`function EmpTechLimits takes nothing returns nothing
    local integer i = 0
    loop
        exitwhen i > ${MAX_SIDE}
${Object.entries(byLevel).map(([lvl, idsAt]) => `        if EmpTechLevel < ${lvl} then\n${idsAt.map((id) => `            call SetPlayerTechMaxAllowed(Player(i), '${id}', 0)`).join('\n')}\n        endif`).join('\n')}
        set i = i + 1
    endloop
endfunction`);

  // ---- spice fields ----
  const clusters = spiceClusters(o.meta);
  fns.push(`function EmpSpiceFields takes nothing returns nothing
    local unit m
${clusters.map((c) => { const [x, y] = o.terrain.toWorld(c.x, c.y); return `    set m = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '${o.units.ids.spiceField}', ${real(x)}, ${real(y)}, ${FACING})\n    call SetResourceAmount(m, ${Math.max(C.SPICE_FIELD_MIN, c.tiles * C.SPICE_PER_TILE)})`; }).join('\n')}
    set m = null
endfunction`);

  // ---- economy & construction glue ----
  const conYards = PREFIXES.map((h) => rc(`${h}ConYard`));
  const refineries = PREFIXES.map((h) => rc(`${h}Refinery`));
  const harvester = rc('Harvester');
  const mcv = rc('MCV');
  fns.push(`function EmpNearestMine takes real x, real y returns unit
    local group g = CreateGroup()
    local unit u
    local unit best = null
    local real bd = 1000000000.0
    local real d
    call GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_PASSIVE), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if GetUnitTypeId(u) == '${o.units.ids.spiceField}' and GetResourceAmount(u) > 0 then
            set d = (GetUnitX(u) - x) * (GetUnitX(u) - x) + (GetUnitY(u) - y) * (GetUnitY(u) - y)
            if d < bd then
                set bd = d
                set best = u
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return best
endfunction

function EmpHarvestIdleEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    local unit m
    if GetUnitTypeId(u) == '${harvester}' and EmpAlive(u) and GetUnitCurrentOrder(u) == 0 then
        set m = EmpNearestMine(GetUnitX(u), GetUnitY(u))
        if m != null then
            call IssueTargetOrder(u, "harvest", m)
        endif
    endif
    set u = null
    set m = null
    return false
endfunction

function EmpHarvestTick takes nothing returns nothing
    local integer i = 0
    loop
        exitwhen i > ${MAX_SIDE}
        call GroupEnumUnitsOfPlayer(EmpTmpGroup, Player(i), Filter(function EmpHarvestIdleEnum))
        set i = i + 1
    endloop
endfunction

function EmpOnBuildingDone takes nothing returns nothing
    local unit b = GetConstructedStructure()
    local integer t = GetUnitTypeId(b)
${PREFIXES.map((h, i) => `    if t == '${conYards[i]}' then\n        call CreateUnit(GetOwningPlayer(b), '${o.units.ids.builders[h]}', GetUnitX(b) - ${real(C.BUILDER_OFFSET)}, GetUnitY(b) - ${real(C.BUILDER_OFFSET)}, ${FACING})\n    endif`).join('\n')}
    if ${refineries.map((r) => `t == '${r}'`).join(' or ')} then
        call CreateUnit(GetOwningPlayer(b), '${harvester}', GetUnitX(b) + ${real(C.NEW_HARVESTER_OFFSET)}, GetUnitY(b) - ${real(C.NEW_HARVESTER_OFFSET)}, ${FACING})
    endif
    set b = null
endfunction

function EmpOnConstructStart takes nothing returns nothing
    // the MCV is consumed by the construction yard it starts
    local unit b = GetConstructingStructure()
    local group g
    local unit u
    if ${conYards.map((c) => `GetUnitTypeId(b) == '${c}'`).join(' or ')} then
        set g = CreateGroup()
        call GroupEnumUnitsInRange(g, GetUnitX(b), GetUnitY(b), ${real(C.MCV_CONSUME_RADIUS)}, null)
        loop
            set u = FirstOfGroup(g)
            exitwhen u == null
            call GroupRemoveUnit(g, u)
            if GetUnitTypeId(u) == '${mcv}' and GetOwningPlayer(u) == GetOwningPlayer(b) then
                call RemoveUnit(u)
                exitwhen true
            endif
        endloop
        call DestroyGroup(g)
        set g = null
    endif
    set b = null
endfunction`);

  // ---- starting forces / enemy base (territory battles) ----
  const own = (suffix: string): string | undefined => rc(P + suffix);
  const playerArmy = [mcv, own('Infantry') || own('LightInf'), own('Infantry') || own('LightInf'), own('Trike') || own('Buzzsaw') || own('DustScout'), harvester].filter(isId);
  const pickFn = (name: string, perHouse: string[][]): string => `function ${name} takes integer i returns integer
${byHouse(perHouse.map((list) => list.map((id, k) => `        if i == ${k} then\n            return '${id}'\n        endif`).join('\n') || '        return 0'))}
    return 0
endfunction`;
  const infBy = PREFIXES.map((h) => C.ENEMY_INFANTRY.map((s) => rc(h + s)).filter(isId));
  const vehBy = PREFIXES.map((h) => C.ENEMY_VEHICLES.map((s) => rc(h + s)).filter(isId));
  fns.push(pickFn('EmpEnemyInf', infBy));
  fns.push(pickFn('EmpEnemyVeh', vehBy));
  fns.push(`// random unit of the enemy house allowed at the current tech level (vehicles if veh)
function EmpEnemyPick takes boolean veh returns integer
    local integer tries = 0
    local integer t
    loop
        if veh then
            set t = EmpEnemyVeh(GetRandomInt(0, ${C.ENEMY_VEHICLES.length - 1}))
        else
            set t = EmpEnemyInf(GetRandomInt(0, ${C.ENEMY_INFANTRY.length - 1}))
        endif
        if t != 0 and GetPlayerTechMaxAllowed(Player(1), t) != 0 then
            return t
        endif
        set tries = tries + 1
        exitwhen tries > ${C.ENEMY_PICK_TRIES}
    endloop
    return EmpEnemyInf(0)
endfunction`);
  const enemyBase = PREFIXES.map((h) => C.BASE_TEMPLATE.map(([sfx, dx, dy]) => (rc(h + sfx) ? `        call CreateUnit(Player(1), '${rc(h + sfx)}', EmpBaseX[b] + EmpTiles(${dx}), EmpBaseY[b] - EmpTiles(${dy}), ${FACING})` : '')).filter(Boolean).join('\n'));
  // the player's own base for defence battles (own house template at the player's base point)
  const playerBase = C.BASE_TEMPLATE.map(([sfx, dx, dy]) => (rc(P + sfx) ? `    call CreateUnit(Player(0), '${rc(P + sfx)}', EmpBaseX[b] + EmpTiles(${dx}), EmpBaseY[b] - EmpTiles(${dy}), ${FACING})` : '')).filter(Boolean).join('\n');
  const barracksOf = PREFIXES.map((h) => rc(`${h}Barracks`));
  const factoryOf = PREFIXES.map((h) => rc(`${h}Factory`));
  fns.push(`function EmpStartForces takes nothing returns nothing
    local location p = EF_GetEntrancePoint(0)
    local integer b = EmpBaseOfSide(1)
${playerArmy.map((id) => `    call CreateUnit(Player(0), '${id}', GetLocationX(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), GetLocationY(p) + GetRandomReal(-${C.START_ARMY_SPREAD}, ${C.START_ARMY_SPREAD}), ${FACING})`).join('\n')}
    call SetCameraPositionLocForPlayer(Player(0), p)
    set EmpCamSet = true
${byHouse(enemyBase)}
    call CreateUnit(Player(1), '${harvester}', EmpBaseX[b] + ${real(C.BASE_HARVESTER_OFFSET)}, EmpBaseY[b] - ${real(C.BASE_HARVESTER_OFFSET)}, ${FACING})
    call CreateUnit(Player(1), EmpEnemyPick(false), EmpBaseX[b] + ${real(C.BASE_GUARD_OFFSET)}, EmpBaseY[b] + ${real(C.BASE_GUARD_OFFSET)}, ${FACING})
    call CreateUnit(Player(1), EmpEnemyPick(false), EmpBaseX[b] - ${real(C.BASE_GUARD_OFFSET)}, EmpBaseY[b] + ${real(C.BASE_GUARD_OFFSET)}, ${FACING})
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, ${C.START_CREDITS})
    call RemoveLocation(p)
    set p = null
endfunction

function EmpEnemyProduce takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer t
    call GroupEnumUnitsOfPlayer(g, Player(1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set t = GetUnitTypeId(u)
        if EmpAlive(u) and (${barracksOf.map((id) => `t == '${id}'`).join(' or ')}) then
            call CreateUnit(Player(1), EmpEnemyPick(false), GetUnitX(u), GetUnitY(u) - ${real(C.PRODUCED_INFANTRY_OFFSET)}, ${FACING})
        elseif EmpAlive(u) and (${factoryOf.map((id) => `t == '${id}'`).join(' or ')}) then
            call CreateUnit(Player(1), EmpEnemyPick(true), GetUnitX(u), GetUnitY(u) - ${real(C.PRODUCED_VEHICLE_OFFSET)}, ${FACING})
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

function EmpEnemyWave takes nothing returns nothing
    if EmpAIMode[1] == 0 then
        set EmpAIMode[1] = 1
        set EmpAITargetSide[1] = 0
    endif
endfunction

// ---- defence battles: the player holds a base, the enemy arrives in waves from its entrance ----
function EmpDefendStart takes nothing returns nothing
    local integer b = EmpBaseOfSide(0)
    local location e = EF_GetEntrancePoint(1)
${playerBase}
    call CreateUnit(Player(0), '${harvester}', EmpBaseX[b] + ${real(C.BASE_HARVESTER_OFFSET)}, EmpBaseY[b] - ${real(C.BASE_HARVESTER_OFFSET)}, ${FACING})
${playerArmy.slice(C.DEFEND_ARMY_FROM, C.DEFEND_ARMY_TO).map((id) => `    call CreateUnit(Player(0), '${id}', EmpBaseX[b] + GetRandomReal(-${C.DEFEND_ARMY_SPREAD}, ${C.DEFEND_ARMY_SPREAD}), EmpBaseY[b] + GetRandomReal(-${C.DEFEND_ARMY_SPREAD}, ${C.DEFEND_ARMY_SPREAD}), ${FACING})`).join('\n')}
    call SetCameraPositionForPlayer(Player(0), EmpBaseX[b], EmpBaseY[b])
    set EmpCamSet = true
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, ${C.DEFEND_CREDITS})
    set EmpDefendMode = true
    set EmpWavesLeft = ${C.DEFEND_WAVES}
    call RemoveLocation(e)
    set e = null
endfunction

function EmpDefendWave takes nothing returns nothing
    local location e
    local integer k = 0
    if EmpWavesLeft <= 0 then
        return
    endif
    set e = EF_GetEntrancePoint(1)
    loop
        exitwhen k >= ${C.DEFEND_WAVE_BASE} + EmpTechLevel / 2
        call CreateUnit(Player(1), EmpEnemyPick(GetRandomInt(0, 2) > 0), GetLocationX(e) + GetRandomReal(-${C.DEFEND_WAVE_SPREAD}, ${C.DEFEND_WAVE_SPREAD}), GetLocationY(e) + GetRandomReal(-${C.DEFEND_WAVE_SPREAD}, ${C.DEFEND_WAVE_SPREAD}), ${FACING})
        set k = k + 1
    endloop
    set EmpWavesLeft = EmpWavesLeft - 1
    set EmpAIMode[1] = 1
    set EmpAITargetSide[1] = 0
    call PingMinimapLocForForce(GetPlayersAll(), e, ${real(C.DEFEND_WAVE_PING_SECONDS)})
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, ${real(C.DEFEND_WAVE_MESSAGE_SECONDS)}, ${str(C.DEFEND_WAVE_MESSAGE)} + I2S(EmpWavesLeft))
    call RemoveLocation(e)
    set e = null
endfunction`);

  fns.push(`function EmpBattleInit takes nothing returns nothing
    local trigger tr
    local integer i
    call EmpTechLimits()
    call EmpSpiceFields()
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > ${MAX_SIDE}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnBuildingDone)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > ${MAX_SIDE}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_START, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnConstructStart)
    call TimerStart(CreateTimer(), ${real(C.HARVEST_CHECK_PERIOD)}, true, function EmpHarvestTick)
${o.territoryBattle && !o.defend ? `    call EmpStartForces()
    call TimerStart(CreateTimer(), ${real(C.ENEMY_PRODUCE_PERIOD)}, true, function EmpEnemyProduce)
    call TimerStart(CreateTimer(), ${real(C.ENEMY_WAVE_PERIOD)}, true, function EmpEnemyWave)` : ''}
${o.territoryBattle && o.defend ? `    call EmpDefendStart()
    call TimerStart(CreateTimer(), ${real(C.DEFEND_WAVE_PERIOD)}, true, function EmpDefendWave)` : ''}
    set tr = null
endfunction`);
  lines.push('    call EmpBattleInit()');
  return { functions: fns.join('\n\n'), init: lines.join('\n'), clusters: clusters.length };
}

export { battleSetup, spiceClusters };
