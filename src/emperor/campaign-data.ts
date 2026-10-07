// Campaign model of Emperor: Battle for Dune, from CAMPAIGN0001 (territories, connections,
// PhaseRules, Forced Missions) and the mission script names in MISSIONS0001.
//
// Mission name grammar (house prefix AT/HK/OR): <H>P<phase><M|D><territory><subhouse>[Fail|Win]
// e.g. ATP1M11OR = Atreides, phase 1, attack (M) on territory 11, sub-house tag OR.
// Story scripts have plain names and are assigned to their maps/phases below.

import fs from 'node:fs';
import path from 'node:path';

import { HOUSE_BY_CODE as HOUSES } from '../config/houses.ts';
import type { House, HouseCode } from '../config/houses.ts';
import { JUMP_POINT, JUMP_SCRIPT, TERRITORY_COUNT } from '../config/campaign.ts';
import { STORY, territoryMapPrefix } from '../config/story.ts';
import type { StoryRef, HouseStory } from '../config/story.ts';

export type { HouseCode, StoryRef, HouseStory };

export interface Territory {
  /** 1..TERRITORY_COUNT */
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
  story: Readonly<Record<HouseCode, HouseStory>>;
  jumpPoint: Readonly<Record<HouseCode, number>>;
  jumpScript: Readonly<Record<HouseCode, Readonly<Partial<Record<HouseCode, string>>>>>;
  houses: Readonly<Record<HouseCode, House>>;
  scripts: string[];
}

function readLines(file: string): string[] {
  return fs.readFileSync(file, 'latin1').split(/\r?\n/).map((l) => l.trim());
}

/** rawDir: data/emperor/raw; mapFolders: names of map folders (MAPS0001 index), for territory names */
function loadCampaign(rawDir: string, mapFolders: string[]): Campaign {
  const conn = readLines(path.join(rawDir, 'arrakis connections.txt'));
  const territories: Territory[] = [];
  for (let i = 0; i < TERRITORY_COUNT; i++) {
    const n = i + 1;
    const folder = mapFolders.find((f) => f.startsWith(territoryMapPrefix(n))) || null;
    const name = folder ? folder.replace(/^#T\d+\s+/, '').replace(/^(GM|JF)\s+/, '').replace(/\s+S\s+LOD2$/i, '').replace(/\s+s\s+LOD2$/i, '').trim() : `T${n}`;
    const neighbours = (conn[i] || '').split(',').map((x) => Number(x)).filter((x) => x >= 1 && x <= TERRITORY_COUNT);
    territories.push({ n, name, folder, neighbours, owner: null, ring: Infinity });
  }
  // make the graph symmetric
  for (const t of territories) for (const m of t.neighbours) {
    const o = territories[m - 1] as Territory;
    if (!o.neighbours.includes(t.n)) o.neighbours.push(t.n);
  }
  // initial owners: multi-source BFS from the jump points (Emperor: 11 territories per house in rings)
  const owner: Array<HouseCode | null> = Array.from({ length: TERRITORY_COUNT + 1 }, () => null);
  const dist: number[] = Array.from({ length: TERRITORY_COUNT + 1 }, () => Infinity);
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

/** A defence script's Fail / Win variant and the attack it depends on. */
export interface DefendVariant {
  name: string;
  /** attack script of the same phase and territory */
  attack: string;
  /** true: plays when that attack was won (Win); false: unless it was won (Fail) */
  won: boolean;
}

/**
 * Variant of the defence slot (phase, territory) of house h. Inferred from the scripts, not from the
 * game code: Fail variants only give the enemy cash where the base script brings the sub-house's help
 * earned by the attack on that territory, Win variants follow a won attack. Paired with the attack
 * slot of the same phase and territory (its sub-house tag may differ: ATP1D16GNFail / ATP1M16AT).
 */
function defendVariant(camp: Campaign, h: HouseCode, phase: number, territory: number): DefendVariant | null {
  const slot = camp.missions[h].defend[`${phase}:${territory}`];
  const attack = camp.missions[h].attack[`${phase}:${territory}`]?.script;
  const name = slot?.fail ?? slot?.win;
  if (!slot || !name || !attack) return null;
  return { name, attack, won: !slot.fail };
}

export { loadCampaign, defendVariant };
