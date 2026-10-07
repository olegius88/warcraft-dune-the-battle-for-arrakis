// The Arrakis strategic map ("hub") of one house: a small WC3 map showing the 33 territories,
// their owners and connections, letting the player pick attacks, resolving battle results from
// the campaign game cache, running the phase / tech-level rules (CAMPAIGN0001 PhaseRules.txt)
// and the AI counter-attacks, and offering the story missions. Moves between maps with
// ChangeLevel (only valid inside a campaign .w3n).
//
// Phase model (simplified from PhaseRules.txt — TODO(phases): Emperor's exact battle counters):
//   1 -> after 2 captures the Heighliner story mission  -> 2
//   2 -> after 2 captures the home-world defence story  -> 3
//   3 -> capturing an enemy jump point (forced Jump mission) -> home-world attack story -> final
// Tech level: phase 1 starts at 1 (+1 on first capture), phase 2 at 3 (+1), phase 3 at 5 (+1, +1),
// home-world attack 8.

import { buildMap } from '../wc3/map.ts';
import { str, real } from '../wc3/jass.ts';
import type { ScriptPlayer } from '../wc3/jass.ts';
import type { Campaign, Territory } from './campaign-data.ts';
import { HOUSE_CODES, HOUSE_RU_BY_ID, HOUSE_COLOR } from '../config/houses.ts';
import type { HouseCode } from '../config/houses.ts';
import { CACHE_FILE, J_CACHE_CATEGORY as CAT, J_CACHE_KEY as K, TERRITORY_COUNT, ADJ_STRIDE, KIND_ID, PHASE, CAPTURES_FOR_STORY, START_TECH, HOME_ATTACK_TECH, COUNTER_ATTACK_ONE_IN, AUTOTEST_HUB_DELAY } from '../config/campaign.ts';
import { DEFAULT_FACING, TIME_OF_DAY, DEBUG_REPORT_DIR } from '../config/runtime.ts';
import { CUSTOM_ID, TERRAIN } from '../config/wc3.ts';
import * as V from '../config/hub.ts';
import type { UnitData } from './units.ts';

/** Map file names of the story missions of one house. */
export interface StoryMaps {
  heighliner?: string;
  homeDefence?: string;
  /** enemy house code -> assault on its homeworld */
  homeAttack?: Partial<Record<string, string>>;
  end?: string;
  civilWar?: string;
}

export interface HubOptions {
  house: HouseCode;
  campaign: Campaign;
  /** battle map file for (attack|defend, territory), null when there is none */
  battleMap: (kind: 'attack' | 'defend', n: number) => string | null;
  storyMap: StoryMaps;
  /** for the object data (marker unit) */
  units: UnitData;
  /** automatic flow test (config/campaign.ts AUTOTEST_*): report every visit, attack once */
  autoTest?: boolean;
  /** music playlist: archive paths of tracks stored in the campaign (src/emperor/music.ts) */
  music?: string[];
}

type Vec2 = [number, number];

const HOUSES = HOUSE_CODES;
const HOUSE_NAME = HOUSE_RU_BY_ID;
const COLOR = HOUSE_COLOR;

