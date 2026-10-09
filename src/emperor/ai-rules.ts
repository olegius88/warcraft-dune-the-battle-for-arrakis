// ai.ini (AI0001): the values of Emperor's skirmish / campaign AI that the territory battle AI uses
// (src/jass/battle/forces.j, ai.j). ([Strategy] appears twice in the shipped file; the first value
// of a key wins.)
//   [BuildingConstructionRatios] Core / Defence / Manufacturing / Resource: share of the buildings (%)
//   [UnitConstructionRatios] Foot / Tank / Air / Special: share of the units the AI builds (%)
//   [PositionAlgorithmRatiosExits] / [...NoExits] weights of a building site, for buildings that
//              release units (exits) and the others: Aligned, DistanceFromCentre, FurtherFromEdge,
//              OuterPerimeter, Perpendicular, Random, WithinExistingBounds, Rotation
//   [Strategy] scouting, defence, attack waves, turrets, money limits, tactic timers (ticks)

import fs from 'node:fs';
import path from 'node:path';
import { AI_DIFFICULTY_FILE } from '../config/paths.ts';
import { AI_TECH_LEVELS } from '../config/battle.ts';
import { JUMP_POINT } from '../config/campaign.ts';
import { HOUSE_BY_CODE } from '../config/houses.ts';
import type { HouseCode } from '../config/houses.ts';
import { parseSections } from './rules.ts';

export interface PositionWeights {
  aligned: number;
  distanceFromCentre: number;
  furtherFromEdge: number;
  outerPerimeter: number;
  perpendicular: number;
  random: number;
  withinExistingBounds: number;
  rotation: number;
}

export interface AiRules {
  foot: number;
  tank: number;
  defencePercent: number;
  minMoneyToBuild: number;
  retreatChance: number;
  /** [BuildingConstructionRatios] in % */
  buildRatios: { core: number; defence: number; manufacturing: number; resource: number };
  positionExits: PositionWeights;
  positionNoExits: PositionWeights;
  /** [Strategy] */
  unitsBeforeScout: number;
  scoutTeams: number;
  defenceWanderTiles: number;
  buildsDefences: boolean;
  /** % change to the frequency of large attacks */
  largeAttackModifier: number;
  minTurretGapTiles: number;
  maxTurretsLowTech: number;
  maxRefineries: number;
  /** ExtraPower: the builder's critical need for power (Game.exe 0x42d973): made - used below it */
  extraPower: number;
  /** MaxSites: building sites scored before the best is taken (Game.exe 0x42a4ed: stops at MaxSites - 4) */
  maxSites: number;
  firstTechTurrets: number;
  minMoneyWalls: number;
  minMoneyMaintenance: number;
  ticksDefendHarvester: number;
  ticksDefendCY: number;
  firstTechDefendCY: number;
  /** FirstCampaignGameTechLevel: Game.exe waits past it + 1 for the harvester flight (0x45a954), building commands (0x4304c0), the defence plan */
  firstCampaignTech: number;
  /** NumReserveTeams / MaxUnitsPerReserveTeam: the reserve tactic's teams (Game.exe 0x44d980; the last one takes any number) */
  reserveTeams: number;
  reservePerTeam: number;
  ticksSeesIntoShroud: number;
  ticksAbandonForming: number;
  /** NumTicksStandingStillUntilDeploy: a deployable unit of the AI stands still this long, then deploys (Game.exe 0x465bf1) */
  ticksUntilDeploy: number;
  /** [StartScript] Next= entries in order: the building groups built first (lower case) */
  startScript: string[];
  /** ai_difficulty.ini by tech level (index 1..8; 0 unused = Tech1) */
  tech: AiTech[];
}

/** ai_difficulty.ini [TechN] (ticks): MaxAiUnits, NumBuildings, BuildingDelay, FirstAttackDelay,
 * GapBetweenNewScripts, UnitDelay, Minimum/MaximumUnitsForDefence, MaxTurretsAllowed. Its comments
 * ("UnitDelay=875 // 35 seconds") also give 25 ticks per second. */
export interface AiTech {
  maxUnits: number;
  numBuildings: number;
  buildingDelay: number;
  /** MaintenanceDelay: the builder's pace once it has NumBuildings (Game.exe 1.09 0x430e95) */
  maintenanceDelay: number;
  firstAttackDelay: number;
  gapBetweenScripts: number;
  unitDelay: number;
  minDefence: number;
  maxDefence: number;
  maxTurrets: number;
}



