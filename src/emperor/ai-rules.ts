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
  firstTechTurrets: number;
  minMoneyWalls: number;
  minMoneyMaintenance: number;
  ticksDefendHarvester: number;
  ticksDefendCY: number;
  firstTechDefendCY: number;
  ticksSeesIntoShroud: number;
  ticksAbandonForming: number;
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
      maxUnits: get(l, 'MaxAiUnits'), numBuildings: get(l, 'NumBuildings'), buildingDelay: get(l, 'BuildingDelay'),
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
    firstTechTurrets: s('FirstTechLevelToBuildTurrets', 0),
    minMoneyWalls: s('MinMoneyToStartBuildingWalls', 0),
    minMoneyMaintenance: s('MinMoneyToBuildMaintenanceBuildings', 0),
    ticksDefendHarvester: s('TicksBeforeDefendHarvesterTactic', 0),
    ticksDefendCY: s('TicksBeforeDefendCYTactic', 0),
    firstTechDefendCY: s('FirstTechLevelForDefendCYTactic', 0),
    ticksSeesIntoShroud: s('TicksUntilAISeesIntoShroud', 0),
    ticksAbandonForming: s('TicksUntilAbandonForming', 0),
    tech: parseAiDifficulty(difficulty),
  };
}

/** ai.ini and the ai_difficulty.ini next to it */
function loadAiRules(file: string): AiRules {
  const difficulty = path.join(path.dirname(file), AI_DIFFICULTY_FILE);
  return parseAiRules(fs.readFileSync(file, 'latin1'), fs.existsSync(difficulty) ? fs.readFileSync(difficulty, 'latin1') : '');
}

export { parseAiRules, parseAiDifficulty, loadAiRules };