/** Deterministic spring layout of the territory graph in [-1, 1]^2. */
function layout(territories: Territory[], jumpPoint: Record<HouseCode, number>): Map<number, Vec2> {
  const pos = new Map<number, Vec2>();
  // every territory has an owner: the BFS from the jump points reaches the whole graph
  for (const t of territories) {
    const a = V.LAYOUT_ANCHOR[t.owner as HouseCode];
    const k = t.n * V.LAYOUT.spreadAngle; // golden angle spread
    pos.set(t.n, [a[0] * (1 - t.ring * V.LAYOUT.ringPull) + Math.cos(k) * V.LAYOUT.ringScatter * t.ring, a[1] * (1 - t.ring * V.LAYOUT.ringPull) + Math.sin(k) * V.LAYOUT.ringScatter * t.ring]);
  }
  for (let it = 0; it < V.LAYOUT.iterations; it++) {
    const f = new Map(territories.map((t): [number, Vec2] => [t.n, [0, 0]]));
    const at = <V,>(m: Map<number, V>, n: number): V => m.get(n) as V;
    for (const a of territories) for (const b of territories) {
      if (a.n >= b.n) continue;
      const [ax, ay] = at(pos, a.n), [bx, by] = at(pos, b.n);
      let dx = ax - bx, dy = ay - by;
      const d = Math.max(V.LAYOUT.minDistance, Math.hypot(dx, dy));
      dx /= d; dy /= d;
      const linked = a.neighbours.includes(b.n);
      const rep = V.LAYOUT.repulsion / (d * d);
      const att = linked ? (d - V.LAYOUT.springLength) * V.LAYOUT.springStrength : 0;
      const fa = at(f, a.n), fb = at(f, b.n);
      fa[0] += (rep - att) * dx; fa[1] += (rep - att) * dy;
      fb[0] -= (rep - att) * dx; fb[1] -= (rep - att) * dy;
    }
    for (const t of territories) {
      if (Object.values(jumpPoint).includes(t.n)) continue; // capitals stay at the corners
      const p = at(pos, t.n), fv = at(f, t.n);
      p[0] = Math.max(-1, Math.min(1, p[0] + Math.max(-V.LAYOUT.maxStep, Math.min(V.LAYOUT.maxStep, fv[0]))));
      p[1] = Math.max(-1, Math.min(1, p[1] + Math.max(-V.LAYOUT.maxStep, Math.min(V.LAYOUT.maxStep, fv[1]))));
    }
  }
  return pos;
}

