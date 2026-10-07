// Campaign model of Emperor: Battle for Dune, from CAMPAIGN0001 (territories, connections,
// PhaseRules, Forced Missions) and the mission script names in MISSIONS0001.
//
// Mission name grammar (house prefix AT/HK/OR): <H>P<phase><M|D><territory><subhouse>[Fail|Win]
// e.g. ATP1M11OR = Atreides, phase 1, attack (M) on territory 11, sub-house tag OR.
// Story scripts have plain names and are assigned to their maps/phases below.

import fs from 'node:fs';
import path from 'node:path';

import type { House } from './battle.ts';

/** House prefix of script and object names. */
export type HouseCode = 'AT' | 'HK' | 'OR';

/** [script name, map folder prefix], e.g. ['ATStart', '#U1 '] */
export type StoryRef = [string, string];

export interface HouseStory {
  tutorial: StoryRef;
  start: StoryRef;
  heighliner: StoryRef;
  homeDefence: StoryRef;
  civilWar?: StoryRef;
  /** enemy house code -> assault on its homeworld */
  homeAttack: Partial<Record<HouseCode, StoryRef>>;
  end: StoryRef;
}

export interface Territory {
  /** 1..33 */
  n: number;
  name: string;
  /** map folder (MAPS0001 index), null when not found */
  folder: string | null;
  neighbours: number[];
  /** initial owner (house code), null for unreachable */
  owner: HouseCode | null;
  /** distance from the owner's jump point */
  ring: number;
}

/** Scripts of one campaign mission: phase/territory, sub-house tag and the Fail/Win variants. */
export interface MissionSlot {
  phase: number;
  territory: number;
  subhouse: string;
  script?: string;
  fail?: string;
  win?: string;
}

export type MissionKindKey = 'attack' | 'defend';

export interface Campaign {
  territories: Territory[];
  /** house -> kind -> "phase:territory" -> slot */
  missions: Record<HouseCode, Record<MissionKindKey, Record<string, MissionSlot>>>;
  story: Record<HouseCode, HouseStory>;
  jumpPoint: Record<HouseCode, number>;
  jumpScript: Record<HouseCode, Partial<Record<HouseCode, string>>>;
  houses: Record<HouseCode, House>;
  scripts: string[];
}

const HOUSES: Record<HouseCode, House> = { AT: 'Atreides', HK: 'Harkonnen', OR: 'Ordos' };
// Forced Missions.txt: jump points (0-based territory index) and the scripts used to take them.
const JUMP_POINT: Record<HouseCode, number> = { AT: 33, HK: 1, OR: 31 }; // 1-based territory numbers
const JUMP_SCRIPT: Record<HouseCode, Partial<Record<HouseCode, string>>> = { // attacker -> { defender: script }
  AT: { HK: 'HKJump_reb2', OR: 'ORJump_reb' },
  HK: { AT: 'ATJump_reb', OR: 'ORJump2_reb' },
  OR: { AT: 'ATJump_reb2', HK: 'HKjump_reb' },
};

// Story missions: script -> map folder prefix. Derived from script/map names (see README).
const STORY: Record<HouseCode, HouseStory> = {
  AT: {
    tutorial: ['ATTutorial', '#X1 '], start: ['ATStart', '#U1 '], heighliner: ['Atreides Heighliner Mission', '#H1 '],
    homeDefence: ['DAT Save The Duke', '#D1 '],
    homeAttack: { HK: ['Harkonnen homeworld assault_AT', '#A3 '], OR: ['Ordos homeworld assault _Atreides', '#A2 '] },
    end: ['ATENDMission', '#E1 '],
  },
  HK: {
    tutorial: ['ATTutorial', '#X1 '], start: ['HKStart', '#U3 '], heighliner: ['HHK Heighliner Mission', '#H3 '],
    homeDefence: ['HHK Civil War Defence Mission', '#V1 '], civilWar: ['HHK Civil War Attack Mission', '#C1 '],
    homeAttack: { AT: ['T36 Atreides Homeworld Assault', '#A1 '], OR: ['Ordos homeworld assault', '#A2 '] },
    end: ['HKENDMission', '#E1 '],
  },
  OR: {
    tutorial: ['ATTutorial', '#X1 '], start: ['ORStart', '#U2 '], heighliner: ['Ordos Heighliner Mission', '#H2 '],
    homeDefence: ['Ordos Homeworld Defense', '#D2 '],
    homeAttack: { AT: ['T36 Atreides Homeworld Assault_OR', '#A1 '], HK: ['Harkonnen homeworld assault_OR', '#A3 '] },
    end: ['ORENDMission', '#E1 '],
  },
};

