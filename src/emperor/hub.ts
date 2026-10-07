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
import { CACHE_FILE } from './mission.ts';

const HOUSES = ['AT', 'HK', 'OR'];
const HOUSE_NAME = ['Атрейдесы', 'Харконнены', 'Ордосы'];
const COLOR = [1, 0, 6];

/** Deterministic spring layout of the territory graph in [-1, 1]^2. */
function layout(territories, jumpPoint) {
  const pos = new Map();
  const anchor = { AT: [0.85, 0.75], HK: [-0.85, 0.75], OR: [0, -0.9] };
  for (const t of territories) {
    const a = anchor[t.owner];
    const k = t.n * 2.399; // golden angle spread
    pos.set(t.n, [a[0] * (1 - t.ring * 0.22) + Math.cos(k) * 0.08 * t.ring, a[1] * (1 - t.ring * 0.22) + Math.sin(k) * 0.08 * t.ring]);
  }
  for (let it = 0; it < 400; it++) {
    const f = new Map(territories.map((t) => [t.n, [0, 0]]));
    for (const a of territories) for (const b of territories) {
      if (a.n >= b.n) continue;
      const [ax, ay] = pos.get(a.n), [bx, by] = pos.get(b.n);
      let dx = ax - bx, dy = ay - by;
      const d = Math.max(0.02, Math.hypot(dx, dy));
      dx /= d; dy /= d;
      const linked = a.neighbours.includes(b.n);
      const rep = 0.012 / (d * d);
      const att = linked ? (d - 0.3) * 0.08 : 0;
      const fa = f.get(a.n), fb = f.get(b.n);
      fa[0] += (rep - att) * dx; fa[1] += (rep - att) * dy;
      fb[0] -= (rep - att) * dx; fb[1] -= (rep - att) * dy;
    }
    for (const t of territories) {
      if (Object.values(jumpPoint).includes(t.n)) continue; // capitals stay at the corners
      const p = pos.get(t.n), fv = f.get(t.n);
      p[0] = Math.max(-1, Math.min(1, p[0] + Math.max(-0.05, Math.min(0.05, fv[0]))));
      p[1] = Math.max(-1, Math.min(1, p[1] + Math.max(-0.05, Math.min(0.05, fv[1]))));
    }
  }
  return pos;
}

/**
 * @param {object} o
 * @param {string} o.house           'AT' | 'HK' | 'OR'
 * @param {object} o.campaign        campaign-data.loadCampaign()
 * @param {(kind:string, n:number)=>string|null} o.battleMap  battle map file for (attack|defend, territory)
 * @param {object} o.storyMap        { heighliner, homeDefence, homeAttack: {AT,HK,OR}, end, civilWar? } -> map file names
 * @param {object} o.units           buildUnitData (for marker unit ids)
 */
function buildHub(o) {
  const me = HOUSES.indexOf(o.house);
  const terr = o.campaign.territories;
  const pos = layout(terr, o.campaign.jumpPoint);
  const W = 96, H = 96, SPAN = 40 * 128; // markers inside +-SPAN
  const xy = (n) => { const [x, y] = pos.get(n); return [x * SPAN, y * SPAN]; };
  const jp = HOUSES.map((h) => o.campaign.jumpPoint[h]);
  const foes = [0, 1, 2].filter((h) => h !== me);
  const markerId = 'xM00';
  const lines = [];
  for (const t of terr) {
    const [x, y] = xy(t.n);
    lines.push(`    set EmpTX[${t.n}] = ${real(x)}`, `    set EmpTY[${t.n}] = ${real(y)}`, `    set EmpTName[${t.n}] = ${str(t.name)}`);
    lines.push(`    set EmpInitOwner[${t.n}] = ${HOUSES.indexOf(t.owner)}`);
    t.neighbours.forEach((m, i) => lines.push(`    set EmpAdj[${t.n * 8 + i}] = ${m}`));
    lines.push(`    set EmpAdjCount[${t.n}] = ${t.neighbours.length}`);
    lines.push(`    set EmpMapA[${t.n}] = ${str(o.battleMap('attack', t.n) || '')}`, `    set EmpMapD[${t.n}] = ${str(o.battleMap('defend', t.n) || '')}`);
  }
  const story = o.storyMap;

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
    integer EmpPhase = 1
    integer EmpTech = 1
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
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 20.0, s)
endfunction