function buildHub(o: HubOptions): { buffer: Buffer; script: string } {
  const me = HOUSES.indexOf(o.house);
  const terr = o.campaign.territories;
  const pos = layout(terr, o.campaign.jumpPoint);
  const W = V.HUB_WIDTH, H = V.HUB_HEIGHT, SPAN = V.MARKER_SPAN; // markers inside +-SPAN
  const xy = (n: number): Vec2 => { const [x, y] = pos.get(n) as Vec2; return [x * SPAN, y * SPAN]; };
  const jp = HOUSES.map((h) => o.campaign.jumpPoint[h]);
  const foes = [0, 1, 2].filter((h) => h !== me);
  const markerId = CUSTOM_ID.territoryMarker;
  const lines: string[] = [];
  for (const t of terr) {
    const [x, y] = xy(t.n);
    lines.push(`    set EmpTX[${t.n}] = ${real(x)}`, `    set EmpTY[${t.n}] = ${real(y)}`, `    set EmpTName[${t.n}] = ${str(t.name)}`);
    lines.push(`    set EmpInitOwner[${t.n}] = ${t.owner ? HOUSES.indexOf(t.owner) : -1}`);
    t.neighbours.forEach((m, i) => lines.push(`    set EmpAdj[${t.n * ADJ_STRIDE + i}] = ${m}`));
    lines.push(`    set EmpAdjCount[${t.n}] = ${t.neighbours.length}`);
    lines.push(`    set EmpMapA[${t.n}] = ${str(o.battleMap('attack', t.n) || '')}`, `    set EmpMapD[${t.n}] = ${str(o.battleMap('defend', t.n) || '')}`);
  }
  const story = o.storyMap;
  // music: a JASS string literal of the ";"-separated playlist, or '' for none
  const musicList = o.music && o.music.length ? str(o.music.join(';')) : '';
  // automatic flow test: one report line per hub visit; on the first visit attack the first
  // reachable territory that has a battle map (enemy capitals stay closed before the last war phase)
  const autoTestFunctions = `function EmpAutoAttack takes nothing returns nothing
    local integer n = 1
    if EmpBusy then
        return
    endif
    loop
        exitwhen n > ${TERRITORY_COUNT}
        if EmpOwner[n] != ${me} and EmpAdjacentToMe(n) and EmpMapA[n] != "" and ${jp.filter((_, h) => h !== me).map((x) => `n != ${x}`).join(' and ')} then
            set EmpBusy = true
            set EmpPendTerr = n
            set EmpPendKind = ${KIND_ID.attack}
            set EmpPendEnemy = EmpOwner[n]
            set EmpNextMap = EmpMapA[n]
            call EmpSay("Автотест: атака на «" + EmpTName[n] + "»")
            call EmpGo()
            return
        endif
        set n = n + 1
    endloop
endfunction

function EmpAutoReport takes nothing returns nothing
    local integer v = GetStoredInteger(EmpCache, ${CAT}, ${K.autotestVisits}) + 1
    call StoreInteger(EmpCache, ${CAT}, ${K.autotestVisits}, v)
    call SaveGameCache(EmpCache)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("visit=" + I2S(v) + " phase=" + I2S(EmpPhase) + " tech=" + I2S(EmpTech) + " captured=" + I2S(EmpCaptured) + " owned=" + I2S(EmpCount(${me}))${musicList ? ` + " music=" + I2S(GetSoundFileDuration(${str(o.music?.[0] ?? '')}))` : ''})
    call PreloadGenEnd(${str(`${DEBUG_REPORT_DIR}\\${HOUSES[me]}_Hub_`)} + I2S(v) + ".pld")
    if v == 1 then
        call TimerStart(CreateTimer(), ${real(AUTOTEST_HUB_DELAY)}, false, function EmpAutoAttack)
    endif
endfunction

`;

  const globals = `
    gamecache EmpCache = null
    real array EmpTX
    real array EmpTY
    string array EmpTName
    integer array EmpOwner
    integer array EmpInitOwner
    integer array EmpAdj
    integer array EmpAdjCount
    string array EmpMapA
    string array EmpMapD
    unit array EmpMarker
    texttag array EmpLabel
    integer EmpPhase = ${PHASE.first}
    integer EmpTech = ${START_TECH}
    integer EmpCaptured = 0
    integer EmpPendTerr = 0
    integer EmpPendKind = 0
    integer EmpPendEnemy = 0
    integer EmpPendFrom = 0
    string EmpNextMap = ""
    dialog EmpDialog = null
    button EmpBtnYes = null
    button EmpBtnNo = null
    integer EmpDialogMode = 0
    boolean EmpBusy = false`;

  const functions = `
function EmpData takes nothing returns nothing
${lines.join('\n')}
endfunction

function EmpSay takes string s returns nothing
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, ${real(V.HUB_MESSAGE_SECONDS)}, s)
endfunction

function EmpSave takes nothing returns nothing
    local integer n = 1
    call StoreInteger(EmpCache, ${CAT}, ${K.init}, 1)
    call StoreInteger(EmpCache, ${CAT}, ${K.phase}, EmpPhase)
    call StoreInteger(EmpCache, ${CAT}, ${K.tech}, EmpTech)
    call StoreInteger(EmpCache, ${CAT}, ${K.captured}, EmpCaptured)
    loop
        exitwhen n > ${TERRITORY_COUNT}
        call StoreInteger(EmpCache, ${CAT}, ${K.ownerPrefix} + I2S(n), EmpOwner[n])
        set n = n + 1
    endloop
    call SaveGameCache(EmpCache)
endfunction

function EmpLoad takes nothing returns nothing
    local integer n = 1
    set EmpCache = InitGameCache(${str(CACHE_FILE)})
    if GetStoredInteger(EmpCache, ${CAT}, ${K.init}) != 1 or GetStoredInteger(EmpCache, ${CAT}, ${K.house}) != ${me} then
        // new campaign for this house
        loop
            exitwhen n > ${TERRITORY_COUNT}
            set EmpOwner[n] = EmpInitOwner[n]
            set n = n + 1
        endloop
        set EmpPhase = ${PHASE.first}
        set EmpTech = ${START_TECH}
        set EmpCaptured = 0
        call StoreInteger(EmpCache, ${CAT}, ${K.house}, ${me})
        call StoreInteger(EmpCache, ${CAT}, ${K.result}, -1)${story.civilWar ? `
        call StoreInteger(EmpCache, ${CAT}, ${K.storyStep}, 0)` : ''}
        call EmpSave()
        return
    endif
    loop
        exitwhen n > ${TERRITORY_COUNT}
        set EmpOwner[n] = GetStoredInteger(EmpCache, ${CAT}, ${K.ownerPrefix} + I2S(n))
        set n = n + 1
    endloop
    set EmpPhase = GetStoredInteger(EmpCache, ${CAT}, ${K.phase})
    set EmpTech = GetStoredInteger(EmpCache, ${CAT}, ${K.tech})
    set EmpCaptured = GetStoredInteger(EmpCache, ${CAT}, ${K.captured})
endfunction

function EmpAdjacentToMe takes integer n returns boolean
    local integer i = 0
    loop
        exitwhen i >= EmpAdjCount[n]
        if EmpOwner[EmpAdj[n * ${ADJ_STRIDE} + i]] == ${me} then
            return true
        endif
        set i = i + 1
    endloop
    return false
endfunction

function EmpMyNeighbourOf takes integer n returns integer
    local integer i = 0
    loop
        exitwhen i >= EmpAdjCount[n]
        if EmpOwner[EmpAdj[n * ${ADJ_STRIDE} + i]] == ${me} then
            return EmpAdj[n * ${ADJ_STRIDE} + i]
        endif
        set i = i + 1
    endloop
    return 0
endfunction

function EmpCount takes integer house returns integer
    local integer n = 1
    local integer c = 0
    loop
        exitwhen n > ${TERRITORY_COUNT}
        if EmpOwner[n] == house then
            set c = c + 1
        endif
        set n = n + 1
    endloop
    return c
endfunction

function EmpDraw takes nothing returns nothing
    local integer n = 1
    local integer i
    local integer m
    loop
        exitwhen n > ${TERRITORY_COUNT}
        if EmpMarker[n] != null then
            call RemoveUnit(EmpMarker[n])
        endif
        set EmpMarker[n] = CreateUnit(Player(EmpOwner[n]), '${markerId}', EmpTX[n], EmpTY[n], ${real(DEFAULT_FACING)})
        call BlzSetUnitName(EmpMarker[n], EmpTName[n])
        if EmpLabel[n] == null then
            set EmpLabel[n] = CreateTextTag()
            set i = 0
            loop
                exitwhen i >= EmpAdjCount[n]
                set m = EmpAdj[n * ${ADJ_STRIDE} + i]
                if m > n then
                    call SetLightningColor(AddLightningEx(${str(V.LINK_LIGHTNING)}, false, EmpTX[n], EmpTY[n], ${real(V.LINK_HEIGHT)}, EmpTX[m], EmpTY[m], ${real(V.LINK_HEIGHT)}), ${V.LINK_COLOR.map(real).join(', ')})
                endif
                set i = i + 1
            endloop
        endif
        call SetTextTagText(EmpLabel[n], I2S(n) + ". " + EmpTName[n], ${real(V.LABEL_SIZE)})
        call SetTextTagPos(EmpLabel[n], EmpTX[n] - ${real(-V.LABEL_OFFSET_X)}, EmpTY[n] - ${real(-V.LABEL_OFFSET_Y)}, ${real(V.LABEL_HEIGHT)})
        call SetTextTagVisibility(EmpLabel[n], true)
        set n = n + 1
    endloop
endfunction

function EmpStatus takes nothing returns nothing
    call EmpSay("|cffffcc00${HOUSE_NAME[me]}|r — фаза " + I2S(EmpPhase) + ", тех. уровень " + I2S(EmpTech) + ", территорий: " + I2S(EmpCount(${me})) + " из ${TERRITORY_COUNT}")
endfunction

function EmpGo takes nothing returns nothing
    // hand the pending battle to the next map through the cache, then change level
    call StoreInteger(EmpCache, ${CAT}, ${K.inCampaign}, 1)
    call StoreInteger(EmpCache, ${CAT}, ${K.pendingTerritory}, EmpPendTerr)
    call StoreInteger(EmpCache, ${CAT}, ${K.pendingKind}, EmpPendKind)
    call StoreInteger(EmpCache, ${CAT}, ${K.pendingEnemy}, EmpPendEnemy)
    if EmpPendKind == ${KIND_ID.defend} then
        // defence: the attacker comes from its own neighbouring territory
        call StoreInteger(EmpCache, ${CAT}, ${K.pendingFrom}, EmpPendFrom)
    else
        call StoreInteger(EmpCache, ${CAT}, ${K.pendingFrom}, EmpMyNeighbourOf(EmpPendTerr))
    endif
    call StoreInteger(EmpCache, ${CAT}, ${K.result}, -1)
    call EmpSave()
    call SetNextLevelBJ(EmpNextMap)
    call CustomVictoryBJ(Player(0), false, false)
endfunction

function EmpAsk takes string question, string yes, string no returns nothing
    call DialogClear(EmpDialog)
    call DialogSetMessage(EmpDialog, question)
    set EmpBtnYes = DialogAddButton(EmpDialog, yes, 0)
    set EmpBtnNo = DialogAddButton(EmpDialog, no, 0)
    call DialogDisplay(Player(0), EmpDialog, true)
endfunction

// phases: 1, 2, 3 = territory war; 4 = home-world attack (house in "haenemy"); 5 = final battle
function EmpStoryMap takes nothing returns string
    if EmpPhase == ${PHASE.first} then
        return ${str(story.heighliner || '')}
    elseif EmpPhase == ${PHASE.second} then${story.civilWar ? `
        if GetStoredInteger(EmpCache, ${CAT}, ${K.storyStep}) == 1 then
            return ${str(story.civilWar)}
        endif` : ''}
        return ${str(story.homeDefence || '')}
    elseif EmpPhase == ${PHASE.homeAttack} then
        if GetStoredInteger(EmpCache, ${CAT}, ${K.homeAttackEnemy}) == ${foes[0]} then
            return ${str((story.homeAttack || {})[HOUSES[foes[0]]] || '')}
        endif
        return ${str((story.homeAttack || {})[HOUSES[foes[1]]] || '')}
    elseif EmpPhase == ${PHASE.final} then
        return ${str(story.end || '')}
    endif
    return ""
endfunction

function EmpOfferStory takes nothing returns boolean
    local string m = EmpStoryMap()
    if m == "" then
        return false
    endif
    if (EmpPhase == ${PHASE.first} or EmpPhase == ${PHASE.second}) and EmpCaptured < ${CAPTURES_FOR_STORY}${story.civilWar ? ` and GetStoredInteger(EmpCache, ${CAT}, ${K.storyStep}) == 0` : ''} then
        return false
    endif
    set EmpNextMap = m
    set EmpPendTerr = 0
    set EmpPendKind = ${KIND_ID.story}
    set EmpPendEnemy = ${(me + 1) % 3}
    set EmpDialogMode = 2
    call EmpAsk("Доступна сюжетная миссия. Начать?", "В бой!", "Позже")
    return true
endfunction

function EmpCounterAttack takes nothing returns boolean
    // an enemy house attacks one of my territories adjacent to it (50 %)
    local integer n = 1
    local integer i
    local integer foe
    if GetRandomInt(0, ${COUNTER_ATTACK_ONE_IN - 1}) == 0 then
        return false
    endif
    loop
        exitwhen n > ${TERRITORY_COUNT}
        if EmpOwner[n] == ${me} and n != ${jp[me]} then
            set i = 0
            loop
                exitwhen i >= EmpAdjCount[n]
                set foe = EmpOwner[EmpAdj[n * ${ADJ_STRIDE} + i]]
                if foe != ${me} and EmpMapD[n] != "" then
                    set EmpPendTerr = n
                    set EmpPendKind = ${KIND_ID.defend}
                    set EmpPendEnemy = foe
                    set EmpPendFrom = EmpAdj[n * ${ADJ_STRIDE} + i]
                    set EmpNextMap = EmpMapD[n]
                    set EmpDialogMode = 1
                    if foe == 0 then
                        call EmpAsk("Атрейдесы атакуют территорию «" + EmpTName[n] + "»! Оборонять?", "Оборонять", "Отступить")
                    elseif foe == 1 then
                        call EmpAsk("Харконнены атакуют территорию «" + EmpTName[n] + "»! Оборонять?", "Оборонять", "Отступить")
                    else
                        call EmpAsk("Ордосы атакуют территорию «" + EmpTName[n] + "»! Оборонять?", "Оборонять", "Отступить")
                    endif
                    return true
                endif
                set i = i + 1
            endloop
        endif
        set n = n + 1
    endloop
    return false
endfunction

function EmpApplyResult takes nothing returns boolean
    local integer r = GetStoredInteger(EmpCache, ${CAT}, ${K.result})
    local integer kind = GetStoredInteger(EmpCache, ${CAT}, ${K.resultKind})
    local integer t = GetStoredInteger(EmpCache, ${CAT}, ${K.resultTerritory})
    local integer foe = GetStoredInteger(EmpCache, ${CAT}, ${K.pendingEnemy})
    if r < 0 then
        return false
    endif
    call StoreInteger(EmpCache, ${CAT}, ${K.result}, -1)
    if kind == ${KIND_ID.attack} then
        if r == 1 then
            set EmpOwner[t] = ${me}
            set EmpCaptured = EmpCaptured + 1
            call EmpSay("Территория «" + EmpTName[t] + "» захвачена!")
            if EmpCaptured == 1 then
                set EmpTech = EmpTech + 1
            endif
            if EmpPhase == ${PHASE.lastWar} and (${jp.filter((_, h) => h !== me).map((n) => `t == ${n}`).join(' or ')}) then
                // an enemy capital fell: home-world attack on that house (offered by EmpOfferStory)
                set EmpPhase = ${PHASE.homeAttack}
                set EmpTech = ${HOME_ATTACK_TECH}
                if t == ${jp[foes[0]]} then
                    call StoreInteger(EmpCache, ${CAT}, ${K.homeAttackEnemy}, ${foes[0]})
                else
                    call StoreInteger(EmpCache, ${CAT}, ${K.homeAttackEnemy}, ${foes[1]})
                endif
                call EmpSay("Вражеская столица захвачена. Готовьтесь к вторжению на их родную планету!")
            endif
        else
            call EmpSay("Атака на «" + EmpTName[t] + "» отбита. Наши силы отошли.")
        endif
    elseif kind == ${KIND_ID.defend} then
        if r == 1 then
            call EmpSay("Территория «" + EmpTName[t] + "» удержана!")
        else
            set EmpOwner[t] = foe
            call EmpSay("Территория «" + EmpTName[t] + "» потеряна.")
        endif
    elseif kind == ${KIND_ID.story} then
        if r == 1 then
            if EmpPhase == ${PHASE.final} then
                // final mission won
                call EmpSave()
                call EmpSay("|cffffcc00Арракис принадлежит вам! Кампания завершена.|r")
                call CustomVictoryBJ(Player(0), true, true)
                return true
            endif
${story.civilWar ? `            if EmpPhase == ${PHASE.second} and GetStoredInteger(EmpCache, ${CAT}, ${K.storyStep}) == 0 then
                // the home defence is won: the civil war attack follows before phase ${PHASE.lastWar}
                call StoreInteger(EmpCache, ${CAT}, ${K.storyStep}, 1)
                call EmpSay("|cffffcc00Гражданская война! Сюжетная миссия доступна.|r")
                call EmpSave()
                return false
            endif
            call StoreInteger(EmpCache, ${CAT}, ${K.storyStep}, 0)
` : ''}            if EmpPhase < ${PHASE.lastWar} then
                set EmpPhase = EmpPhase + 1
                set EmpCaptured = 0
                set EmpTech = IMaxBJ(EmpTech, 2 * EmpPhase - 1)
                call EmpSay("|cffffcc00Начинается фаза " + I2S(EmpPhase) + ".|r")
            elseif EmpPhase == ${PHASE.homeAttack} then
                set EmpPhase = ${PHASE.final}
                call EmpSay("|cffffcc00Родной мир врага пал. Остался последний бой — Император!|r")
            endif
        else
            call EmpSay("Сюжетная миссия провалена. Попробуйте снова.")
        endif
    endif
    // kind ${KIND_ID.start} = the house start mission: nothing to apply
    call EmpSave()
    return false
endfunction

function EmpOnDialog takes nothing returns nothing
    local boolean yes = GetClickedButton() == EmpBtnYes
    call DialogDisplay(Player(0), EmpDialog, false)
    if EmpDialogMode == 1 then
        if yes then
            call EmpGo()
            return
        endif
        // retreat: the territory is lost
        set EmpOwner[EmpPendTerr] = EmpPendEnemy
        call EmpSay("Мы отступили с территории «" + EmpTName[EmpPendTerr] + "».")
        call EmpSave()
        call EmpDraw()
    elseif EmpDialogMode == 2 or EmpDialogMode == 3 then
        if yes then
            call EmpGo()
            return
        endif
    endif
    set EmpBusy = false
endfunction

function EmpOnSelect takes nothing returns nothing
    local unit u = GetTriggerUnit()
    local integer n = 1
    if EmpBusy or GetUnitTypeId(u) != '${markerId}' then
        return
    endif
    loop
        exitwhen n > ${TERRITORY_COUNT}
        exitwhen EmpMarker[n] == u
        set n = n + 1
    endloop
    if n > ${TERRITORY_COUNT} then
        return
    endif
    if EmpOwner[n] == ${me} then
        call EmpSay("«" + EmpTName[n] + "» — наша территория.")
        return
    endif
    if not EmpAdjacentToMe(n) then
        call EmpSay("«" + EmpTName[n] + "» не граничит с нашими землями.")
        return
    endif
    if EmpPhase < ${PHASE.lastWar} and (${jp.filter((_, h) => h !== me).map((x) => `n == ${x}`).join(' or ')}) then
        call EmpSay("Вражеская столица пока недоступна (фаза ${PHASE.lastWar}).")
        return
    endif
    if EmpMapA[n] == "" then
        call EmpSay("Для этой территории нет карты боя.")
        return
    endif
    set EmpBusy = true
    set EmpPendTerr = n
    set EmpPendKind = ${KIND_ID.attack}
    set EmpPendEnemy = EmpOwner[n]
    set EmpNextMap = EmpMapA[n]
    set EmpDialogMode = 3
    call EmpAsk("Атаковать «" + EmpTName[n] + "»?", "В бой!", "Отмена")
endfunction

${o.autoTest ? autoTestFunctions : ''}function EmpHubStart takes nothing returns nothing
    local trigger tr = CreateTrigger()
    set EmpDialog = DialogCreate()
    call TriggerRegisterDialogEvent(tr, EmpDialog)
    call TriggerAddAction(tr, function EmpOnDialog)
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_SELECTED, null)
    call TriggerAddAction(tr, function EmpOnSelect)
    call SetPlayerColorBJ(Player(0), ConvertPlayerColor(${COLOR[me]}), true)
    call SetPlayerColorBJ(Player(1), ConvertPlayerColor(${COLOR[(me + 1) % 3]}), true)
    call SetPlayerColorBJ(Player(2), ConvertPlayerColor(${COLOR[(me + 2) % 3]}), true)
    call SetTimeOfDay(${real(TIME_OF_DAY)})
    call SuspendTimeOfDay(true)${musicList ? `
    call ClearMapMusic()
    call SetMapMusic(${musicList}, false, 0)
    call PlayMusic(${musicList})` : ''}
    call FogEnable(false)
    call FogMaskEnable(false)
    call EmpData()
    call EmpLoad()
    call EmpDraw()
    call SetCameraField(CAMERA_FIELD_TARGET_DISTANCE, ${real(V.HUB_CAMERA_DISTANCE)}, 0.0)
    call SetCameraPosition((EmpTX[${jp[me]}] * ${real(V.CAMERA_TOWARDS_CAPITAL_NUM)}) / ${real(V.CAMERA_TOWARDS_CAPITAL_DEN)}, (EmpTY[${jp[me]}] * ${real(V.CAMERA_TOWARDS_CAPITAL_NUM)}) / ${real(V.CAMERA_TOWARDS_CAPITAL_DEN)})
    call EmpStatus()
    call EmpSay("Выберите вражескую территорию рядом с вашими землями, чтобы атаковать.")
    set EmpBusy = true
    if EmpApplyResult() then
        call EmpDraw()
        return
    endif
    call EmpDraw()
    call EmpStatus()${o.autoTest ? '\n    call EmpAutoReport()' : ''}
    if EmpOfferStory() then
        return
    endif
    if ${o.autoTest ? 'false and ' : ''}GetStoredInteger(EmpCache, ${CAT}, ${K.lastKind}) == 0 and EmpCounterAttack() then
        call StoreInteger(EmpCache, ${CAT}, ${K.lastKind}, 1)
        return
    endif
    call StoreInteger(EmpCache, ${CAT}, ${K.lastKind}, 0)
    set EmpBusy = false
endfunction`;

  // players: 0 = me, 1 and 2 = the other houses (passive). Player ids are house-relative here,
  // so remap owners: house h -> player (h - me + 3) % 3.
  const fixed = functions.replace(/Player\(EmpOwner\[n\]\)/g, `Player(ModuloInteger(EmpOwner[n] - ${me} + 3, 3))`);
  const players: ScriptPlayer[] = [0, 1, 2].map((i): ScriptPlayer => ({ id: i, control: i === 0 ? 'user' : 'computer', race: 'human', team: i, x: 0, y: 0, name: HOUSE_NAME[(me + i) % 3] }));
  const m = buildMap({
    name: `Арракис — ${HOUSE_NAME[me]}`, description: 'Стратегическая карта кампании', width: W, height: H,
    tileset: TERRAIN.tileset, ground: [...TERRAIN.hubGround], cliffs: [TERRAIN.cliff],
    corner: (x: number, y: number) => ({ texture: (x * 7 + y * 3) % V.HUB_DIRT_EVERY === 0 ? 1 : 0, boundary: x < V.HUB_BOUNDARY_SIDE || x > W - V.HUB_BOUNDARY_SIDE || y < V.HUB_BOUNDARY_BOTTOM || y > H - V.HUB_BOUNDARY_TOP }),
    players, globals, functions: fixed,
    init: `    call TimerStart( CreateTimer(), ${real(V.HUB_START_DELAY)}, false, function EmpHubStart )`,
    imports: { 'war3map.w3u': o.units.w3u, 'war3map.w3a': o.units.w3a },
    minimapColor: () => [...V.HUB_MINIMAP_COLOR],
  });
  return { buffer: m.buffer, script: m.script };
}

export { buildHub, layout };