/** [Tech1] holds the defaults of every tech level ("unless redefined"). */
function parseAiDifficulty(text: string): AiTech[] {
  const { sections } = parseSections(text);
  const get = (lvl: number, key: string): number => {
    for (const l of [lvl, 1]) {
      const e = sections.get(`tech${l}`)?.entries.find(([k]) => k === key);
      const n = e ? parseFloat(e[1]) : Number.NaN;
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };
  return Array.from({ length: AI_TECH_LEVELS + 1 }, (_, i) => {
    const l = Math.max(1, i);
    return {
      maxUnits: get(l, 'MaxAiUnits'), numBuildings: get(l, 'NumBuildings'), buildingDelay: get(l, 'BuildingDelay'), maintenanceDelay: get(l, 'MaintenanceDelay'),
      firstAttackDelay: get(l, 'FirstAttackDelay'), gapBetweenScripts: get(l, 'GapBetweenNewScripts'), unitDelay: get(l, 'UnitDelay'),
      minDefence: get(l, 'MinimumUnitsForDefence'), maxDefence: get(l, 'MaximumUnitsForDefence'), maxTurrets: get(l, 'MaxTurretsAllowed'),
    };
  });
}

/** difficulty: the text of ai_difficulty.ini (empty: every value 0) */
function parseAiRules(text: string, difficulty = ''): AiRules {
  const { sections } = parseSections(text);
  const get = (sec: string, key: string, d: number): number => {
    const e = sections.get(sec.toLowerCase())?.entries.find(([k]) => k === key);
    const n = e ? parseFloat(e[1]) : Number.NaN;
    return Number.isFinite(n) ? n : d;
  };
  const position = (sec: string): PositionWeights => ({
    aligned: get(sec, 'Aligned', 0), distanceFromCentre: get(sec, 'DistanceFromCentre', 0), furtherFromEdge: get(sec, 'FurtherFromEdge', 0),
    outerPerimeter: get(sec, 'OuterPerimeter', 0), perpendicular: get(sec, 'Perpendicular', 0), random: get(sec, 'Random', 0),
    withinExistingBounds: get(sec, 'WithinExistingBounds', 0), rotation: get(sec, 'Rotation', 0),
  });
  const s = (key: string, d: number): number => get('Strategy', key, d);
  return {
    foot: get('UnitConstructionRatios', 'Foot', 50),
    tank: get('UnitConstructionRatios', 'Tank', 50),
    defencePercent: s('PercentageOfUnitsForDefence', 0),
    minMoneyToBuild: s('MinMoneyToConstructBuildings', 0),
    retreatChance: s('ChanceOfRetreating', 0),
    buildRatios: {
      core: get('BuildingConstructionRatios', 'Core', 25), defence: get('BuildingConstructionRatios', 'Defence', 25),
      manufacturing: get('BuildingConstructionRatios', 'Manufacturing', 25), resource: get('BuildingConstructionRatios', 'Resource', 25),
    },
    positionExits: position('PositionAlgorithmRatiosExits'),
    positionNoExits: position('PositionAlgorithmRatiosNoExits'),
    unitsBeforeScout: s('UnitsToBuildBeforeCreatingScoutTactic', 3),
    scoutTeams: s('NumberOfScoutTeams', 0),
    defenceWanderTiles: s('DefenceTacticWanderDistance', 0),
    buildsDefences: s('AiBuildsDefences', 0) !== 0,
    largeAttackModifier: s('LargeAttackModifier', 100),
    minTurretGapTiles: s('MinimumGapBetweenTurrets', 0),
    maxTurretsLowTech: s('MaxTurretsAtLowTech', 0),
    maxRefineries: s('MaxRefineries', 1),
    extraPower: s('ExtraPower', 0),
    maxSites: s('MaxSites', 35),
    firstTechTurrets: s('FirstTechLevelToBuildTurrets', 0),
    minMoneyWalls: s('MinMoneyToStartBuildingWalls', 0),
    minMoneyMaintenance: s('MinMoneyToBuildMaintenanceBuildings', 0),
    ticksDefendHarvester: s('TicksBeforeDefendHarvesterTactic', 0),
    ticksDefendCY: s('TicksBeforeDefendCYTactic', 0),
    firstTechDefendCY: s('FirstTechLevelForDefendCYTactic', 0),
    firstCampaignTech: s('FirstCampaignGameTechLevel', 0),
    reserveTeams: s('NumReserveTeams', 0),
    reservePerTeam: s('MaxUnitsPerReserveTeam', 0),
    ticksSeesIntoShroud: s('TicksUntilAISeesIntoShroud', 0),
    ticksAbandonForming: s('TicksUntilAbandonForming', 0),
    ticksUntilDeploy: get('UnitLevel', 'NumTicksStandingStillUntilDeploy', 0),
    startScript: (sections.get('startscript')?.entries ?? []).filter(([k]) => k.toLowerCase() === 'next').map(([, v]) => (v.split('//')[0] ?? '').trim().toLowerCase()).filter(Boolean),
    tech: parseAiDifficulty(difficulty),
  };
}

/** ai.ini and the ai_difficulty.ini next to it; override (an ai_<house>_<mission>.ini) goes over
 * ai.ini: it is read first, and the first value of a key wins. */
function loadAiRules(file: string, override?: string | null): AiRules {
  const difficulty = path.join(path.dirname(file), AI_DIFFICULTY_FILE);
  const over = override && fs.existsSync(override) ? `${fs.readFileSync(override, 'latin1')}\n` : '';
  return parseAiRules(over + fs.readFileSync(file, 'latin1'), fs.existsSync(difficulty) ? fs.readFileSync(difficulty, 'latin1') : '');
}

/** ai_<house>_<map>.ini: the AI playing house h on a map, <map> its folder prefix in lower case
 * ('#A1 ' -> ai_atreides_a1.ini "Homeworld attack with AI playing Atreides", 't33' -> the jump
 * point); null if absent */
function aiOverride(dir: string, h: HouseCode, map: string): string | null {
  const file = path.join(dir, `ai_${HOUSE_BY_CODE[h].toLowerCase()}_${map.trim().replace(/^#/, '').toLowerCase()}.ini`);
  return fs.existsSync(file) ? file : null;
}

/** ai_<house>_t<jump point>.ini ("<House> Jump Point"): the AI defending its capital; null if absent */
function capitalAiOverride(dir: string, h: HouseCode): string | null {
  return aiOverride(dir, h, `t${JUMP_POINT[h]}`);
}

export { parseAiRules, parseAiDifficulty, loadAiRules, aiOverride, capitalAiOverride };
