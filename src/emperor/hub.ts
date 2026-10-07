// The Arrakis strategic map ("hub") of one house: a small WC3 map showing the 33 territories,
// their owners and connections, letting the player pick attacks, resolving battle results from
// the campaign game cache, running the phase / tech-level rules (CAMPAIGN0001 PhaseRules.txt)
// and the AI counter-attacks, and offering the story missions. Moves between maps with
// ChangeLevel (only valid inside a campaign .w3n).
//
// Phase model (PhaseRules.txt, read by src/emperor/phase-rules.ts; the shipped values):
//   1 -> after Battles 2 (Captured 1, MaxBattles 2) the Heighliner story mission  -> 2
//   2 -> after Battles 2 (Captured 1, MaxBattles 2) the home-world defence story  -> 3
//   3 -> capturing an enemy jump point (forced Jump mission) -> home-world attack story -> final;
//        Warning 3 / Lose 5 battles in a row without a captured territory end the campaign
// Tech level ([Tech Level N]): phase 1 starts at 1 (2 after the first capture), phase 2 at 3 (4),
// phase 3 at 5 (6 after one capture, 7 after two), home-world attack (phase 12) 8.

import { buildMap } from '../wc3/map.ts';
import { str, real } from '../wc3/jass.ts';
import { renderFile } from '../wc3/template.ts';
import { jassFile } from '../config/paths.ts';
import type { ScriptPlayer } from '../wc3/jass.ts';
import type { Campaign, Territory } from './campaign-data.ts';
import { HOUSE_CODES, HOUSE_RU_BY_ID, HOUSE_COLOR } from '../config/houses.ts';
import type { HouseCode } from '../config/houses.ts';
import { CACHE_FILE, J_CACHE_CATEGORY as CAT, J_CACHE_KEY as K, TERRITORY_COUNT, ADJ_STRIDE, KIND_ID, PHASE, EMPEROR_PHASE, START_TECH, NO_GAIN_WARNING, NO_GAIN_LOST, COUNTER_ATTACK_ONE_IN, AUTOTEST_HUB_DELAY } from '../config/campaign.ts';
import type { PhaseRules } from './phase-rules.ts';
import { DEFAULT_FACING, TIME_OF_DAY, DEBUG_REPORT_DIR } from '../config/runtime.ts';
import { CUSTOM_ID, TERRAIN } from '../config/wc3.ts';
import * as V from '../config/hub.ts';
import { MOVIE_DIR, MOVIE_PATH, MOVIE_AREA, MOVIE_BLACK_AREA, MOVIE_VOLUME, MOVIE_FRAME_DIGITS, MOVIE_FPS } from '../config/movies.ts';
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
  /** PhaseRules.txt: phase lengths, tech levels, warning / lose (src/emperor/phase-rules.ts) */
  phaseRules?: PhaseRules;
  /** movie slide shows (src/emperor/movies.ts, fmv.ts): hub event -> movie names, frame count of
   * each movie and the files to import; without them no movie is shown */
  movies?: HubMovies;
}

export interface HubMovies {
  events: Record<string, string[]>;
  frames: Map<string, number>;
  files: Record<string, Buffer>;
}

/** Template values of the movie player (src/jass/hub/movie.j) and the movie of every hub event
 * (`mv`: a JASS string of the ";"-separated movie names, "" when the event has none). */
function movieJass(movies: HubMovies | undefined, foes: HouseCode[], house: HouseCode = 'AT'): { movieFunctions: string; mv: Record<string, string> } {
  const events = movies?.events ?? {};
  const chain = (key: string): string => str((events[key] ?? []).filter((m) => (movies?.frames.get(m) ?? 0) > 0).join(';'));
  const keys = ['start', 'phase2', 'phase3', 'heighliner', 'homeDefence', 'civilWar', 'won', 'warning', 'lost', 'failedHeighliner', 'failedHomeDefence', 'failedCivilWar'];
  const mv: Record<string, string> = Object.fromEntries(keys.map((k) => [k, chain(k)]));
  foes.forEach((f, i) => {
    for (const k of ['homeAttack', 'final', 'failedHomeAttack', 'failedFinal']) mv[`${k}${i}`] = chain(`${k}${f}`);
  });
  const movieFunctions = renderFile(jassFile('hub/movie'), {
    MOVIE_DIR, MOVIE_PATH, MOVIE_AREA, MOVIE_BLACK_AREA, MOVIE_VOLUME,
    movieReport: `${DEBUG_REPORT_DIR}\\${house}_Movies.pld`,
    frameBase: 10 ** MOVIE_FRAME_DIGITS, frameDigitsEnd: MOVIE_FRAME_DIGITS + 1, moviePeriod: 1 / MOVIE_FPS,
    movieDataLines: [...(movies?.frames ?? [])].map(([m, n]) => `    call SaveInteger(EmpMovieTab, 0, StringHash(${str(m)}), ${n})`).join('\n'),
  });
  return { movieFunctions, mv };
}