function EmpSave takes nothing returns nothing
    local integer n = 1
    call StoreInteger(EmpCache, "emp", "init", 1)
    call StoreInteger(EmpCache, "emp", "phase", EmpPhase)
    call StoreInteger(EmpCache, "emp", "tech", EmpTech)
    call StoreInteger(EmpCache, "emp", "captured", EmpCaptured)
    loop
        exitwhen n > 33
        call StoreInteger(EmpCache, "emp", "own" + I2S(n), EmpOwner[n])
        set n = n + 1
    endloop
    call SaveGameCache(EmpCache)
endfunction

function EmpLoad takes nothing returns nothing
    local integer n = 1
    set EmpCache = InitGameCache(${str(CACHE_FILE)})
    if GetStoredInteger(EmpCache, "emp", "init") != 1 or GetStoredInteger(EmpCache, "emp", "house") != ${me} then
        // new campaign for this house
        loop
            exitwhen n > 33
            set EmpOwner[n] = EmpInitOwner[n]
            set n = n + 1
        endloop
        set EmpPhase = 1
        set EmpTech = 1
        set EmpCaptured = 0
        call StoreInteger(EmpCache, "emp", "house", ${me})
        call StoreInteger(EmpCache, "emp", "result", -1)
        call EmpSave()
        return
    endif
    loop
        exitwhen n > 33
        set EmpOwner[n] = GetStoredInteger(EmpCache, "emp", "own" + I2S(n))
        set n = n + 1
    endloop
    set EmpPhase = GetStoredInteger(EmpCache, "emp", "phase")
    set EmpTech = GetStoredInteger(EmpCache, "emp", "tech")
    set EmpCaptured = GetStoredInteger(EmpCache, "emp", "captured")
endfunction

function EmpAdjacentToMe takes integer n returns boolean
    local integer i = 0
    loop
        exitwhen i >= EmpAdjCount[n]
        if EmpOwner[EmpAdj[n * 8 + i]] == ${me} then
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
        if EmpOwner[EmpAdj[n * 8 + i]] == ${me} then
            return EmpAdj[n * 8 + i]
        endif
        set i = i + 1
    endloop
    return 0
endfunction

function EmpCount takes integer house returns integer
    local integer n = 1
    local integer c = 0
    loop
        exitwhen n > 33
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
        exitwhen n > 33
        if EmpMarker[n] != null then
            call RemoveUnit(EmpMarker[n])
        endif
        set EmpMarker[n] = CreateUnit(Player(EmpOwner[n]), '${markerId}', EmpTX[n], EmpTY[n], 270.0)
        call BlzSetUnitName(EmpMarker[n], EmpTName[n])
        if EmpLabel[n] == null then
            set EmpLabel[n] = CreateTextTag()
            set i = 0
            loop
                exitwhen i >= EmpAdjCount[n]
                set m = EmpAdj[n * 8 + i]
                if m > n then
                    call SetLightningColor(AddLightningEx("LEAS", false, EmpTX[n], EmpTY[n], 40.0, EmpTX[m], EmpTY[m], 40.0), 1.0, 0.85, 0.5, 0.45)
                endif
                set i = i + 1
            endloop
        endif
        call SetTextTagText(EmpLabel[n], I2S(n) + ". " + EmpTName[n], 0.022)
        call SetTextTagPos(EmpLabel[n], EmpTX[n] - 200.0, EmpTY[n] - 220.0, 16.0)
        call SetTextTagVisibility(EmpLabel[n], true)
        set n = n + 1
    endloop
endfunction

function EmpStatus takes nothing returns nothing
    call EmpSay("|cffffcc00${HOUSE_NAME[me]}|r — фаза " + I2S(EmpPhase) + ", тех. уровень " + I2S(EmpTech) + ", территорий: " + I2S(EmpCount(${me})) + " из 33")
endfunction

