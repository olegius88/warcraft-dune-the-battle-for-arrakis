'use strict';
// Territory-battle setup that Emperor does in code rather than in mission scripts:
// spice fields, starting forces, the enemy house's base, AI production/attack waves, the
// economy/construction glue and tech-level limits. Produces JASS (functions + init lines).
// The enemy house and tech level are runtime values (EmpEnemyHouse 0 AT / 1 HK / 2 OR,
// EmpTechLevel), set from the campaign cache by mission.js before EmpBattleInit runs.
//
// Simplifications (TODO(ai)): the enemy base is a fixed template instead of Emperor's
// position-scored AI builder (ai.ini); AI units are produced without paying; waves attack the
// player's base point every 150 s.

const { real } = require('../wc3/jass');

const HOUSE_PREFIX = { Atreides: 'AT', Harkonnen: 'HK', Ordos: 'OR' };
const PREFIXES = ['AT', 'HK', 'OR']; // index = EmpEnemyHouse / house id

// Enemy base template: [Emperor building suffix, dx, dy] in tiles from the base point.
const BASE_TEMPLATE = [
  ['ConYard', 0, 0], ['SmWindtrap', -5, -4], ['SmWindtrap', -5, 0], ['Refinery', 5, -4], ['Barracks', 5, 2],
  ['Factory', 0, 6], ['Outpost', -5, 5], ['Pillbox', -8, -8], ['Pillbox', 8, -8], ['GunTurret', 8, 8], ['GunTurret', -8, 8],
];
const INF = ['Infantry', 'LightInf', 'Trooper', 'Sniper', 'Chemical', 'Flamer', 'Mortar', 'AATrooper', 'Kindjal'];
const VEH = ['Trike', 'Buzzsaw', 'DustScout', 'Mongoose', 'Assault', 'LaserTank', 'Flame', 'Kobra', 'Minotaurus', 'InkVine', 'Missile', 'Devastator', 'SonicTank', 'Deviator'];

