'use strict';
// Assemble an Emperor mission map (.w3x): converted terrain, Emperor object data (w3u/w3a +
// combat table), the JASS runtime, one or more translated mission scripts (one per campaign
// phase, chosen at runtime) and the campaign glue (game cache in, result out, back to the hub).

const { buildMap } = require('../wc3/map');
const { str, real } = require('../wc3/jass');
const { buildRuntime } = require('./runtime');
const { translateScript } = require('./translate');
const { buildTerrain } = require('./terrain');
const { battleSetup } = require('./battle');

const TICK = 1 / 25; // seconds per Emperor tick, TODO(tick-rate)
const HOUSE_ID = { Atreides: 0, Harkonnen: 1, Ordos: 2 };
const HOUSE_COLOR = [1, 0, 6]; // WC3 player colours: blue, red, green
const CACHE_FILE = 'EmperorCampaign.w3v';

/**
 * @param {object} p
 * @param {{tok: Buffer, phase: number, name: string}[]} p.scripts  mission scripts (may be empty: plain battle)
 * @param {object} p.meta           mapxbf.readMeta of the mission map
 * @param {object[]} p.table        token table (Game.exe)
 * @param {object} p.ctx            emperor/context.js loadContext()
 * @param {object} p.units          emperor/units.js buildUnitData()
 * @param {string} p.name           map title
 * @param {string} p.playerHouse    'Atreides' | 'Harkonnen' | 'Ordos'
 * @param {string} [p.defaultEnemyHouse]  used when no campaign cache is present (standalone)
 * @param {number} [p.defaultTech]
 * @param {boolean} [p.territoryBattle]
 * @param {number} [p.territory]    campaign territory number (for entrances/results)
 * @param {string} [p.kind]         'attack' | 'defend' | 'story'
 * @param {string} [p.hubMap]       map to return to inside the campaign
 * @param {string} [p.briefing]     loading screen text
 * @param {string} [p.debugName]
 */