/** JASS of the PhaseRules.txt parts the hub uses (the EmpPhaseTech / EmpCaptureTech /
 * EmpPhaseDone bodies and the Warning / Lose counts of the last war phase). */
function phaseJass(rules: PhaseRules | undefined): { phaseTechLines: string; captureTechLines: string; phaseDoneLines: string; noGain: { warning: number; lose: number } } {
  const hubPhase = new Map(Object.entries(EMPEROR_PHASE).map(([k, ep]) => [ep, PHASE[k as keyof typeof PHASE]]));
  const raise = (level: number): string => `set EmpTech = IMaxBJ(EmpTech, ${level})`;
  const phaseTech: string[] = [];
  const captureTech: string[] = [];
  for (const t of rules?.tech ?? []) {
    const p = hubPhase.get(t.inPhase);
    if (p === undefined) continue; // the tutorial
    if (t.phase !== undefined) phaseTech.push(`    if EmpPhase == ${p} then\n        ${raise(t.level)}\n    endif`);
    else if (t.captured !== undefined) captureTech.push(`    if EmpPhase == ${p} and EmpCaptured == ${t.captured} then\n        ${raise(t.level)}\n    endif`);
  }
  const done: string[] = [];
  for (const key of ['first', 'second'] as const) {
    const r = rules?.phases.get(EMPEROR_PHASE[key]);
    if (!r) continue;
    const max = r.maxBattles > 0 ? ` or EmpBattles >= ${r.maxBattles}` : '';
    done.push(`    if EmpPhase == ${PHASE[key]} then\n        return (EmpBattles >= ${r.battles} and EmpCaptured >= ${r.captured})${max}\n    endif`);
  }
  const last = rules?.phases.get(EMPEROR_PHASE.lastWar);
  return {
    phaseTechLines: phaseTech.join('\n'), captureTechLines: captureTech.join('\n'), phaseDoneLines: done.join('\n'),
    noGain: { warning: last?.warning ?? 0, lose: last?.lose ?? 0 },
  };
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
  const autoTestFunctions = renderFile(jassFile('hub/autotest'), {
    AUTOTEST_HUB_DELAY, CAT, K, KIND_ID, TERRITORY_COUNT, me, musicList,
    notEnemyCapitalN: jp.filter((_, h) => h !== me).map((x) => `n != ${x}`).join(' and '),
    jFirstTrack: str(o.music?.[0] ?? ''),
    jReportPrefix: str(`${DEBUG_REPORT_DIR}\\${HOUSES[me]}_Hub_`),
  });

  const globals = renderFile(jassFile('hub/globals'), { PHASE, START_TECH });

  const functions = renderFile(jassFile('hub/functions'), {
    ADJ_STRIDE, CACHE_FILE, CAT, DEFAULT_FACING, K, KIND_ID, PHASE, START_TECH, NO_GAIN_WARNING, NO_GAIN_LOST, ...phaseJass(o.phaseRules),
    TERRITORY_COUNT, TIME_OF_DAY, V, foes, markerId, me, musicList, o, story,
    ...movieJass(o.movies, foes.map((f) => HOUSES[f] as HouseCode), o.house),
    autoTestFunctions: o.autoTest ? autoTestFunctions : '',
    dataLines: lines.join('\n'),
    linkColor: V.LINK_COLOR.map((c) => real(c)).join(', '),
    labelDx: real(-V.LABEL_OFFSET_X),
    labelDy: real(-V.LABEL_OFFSET_Y),
    houseName: HOUSE_NAME[me],
    jHeighliner: str(story.heighliner || ''),
    jHomeDefence: str(story.homeDefence || ''),
    jHomeAttack0: str((story.homeAttack || {})[HOUSES[foes[0] as number] as string] || ''),
    jHomeAttack1: str((story.homeAttack || {})[HOUSES[foes[1] as number] as string] || ''),
    jEnd: str(story.end || ''),
    nextHouse: (me + 1) % 3,
    counterMax: COUNTER_ATTACK_ONE_IN - 1,
    jpMe: jp[me],
    jpFoe0: jp[foes[0] as number],
    enemyCapitalIsT: jp.filter((_, h) => h !== me).map((n) => `t == ${n}`).join(' or '),
    enemyCapitalIsN: jp.filter((_, h) => h !== me).map((x) => `n == ${x}`).join(' or '),
    colorMe: COLOR[me],
    colorNext: COLOR[(me + 1) % 3],
    colorNext2: COLOR[(me + 2) % 3],
  });

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
    imports: { 'war3map.w3u': o.units.w3u, 'war3map.w3a': o.units.w3a, ...o.movies?.files },
    minimapColor: () => [...V.HUB_MINIMAP_COLOR],
  });
  return { buffer: m.buffer, script: m.script };
}

export { buildHub, layout, phaseJass, movieJass };