/** Group spice tiles into clusters (flood fill with a 2-tile reach). */
function spiceClusters(meta) {
  const [W, H] = meta.mapSize;
  const s = meta.spice;
  const seen = new Uint8Array(W * H);
  const out = [];
  for (let i = 0; i < W * H; i++) {
    if (!s[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let n = 0, sx = 0, sy = 0;
    while (stack.length) {
      const j = stack.pop();
      const x = j % W, y = (j / W) | 0;
      n++; sx += x; sy += y;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (s[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push({ x: (sx / n + 0.5) * 32, y: (sy / n + 0.5) * 32, tiles: n });
  }
  return out;
}

/** JASS "if/elseif" chain choosing a value by EmpEnemyHouse. */
function byHouse(lines) {
  return lines.map((body, h) => `    ${h === 0 ? 'if' : 'elseif'} EmpEnemyHouse == ${h} then\n${body}`).join('\n') + '\n    endif';
}

/**
 * @param {object} o
 * @param {object} o.meta, o.terrain (buildTerrain result), o.units (buildUnitData)
 * @param {string} o.playerHouse  'Atreides' | 'Harkonnen' | 'Ordos'
 * @param {boolean} o.territoryBattle  create starting forces/enemy base (false for story missions)
 */
function battleSetup(o) {
  const rc = (name) => o.units.rawcode.get(name);
  const obj = (id) => o.units.objects.find((x) => x.id === id);
  const P = HOUSE_PREFIX[o.playerHouse] || 'AT';
  const lines = [];
  const fns = [];

  // ---- tech limits by runtime tech level ----
  const gated = o.units.objects.filter((x) => x.emperor && x.emperor.techLevel > 1);
  const byLevel = {};
  for (const x of gated) (byLevel[x.emperor.techLevel] = byLevel[x.emperor.techLevel] || []).push(x.id);
  fns.push(`function EmpTechLimits takes nothing returns nothing
    local integer i = 0
    loop
        exitwhen i > 11
${Object.entries(byLevel).map(([lvl, idsAt]) => `        if EmpTechLevel < ${lvl} then\n${idsAt.map((id) => `            call SetPlayerTechMaxAllowed(Player(i), '${id}', 0)`).join('\n')}\n        endif`).join('\n')}
        set i = i + 1
    endloop
endfunction`);

  // ---- spice fields ----
  const clusters = spiceClusters(o.meta);
  fns.push(`function EmpSpiceFields takes nothing returns nothing
    local unit m
${clusters.map((c) => { const [x, y] = o.terrain.toWorld(c.x, c.y); return `    set m = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '${o.units.ids.spiceField}', ${real(x)}, ${real(y)}, 270.0)\n    call SetResourceAmount(m, ${Math.max(2000, c.tiles * 1500)})`; }).join('\n')}
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
        exitwhen i > 11
        call GroupEnumUnitsOfPlayer(EmpTmpGroup, Player(i), Filter(function EmpHarvestIdleEnum))
        set i = i + 1
    endloop
endfunction

function EmpOnBuildingDone takes nothing returns nothing
    local unit b = GetConstructedStructure()
    local integer t = GetUnitTypeId(b)
${PREFIXES.map((h, i) => `    if t == '${conYards[i]}' then\n        call CreateUnit(GetOwningPlayer(b), '${o.units.ids.builders[h]}', GetUnitX(b) - 256.0, GetUnitY(b) - 256.0, 270.0)\n    endif`).join('\n')}
    if ${refineries.map((r) => `t == '${r}'`).join(' or ')} then
        call CreateUnit(GetOwningPlayer(b), '${harvester}', GetUnitX(b) + 256.0, GetUnitY(b) - 256.0, 270.0)
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
        call GroupEnumUnitsInRange(g, GetUnitX(b), GetUnitY(b), 900.0, null)
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
  const own = (suffix) => rc(P + suffix);
  const playerArmy = [mcv, own('Infantry') || own('LightInf'), own('Infantry') || own('LightInf'), own('Trike') || own('Buzzsaw') || own('DustScout'), harvester].filter(Boolean);
  const pickFn = (name, perHouse) => `function ${name} takes integer i returns integer
${byHouse(perHouse.map((list) => list.map((id, k) => `        if i == ${k} then\n            return '${id}'\n        endif`).join('\n') || '        return 0'))}
    return 0
endfunction`;
  const infBy = PREFIXES.map((h) => INF.map((s) => rc(h + s)).filter(Boolean));
  const vehBy = PREFIXES.map((h) => VEH.map((s) => rc(h + s)).filter(Boolean));
  fns.push(pickFn('EmpEnemyInf', infBy));
  fns.push(pickFn('EmpEnemyVeh', vehBy));
  fns.push(`// random unit of the enemy house allowed at the current tech level (vehicles if veh)
function EmpEnemyPick takes boolean veh returns integer
    local integer tries = 0
    local integer t
    loop
        if veh then
            set t = EmpEnemyVeh(GetRandomInt(0, 13))
        else
            set t = EmpEnemyInf(GetRandomInt(0, 8))
        endif
        if t != 0 and GetPlayerTechMaxAllowed(Player(1), t) != 0 then
            return t
        endif
        set tries = tries + 1
        exitwhen tries > 20
    endloop
    return EmpEnemyInf(0)
endfunction`);
  const enemyBase = PREFIXES.map((h) => BASE_TEMPLATE.map(([sfx, dx, dy]) => (rc(h + sfx) ? `        call CreateUnit(Player(1), '${rc(h + sfx)}', EmpBaseX[b] + EmpTiles(${dx}), EmpBaseY[b] - EmpTiles(${dy}), 270.0)` : '')).filter(Boolean).join('\n'));
  // the player's own base for defence battles (own house template at the player's base point)
  const playerBase = BASE_TEMPLATE.map(([sfx, dx, dy]) => (rc(P + sfx) ? `    call CreateUnit(Player(0), '${rc(P + sfx)}', EmpBaseX[b] + EmpTiles(${dx}), EmpBaseY[b] - EmpTiles(${dy}), 270.0)` : '')).filter(Boolean).join('\n');
  const barracksOf = PREFIXES.map((h) => rc(`${h}Barracks`));
  const factoryOf = PREFIXES.map((h) => rc(`${h}Factory`));
  fns.push(`function EmpStartForces takes nothing returns nothing
    local location p = EF_GetEntrancePoint(0)
    local integer b = EmpBaseOfSide(1)
${playerArmy.map((id) => `    call CreateUnit(Player(0), '${id}', GetLocationX(p) + GetRandomReal(-200, 200), GetLocationY(p) + GetRandomReal(-200, 200), 270.0)`).join('\n')}
    call SetCameraPositionLocForPlayer(Player(0), p)
    set EmpCamSet = true
${byHouse(enemyBase)}
    call CreateUnit(Player(1), '${harvester}', EmpBaseX[b] + 512.0, EmpBaseY[b] - 512.0, 270.0)
    call CreateUnit(Player(1), EmpEnemyPick(false), EmpBaseX[b] + 300.0, EmpBaseY[b] + 300.0, 270.0)
    call CreateUnit(Player(1), EmpEnemyPick(false), EmpBaseX[b] - 300.0, EmpBaseY[b] + 300.0, 270.0)
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, 3000)
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
            call CreateUnit(Player(1), EmpEnemyPick(false), GetUnitX(u), GetUnitY(u) - 256.0, 270.0)
        elseif EmpAlive(u) and (${factoryOf.map((id) => `t == '${id}'`).join(' or ')}) then
            call CreateUnit(Player(1), EmpEnemyPick(true), GetUnitX(u), GetUnitY(u) - 320.0, 270.0)
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
    call CreateUnit(Player(0), '${harvester}', EmpBaseX[b] + 512.0, EmpBaseY[b] - 512.0, 270.0)
${playerArmy.slice(1, 4).map((id) => `    call CreateUnit(Player(0), '${id}', EmpBaseX[b] + GetRandomReal(-300, 300), EmpBaseY[b] + GetRandomReal(-300, 300), 270.0)`).join('\n')}
    call SetCameraPositionForPlayer(Player(0), EmpBaseX[b], EmpBaseY[b])
    set EmpCamSet = true
    call SetPlayerStateBJ(Player(0), PLAYER_STATE_RESOURCE_GOLD, 2500)
    set EmpDefendMode = true
    set EmpWavesLeft = 4
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
        exitwhen k >= 3 + EmpTechLevel / 2
        call CreateUnit(Player(1), EmpEnemyPick(GetRandomInt(0, 2) > 0), GetLocationX(e) + GetRandomReal(-250, 250), GetLocationY(e) + GetRandomReal(-250, 250), 270.0)
        set k = k + 1
    endloop
    set EmpWavesLeft = EmpWavesLeft - 1
    set EmpAIMode[1] = 1
    set EmpAITargetSide[1] = 0
    call PingMinimapLocForForce(GetPlayersAll(), e, 4.0)
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 8.0, "Ментат: Враг атакует! Осталось волн: " + I2S(EmpWavesLeft))
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
        exitwhen i > 11
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnBuildingDone)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > 11
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_START, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnConstructStart)
    call TimerStart(CreateTimer(), 3.0, true, function EmpHarvestTick)
${o.territoryBattle && !o.defend ? `    call EmpStartForces()
    call TimerStart(CreateTimer(), 20.0, true, function EmpEnemyProduce)
    call TimerStart(CreateTimer(), 150.0, true, function EmpEnemyWave)` : ''}
${o.territoryBattle && o.defend ? `    call EmpDefendStart()
    call TimerStart(CreateTimer(), 75.0, true, function EmpDefendWave)` : ''}
    set tr = null
endfunction`);
  lines.push('    call EmpBattleInit()');
  return { functions: fns.join('\n\n'), init: lines.join('\n'), clusters: clusters.length };
}

module.exports = { battleSetup, spiceClusters, HOUSE_PREFIX, PREFIXES };
