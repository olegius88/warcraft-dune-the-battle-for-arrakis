// The campaign: territories, phases and tech levels, mission kinds, the game cache shared by the
// hub and the mission maps, map file names and campaign-screen texts.

import { str } from '../wc3/jass.ts';
import type { HouseCode } from './houses.ts';

/** Arrakis territories (1-based numbers 1..TERRITORY_COUNT). */
export const TERRITORY_COUNT = 33;
/** Hub JASS: neighbours of territory n are EmpAdj[n * ADJ_STRIDE + i]. */
export const ADJ_STRIDE = 8;
/** Home territory (jump point) of each house, 1-based (Forced Missions.txt). */
export const JUMP_POINT: Readonly<Record<HouseCode, number>> = { AT: 33, HK: 1, OR: 31 };
/** Scripts that take an enemy capital: attacker -> { defender: script } (Forced Missions.txt). */
export const JUMP_SCRIPT: Readonly<Record<HouseCode, Readonly<Partial<Record<HouseCode, string>>>>> = {
  AT: { HK: 'HKJump_reb2', OR: 'ORJump_reb' },
  HK: { AT: 'ATJump_reb', OR: 'ORJump2_reb' },
  OR: { AT: 'ATJump_reb2', HK: 'HKjump_reb' },
};

/** Mission kinds; the number is what the cache carries (resultkind / pendkind). */
export type MissionKind = 'attack' | 'defend' | 'story' | 'start' | 'tutorial';
export const KIND_ID: Readonly<Record<MissionKind, number>> = { attack: 0, defend: 1, story: 2, start: 3, tutorial: 4 };

/** Phases of the hub: 1..3 territory war, then the home-world attack, then the final battle. How
 * long a phase lasts and the tech levels come from PhaseRules.txt (src/emperor/phase-rules.ts). */
export const PHASE = { first: 1, second: 2, lastWar: 3, homeAttack: 4, final: 5 } as const;
/** PhaseRules.txt number of each hub phase (10 / 11 there are the story missions between phases). */
export const EMPEROR_PHASE: Readonly<Record<keyof typeof PHASE, number>> = { first: 1, second: 2, lastWar: 3, homeAttack: 12, final: 13 };
/** Tech level before PhaseRules.txt says anything (and of a hub built without it). */
export const START_TECH = 1;
/** PhaseRules.txt Warning / Lose of the last war phase: what the Mentat says. */
export const NO_GAIN_WARNING = 'Ментат: Император недоволен — мы давно не захватывали новых земель!';
export const NO_GAIN_LOST = 'Император отказал Дому в поддержке: слишком долго без новых земель. Кампания проиграна.';
/** Chance (1 in N) that an enemy counter-attacks after a battle. */
export const COUNTER_ATTACK_ONE_IN = 2;

/** Mission map defaults when no campaign cache is present (standalone), and for start missions. */
export const DEFAULT_PHASE = 1;
export const DEFAULT_TECH = 3;
export const START_MISSION_PHASE = 0;
export const START_MISSION_TECH = 2;

/** Game cache shared by the hub and the mission maps. */
export const CACHE_FILE = 'EmperorCampaign.w3v';
export const CACHE_CATEGORY = 'emp';
export const CACHE_KEY = {
  /** 1 = the next mission map was entered from the hub */
  inCampaign: 'incampaign',
  /** 1 = campaign state written for `house` */
  init: 'init',
  house: 'house',
  phase: 'phase',
  tech: 'tech',
  captured: 'captured',
  /** battles fought in the current phase (PhaseRules.txt Battles / MaxBattles) */
  battles: 'battles',
  /** battles in a row without a captured territory (PhaseRules.txt Warning / Lose) */
  noGain: 'nogain',
  /** ownerPrefix + n = owner of territory n */
  ownerPrefix: 'own',
  /** battle handed from the hub to a mission map */
  pendingTerritory: 'pendterr',
  pendingKind: 'pendkind',
  pendingEnemy: 'pendenemy',
  pendingFrom: 'pendfrom',
  /** result handed back to the hub: 1 win, 0 loss, -1 none */
  result: 'result',
  resultTerritory: 'resultterr',
  resultKind: 'resultkind',
  outcome: 'outcome',
  /** enemy house of the home-world attack */
  homeAttackEnemy: 'haenemy',
  /** 1 = the last hub visit offered a counter-attack */
  lastKind: 'lastkind',
  /** second story mission of a phase (HK: civil war attack after the home defence): 1 = next */
  storyStep: 'storystep',
  /** autotest runs only: hub visits since the start mission */
  autotestVisits: 'atvisits',
} as const;
export type CacheKey = keyof typeof CACHE_KEY;
/** JASS string literals: the category and every key, ready to paste into JASS code. */
export const J_CACHE_CATEGORY = str(CACHE_CATEGORY);
export const J_CACHE_KEY = Object.fromEntries(Object.entries(CACHE_KEY).map(([k, v]) => [k, str(v)])) as Record<CacheKey, string>;

/** Campaign screen. */
export const CAMPAIGN_NAME = 'Emperor: Битва за Дюну';
export const CAMPAIGN_AUTHOR = 'warcraft-dune (данные — ваша копия Emperor)';
export const CAMPAIGN_DIFFICULTY = 'Нормальная';
export const CAMPAIGN_DESCRIPTION = 'Кампании трёх Великих Домов за Арракис. Собрано из вашей копии Emperor: Battle for Dune.';
export const CAMPAIGN_CHAPTER = 'Emperor: Битва за Дюну';
export const TUTORIAL_TITLE = 'Обучение';

/** Map file names inside the campaign. */
export const MAP_FILE = {
  start: (h: HouseCode): string => `${h}_Start.w3x`,
  hub: (h: HouseCode): string => `${h}_Hub.w3x`,
  battle: (h: HouseCode, kind: 'attack' | 'defend', n: number): string => `${h}_${kind === 'attack' ? 'A' : 'D'}${String(n).padStart(2, '0')}.w3x`,
  story: (h: HouseCode, key: string): string => `${h}_S_${key}.w3x`,
  homeAttack: (h: HouseCode, foe: HouseCode): string => `${h}_S_Home${foe}.w3x`,
  tutorial: 'Tutorial.w3x',
} as const;

/** Enemy of a house when the map/cache does not say (standalone runs, own territories). */
export const DEFAULT_ENEMY: Readonly<Record<HouseCode, HouseCode>> = { AT: 'HK', HK: 'AT', OR: 'HK' };

/** Debug builds of single missions (build-mission.ts, check-all.ts). */
export const DEBUG_HUB_MAP = 'Arrakis.w3x';
export const CHECK_ALL_MAP = '#U1 AT Start S LOD2';

/** Automatic test of the campaign flow (build-campaign --autotest): the start mission resets the
 * campaign and every mission is won after AUTOTEST_WIN_SECONDS; on its first visit the hub attacks
 * the first reachable territory after AUTOTEST_HUB_DELAY seconds; every map writes a report. The
 * campaign name gets AUTOTEST_NAME_PREFIX so it sorts first in the custom campaign list. */
export const AUTOTEST_WIN_SECONDS = 15;
export const AUTOTEST_HUB_DELAY = 6;
export const AUTOTEST_NAME_PREFIX = 'AAA AutoTest ';
