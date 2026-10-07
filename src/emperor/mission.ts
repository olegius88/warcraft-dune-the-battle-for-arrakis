// Assemble an Emperor mission map (.w3x): converted terrain, Emperor object data (w3u/w3a +
// combat table), the JASS runtime, one or more translated mission scripts (one per campaign
// phase, chosen at runtime) and the campaign glue (game cache in, result out, back to the hub).

import { buildMap } from '../wc3/map.ts';
import { str, real } from '../wc3/jass.ts';
import { buildRuntime } from './runtime.ts';
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
import type { Speech } from './speech.ts';
import { HOUSE_ID, HOUSE_COLOR, OTHER_ENEMY_COLOR, CODE_BY_HOUSE, HOUSE_BY_CODE } from '../config/houses.ts';
import { CACHE_FILE, DEFAULT_ENEMY, J_CACHE_CATEGORY as CAT, J_CACHE_KEY as K, KIND_ID, DEFAULT_PHASE, DEFAULT_TECH, START_MISSION_PHASE, START_MISSION_TECH } from '../config/campaign.ts';
import type { MissionKind } from '../config/campaign.ts';
import * as RT from '../config/runtime.ts';
import { TICK_SECONDS, EMPEROR_TILE, WC3_UNITS_PER_TILE, HP_DIVISOR, ARMOR_REDUCTION, moveSpeed } from '../config/scale.ts';
import { UNIT, DESTRUCTABLE, ITEM, EFFECT, ICON } from '../config/wc3.ts';
import * as SC from '../config/scenery.ts';

export type { MissionKind };
const FACING = real(RT.DEFAULT_FACING);

export interface MissionScript {
  tok: Buffer;
  /** campaign phase the script belongs to (chosen at run time) */
  phase: number;
  name: string;
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
  /** automatic flow test: win the mission after this many seconds (config AUTOTEST_WIN_SECONDS) */
  autoWinSeconds?: number;
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