function EmpGo takes nothing returns nothing
    // hand the pending battle to the next map through the cache, then change level
    call StoreInteger(EmpCache, "emp", "incampaign", 1)
    call StoreInteger(EmpCache, "emp", "pendterr", EmpPendTerr)
    call StoreInteger(EmpCache, "emp", "pendkind", EmpPendKind)
    call StoreInteger(EmpCache, "emp", "pendenemy", EmpPendEnemy)
    if EmpPendKind == 1 then
        // defence: the attacker comes from its own neighbouring territory
        call StoreInteger(EmpCache, "emp", "pendfrom", EmpPendFrom)
    else
        call StoreInteger(EmpCache, "emp", "pendfrom", EmpMyNeighbourOf(EmpPendTerr))
    endif
    call StoreInteger(EmpCache, "emp", "result", -1)
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
    if EmpPhase == 1 then
        return ${str(story.heighliner || '')}
    elseif EmpPhase == 2 then
        return ${str(story.homeDefence || '')}
    elseif EmpPhase == 4 then
        if GetStoredInteger(EmpCache, "emp", "haenemy") == ${foes[0]} then
            return ${str((story.homeAttack || {})[HOUSES[foes[0]]] || '')}
        endif
        return ${str((story.homeAttack || {})[HOUSES[foes[1]]] || '')}
    elseif EmpPhase == 5 then
        return ${str(story.end || '')}
    endif
    return ""
endfunction

function EmpOfferStory takes nothing returns boolean
    local string m = EmpStoryMap()
    if m == "" then
        return false
    endif
    if (EmpPhase == 1 or EmpPhase == 2) and EmpCaptured < 2 then
        return false
    endif
    set EmpNextMap = m
    set EmpPendTerr = 0
    set EmpPendKind = 2
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
    if GetRandomInt(0, 1) == 0 then
        return false
    endif
    loop
        exitwhen n > 33
        if EmpOwner[n] == ${me} and n != ${jp[me]} then
            set i = 0
            loop
                exitwhen i >= EmpAdjCount[n]
                set foe = EmpOwner[EmpAdj[n * 8 + i]]
                if foe != ${me} and EmpMapD[n] != "" then
                    set EmpPendTerr = n
                    set EmpPendKind = 1
                    set EmpPendEnemy = foe
                    set EmpPendFrom = EmpAdj[n * 8 + i]
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
    local integer r = GetStoredInteger(EmpCache, "emp", "result")
    local integer kind = GetStoredInteger(EmpCache, "emp", "resultkind")
    local integer t = GetStoredInteger(EmpCache, "emp", "resultterr")
    local integer foe = GetStoredInteger(EmpCache, "emp", "pendenemy")
    if r < 0 then
        return false
    endif
    call StoreInteger(EmpCache, "emp", "result", -1)
    if kind == 0 then
        if r == 1 then
            set EmpOwner[t] = ${me}
            set EmpCaptured = EmpCaptured + 1
            call EmpSay("Территория «" + EmpTName[t] + "» захвачена!")
            if EmpCaptured == 1 then
                set EmpTech = EmpTech + 1
            endif
            if EmpPhase == 3 and (${jp.filter((_, h) => h !== me).map((n) => `t == ${n}`).join(' or ')}) then
                // an enemy capital fell: home-world attack on that house (offered by EmpOfferStory)
                set EmpPhase = 4
                set EmpTech = 8
                if t == ${jp[foes[0]]} then
                    call StoreInteger(EmpCache, "emp", "haenemy", ${foes[0]})
                else
                    call StoreInteger(EmpCache, "emp", "haenemy", ${foes[1]})
                endif
                call EmpSay("Вражеская столица захвачена. Готовьтесь к вторжению на их родную планету!")
            endif
        else
            call EmpSay("Атака на «" + EmpTName[t] + "» отбита. Наши силы отошли.")
        endif
    elseif kind == 1 then
        if r == 1 then
            call EmpSay("Территория «" + EmpTName[t] + "» удержана!")
        else
            set EmpOwner[t] = foe
            call EmpSay("Территория «" + EmpTName[t] + "» потеряна.")
        endif
    elseif kind == 2 then
        if r == 1 then
            if EmpPhase == 5 then
                // final mission won
                call EmpSave()
                call EmpSay("|cffffcc00Арракис принадлежит вам! Кампания завершена.|r")
                call CustomVictoryBJ(Player(0), true, true)
                return true
            endif
            if EmpPhase < 3 then
                set EmpPhase = EmpPhase + 1
                set EmpCaptured = 0
                set EmpTech = IMaxBJ(EmpTech, 2 * EmpPhase - 1)
                call EmpSay("|cffffcc00Начинается фаза " + I2S(EmpPhase) + ".|r")
            elseif EmpPhase == 4 then
                set EmpPhase = 5
                call EmpSay("|cffffcc00Родной мир врага пал. Остался последний бой — Император!|r")
            endif
        else
            call EmpSay("Сюжетная миссия провалена. Попробуйте снова.")
        endif
    endif
    // kind 3 = the house start mission: nothing to apply
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
        exitwhen n > 33
        exitwhen EmpMarker[n] == u
        set n = n + 1
    endloop
    if n > 33 then
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
    if EmpPhase < 3 and (${jp.filter((_, h) => h !== me).map((x) => `n == ${x}`).join(' or ')}) then
        call EmpSay("Вражеская столица пока недоступна (фаза 3).")
        return
    endif
    if EmpMapA[n] == "" then
        call EmpSay("Для этой территории нет карты боя.")
        return
    endif
    set EmpBusy = true
    set EmpPendTerr = n
    set EmpPendKind = 0
    set EmpPendEnemy = EmpOwner[n]
    set EmpNextMap = EmpMapA[n]
    set EmpDialogMode = 3
    call EmpAsk("Атаковать «" + EmpTName[n] + "»?", "В бой!", "Отмена")