function buildMission(p) {
  const t = buildTerrain(p.meta);
  const typeNames = p.ctx.objectTypes.map((o) => o.name);
  const rawcodeOfIndex = (n) => {
    const name = typeNames[n];
    const id = name && p.units.rawcode.get(name);
    return id || 'hfoo'; // non-unit object types (explosions, bullets) fall back to a harmless unit
  };
  const scripts = (p.scripts || []).map((s, i) => ({
    ...s, tr: translateScript(s.tok, p.table, { rawcode: rawcodeOfIndex, varPrefix: `e${i}v` }, `EmpScript${i}`),
  }));
  const used = new Set();
  const messages = new Set();
  const tooltips = new Set();
  for (const s of scripts) { s.tr.used.forEach((x) => used.add(x)); s.tr.messages.forEach((x) => messages.add(x)); s.tr.tooltips.forEach((x) => tooltips.add(x)); }

  const battle = battleSetup({ meta: p.meta, terrain: t, units: p.units, playerHouse: p.playerHouse, territoryBattle: Boolean(p.territoryBattle), defend: p.kind === 'defend' });
  const deployMap = { [p.units.rawcode.get('MCV')]: p.units.rawcode.get(`${{ Atreides: 'AT', Harkonnen: 'HK', Ordos: 'OR' }[p.playerHouse]}ConYard`) };
  const rt = buildRuntime(p.table, { deployMap });

  // ---- generated data init (points, strings) ----
  const ge = p.meta.gameElements || {};
  const init = [];
  const toW = (pt) => t.toWorld(pt.x, pt.y);
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
  for (let s = 0; s <= 12; s++) init.push(`    set EmpSideBase[${s}] = -1`);
  init.push('    set EmpSideBase[0] = 0', '    set EmpBaseOwner[0] = 0');
  const entrances = ((ge.Entrance || {}).Connected_Entrance) || [];
  entrances.forEach((e, i) => { const [x, y] = toW(e); init.push(`    set EmpEntrX[${i}] = ${real(x)}`, `    set EmpEntrY[${i}] = ${real(y)}`, `    set EmpEntrTag[${i}] = ${e.tag}`); });
  init.push(`    set EmpEntrCount = ${entrances.length}`);
  if (!entrances.length) init.push('    set EmpEntrX[0] = 0.0', '    set EmpEntrY[0] = 0.0', '    set EmpEntrTag[0] = 99', '    set EmpEntrCount = 1');
  // Scripts that end the game themselves (story/start missions) do not use the normal
  // "destroy the enemy house" rule; territory battles do.
  init.push(`    set EmpNormalConditions = ${used.has('EndGameWin') || used.has('EndGameLose') ? 'false' : 'true'}`);
  for (const n of messages) { const text = p.ctx.messageText(n); if (text) init.push(`    set EmpMsgText[${n}] = ${str(text)}`); }
  for (const n of tooltips) { const text = p.ctx.tooltipText(n); if (text) init.push(`    set EmpTipText[${n}] = ${str(text)}`); }
  // ---- objects placed in the map itself (test.xbf tag 0x07) ----
  // owner 1 = the side defending the map (-> Player(1), e.g. the whole Atreides base of the
  // Caladan capital map), owner 0 = the player's side (-> Player(0)), owners 2/3 = scenery
  // (trees, houses, barrels, wrecks, crates).
  const placed = [];
  for (const b of p.meta.buildings || []) {
    const [x, y] = t.toWorld(b.x * 32 + 16, b.y * 32 + 16);
    const at = `${real(x)}, ${real(y)}`;
    const n = b.name;
    // Factory frigates are real objects: heighliner scripts win when the enemy has none left
    // (regression test: test/emperor-mission.test.js).
    if (/SFX|hungfigure|NoddingDonkey|Bird|Seagul|Spotlight|DrKynes|CampFire|pyramid|bubble|MegaCannon/i.test(n)) continue;
    if (/Barrel/i.test(n)) placed.push(`    call CreateDestructable('LTbr', ${at}, ${real((b.x * 37) % 360)}, 1.0, 0)`);
    else if (/Tree/i.test(n)) placed.push(`    call CreateDestructable('BTtc', ${at}, ${real((b.x * 53) % 360)}, 1.0, 0)`);
    else if (/Wreck|Crash/i.test(n)) placed.push(`    call CreateDestructable('LTrc', ${at}, 0.0, 1.2, 0)`);
    else if (/Crate/i.test(n)) {
      // Rules.txt CrateGiftObject: a unit type or CASH<n>; unknown gifts (GUNiabTank) -> 500 credits
      const gift = (p.rules && p.rules.crates && p.rules.crates.get(n)) || '';
      const cash = /^CASH(d+)/i.exec(gift);
      const id = cash ? null : p.units.rawcode.get(gift);
      placed.push(`    call EmpAddCrate(${at}, ${id ? `'${id}'` : 0}, ${id ? 0 : cash ? cash[1] : 500})`);
    }
    else if (/^(AT|HK|OR|HL)?IN|^IN/i.test(n) && /House|Store|Hut|Tower|Apartment|Tennament|Townhall|hall|Mart|Palace|Sultan|Workshop|Tent|StPauls|Indi|Moss|Trafford|Twafford|Tyower|GiediRef|Oxygen|Vent|Gate/i.test(n)) {
      placed.push(`    call CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), 'nfh0', ${at}, 270.0)`);
    } else if (p.units.rawcode.has(n)) {
      // owner 0 = the player's side (own frigate on #H2/#H3, the HK base of #V1 Homeworld Defence)
      const who = b.owner === 1 ? 'Player(1)' : b.owner === 0 ? 'Player(0)' : 'Player(PLAYER_NEUTRAL_PASSIVE)';
      placed.push(`    call CreateUnit(${who}, '${p.units.rawcode.get(n)}', ${at}, 270.0)`);
    }
  }
  // ---- veterancy table (Rules.txt Score + VeterancyLevel blocks), same scaling as units.js ----
  const vetLines = [];
  for (const o of (p.rules ? p.rules.objects.values() : [])) {
    const id = p.units.rawcode.get(o.name);
    if (!id) continue;
    if (o.score !== 1) vetLines.push(`    call SaveInteger(EmpVet, '${id}', 0, ${o.score})`);
    o.veterancy.forEach((l, i) => vetLines.push(`    call EmpVetLevel('${id}', ${i + 1}, ${l.score}, ${Math.round(l.health / 2)}, ${l.extraDamage}, ${l.extraArmour}, ${l.extraRange}, ${l.speed ? Math.min(522, Math.max(60, Math.round(l.speed * 40))) : 0}, ${l.selfRepair}, ${l.elite})`));
  }
  const half = (n) => (n * 128) / 2;
  const [bl, br, bb, btop] = t.boundary;
  init.push(`    set EmpMapMinX = ${real(-half(t.width) + bl * 128)}`, `    set EmpMapMaxX = ${real(half(t.width) - br * 128)}`);
  init.push(`    set EmpMapMinY = ${real(-half(t.height) + bb * 128)}`, `    set EmpMapMaxY = ${real(half(t.height) - btop * 128)}`);

  const playerHouseId = HOUSE_ID[p.playerHouse];
  const defaultEnemy = HOUSE_ID[p.defaultEnemyHouse || (p.playerHouse === 'Harkonnen' ? 'Atreides' : 'Harkonnen')];
  const dispatch = scripts.length
    ? scripts.map((s, i) => `    ${i === 0 ? 'if' : 'elseif'} EmpScriptIndex == ${i} then\n        call EmpScript${i}()`).join('\n') + '\n    endif'
    : '';
  const pickScript = scripts.length
    ? `    // pick the script of the current campaign phase (fallback: the first one)\n    set EmpScriptIndex = 0\n${scripts.map((s, i) => `    if EmpPhase == ${s.phase} then\n        set EmpScriptIndex = ${i}\n    endif`).join('\n')}`
    : '';

  const glueGlobals = `
    gamecache EmpCache = null
    boolean EmpInCampaign = false
    integer EmpPhase = ${p.defaultPhase || 1}
    integer EmpTechLevel = ${p.defaultTech || 3}
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
    // (regression test: test/emperor-mission.test.js).
    `function EmpAddCrate takes real x, real y, integer gift, integer cash returns nothing
    set EmpCrateItem[EmpCrateCount] = CreateItem('gold', x, y)
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
            call GroupEnumUnitsInRange(g, GetItemX(EmpCrateItem[i]), GetItemY(EmpCrateItem[i]), 160.0, null)
            loop
                set u = FirstOfGroup(g)
                exitwhen u == null
                call GroupRemoveUnit(g, u)
                if taker == null and EmpAlive(u) and GetPlayerId(GetOwningPlayer(u)) < 12 and not IsUnitType(u, UNIT_TYPE_STRUCTURE) then
                    set taker = u
                endif
            endloop
            if taker != null then
                set who = GetOwningPlayer(taker)
                if EmpCrateGift[i] != 0 then
                    call CreateUnit(who, EmpCrateGift[i], GetUnitX(taker), GetUnitY(taker), 270.0)
                else
                    call SetPlayerState(who, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(who, PLAYER_STATE_RESOURCE_GOLD) + EmpCrateCash[i])
                endif
                call DestroyEffect(AddSpecialEffect("Abilities\\\\Spells\\\\Items\\\\ResourceItems\\\\ResourceEffectTarget.mdl", GetItemX(EmpCrateItem[i]), GetItemY(EmpCrateItem[i])))
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
    // EmpVet[type]: child 0 = Score, 1 = level count, level L at L*16 + 1..8.
    // EmpVetUnit[handle id]: 0 = score so far, 1 = level, 2..4 = original damage/armour/range.
    // Regression/feature test: test/emperor-mission.test.js.
    `function EmpVetLevel takes integer t, integer lv, integer score, integer hp, integer dmg, integer arm, integer rng, integer spd, boolean repair, boolean elite returns nothing
    local integer b = lv * 16
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
    local integer b = lv * 16
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
        call BlzSetUnitArmor(u, LoadReal(EmpVetUnit, h, 3) + r / (0.06 * (1.0 - r)))
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
        call BlzSetUnitRealField(u, UNIT_RF_HIT_POINTS_REGENERATION_RATE, BlzGetUnitMaxHP(u) * 0.01)
    endif
    if LoadBoolean(EmpVet, t, b + 8) then
        call AddSpecialEffectTarget("Abilities\\\\Spells\\\\Other\\\\GeneralAuraTarget\\\\GeneralAuraTarget.mdl", u, "origin")
    endif
    call DestroyEffect(AddSpecialEffectTarget("Abilities\\\\Spells\\\\Other\\\\Levelup\\\\LevelupCaster.mdl", u, "origin"))
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
        exitwhen LoadInteger(EmpVet, t, (lv + 1) * 16 + 1) > s
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
    set EmpPhase = 0
    set EmpTechLevel = 2
    return` : ''}
    if GetStoredInteger(EmpCache, "emp", "incampaign") == 1 then
        set EmpInCampaign = true
        set EmpPhase = GetStoredInteger(EmpCache, "emp", "phase")
        set EmpTechLevel = GetStoredInteger(EmpCache, "emp", "tech")
        set EmpEnemyHouse = GetStoredInteger(EmpCache, "emp", "pendenemy")
        set EmpTerritory = GetStoredInteger(EmpCache, "emp", "pendterr")
        set EmpPlayerTerritory = GetStoredInteger(EmpCache, "emp", "pendfrom")
        // consumed: a later standalone test run must not think it is inside the campaign
        call StoreInteger(EmpCache, "emp", "incampaign", 0)
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
    call StoreInteger(EmpCache, "emp", "incampaign", 1)
    call StoreInteger(EmpCache, "emp", "result", EF_B2I(win))
    call StoreInteger(EmpCache, "emp", "outcome", EmpOutcome)
    call StoreInteger(EmpCache, "emp", "resultterr", EmpTerritory)
    call StoreInteger(EmpCache, "emp", "resultkind", ${{ attack: 0, defend: 1, story: 2, start: 3, tutorial: 4 }[p.kind || 'attack']})
    call SaveGameCache(EmpCache)
    if win then
        call EmpShow("Победа! Возвращение на карту Арракиса...")
    else
        call EmpShow("Поражение. Возвращение на карту Арракиса...")
    endif
    call TimerStart(CreateTimer(), 4.0, false, function EmpReturnToHub)
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
    // Debug report for unattended tests: CustomMapData\DuneTest\<name>.pld every 10 s.
    `function EmpDebugReport takes nothing returns nothing
    local string s = "t=" + I2S(EmpTick) + " phase=" + I2S(EmpPhase) + " tech=" + I2S(EmpTechLevel) + " enemy=" + I2S(EmpEnemyHouse) + " camp=" + I2S(EF_B2I(EmpInCampaign))
    local integer i = 0
    loop
        exitwhen i > 4
        set s = s + " s" + I2S(i) + "=" + I2S(EmpCount(i, 1)) + "u/" + I2S(EmpCount(i, 2)) + "b"
        set i = i + 1
    endloop
    set s = s + " gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " mines=" + I2S(EmpCount(12, 0)) + " ended=" + I2S(EF_B2I(EmpEnded))
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s)
    call PreloadGenEnd(${str(`DuneTest\\${p.debugName || 'mission'}.pld`)})
endfunction`,
    // Emperor starts the main camera on the player's forces; story scripts only pan the PIP
    // window. Unless a script or the battle setup placed the camera, centre it on Player(0)'s
    // units (regression test: test/emperor-mission.test.js).
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
    `function EmpStart takes nothing returns nothing
    local trigger tr
    local integer i = 0
    set EmpTmpGroup = CreateGroup()
    call EmpCampaignLoad()
    call EmpData()
    call EmpPlaced()
    call EmpVetData()
${pickScript}
${p.briefing ? `    call CreateQuestBJ(bj_QUESTTYPE_REQ_DISCOVERED, ${str(p.name)}, ${str(p.briefing)}, "ReplaceableTextures\\\\CommandButtons\\\\BTNSpell_Holy_SealOfMight.blp")
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 25.0, "|cffffcc00" + ${str(p.name)} + "|r|n" + ${str(p.briefing)})` : ''}
    call SetPlayerColorBJ(Player(0), ConvertPlayerColor(${HOUSE_COLOR[playerHouseId]}), true)
    if EmpEnemyHouse == 0 then
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor(1), true)
    elseif EmpEnemyHouse == 1 then
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor(0), true)
    else
        call SetPlayerColorBJ(Player(1), ConvertPlayerColor(6), true)
    endif
    call TimerStart(CreateTimer(), 10.0, true, function EmpDebugReport)
    call SetTimeOfDay(12.0)
    call SuspendTimeOfDay(true)
    set tr = CreateTrigger()
    loop
        exitwhen i > 11
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_ATTACKED, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnAttacked)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > 11
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnConstructed)
    set tr = CreateTrigger()
    set i = 0
    loop
        exitwhen i > 11
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_DEATH, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpOnKill)
${battle.init}
    call TimerStart(CreateTimer(), ${real(TICK)}, true, function EmpTickRun)
    call TimerStart(CreateTimer(), 2.0, true, function EmpAITick)
    call TimerStart(CreateTimer(), 1.0, true, function EmpNormalCheck)
    call TimerStart(CreateTimer(), ${real(0.5)}, false, function EmpInitialCamera)
    call TimerStart(CreateTimer(), ${real(0.5)}, true, function EmpCrateTick)
    set tr = null
endfunction`,
  ].join('\n\n');

  // players: 0 user + 1..11 computer (sides); all on their own team
  const b0 = bases[0] || { x: p.meta.mapSize[0] * 16, y: p.meta.mapSize[1] * 16 };
  const [sx, sy] = t.toWorld(b0.x, b0.y);
  const players = [{ id: 0, control: 'user', race: 'human', team: 0, x: sx, y: sy, name: 'Командор' }];
  for (let i = 1; i <= 11; i++) players.push({ id: i, control: 'computer', race: 'orc', team: i, x: sx, y: sy, name: `Сторона ${i}` });

  const m = buildMap({
    name: p.name, description: p.briefing || '', width: t.width, height: t.height, boundary: t.boundary,
    tileset: t.tileset, ground: t.ground, cliffs: t.cliffs, corner: t.corner, pathing: t.pathing, minimapColor: t.minimapColor,
    players, globals: rt.globals + glueGlobals + '\n' + scripts.map((s) => s.tr.globals).join('\n'), functions,
    init: '    call TimerStart( CreateTimer(), 0.0, false, function EmpStart )',
    imports: { 'war3map.w3u': p.units.w3u, 'war3map.w3a': p.units.w3a, 'war3mapMisc.txt': Buffer.from(p.units.misc, 'utf8') },
    loadingTitle: p.name, loadingText: p.briefing || '',
  });
  return { buffer: m.buffer, script: m.script, stubbed: rt.stubbed, used };
}

module.exports = { buildMission, CACHE_FILE, HOUSE_ID };