function readLines(file: string): string[] {
  return fs.readFileSync(file, 'latin1').split(/\r?\n/).map((l) => l.trim());
}

/** rawDir: data/emperor/raw; mapFolders: names of map folders (MAPS0001 index), for territory names */
function loadCampaign(rawDir: string, mapFolders: string[]): Campaign {
  const conn = readLines(path.join(rawDir, 'arrakis connections.txt'));
  const territories: Territory[] = [];
  for (let i = 0; i < 33; i++) {
    const n = i + 1;
    const folder = mapFolders.find((f) => f.startsWith(`#T${n} `)) || null;
    const name = folder ? folder.replace(/^#T\d+\s+/, '').replace(/^(GM|JF)\s+/, '').replace(/\s+S\s+LOD2$/i, '').replace(/\s+s\s+LOD2$/i, '').trim() : `T${n}`;
    const neighbours = (conn[i] || '').split(',').map((x) => Number(x)).filter((x) => x >= 1 && x <= 33);
    territories.push({ n, name, folder, neighbours, owner: null, ring: Infinity });
  }
  // make the graph symmetric
  for (const t of territories) for (const m of t.neighbours) {
    const o = territories[m - 1] as Territory;
    if (!o.neighbours.includes(t.n)) o.neighbours.push(t.n);
  }
  // initial owners: multi-source BFS from the jump points (Emperor: 11 territories per house in rings)
  const owner: Array<HouseCode | null> = Array.from({ length: 34 }, () => null);
  const dist: number[] = Array.from({ length: 34 }, () => Infinity);
  const queue: number[] = [];
  for (const [h, jp] of Object.entries(JUMP_POINT) as Array<[HouseCode, number]>) { owner[jp] = h; dist[jp] = 0; queue.push(jp); }
  for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
    for (const m of (territories[t - 1] as Territory).neighbours) {
      if (dist[m] === Infinity) { dist[m] = (dist[t] as number) + 1; owner[m] = owner[t] ?? null; queue.push(m); }
    }
  }
  territories.forEach((t) => { t.owner = owner[t.n] ?? null; t.ring = dist[t.n] as number; });

  // mission scripts
  const scripts = fs.readdirSync(rawDir).filter((f) => /\.tok$/i.test(f) && f !== 'header.tok').map((f) => f.replace(/\.tok$/i, ''));
  const missions: Campaign['missions'] = { AT: { attack: {}, defend: {} }, HK: { attack: {}, defend: {} }, OR: { attack: {}, defend: {} } };
  const re = /^(AT|HK|OR)P(\d)([MD])(\d+)([A-Z]{2})(Fail|Win)?$/i;
  for (const s of scripts) {
    const m = s.match(re);
    if (!m) continue;
    // groups 1-5 always match; 6 (Fail|Win) is optional
    const [, house = '', phase = '', mk = '', terr = '', sub = '', variant] = m;
    const h = house.toUpperCase() as HouseCode;
    const kind: MissionKindKey = mk.toUpperCase() === 'M' ? 'attack' : 'defend';
    const key = `${phase}:${Number(terr)}`;
    const slot = (missions[h][kind][key] = missions[h][kind][key] || { phase: Number(phase), territory: Number(terr), subhouse: sub.toUpperCase() });
    if (variant) slot[variant.toLowerCase() as 'fail' | 'win'] = s; else slot.script = s;
  }
  return { territories, missions, story: STORY, jumpPoint: JUMP_POINT, jumpScript: JUMP_SCRIPT, houses: HOUSES, scripts };
}

export { loadCampaign, HOUSES, JUMP_POINT };