  const battle = battleSetup({ meta: p.meta, terrain: t, units: p.units, playerHouse: p.playerHouse, territoryBattle: Boolean(p.territoryBattle), defend: p.kind === 'defend' });
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
    o.veterancy.forEach((l, i) => vetLines.push(`    call EmpVetLevel('${id}', ${i + 1}, ${l.score}, ${Math.round(l.health / HP_DIVISOR)}, ${l.extraDamage}, ${l.extraArmour}, ${l.extraRange}, ${l.speed ? Math.round(moveSpeed(l.speed)) : 0}, ${l.selfRepair}, ${l.elite})`));
  }
  const half = (n: number): number => (n * WC3_UNITS_PER_TILE) / 2;
  const [bl, br, bb, btop] = t.boundary;
  init.push(`    set EmpMapMinX = ${real(-half(t.width) + bl * WC3_UNITS_PER_TILE)}`, `    set EmpMapMaxX = ${real(half(t.width) - br * WC3_UNITS_PER_TILE)}`);
  init.push(`    set EmpMapMinY = ${real(-half(t.height) + bb * WC3_UNITS_PER_TILE)}`, `    set EmpMapMaxY = ${real(half(t.height) - btop * WC3_UNITS_PER_TILE)}`);

  const playerHouseId = HOUSE_ID[p.playerHouse];
  const defaultEnemy = HOUSE_ID[p.defaultEnemyHouse || HOUSE_BY_CODE[DEFAULT_ENEMY[CODE_BY_HOUSE[p.playerHouse]]]];
  const dispatch = scripts.length
    ? scripts.map((s, i) => `    ${i === 0 ? 'if' : 'elseif'} EmpScriptIndex == ${i} then\n        call EmpScript${i}()`).join('\n') + '\n    endif'
    : '';
  const pickScript = scripts.length
    ? `    // pick the script of the current campaign phase (fallback: the first one)\n    set EmpScriptIndex = 0\n${scripts.map((s, i) => `    if EmpPhase == ${s.phase} then\n        set EmpScriptIndex = ${i}\n    endif`).join('\n')}`
    : '';

  const glueGlobals = `
    gamecache EmpCache = null
    boolean EmpInCampaign = false
    integer EmpPhase = ${p.defaultPhase || DEFAULT_PHASE}
    integer EmpTechLevel = ${p.defaultTech || DEFAULT_TECH}
    integer EmpEnemyHouse = ${defaultEnemy}
    integer EmpScriptIndex = 0
    integer EmpTerritory = ${p.territory || 0}
    hashtable EmpVet = null
    hashtable EmpVetUnit = null
    item array EmpCrateItem
    integer array EmpCrateGift
    integer array EmpCrateCash
    integer EmpCrateCount = 0`;

  const functions = [
    rt.helpers, rt.functions, battle.functions, ...scripts.map((s) => s.tr.body),
    `function EmpData takes nothing returns nothing\n${init.join('\n')}\nendfunction`,
    // Crates (Emperor: a unit driving over the crate gets CrateGiftObject). WC3 items need an
    // inventory, which Emperor units do not have, so the pickup is a proximity check
    // (regression test: test/emperor-mission.test.ts).
    `function EmpAddCrate takes real x, real y, integer gift, integer cash returns nothing
    set EmpCrateItem[EmpCrateCount] = CreateItem('${ITEM.crate}', x, y)
    call SetItemInvulnerable(EmpCrateItem[EmpCrateCount], true)
    set EmpCrateGift[EmpCrateCount] = gift
    set EmpCrateCash[EmpCrateCount] = cash
    set EmpCrateCount = EmpCrateCount + 1
endfunction

function EmpCrateTick takes nothing returns nothing
    local integer i = 0
    local group g = CreateGroup()
    local unit u
    local unit taker
    local player who
    loop
        exitwhen i >= EmpCrateCount
        if EmpCrateItem[i] != null then
            set taker = null
            call GroupEnumUnitsInRange(g, GetItemX(EmpCrateItem[i]), GetItemY(EmpCrateItem[i]), ${real(RT.CRATE_RADIUS)}, null)
            loop
                set u = FirstOfGroup(g)
                exitwhen u == null
                call GroupRemoveUnit(g, u)
                if taker == null and EmpAlive(u) and GetPlayerId(GetOwningPlayer(u)) < ${RT.NEUTRAL_SIDE} and not IsUnitType(u, UNIT_TYPE_STRUCTURE) then
                    set taker = u
                endif
            endloop
            if taker != null then
                set who = GetOwningPlayer(taker)
                if EmpCrateGift[i] != 0 then
                    call CreateUnit(who, EmpCrateGift[i], GetUnitX(taker), GetUnitY(taker), ${FACING})
                else
                    call SetPlayerState(who, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(who, PLAYER_STATE_RESOURCE_GOLD) + EmpCrateCash[i])
                endif
                call DestroyEffect(AddSpecialEffect(${str(EFFECT.crateTaken)}, GetItemX(EmpCrateItem[i]), GetItemY(EmpCrateItem[i])))
                call RemoveItem(EmpCrateItem[i])
                set EmpCrateItem[i] = null
            endif
        endif
        set i = i + 1
    endloop
    call DestroyGroup(g)
    set g = null
    set taker = null
    set who = null
endfunction`,
    // Veterancy (Rules.txt): the killer gets the victim's Score (assumed: Emperor's own docs are not
    // available; thresholds such as ATKindjal 2/10/20 against Score = 1..2 per kill fit it).
    // EmpVet[type]: child 0 = Score, 1 = level count, level L at L*VET_SLOT_STRIDE + 1..8.
    // EmpVetUnit[handle id]: 0 = score so far, 1 = level, 2..4 = original damage/armour/range.
    // Regression/feature test: test/emperor-mission.test.ts.
    `function EmpVetLevel takes integer t, integer lv, integer score, integer hp, integer dmg, integer arm, integer rng, integer spd, boolean repair, boolean elite returns nothing
    local integer b = lv * ${RT.VET_SLOT_STRIDE}
    call SaveInteger(EmpVet, t, b + 1, score)
    call SaveInteger(EmpVet, t, b + 2, hp)
    call SaveInteger(EmpVet, t, b + 3, dmg)
    call SaveInteger(EmpVet, t, b + 4, arm)
    call SaveInteger(EmpVet, t, b + 5, rng)
    call SaveInteger(EmpVet, t, b + 6, spd)
    call SaveBoolean(EmpVet, t, b + 7, repair)
    call SaveBoolean(EmpVet, t, b + 8, elite)
    if lv > LoadInteger(EmpVet, t, 1) then
        call SaveInteger(EmpVet, t, 1, lv)
    endif
endfunction

function EmpVetData takes nothing returns nothing
    set EmpVet = InitHashtable()
    set EmpVetUnit = InitHashtable()
${vetLines.join('\n')}
endfunction

function EmpVetApply takes unit u, integer lv returns nothing
    local integer t = GetUnitTypeId(u)
    local integer h = GetHandleId(u)
    local integer b = lv * ${RT.VET_SLOT_STRIDE}
    local integer v
    local real r
    local real pct
    if not LoadBoolean(EmpVetUnit, h, 5) then
        call SaveInteger(EmpVetUnit, h, 2, BlzGetUnitBaseDamage(u, 0))
        call SaveReal(EmpVetUnit, h, 3, BlzGetUnitArmor(u))
        call SaveReal(EmpVetUnit, h, 4, BlzGetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 0))
        call SaveBoolean(EmpVetUnit, h, 5, true)
    endif
    set v = LoadInteger(EmpVet, t, b + 2)
    if v > 0 then
        set pct = GetUnitLifePercent(u)
        call BlzSetUnitMaxHP(u, v)
        call SetUnitLifePercentBJ(u, pct)
    endif
    set v = LoadInteger(EmpVet, t, b + 3)
    if v > 0 then
        call BlzSetUnitBaseDamage(u, R2I(LoadInteger(EmpVetUnit, h, 2) * (100 + v) / 100.0), 0)
    endif
    set v = LoadInteger(EmpVet, t, b + 4)
    if v > 0 and v < 100 then
        // "v% less damage received": WC3 armour a absorbs 0.06a / (1 + 0.06a)
        set r = v / 100.0
        call BlzSetUnitArmor(u, LoadReal(EmpVetUnit, h, 3) + r / (${real(ARMOR_REDUCTION)} * (1.0 - r)))
    endif
    set v = LoadInteger(EmpVet, t, b + 5)
    if v > 0 then
        // TODO(veterancy): weapon index base (0 or 1) of BlzSetUnitWeaponRealField in 1.31 not verified in game
        call BlzSetUnitWeaponRealField(u, UNIT_WEAPON_RF_ATTACK_RANGE, 0, LoadReal(EmpVetUnit, h, 4) * (100 + v) / 100.0)
    endif
    set v = LoadInteger(EmpVet, t, b + 6)
    if v > 0 then
        call SetUnitMoveSpeed(u, v)
    endif
    if LoadBoolean(EmpVet, t, b + 7) then
        // TODO(veterancy): Emperor's self-repair rate is unknown; 1% of max HP per second
        call BlzSetUnitRealField(u, UNIT_RF_HIT_POINTS_REGENERATION_RATE, BlzGetUnitMaxHP(u) * ${real(RT.VET_SELF_REPAIR_RATE)})
    endif
    if LoadBoolean(EmpVet, t, b + 8) then
        call AddSpecialEffectTarget(${str(EFFECT.elite)}, u, "origin")
    endif
    call DestroyEffect(AddSpecialEffectTarget(${str(EFFECT.levelUp)}, u, "origin"))
endfunction

function EmpOnKill takes nothing returns nothing
    local unit k = GetKillingUnit()
    local unit d = GetTriggerUnit()
    local integer t
    local integer h
    local integer s = 1
    local integer lv
    local integer n
    // handle ids are reused: forget the dead unit's veterancy
    call FlushChildHashtable(EmpVetUnit, GetHandleId(d))
    if k == null or not EmpAlive(k) or IsUnitType(k, UNIT_TYPE_STRUCTURE) or GetOwningPlayer(k) == GetOwningPlayer(d) then
        set k = null
        set d = null
        return
    endif
    set t = GetUnitTypeId(d)
    if HaveSavedInteger(EmpVet, t, 0) then
        set s = LoadInteger(EmpVet, t, 0)
    endif
    set t = GetUnitTypeId(k)
    set h = GetHandleId(k)
    set s = LoadInteger(EmpVetUnit, h, 0) + s
    call SaveInteger(EmpVetUnit, h, 0, s)
    set lv = LoadInteger(EmpVetUnit, h, 1)
    set n = LoadInteger(EmpVet, t, 1)
    loop
        exitwhen lv >= n
        exitwhen LoadInteger(EmpVet, t, (lv + 1) * ${RT.VET_SLOT_STRIDE} + 1) > s
        set lv = lv + 1
        call EmpVetApply(k, lv)
    endloop
    call SaveInteger(EmpVetUnit, h, 1, lv)
    set k = null
    set d = null
endfunction`,
    `function EmpPlaced takes nothing returns nothing\n${placed.join('\n')}\nendfunction`,
    `function EmpMissionTick takes nothing returns nothing\n${dispatch}\nendfunction`,
    // ---- campaign glue ----
    `function EmpCampaignLoad takes nothing returns nothing
    set EmpCache = InitGameCache(${str(CACHE_FILE)})
${p.kind === 'tutorial' ? `    // the tutorial is a standalone mission (own campaign button), never part of a house campaign
    return` : ''}
${p.kind === 'start' ? `    // the house start mission is opened from the campaign screen: always part of the campaign
    set EmpInCampaign = true
    set EmpPhase = ${START_MISSION_PHASE}
    set EmpTechLevel = ${START_MISSION_TECH}
    return` : ''}
    if GetStoredInteger(EmpCache, ${CAT}, ${K.inCampaign}) == 1 then
        set EmpInCampaign = true
        set EmpPhase = GetStoredInteger(EmpCache, ${CAT}, ${K.phase})
        set EmpTechLevel = GetStoredInteger(EmpCache, ${CAT}, ${K.tech})
        set EmpEnemyHouse = GetStoredInteger(EmpCache, ${CAT}, ${K.pendingEnemy})
        set EmpTerritory = GetStoredInteger(EmpCache, ${CAT}, ${K.pendingTerritory})
        set EmpPlayerTerritory = GetStoredInteger(EmpCache, ${CAT}, ${K.pendingFrom})
        // consumed: a later standalone test run must not think it is inside the campaign
        call StoreInteger(EmpCache, ${CAT}, ${K.inCampaign}, 0)
        call SaveGameCache(EmpCache)
    endif
${p.kind === 'defend'
    ? '    // defence: the attacker enters from its own territory (pendfrom); the player is already here\n    set EmpEnemyTerritory = EmpPlayerTerritory\n    set EmpPlayerTerritory = 0'
    : '    set EmpEnemyTerritory = EmpTerritory'}
endfunction`,
    `function EmpReturnToHub takes nothing returns nothing
    call SetNextLevelBJ(${str(p.hubMap || '')})
    call CustomVictoryBJ(Player(0), false, false)
endfunction`,
    `// Called by EmpEnd (runtime) when the mission is decided.
function EmpCampaignResult takes boolean win returns nothing
    if not EmpInCampaign then
        if win then
            call CustomVictoryBJ(Player(0), true, true)
        else
            call CustomDefeatBJ(Player(0), "Миссия провалена")
        endif
        return
    endif
    call StoreInteger(EmpCache, ${CAT}, ${K.inCampaign}, 1)
    call StoreInteger(EmpCache, ${CAT}, ${K.result}, EF_B2I(win))
    call StoreInteger(EmpCache, ${CAT}, ${K.outcome}, EmpOutcome)
    call StoreInteger(EmpCache, ${CAT}, ${K.resultTerritory}, EmpTerritory)
    call StoreInteger(EmpCache, ${CAT}, ${K.resultKind}, ${KIND_ID[p.kind || 'attack']})
    call SaveGameCache(EmpCache)
    if win then
        call EmpShow("Победа! Возвращение на карту Арракиса...")
    else
        call EmpShow("Поражение. Возвращение на карту Арракиса...")
    endif
    call TimerStart(CreateTimer(), ${real(RT.RETURN_TO_HUB_DELAY)}, false, function EmpReturnToHub)
endfunction`,
    p.extraFunctions || '',
    `function EmpTickRun takes nothing returns nothing
    if EmpEnded then
        if not EmpResultSent then
            set EmpResultSent = true
            call EmpCampaignResult(EmpEndWin)
        endif
        return
    endif
    call EmpMissionTick()
    set EmpTick = EmpTick + 1
endfunction`,
    // Debug report for unattended tests: CustomMapData\<DEBUG_REPORT_DIR>\<name>.pld every DEBUG_REPORT_PERIOD s.
    `function EmpDebugReport takes nothing returns nothing
    local string s = "t=" + I2S(EmpTick) + " phase=" + I2S(EmpPhase) + " tech=" + I2S(EmpTechLevel) + " enemy=" + I2S(EmpEnemyHouse) + " camp=" + I2S(EF_B2I(EmpInCampaign))
    local integer i = 0
    loop
        exitwhen i > ${RT.DEBUG_REPORT_SIDES}
        set s = s + " s" + I2S(i) + "=" + I2S(EmpCount(i, 1)) + "u/" + I2S(EmpCount(i, 2)) + "b"
        set i = i + 1
    endloop
    set s = s + " gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " mines=" + I2S(EmpCount(${RT.NEUTRAL_SIDE}, 0)) + " ended=" + I2S(EF_B2I(EmpEnded)) + " speech=" + I2S(EmpSpeechHead) + "/" + I2S(EmpSpeechTail) + " ms=" + I2S(EmpSpeechLastMs)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s)
    call PreloadGenEnd(${str(`${RT.DEBUG_REPORT_DIR}\\${p.debugName || 'mission'}.pld`)})
endfunction`,
    // Emperor starts the main camera on the player's forces; story scripts only pan the PIP
    // window. Unless a script or the battle setup placed the camera, centre it on Player(0)'s
    // units (regression test: test/emperor-mission.test.ts).
    `function EmpInitialCamera takes nothing returns nothing
    local group g
    local unit u
    local real x = 0.0
    local real y = 0.0
    local integer n = 0
    call DestroyTimer(GetExpiredTimer())
    if EmpCamSet then
        return
    endif
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(0), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) then
            set x = x + GetUnitX(u)
            set y = y + GetUnitY(u)
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    if n > 0 then
        call SetCameraPositionForPlayer(Player(0), x / n, y / n)
    endif
endfunction`,
    ...(p.autoWinSeconds ? [`// automatic flow test: win after a delay; the start mission also begins a fresh campaign
function EmpAutoWin takes nothing returns nothing
${p.kind === 'start' ? `    call StoreInteger(EmpCache, ${CAT}, ${K.init}, 0)
    call StoreInteger(EmpCache, ${CAT}, ${K.autotestVisits}, 0)
    call SaveGameCache(EmpCache)
` : ''}    call EmpEnd(true)
endfunction`] : []),
    `function EmpStart takes nothing returns nothing
    local trigger tr
    local integer i = 0
    set EmpTmpGroup = CreateGroup()
    call EmpCampaignLoad()
    call EmpData()
    call EmpPlaced()
    call EmpVetData()
${pickScript}
${p.briefing ? `    call CreateQuestBJ(bj_QUESTTYPE_REQ_DISCOVERED, ${str(p.name)}, ${str(p.briefing)}, ${str(ICON.briefingQuest)})
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, ${real(RT.BRIEFING_SECONDS)}, "|cffffcc00" + ${str(p.name)} + "|r|n" + ${str(p.briefing)})` : ''}
    call SetPlayerColorBJ(Player(0), ConvertPlayerColor(${HOUSE_COLOR[playerHouseId]}), true)
    if EmpEnemyHouse == ${HOUSE_ID.Atreides} then
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor(${HOUSE_COLOR[HOUSE_ID.Atreides]}), true)
    elseif EmpEnemyHouse == ${HOUSE_ID.Harkonnen} then
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor(${HOUSE_COLOR[HOUSE_ID.Harkonnen]}), true)
    else
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor(${OTHER_ENEMY_COLOR}), true)
    endif
    call TimerStart(CreateTimer(), ${real(RT.DEBUG_REPORT_PERIOD)}, true, function EmpDebugReport)
    call SetTimeOfDay(${real(RT.TIME_OF_DAY)})
    call SuspendTimeOfDay(true)
    set tr = CreateTrigger()
    loop
        exitwhen i > ${RT.MAX_SIDE}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ATTACKED, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnAttacked)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > ${RT.MAX_SIDE}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnConstructed)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > ${RT.MAX_SIDE}
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnKill)
${battle.init}
    call TimerStart(CreateTimer(), ${real(TICK_SECONDS)}, true, function EmpTickRun)
    call TimerStart(CreateTimer(), ${real(RT.AI_TICK)}, true, function EmpAITick)
    call TimerStart(CreateTimer(), ${real(RT.NORMAL_CHECK_PERIOD)}, true, function EmpNormalCheck)
    call TimerStart(CreateTimer(), ${real(RT.INITIAL_CAMERA_DELAY)}, false, function EmpInitialCamera)
    call TimerStart(CreateTimer(), ${real(RT.CRATE_TICK)}, true, function EmpCrateTick)${p.autoWinSeconds ? `
    call TimerStart(CreateTimer(), ${real(p.autoWinSeconds)}, false, function EmpAutoWin)` : ''}
    set tr = null
endfunction`,
  ].join('\n\n');

  // players: 0 user + 1..11 computer (sides); all on their own team
  const [mapW, mapH] = p.meta.mapSize as [number, number]; // buildTerrain has checked it
  const b0 = bases[0] || { x: mapW * EMPEROR_TILE / 2, y: mapH * EMPEROR_TILE / 2 };
  const [sx, sy] = t.toWorld(b0.x, b0.y);
  const players: ScriptPlayer[] = [{ id: 0, control: 'user', race: 'human', team: 0, x: sx, y: sy, name: RT.PLAYER_NAME }];
  for (let i = 1; i <= RT.MAX_SIDE; i++) players.push({ id: i, control: 'computer', race: 'orc', team: i, x: sx, y: sy, name: `${RT.SIDE_NAME_PREFIX}${i}` });

  const imports: Record<string, Buffer> = { 'war3map.w3u': p.units.w3u, 'war3map.w3a': p.units.w3a, 'war3mapMisc.txt': Buffer.from(p.units.misc, 'utf8'), ...speechImports };
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