endfunction

function EmpHubStart takes nothing returns nothing
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
    call SetTimeOfDay(12.0)
    call SuspendTimeOfDay(true)
    call FogEnable(false)
    call FogMaskEnable(false)
    call EmpData()
    call EmpLoad()
    call EmpDraw()
    call SetCameraField(CAMERA_FIELD_TARGET_DISTANCE, 4200.0, 0.0)
    call SetCameraPosition((EmpTX[${jp[me]}] * 2.0) / 3.0, (EmpTY[${jp[me]}] * 2.0) / 3.0)
    call EmpStatus()
    call EmpSay("Выберите вражескую территорию рядом с вашими землями, чтобы атаковать.")
    set EmpBusy = true
    if EmpApplyResult() then
        call EmpDraw()
        return
    endif
    call EmpDraw()
    call EmpStatus()
    if EmpOfferStory() then
        return
    endif
    if GetStoredInteger(EmpCache, "emp", "lastkind") == 0 and EmpCounterAttack() then
        call StoreInteger(EmpCache, "emp", "lastkind", 1)
        return
    endif
    call StoreInteger(EmpCache, "emp", "lastkind", 0)
    set EmpBusy = false
endfunction`;

  // players: 0 = me, 1 and 2 = the other houses (passive). Player ids are house-relative here,
  // so remap owners: house h -> player (h - me + 3) % 3.
  const fixed = functions.replace(/Player\(EmpOwner\[n\]\)/g, `Player(ModuloInteger(EmpOwner[n] - ${me} + 3, 3))`);
  const players = [0, 1, 2].map((i) => ({ id: i, control: i === 0 ? 'user' : 'computer', race: 'human', team: i, x: 0, y: 0, name: HOUSE_NAME[(me + i) % 3] }));
  const m = buildMap({
    name: `Арракис — ${HOUSE_NAME[me]}`, description: 'Стратегическая карта кампании', width: W, height: H,
    tileset: 'B', ground: ['Bdsr', 'Bdsd', 'Bdrh'], cliffs: ['CBde'],
    corner: (x, y) => ({ texture: (x * 7 + y * 3) % 13 === 0 ? 1 : 0, boundary: x < 6 || x > W - 6 || y < 4 || y > H - 8 }),
    players, globals, functions: fixed,
    init: '    call TimerStart( CreateTimer(), 0.1, false, function EmpHubStart )',
    imports: { 'war3map.w3u': o.units.w3u, 'war3map.w3a': o.units.w3a },
    minimapColor: () => [214, 170, 104],
  });
  return { buffer: m.buffer, script: m.script };
}

export { buildHub, layout };
